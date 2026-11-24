// What the Play screen tracks: every use of a skill part, ancestry ability, profession skill,
// and familiar skill on the sheet, plus the spent counts kept in the use tracker. Pure: no React.
// Rules: docs/rules-spec/03-play-rules.md [PLAY-REPOP], [PLAY-ENCOUNTER], [PLAY-PER-EVENT].
import type { Ruleset, Sheet, UsePeriod } from '../../../../engine/index.ts';
import type { SkillPart, UseTracker } from '../../../../engine/model.ts';
import { skillPartName } from '../../../lib/names.ts';

/** Rule text shown under a tracked item when the player opens it. */
export interface UseDetail {
  /** A heading when an item shows more than one text (From Legends, mastery extras). */
  readonly title: string | null;
  readonly text: string;
}

export interface TrackedUse {
  /** Stable key, for example `skill:assault:basic` or `profession:medic-stitch-em-up:adept`. */
  readonly key: string;
  readonly name: string;
  readonly count: number;
  readonly period: UsePeriod;
  /** Short extra line, for example that an upgrade also spends a basic use. */
  readonly note: string | null;
  /** What the skill or ability does, from the rules data. */
  readonly details?: readonly UseDetail[];
  /** Skill parts: the skill, for a link to its page. */
  readonly skillId?: string;
  /** Skill parts: the archetype the skill was bought in, for the filter chips. */
  readonly archetype?: string;
  /**
   * Adept and Advanced uses: the key of the Basic use they upgrade. Spending one also spends a
   * Basic use, and the row sits under that Basic use.
   */
  readonly upgradeOf?: string;
}

function textDetail(text: string | null | undefined, title: string | null = null): UseDetail[] {
  return text ? [{ title, text }] : [];
}

export const PERIOD_ORDER: readonly UsePeriod[] = ['encounter', 'repop', 'event'];

export const PERIOD_TITLES: Record<UsePeriod, string> = {
  encounter: 'Per encounter',
  repop: 'Per repop',
  event: 'Per event',
};

/**
 * Periods a group reset restores. A repop restores per-repop and per-encounter uses
 * ([PLAY-REPOP]); per-event uses come back only at the next event.
 */
export const RESET_SCOPE: Record<UsePeriod, readonly UsePeriod[]> = {
  encounter: ['encounter'],
  repop: ['repop', 'encounter'],
  event: ['event'],
};

const UPGRADE_NOTE = 'Upgrades a basic use: also spends one basic use.';

/** Maps a rules data frequency to a period; passive and unusual frequencies are not tracked. */
function periodOfFrequency(frequency: string): UsePeriod | null {
  if (frequency === 'per-encounter') return 'encounter';
  if (frequency === 'per-repop') return 'repop';
  if (frequency === 'per-event') return 'event';
  return null;
}

/** Every trackable use on the sheet, in sheet order. Items with no uses are left out. */
export function trackedUses(sheet: Sheet, ruleset: Ruleset): TrackedUse[] {
  const items: TrackedUse[] = [];
  const add = (item: TrackedUse) => {
    if (item.count > 0) items.push(item);
  };

  for (const skill of sheet.skills) {
    for (const part of skill.parts) {
      const name = skillPartName(ruleset, skill.skillId, part.part);
      const base = `skill:${skill.skillId}:${part.part}`;
      const partText = ruleset.skillsById[skill.skillId]?.parts[part.part]?.text;
      const upgradeOf =
        part.part === 'adept' || part.part === 'advanced'
          ? { upgradeOf: `skill:${skill.skillId}:basic` }
          : {};
      if (part.uses)
        add({
          key: base,
          name,
          count: part.uses.count,
          period: part.uses.per,
          note: 'upgradeOf' in upgradeOf ? UPGRADE_NOTE : null,
          ...upgradeOf,
          details: textDetail(partText),
          skillId: skill.skillId,
          ...(skill.archetype ? { archetype: skill.archetype } : {}),
        });
      // Extra uses on another period, summed per period (a mastery's "+1 use each encounter").
      for (const period of PERIOD_ORDER) {
        const extras = part.extraUses.filter((e) => e.per === period);
        const count = extras.reduce((sum, e) => sum + e.count, 0);
        if (count === 0) continue;
        const from = [
          ...new Set(extras.map((e) => skillPartName(ruleset, e.fromSkillId, e.fromPart))),
        ];
        const sources = extras.map((e) => ({
          title: skillPartName(ruleset, e.fromSkillId, e.fromPart),
          text: ruleset.skillsById[e.fromSkillId]?.parts[e.fromPart]?.text,
        }));
        add({
          key: `${base}:extra:${period}`,
          name: `${name} extra`,
          count,
          period,
          note: `Extra ${count === 1 ? 'use' : 'uses'} from ${from.join(', ')}.`,
          ...upgradeOf,
          details: [
            ...textDetail(partText, name),
            ...sources.flatMap((s) => textDetail(s.text, s.title)),
          ],
          skillId: skill.skillId,
          ...(skill.archetype ? { archetype: skill.archetype } : {}),
        });
      }
    }
  }

  for (const ability of sheet.ancestry?.abilities ?? []) {
    if (!ability.uses) continue;
    add({
      key: `ancestry:${ability.id}`,
      name: ability.copied ? `${ability.name}: ${ability.copied.name}` : ability.name,
      count: ability.uses.count,
      period: ability.uses.per,
      note: null,
      details: ability.copied
        ? [
            ...textDetail(ability.text, ability.name),
            ...textDetail(ability.copied.text, ability.copied.name),
          ]
        : textDetail(ability.text),
    });
  }

  for (const skill of sheet.profession?.skills ?? []) {
    const period = skill.uses.per;
    const tier = (id: 'basic' | 'adept' | 'advanced') =>
      skill.tiers.find((t) => t.tier === id)?.text ?? null;
    add({
      key: `profession:${skill.id}:basic`,
      name: skill.name,
      count: skill.uses.count,
      period,
      note: null,
      details: textDetail(skill.text ?? tier('basic')),
    });
    add({
      key: `profession:${skill.id}:adept`,
      name: `${skill.name} Adept upgrade`,
      count: skill.adeptUpgrades,
      period,
      note: UPGRADE_NOTE,
      upgradeOf: `profession:${skill.id}:basic`,
      details: textDetail(tier('adept')),
    });
    add({
      key: `profession:${skill.id}:advanced`,
      name: `${skill.name} Advanced upgrade`,
      count: skill.advancedUpgrades,
      period,
      note: UPGRADE_NOTE,
      upgradeOf: `profession:${skill.id}:basic`,
      details: textDetail(tier('advanced')),
    });
  }

  const familiar = sheet.familiar;
  if (familiar) {
    const awakened = familiar.awakenedSkill;
    const period = awakened
      ? periodOfFrequency(ruleset.awakenedSkillsById[awakened.id]?.frequency ?? 'passive')
      : null;
    if (awakened && period)
      add({
        key: `familiar:awakened:${awakened.id}`,
        name: awakened.name,
        count: 1,
        period,
        note: `Familiar ${familiar.name}, awakened skill.`,
        details: textDetail(awakened.text),
      });
    // One use per learned copy (a skill can sit in more than one slot).
    const copies = new Map<string, { name: string; frequency: string; count: number }>();
    for (const s of familiar.learned) {
      const entry = copies.get(s.skillId);
      if (entry) entry.count += 1;
      else copies.set(s.skillId, { name: s.name, frequency: s.frequency, count: 1 });
    }
    for (const [skillId, entry] of copies) {
      const p = periodOfFrequency(entry.frequency);
      if (!p) continue;
      add({
        key: `familiar:${skillId}`,
        name: entry.name,
        count: entry.count,
        period: p,
        note: `Familiar ${familiar.name}.`,
        details: textDetail(ruleset.familiarSkillsById[skillId]?.text),
      });
    }
  }

  // An upgrade whose Basic use is not tracked stands on its own.
  const keys = new Set(items.map((i) => i.key));
  return items.map((i) => {
    if (i.upgradeOf === undefined || keys.has(i.upgradeOf)) return i;
    const rest = { ...i };
    delete (rest as { upgradeOf?: string }).upgradeOf;
    return rest;
  });
}

/**
 * Items grouped by period, in display order; empty groups are left out. Adept and Advanced uses
 * sit right under their skill's Basic use, in the Basic use's group, whatever their own period.
 */
export function groupByPeriod(
  items: readonly TrackedUse[],
): { period: UsePeriod; items: TrackedUse[] }[] {
  const keys = new Set(items.map((i) => i.key));
  const attached = (i: TrackedUse) => i.upgradeOf !== undefined && keys.has(i.upgradeOf);
  return PERIOD_ORDER.map((period) => ({
    period,
    items: items
      .filter((i) => i.period === period && !attached(i))
      .flatMap((i) => [i, ...items.filter((u) => u.upgradeOf === i.key)]),
  })).filter((g) => g.items.length > 0);
}

/** Archetype filter chips on the Play screen, after All. */
export const PLAY_ARCHETYPES = [
  'warrior',
  'defender',
  'rogue',
  'utility',
  'magic',
  'crafting',
] as const;

/**
 * Items whose skill was bought in one of the chosen archetypes; none chosen shows everything.
 * Items that are not skills (ancestry, profession, familiar) show only with no filter.
 */
export function filterByArchetype(
  items: readonly TrackedUse[],
  archetypes: readonly string[],
): TrackedUse[] {
  if (archetypes.length === 0) return [...items];
  return items.filter((i) => i.archetype !== undefined && archetypes.includes(i.archetype));
}

// ---- Spent counts ----

/** Spent uses per item key. Keys are unique across periods. */
export type Spent = Readonly<Record<string, number>>;

/**
 * The stored tracker has `perEncounter` and `perRepop` maps only. Per-event counts live in
 * `perRepop` under this prefix, so a repop reset can leave them alone.
 */
const EVENT_PREFIX = 'event:';

export function spentFromTracker(tracker: UseTracker | undefined): Spent {
  if (!tracker) return {};
  const spent: Record<string, number> = { ...tracker.perEncounter };
  for (const [key, value] of Object.entries(tracker.perRepop)) {
    spent[key.startsWith(EVENT_PREFIX) ? key.slice(EVENT_PREFIX.length) : key] = value;
  }
  return spent;
}

/** The tracker record to save. Only current items with spent uses are kept. */
export function trackerFromSpent(
  characterId: string,
  spent: Spent,
  items: readonly TrackedUse[],
  updatedAt: string,
): UseTracker {
  const perEncounter: Record<string, number> = {};
  const perRepop: Record<string, number> = {};
  for (const item of clampItems(spent, items)) {
    if (item.spent === 0) continue;
    if (item.period === 'encounter') perEncounter[item.key] = item.spent;
    else if (item.period === 'repop') perRepop[item.key] = item.spent;
    else perRepop[`${EVENT_PREFIX}${item.key}`] = item.spent;
  }
  return { characterId, perEncounter, perRepop, updatedAt };
}

function clampItems(spent: Spent, items: readonly TrackedUse[]) {
  return items.map((item) => ({ ...item, spent: spentOf(spent, item) }));
}

/** Spent uses of an item, clamped to 0..count (a count can shrink when the sheet changes). */
export function spentOf(spent: Spent, item: TrackedUse): number {
  const value = spent[item.key] ?? 0;
  return Math.max(0, Math.min(item.count, Math.floor(value)));
}

export function leftOf(spent: Spent, item: TrackedUse): number {
  return item.count - spentOf(spent, item);
}

/** Only current items, each clamped to its count. Returns the same object when nothing changes. */
export function clampSpent(spent: Spent, items: readonly TrackedUse[]): Spent {
  const next: Record<string, number> = {};
  for (const item of items) {
    const value = spentOf(spent, item);
    if (value > 0) next[item.key] = value;
  }
  return sameSpent(spent, next) ? spent : next;
}

/** One more use spent (no change when none is left). */
export function spendOne(spent: Spent, item: TrackedUse): Spent {
  const value = spentOf(spent, item);
  if (value >= item.count) return spent;
  return { ...spent, [item.key]: value + 1 };
}

/** One spent use restored (no change when none is spent). */
export function restoreOne(spent: Spent, item: TrackedUse): Spent {
  const value = spentOf(spent, item);
  if (value <= 0) return spent;
  return { ...spent, [item.key]: value - 1 };
}

// ---- Upgrades: an Adept or Advanced use also spends a Basic use ----

/** The Basic uses an upgrade can spend: the Basic use, then its extra uses. */
export function basicUsesFor(items: readonly TrackedUse[], item: TrackedUse): TrackedUse[] {
  const basic = item.upgradeOf;
  if (basic === undefined) return [];
  return items.filter((i) => i.key === basic || i.key.startsWith(`${basic}:extra:`));
}

/** True for an upgrade with no Basic use left to spend with it. */
export function upgradeBlocked(
  spent: Spent,
  items: readonly TrackedUse[],
  item: TrackedUse,
): boolean {
  return (
    item.upgradeOf !== undefined && basicUsesFor(items, item).every((b) => leftOf(spent, b) < 1)
  );
}

/** The Basic use an upgrade spends next, or null when none is left (or it is no upgrade). */
export function basicToSpend(
  spent: Spent,
  items: readonly TrackedUse[],
  item: TrackedUse,
): TrackedUse | null {
  return basicUsesFor(items, item).find((b) => leftOf(spent, b) > 0) ?? null;
}

/**
 * Spends one use. An Adept or Advanced use also spends one Basic use and cannot be spent without
 * one. Returns `spent` unchanged when nothing can be spent.
 */
export function spendUse(spent: Spent, items: readonly TrackedUse[], item: TrackedUse): Spent {
  if (leftOf(spent, item) < 1) return spent;
  if (item.upgradeOf === undefined) return spendOne(spent, item);
  const basic = basicToSpend(spent, items, item);
  if (!basic) return spent;
  return spendOne(spendOne(spent, item), basic);
}

/** Restores one use; restoring an upgrade also gives back one spent Basic use. */
export function restoreUse(spent: Spent, items: readonly TrackedUse[], item: TrackedUse): Spent {
  const next = restoreOne(spent, item);
  if (next === spent || item.upgradeOf === undefined) return next;
  const basic = [...basicUsesFor(items, item)].reverse().find((b) => spentOf(next, b) > 0);
  return basic ? restoreOne(next, basic) : next;
}

/** Restores every use of the items in the given periods. */
export function resetPeriods(
  spent: Spent,
  items: readonly TrackedUse[],
  periods: readonly UsePeriod[],
): Spent {
  const next: Record<string, number> = { ...spent };
  for (const item of items) if (periods.includes(item.period)) delete next[item.key];
  return next;
}

/** Puts back the spent counts of the given items from an earlier state (Undo after a reset). */
export function restoreFrom(
  spent: Spent,
  before: Spent,
  items: readonly TrackedUse[],
  periods: readonly UsePeriod[],
): Spent {
  const next: Record<string, number> = { ...spent };
  for (const item of items) {
    if (!periods.includes(item.period)) continue;
    const value = before[item.key];
    if (value === undefined) delete next[item.key];
    else next[item.key] = value;
  }
  return next;
}

export function sameSpent(a: Spent, b: Spent): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if ((a[key] ?? 0) !== (b[key] ?? 0)) return false;
  return true;
}

/** "2 of 3 left". */
export function leftText(left: number, count: number): string {
  return `${left} of ${count} left`;
}

/** "Assault use 2 of 3, spent". */
export function pipLabel(item: TrackedUse, index: number, isSpent: boolean): string {
  return `${item.name} use ${index + 1} of ${item.count}, ${isSpent ? 'spent' : 'available'}`;
}

// ---- Mastery magic ----

/** A mastery magic ability on the Play Tracker: using it spends the uses it lists. */
export interface MasteryMove {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  /** Tracked uses it spends, by item key, with how many of each. */
  readonly spends: readonly {
    readonly key: string;
    readonly name: string;
    readonly count: number;
  }[];
}

/** The basic, adept, and advanced abilities of every mastery magic the character owns. */
export function masteryMoves(sheet: Sheet, ruleset: Ruleset): MasteryMove[] {
  const owned = new Set(
    sheet.skills.filter((s) => s.parts.some((p) => p.level > 0)).map((s) => s.skillId),
  );
  return ruleset.spells.flatMap((s) =>
    s.mastery && owned.has(s.masterySkill) && s.expends.length > 0
      ? [
          {
            id: s.id,
            name: s.name,
            text: s.text,
            spends: s.expends.map((e) => ({
              key: `skill:${e.skill}:${e.part}`,
              name: skillPartName(ruleset, e.skill, e.part as SkillPart),
              count: e.count,
            })),
          },
        ]
      : [],
  );
}

/** How many times a mastery ability can still be used: the scarcest use it needs. */
export function movesLeft(spent: Spent, items: readonly TrackedUse[], move: MasteryMove): number {
  let left = Number.POSITIVE_INFINITY;
  for (const need of move.spends) {
    const item = items.find((i) => i.key === need.key);
    left = Math.min(left, item ? Math.floor(leftOf(spent, item) / need.count) : 0);
  }
  return Number.isFinite(left) ? left : 0;
}

/** Spends every use a mastery ability needs, or returns `spent` unchanged when one is missing. */
export function spendMove(spent: Spent, items: readonly TrackedUse[], move: MasteryMove): Spent {
  if (movesLeft(spent, items, move) < 1) return spent;
  let next = spent;
  for (const need of move.spends) {
    const item = items.find((i) => i.key === need.key);
    if (!item) return spent;
    for (let n = 0; n < need.count; n += 1) next = spendOne(next, item);
  }
  return next;
}
