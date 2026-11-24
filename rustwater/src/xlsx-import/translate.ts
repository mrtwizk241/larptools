// Turns a domain-level character (types.ts: an .xlsx import or a parity fixture) into an action
// log the engine can replay. Actions are built directly with valid payloads; the sheet only
// records final levels, so this picks a legal history. The parity tests (tests/parity) use the
// same translator in strict mode, where anything it would have to adapt throws instead.
//
// Translated: character.created (names, email, ancestry, subtype, extra infection, starting and
// infection-bonus CXP), every ledger amount, infection gained after creation, ancestry.leveled
// for each ability level above 1, skill.learned for every level of every skill part,
// memorized.added for spells, recipes, performances, rituals and free-text knowledges, the
// profession (profession.started, then one profession.leveled per level, see
// professionSchedule), the familiar (familiar.bonded at creation, familiar.awakened and
// familiar.leveled in place of the ledger's FP rows, see familiarRowSteps, then
// familiar.slotUnlocked and familiar.skillLearned), boon.added, items.startingSet, and
// profile.updated for the effects notes and starting items typed as free text.
//
// Not translated: checkInReceipt (no engine record; its Shiny total is already a ledger row).
import type { Ruleset } from '../data/index.ts';
import type { Action, ActionType } from '../engine/model.ts';
import type { LedgerCurrency } from '../engine/sheet.ts';
import { levelCost } from '../engine/rules/costs.ts';
import { familiarLevelFp, professionLevelCost } from '../engine/rules/progression.ts';
import type { LedgerEntry, SheetCharacter, SkillEntry } from './types.ts';

// ---- Shared helpers (also used by tests/parity/plan.test.ts) ----

export const CURRENCIES: readonly LedgerCurrency[] = ['cxp', 'pxp', 'fp', 'shinies'];

/** Ledger kinds that character.created credits itself. */
export const CREATION_KINDS: ReadonlySet<string> = new Set(['start', 'infection-bonus']);

/** Ledger kind of the FP rows that pay for familiar levels (see familiarRowSteps). */
export const FAMILIAR_KIND = 'familiar';

/** Event key for a ledger row: `<date>-<event id>`, for example 2024-01-13-e1. */
export function eventKeyOf(row: LedgerEntry): string | undefined {
  return row.event ? `${row.date}-${row.event.toLowerCase()}` : undefined;
}

/**
 * Ledger kind for one currency of a row. A row's `kind` names its main credit; Event rows also
 * carry the attendance FP, which the engine records as kind "attendance".
 */
export function ledgerKindOf(row: LedgerEntry, currency: LedgerCurrency): string {
  if (row.kind === 'event' && currency === 'fp') return 'attendance';
  return row.kind;
}

/** Cryptids: the sheet does not record the From Legends choice (D-28), so take the first allowed. */
export function fromLegendsChoiceOf(rs: Ruleset, ancestryId: string): string | undefined {
  return rs.ancestriesById[ancestryId]?.sharedAbility.choice?.allowedAbilityIds[0];
}

/** Ability ids in slot order (shared, subtype) for the character's ancestry. */
export function abilitySlots(rs: Ruleset, c: SheetCharacter): [string, string] {
  const ancestry = rs.ancestriesById[c.ancestry.id];
  const entry = rs.subtypesById[c.ancestry.subtype];
  if (!ancestry || !entry)
    throw new Error(`Unknown ancestry ${c.ancestry.id}/${c.ancestry.subtype}`);
  return [ancestry.sharedAbility.id, entry.subtype.ability.id];
}

/** Skill entries with basic parts first (so AP is earned before it is spent), else in order. */
export function orderedSkills(rs: Ruleset, c: SheetCharacter): SkillEntry[] {
  const isBasic = (s: SkillEntry) => rs.skillsById[s.skill]?.parts[s.part]?.costKind === 'basic';
  const list = c.skills ?? [];
  return [...list.filter(isBasic), ...list.filter((s) => !isBasic(s))];
}

/**
 * Ledger rows in date order (stable). The sheet's ledgers are sums, so order only matters for
 * when a balance would dip below zero; fixtures list some monthly staff rows after the events.
 */
export function byDate(rows: readonly LedgerEntry[]): LedgerEntry[] {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => (a.row.date < b.row.date ? -1 : a.row.date > b.row.date ? 1 : a.i - b.i))
    .map((x) => x.row);
}

/** Total of one currency over the ledger rows of one kind (start, infection-bonus). */
export function ledgerSum(c: SheetCharacter, kind: string, currency: LedgerCurrency): number {
  return c.ledger.filter((r) => r.kind === kind).reduce((sum, r) => sum + (r[currency] ?? 0), 0);
}

/**
 * Event rows that are a plain player check-in (Event CXP plus the attendance FP and nothing
 * else). plan.test.ts records these with checkIn, so they count as events played before a
 * profession starts ([PRO-START]).
 */
export function isCheckInRow(rs: Ruleset, row: LedgerEntry): boolean {
  const fp = rs.attendanceById.player?.grants.find((g) => g.currency === 'fp')?.amount ?? 0;
  return (
    row.kind === 'event' &&
    eventKeyOf(row) !== undefined &&
    (row.cxp ?? 0) === rs.ruleset.eventCxp &&
    (row.fp ?? 0) === fp &&
    (row.pxp ?? 0) === 0 &&
    (row.shinies ?? 0) === 0
  );
}

/** True when no later row (in `rows` order) belongs to the same event. */
function endsEvent(rows: readonly LedgerEntry[], i: number): boolean {
  const row = rows[i];
  const key = row ? eventKeyOf(row) : undefined;
  return key !== undefined && !rows.slice(i + 1).some((r) => eventKeyOf(r) === key);
}

// ---- Professions ----

export type ProfessionStep =
  | { readonly kind: 'start'; readonly skills: readonly string[] }
  | { readonly kind: 'level'; readonly skillId: string; readonly toLevel: number };

export interface ProfessionPurchase {
  readonly eventKey: string;
  readonly date: string;
  readonly steps: readonly ProfessionStep[];
}

export interface ProfessionPlan {
  /** Purchases keyed by the index (in `rows`) of the last row of their event. */
  readonly schedule: Map<number, ProfessionPurchase>;
  /** Levels the ledger could not pay for one level per event: skill id -> [reached, target]. */
  readonly short: Map<string, readonly [number, number]>;
  readonly started: boolean;
}

/**
 * When the profession levels are bought. The sheet only has the final levels, so this picks a
 * legal history: start at the end of the first event with enough check-ins before it
 * ([PRO-START]) and enough PXP, buying level 1 of every skill the PXP covers; then at the end of
 * each later event, one level per skill ([PRO-PACE]) while the PXP lasts ([PRO-COST]). Each
 * level therefore has its own event key. Levels it cannot place are listed in `short`.
 */
export function professionPlan(
  rs: Ruleset,
  c: SheetCharacter,
  rows: readonly LedgerEntry[],
): ProfessionPlan {
  const schedule = new Map<number, ProfessionPurchase>();
  const short = new Map<string, readonly [number, number]>();
  const prof = c.profession;
  if (!prof) return { schedule, short, started: false };
  const def = rs.professionsById[prof.id];
  if (!def) throw new Error(`Unknown profession ${prof.id}.`);
  for (const id of Object.keys(prof.levels))
    if (!def.skills.some((s) => s.id === id))
      throw new Error(`${id} is not a skill of ${def.name}.`);
  const rules = rs.professions.rules;
  const targets = def.skills
    .map((s) => ({ id: s.id, target: prof.levels[s.id] ?? 0 }))
    .filter((t) => t.target > 0);
  const level = new Map<string, number>();
  let pxp = 0;
  let started = false;
  const checkInDates: string[] = [];
  rows.forEach((row, i) => {
    pxp += row.pxp ?? 0;
    if (isCheckInRow(rs, row)) checkInDates.push(row.date);
    const eventKey = eventKeyOf(row);
    if (eventKey === undefined || !endsEvent(rows, i)) return;
    const steps: ProfessionStep[] = [];
    if (!started) {
      const before = checkInDates.filter((d) => d < row.date).length;
      if (before < rules.start.eventsPlayedBefore) return;
      const skills: string[] = [];
      for (const t of targets) {
        const cost = professionLevelCost(rs, 1);
        if (cost > pxp) continue;
        pxp -= cost;
        level.set(t.id, 1);
        skills.push(t.id);
      }
      if (skills.length === 0) return;
      started = true;
      steps.push({ kind: 'start', skills });
    } else {
      for (const t of targets) {
        const current = level.get(t.id) ?? 0;
        const cost = professionLevelCost(rs, current + 1);
        if (current >= t.target || cost > pxp) continue;
        pxp -= cost;
        level.set(t.id, current + 1);
        steps.push({ kind: 'level', skillId: t.id, toLevel: current + 1 });
      }
    }
    if (steps.length > 0) schedule.set(i, { eventKey, date: row.date, steps });
  });
  for (const t of targets) {
    const reached = level.get(t.id) ?? 0;
    if (reached < t.target) short.set(t.id, [reached, t.target]);
  }
  return { schedule, short, started };
}

/** professionPlan for the parity tests: throws when a level cannot be placed. */
export function professionSchedule(
  rs: Ruleset,
  c: SheetCharacter,
  rows: readonly LedgerEntry[],
): Map<number, ProfessionPurchase> {
  const p = professionPlan(rs, c, rows);
  for (const [id, [, target]] of p.short)
    throw new Error(
      `${c.name}: ${id} level ${target} cannot be bought one level per event with the PXP the ledger gives.`,
    );
  return p.schedule;
}

// ---- Familiar ----

export type FamiliarRowStep =
  | { readonly kind: 'awaken'; readonly awakenedSkillId: string; readonly fp: number }
  | { readonly kind: 'level'; readonly toLevel: number; readonly fp: number };

/**
 * The familiar's level history, from the ledger. The sheet records FP spent on the familiar as
 * negative FP rows (kind "familiar"), while the engine charges that FP itself through
 * familiar.awakened and familiar.leveled. Replaying the rows as points.adjusted too would count
 * the FP twice, so each such row is replaced by the familiar action it paid for, at the same
 * date and event: the first row awakens the familiar (level 2), each later row is the next
 * level. The row's FP must equal that level's cost in familiar.json ([FAM-AWAKEN],
 * [FAM-LEVEL]) and the rows must reach the character's level; otherwise this throws, unless
 * `lenient`, when a row that does not fit stays a ledger row and a shortfall is left to the
 * caller. Keyed by the row's index in `rows`.
 */
export function familiarRowSteps(
  rs: Ruleset,
  c: SheetCharacter,
  rows: readonly LedgerEntry[],
  lenient = false,
): Map<number, FamiliarRowStep> {
  const out = new Map<number, FamiliarRowStep>();
  const fam = c.familiar;
  let level = rs.familiar.levels.min;
  const fail = (message: string): void => {
    if (!lenient) throw new Error(message);
  };
  rows.forEach((row, i) => {
    if (row.kind !== FAMILIAR_KIND) return;
    if (!fam) return fail(`${c.name}: familiar ledger row without a familiar.`);
    const fp = -(row.fp ?? 0);
    if (fp <= 0 || CURRENCIES.some((cur) => cur !== 'fp' && (row[cur] ?? 0) !== 0))
      return fail(`${c.name}: familiar row "${row.reason}" must only spend FP.`);
    if (level >= fam.level)
      return fail(`${c.name}: "${row.reason}" goes above the familiar's level.`);
    const next = level + 1;
    const cost = familiarLevelFp(rs, next);
    if (fp !== cost)
      return fail(`${c.name}: "${row.reason}" pays ${fp} FP; level ${next} costs ${cost}.`);
    if (level === rs.familiar.levels.min) {
      if (fam.awakenedSkill === undefined)
        return fail(`${c.name}: familiar levels above 1 need an awakened skill.`);
      out.set(i, { kind: 'awaken', awakenedSkillId: fam.awakenedSkill, fp });
    } else out.set(i, { kind: 'level', toLevel: next, fp });
    level = next;
  });
  if (fam && level !== fam.level)
    fail(`${c.name}: the familiar rows reach level ${level}, not ${fam.level}.`);
  return out;
}

export type FamiliarSkillStep =
  { readonly kind: 'unlock' } | { readonly kind: 'learn'; readonly skillId: string };

/** Familiar skills in slot order, unlocking an extra slot when the slots so far are full. */
export function familiarSkillSteps(rs: Ruleset, c: SheetCharacter): FamiliarSkillStep[] {
  const fam = c.familiar;
  if (!fam) return [];
  const steps: FamiliarSkillStep[] = [];
  let slots = rs.familiar.essence.baseSkillSlots;
  let unlocked = 0;
  fam.slots.forEach((skillId, i) => {
    if (i >= slots && unlocked < fam.extraSlots) {
      steps.push({ kind: 'unlock' });
      unlocked++;
      slots++;
    }
    steps.push({ kind: 'learn', skillId });
  });
  for (; unlocked < fam.extraSlots; unlocked++) steps.push({ kind: 'unlock' });
  return steps;
}

// ---- Memorization ----

export interface MemoryPick {
  readonly kind: 'spell' | 'recipe' | 'performance' | 'ritual' | 'knowledge';
  readonly refId?: string;
  readonly text?: string;
  /** School or craft id or `universal` (spells, recipes); the kind's own slot otherwise. */
  readonly slot: string;
}

/**
 * Spells, recipes, performances, rituals and free-text knowledges to memorize, in order.
 * Rituals the engine grants automatically (Ritual Circle with Ritualism) use no slot and cannot
 * be memorized, so they are left out (the engine lists them in memory.autoLearned).
 */
export function memoryPicks(rs: Ruleset, c: SheetCharacter): MemoryPick[] {
  const picks: MemoryPick[] = [];
  for (const s of c.spells ?? []) picks.push({ kind: 'spell', refId: s.spell, slot: s.slot });
  for (const r of c.recipes ?? []) picks.push({ kind: 'recipe', refId: r.recipe, slot: r.slot });
  for (const k of c.otherKnowledges ?? []) {
    if (k.performance !== undefined)
      picks.push({ kind: 'performance', refId: k.performance, slot: 'performance' });
    else if (k.ritual !== undefined) {
      if (rs.ritualsById[k.ritual]?.autoLearned === true) continue;
      picks.push({ kind: 'ritual', refId: k.ritual, slot: 'ritual' });
    } else if (k.name !== undefined) picks.push({ kind: 'knowledge', text: k.name, slot: 'none' });
  }
  return picks;
}

// ---- Translation ----

export interface ToActionsContext {
  /** Who the actions are recorded as. */
  readonly actor: Action['actor'];
  /** A fresh unique action id (a uuid in the app). */
  newId(): string;
  /** Throw on anything that needs adapting instead of warning (parity tests). */
  readonly strict?: boolean;
}

export interface Translation {
  readonly actions: Action[];
  /** What the translator had to adapt, in plain English (always empty in strict mode). */
  readonly warnings: string[];
}

const NAME_MAX = 200;
const TEXT_MAX = 5000;

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max).trimEnd() : text;
}

/** Builds the action log for one character. */
export function toActions(c: SheetCharacter, rs: Ruleset, ctx: ToActionsContext): Translation {
  const actions: Action[] = [];
  const warnings: string[] = [];
  const strict = ctx.strict === true;
  const problem = (message: string): void => {
    if (strict) throw new Error(message);
    if (!warnings.includes(message)) warnings.push(message);
  };
  const push = (
    type: ActionType,
    payload: unknown,
    at: string,
    extra: { eventKey?: string | undefined; note?: string | undefined } = {},
  ): void => {
    actions.push({
      id: ctx.newId(),
      seq: actions.length + 1,
      at,
      actor: ctx.actor,
      type,
      payload,
      ...(extra.eventKey !== undefined ? { eventKey: extra.eventKey } : {}),
      ...(extra.note !== undefined ? { note: clip(extra.note, TEXT_MAX) } : {}),
    });
  };
  const atOf = (date: string) => `${date}T12:00:00.000Z`;
  const firstDate = c.ledger[0]?.date ?? '2026-01-01';
  const lastDate = c.ledger.reduce((d, r) => (r.date > d ? r.date : d), firstDate);
  const later = atOf(lastDate);

  // character.created credits the start and infection-bonus rows.
  const name = clip(c.name.trim(), NAME_MAX);
  const player = clip(c.player.trim(), NAME_MAX);
  if (name !== c.name.trim() || player !== c.player.trim())
    problem('A name longer than 200 letters was shortened.');
  const fromLegends = fromLegendsChoiceOf(rs, c.ancestry.id);
  const email = c.email?.trim();
  push(
    'character.created',
    {
      characterName: name,
      playerName: player,
      ...(email ? { playerEmail: clip(email, 320) } : {}),
      ancestryId: c.ancestry.id,
      subtypeId: c.ancestry.subtype,
      extraInfection: c.ancestry.extraInfection,
      ...(fromLegends !== undefined ? { fromLegendsChoice: fromLegends } : {}),
      ...(c.ancestry.age !== undefined ? { age: c.ancestry.age } : {}),
      startingCxp: ledgerSum(c, 'start', 'cxp'),
      infectionBonusCxp: ledgerSum(c, 'infection-bonus', 'cxp'),
    },
    atOf(firstDate),
  );
  for (const row of c.ledger) {
    if (!CREATION_KINDS.has(row.kind)) continue;
    for (const cur of CURRENCIES)
      if (cur !== 'cxp' && (row[cur] ?? 0) !== 0)
        throw new Error(`${row.kind} row with ${cur} is not supported by the translator.`);
  }

  // Free text and records with no numbers: effects notes, boons, starting items.
  const effects = (c.effectsNotes ?? []).map((t) => t.trim()).filter((t) => t !== '');
  const freeItems = (c.startingItems ?? []).flatMap((i) => (i.text !== undefined ? [i.text] : []));
  const notes = freeItems.length > 0 ? `Starting items on the sheet: ${freeItems.join('; ')}` : '';
  if (effects.length > 0 || notes !== '') {
    const joined = effects.join('\n');
    if (joined.length > TEXT_MAX)
      problem('The effects notes were longer than 5,000 letters and were shortened.');
    push(
      'profile.updated',
      {
        ...(effects.length > 0 ? { effects: clip(joined, TEXT_MAX) } : {}),
        ...(notes !== '' ? { notes: clip(notes, TEXT_MAX) } : {}),
      },
      atOf(firstDate),
    );
  }
  for (const b of c.boons ?? []) {
    const def = b.boon !== undefined ? rs.boonsById[b.boon] : undefined;
    if (b.boon !== undefined && !def) {
      problem(`Unknown boon ${b.boon}; left out.`);
      continue;
    }
    const boonName = clip((def?.name ?? b.name ?? '').trim(), NAME_MAX);
    if (boonName === '') continue;
    push('boon.added', { ...(def ? { boonId: def.id } : {}), name: boonName }, atOf(firstDate));
  }
  const picks = (c.startingItems ?? []).flatMap((i) =>
    i.item !== undefined
      ? [{ optionId: i.item, ...(i.detail ? { detail: clip(i.detail, NAME_MAX) } : {}) }]
      : [],
  );
  for (const p of picks)
    if (!rs.startingItemsById[p.optionId]) problem(`Unknown starting item ${p.optionId}.`);
  if (picks.length > 0) push('items.startingSet', { picks }, atOf(firstDate));

  // Bonding a familiar costs nothing; bond at creation.
  if (c.familiar)
    push('familiar.bonded', { name: clip(c.familiar.name, NAME_MAX) }, atOf(firstDate));

  // Infection gained after creation (typed into D2 on the sheet).
  const gained = c.ancestry.infectionGained ?? 0;
  if (gained > 0) {
    const ancestry = rs.ancestriesById[c.ancestry.id];
    const track = ancestry?.infectionTrack === 'connection' ? 'connection' : 'infection';
    const extra = track === 'connection' ? 0 : c.ancestry.extraInfection;
    push(
      'infection.changed',
      {
        track,
        toLevel: (ancestry?.baseInfection ?? 0) + extra + gained,
        reason: 'Infection gained in play',
      },
      atOf(firstDate),
    );
  }

  // Ledger rows in date order. Shiny purchases become one shinies.spent (cost and grants
  // together). Familiar FP rows become familiar actions (familiarRowSteps); profession levels
  // follow the last row of the event they are bought at (professionSchedule).
  const rows = byDate(c.ledger);
  const familiarSteps = familiarRowSteps(rs, c, rows, !strict);
  let profession: ProfessionPlan = { schedule: new Map(), short: new Map(), started: false };
  try {
    profession = strict
      ? { schedule: professionSchedule(rs, c, rows), short: new Map(), started: true }
      : professionPlan(rs, c, rows);
  } catch (error) {
    if (strict) throw error;
    problem(
      `The profession was left out: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const ledgerRow = (row: LedgerEntry, i: number): void => {
    if (CREATION_KINDS.has(row.kind)) return;
    const at = atOf(row.date);
    const eventKey = eventKeyOf(row);
    const fam = familiarSteps.get(i);
    if (fam) {
      if (fam.kind === 'awaken')
        push('familiar.awakened', { awakenedSkillId: fam.awakenedSkillId, fpCost: fam.fp }, at, {
          eventKey,
          note: row.reason,
        });
      else
        push('familiar.leveled', { toLevel: fam.toLevel, fpCost: fam.fp }, at, {
          eventKey,
          note: row.reason,
        });
      return;
    }
    const shinies = row.shinies ?? 0;
    const negativeGrant = CURRENCIES.some((cur) => cur !== 'shinies' && (row[cur] ?? 0) < 0);
    if (row.kind === 'shiny-purchase' && shinies < 0) {
      if (negativeGrant && strict)
        throw new Error(`Shiny purchase row with a negative grant: ${row.reason}`);
      if (!negativeGrant) {
        const grants = CURRENCIES.filter((cur) => cur !== 'shinies' && (row[cur] ?? 0) > 0).map(
          (cur) => ({ currency: cur, amount: row[cur] ?? 0, kind: 'shiny-purchase' }),
        );
        const only = grants.length === 1 ? grants[0] : undefined;
        const purchaseId = only ? `buy-${only.currency}` : 'check-in-purchases';
        push(
          'shinies.spent',
          {
            purchaseId,
            qty: only ? only.amount : 1,
            shiniesCost: -shinies,
            grants,
            items: [],
          },
          at,
          { eventKey, note: row.reason },
        );
        return;
      }
    }
    for (const cur of CURRENCIES) {
      const amount = row[cur] ?? 0;
      if (amount === 0) continue;
      if (amount > 0)
        push('points.awarded', { currency: cur, amount, kind: ledgerKindOf(row, cur) }, at, {
          eventKey,
          note: row.reason,
        });
      else
        push(
          'points.adjusted',
          {
            currency: cur,
            amount,
            reason: clip(row.reason, 2000),
            kind: row.kind === 'penalty' ? 'penalty' : 'adjustment',
          },
          at,
          { eventKey },
        );
    }
  };
  const professionPurchase = (p: ProfessionPurchase): void => {
    const at = atOf(p.date);
    const ev = { eventKey: p.eventKey };
    for (const step of p.steps) {
      if (step.kind === 'start')
        push('profession.started', { professionId: c.profession?.id }, at, ev);
      const levels =
        step.kind === 'start'
          ? step.skills.map((skillId) => ({ skillId, toLevel: 1 }))
          : [{ skillId: step.skillId, toLevel: step.toLevel }];
      for (const l of levels)
        push(
          'profession.leveled',
          {
            abilityId: l.skillId,
            toLevel: l.toLevel,
            cost: { currency: 'pxp', amount: professionLevelCost(rs, l.toLevel) },
          },
          at,
          ev,
        );
    }
  };
  rows.forEach((row, i) => {
    ledgerRow(row, i);
    const purchase = profession.schedule.get(i);
    if (purchase) professionPurchase(purchase);
  });

  // Profession levels no event could pay for (lenient only): bought after the last ledger row,
  // one level per skill per import step so the pace rule still holds.
  if (profession.short.size > 0 && c.profession) {
    const left = [...profession.short].map(([skillId, [reached, target]]) => ({
      skillId,
      level: reached,
      target,
    }));
    problem(
      `The ledger does not show events and PXP for every profession level; ${left
        .map(
          (l) =>
            `${l.target - l.level} ${l.target - l.level === 1 ? 'level' : 'levels'} of ${rs.professionAbilitiesById[l.skillId]?.ability.name ?? l.skillId}`,
        )
        .join(
          ' and ',
        )} ${left.reduce((n, l) => n + l.target - l.level, 0) === 1 ? 'was' : 'were'} recorded after the last ledger row.`,
    );
    let round = 0;
    let started = profession.started;
    while (left.some((l) => l.level < l.target)) {
      round++;
      const eventKey = `${lastDate}-sheet-import-${round}`;
      const steps: ProfessionStep[] = [];
      if (!started) {
        const skills = left.filter((l) => l.level < l.target).map((l) => l.skillId);
        for (const l of left) if (l.level < l.target) l.level = 1;
        steps.push({ kind: 'start', skills });
        started = true;
      } else
        for (const l of left)
          if (l.level < l.target) {
            l.level++;
            steps.push({ kind: 'level', skillId: l.skillId, toLevel: l.level });
          }
      professionPurchase({ eventKey, date: lastDate, steps });
    }
  }

  // Familiar levels the FP rows did not pay for (lenient only): the engine charges their FP.
  const fam = c.familiar;
  if (fam && !strict) {
    let level = rs.familiar.levels.min;
    for (const step of familiarSteps.values())
      level = step.kind === 'awaken' ? rs.familiar.levels.min + 1 : step.toLevel;
    for (let next = level + 1; next <= fam.level; next++) {
      const fpCost = familiarLevelFp(rs, next);
      if (next === rs.familiar.levels.min + 1) {
        if (fam.awakenedSkill === undefined) break;
        push('familiar.awakened', { awakenedSkillId: fam.awakenedSkill, fpCost }, later);
      } else push('familiar.leveled', { toLevel: next, fpCost }, later);
    }
  }

  // Familiar skills and extra slots, once the familiar has its final level (and Essence).
  for (const step of familiarSkillSteps(rs, c)) {
    if (step.kind === 'unlock')
      push('familiar.slotUnlocked', { essenceCost: rs.familiar.essence.extraSlotCost }, later);
    else
      push(
        'familiar.skillLearned',
        {
          skillId: step.skillId,
          essenceCost: rs.familiarSkillsById[step.skillId]?.costEssence ?? 0,
        },
        later,
      );
  }

  // Ancestry levels: one ancestry.leveled per level above 1, the first one as the starting LXP.
  const slots = abilitySlots(rs, c);
  for (const id of Object.keys(c.ancestry.abilityLevels))
    if (!slots.includes(id)) problem(`${id} is not an ability of ${c.ancestry.subtype}.`);
  let first = true;
  for (const abilityId of slots) {
    const target = c.ancestry.abilityLevels[abilityId] ?? 1;
    for (let level = 2; level <= target; level++) {
      push(
        'ancestry.leveled',
        { abilityId, toLevel: level, ...(first ? { atCreation: true } : {}) },
        first ? atOf(firstDate) : later,
      );
      first = false;
    }
  }

  // Skills: one skill.learned per level.
  for (const s of orderedSkills(rs, c)) {
    const def = rs.skillsById[s.skill]?.parts[s.part];
    if (!def) {
      problem(`Unknown skill part ${s.skill} ${s.part}; left out.`);
      continue;
    }
    const currency = def.costKind === 'basic' ? 'cxp' : 'ap';
    for (let level = 1; level <= s.level; level++)
      push(
        'skill.learned',
        {
          skillId: s.skill,
          part: s.part,
          toLevel: level,
          cost: { currency, amount: levelCost(rs, def.costKind, level) },
          atCreation: false,
          ...(s.archetype !== undefined ? { archetype: s.archetype } : {}),
        },
        later,
      );
  }

  // Memorized items, once the skills that give their slots are owned.
  for (const m of memoryPicks(rs, c))
    push(
      'memorized.added',
      {
        kind: m.kind,
        ...(m.refId !== undefined ? { refId: m.refId } : {}),
        ...(m.text !== undefined ? { text: clip(m.text, NAME_MAX) } : {}),
        slot: m.slot,
      },
      later,
    );
  return { actions, warnings };
}
