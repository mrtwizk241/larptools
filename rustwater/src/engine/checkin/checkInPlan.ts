// Pre-registration for an event: the check-in items a character collects, the choices the player
// makes (resources or Bits, resource types, upkeep, the Sorcerer's start-of-event picks), and the
// Shiny purchases, checked against the rules. Pure TS. Rules: docs/rules-spec/10-check-in.md.
import { z } from 'zod';
import type { Ruleset } from '../../data/index.ts';
import { RefIdSchema } from '../actions/define.ts';
import { plan } from '../commands/plan.ts';
import { deriveSheet } from '../derive/deriveSheet.ts';
import type { Action, GameEvent } from '../model.ts';
import type { Sheet } from '../sheet.ts';

const Count = z.int().min(0).max(1000);

/** Per tier counts: how many uses (or resources) of each tier the player assigns. */
const TierCounts = z.object({ common: Count, uncommon: Count, rare: Count });
export type TierCounts = z.infer<typeof TierCounts>;

export const CheckInChoicesSchema = z.object({
  /** Human passive: take 10 Bits instead of the 2 resources. */
  humanPassiveBits: z.boolean().optional(),
  /** Deep Pockets: levels taken as 10 Bits each instead of 2 resources. */
  deepPocketsBitsLevels: Count.optional(),
  /** Deep Pockets: a note to staff, for example about stacking for higher rarity (Q-CHK-4). */
  deepPocketsNote: z.string().trim().max(500).optional(),
  /** Scavenging: upgrades to use (each turns a basic use into an adept or advanced one). */
  scavengingAdept: Count.optional(),
  scavengingAdvanced: Count.optional(),
  /** Scavenging: uses of each tier taken as Bits instead of a resource. */
  scavengingBits: TierCounts.optional(),
  /** Dismantle: resources of each tier taken as Scrap (the rest are Junk). */
  dismantleFirstType: TierCounts.optional(),
  /** Harvesting: resources of each tier taken as Chemical (the rest are Organic). */
  harvestingFirstType: TierCounts.optional(),
  /**
   * How upkeep is paid when due. `shinies` buys "Upkeep Covered"; `scavenging` spends one basic
   * Scavenging use; `other-character` means another character pays (named in upkeepPayer).
   */
  upkeep: z.enum(['resources', 'bits', 'shinies', 'scavenging', 'other-character']).optional(),
  /** The character paying this character's upkeep. */
  upkeepPayer: z.string().trim().max(200).optional(),
  /** Familiar Gather: false skips the 3 resources this event. */
  familiarGather: z.boolean().optional(),
  /** Profession start-of-event picks, by the data's perEventChoice field. */
  professionPicks: z.record(z.string().min(1).max(100), z.string().min(1).max(100)).optional(),
});
export type CheckInChoices = z.infer<typeof CheckInChoicesSchema>;

export const PlannedPurchaseSchema = z.object({
  purchaseId: RefIdSchema,
  qty: z.int().min(1).max(1000),
  /** Resource purchases: how many of each resource type (chemical, organic, scrap, junk). */
  types: z.record(z.string().min(1).max(50), z.int().min(0).max(1000)).optional(),
});
export type PlannedPurchase = z.infer<typeof PlannedPurchaseSchema>;

/** How the player pays for the event itself (the event's Pre-Reg form). */
export const EventPaymentSchema = z.enum(['online', 'at-event', 'season-pass']);
export type EventPayment = z.infer<typeof EventPaymentSchema>;

/** Event CXP bought at 500 Shinies an event; staff check and record these at the desk. */
export const EventCxpPlanSchema = z.object({
  missedEvents: z.int().min(0).max(10).default(0),
  /** Which event dates, current or previous season. */
  missedDetails: z.string().trim().max(1000).default(''),
  altCharacterEvents: z.int().min(0).max(3).default(0),
  altCharacterName: z.string().trim().max(200).default(''),
});

export const RegistrationPlanSchema = z.object({
  /** Attendance the player plans (staff confirm at check-in). */
  attendance: RefIdSchema.default('player'),
  purchases: z.array(PlannedPurchaseSchema).max(20).default([]),
  choices: CheckInChoicesSchema.default({}),
  note: z.string().trim().max(2000).default(''),
  /** The player confirmed they will also book the event on the website. */
  bookingConfirmed: z.boolean().default(false),
  payment: EventPaymentSchema.optional(),
  eventCxp: EventCxpPlanSchema.optional(),
});
export type RegistrationPlan = z.output<typeof RegistrationPlanSchema>;
export type RegistrationPlanInput = z.input<typeof RegistrationPlanSchema>;

/** Shiny purchases a player may make when pre-registering; the rest stay with staff. */
export const PREREG_PURCHASES = [
  'buy-cxp',
  'buy-pxp',
  'buy-bits',
  'buy-basic-resource',
  'buy-uncommon-resource',
  'buy-rare-resource',
] as const;
const UPKEEP_PURCHASE = 'buy-upkeep';
const MISSED_EVENT_PURCHASE = 'buy-missed-event-cxp';
const ALT_CHARACTER_PURCHASE = 'buy-alt-character-event-cxp';

export const PAYMENT_TEXT: Record<EventPayment, string> = {
  online: 'Have paid or will pay online before the event',
  'at-event': 'Will pay at the event',
  'season-pass': 'Has the Season Pass',
};

/** Questions the Pre-Reg form asks that only the player answers (not checked at the desk). */
export function playerFormProblems(plan: RegistrationPlanInput): string[] {
  const problems: string[] = [];
  if (plan.bookingConfirmed !== true)
    problems.push('Confirm that you will also book the event on the website.');
  if (!plan.payment) problems.push('Choose how you are paying for the event.');
  return problems;
}

export type Rarity = 'common' | 'uncommon' | 'rare';
export const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare'];

/** One line of the pull list: what staff hand over at check-in. */
export interface PullItem {
  /** A check-in skill or ability, or a Shiny purchase. */
  from: 'check-in' | 'purchase';
  /** Where it comes from, for example "Scavenging" or "Shinies: Basic Resource". */
  source: string;
  qty: number;
  what: 'bits' | 'resource' | 'random-draw';
  rarity: Rarity | null;
  /** Resource type id, or null for a random one. */
  type: string | null;
  /** "3 random Common resources", "10 Bits", "2 Uncommon Scrap". */
  text: string;
}

/** A check-in skill or ability the character has, with what the player can choose for it. */
export type CheckInSource =
  | { kind: 'human-passive'; name: string; text: string }
  | { kind: 'deep-pockets'; name: string; text: string; level: number }
  | { kind: 'look-what-i-found'; name: string; text: string; level: number }
  | {
      kind: 'scavenging';
      name: string;
      text: string;
      basic: number;
      adept: number;
      advanced: number;
      mastery: boolean;
    }
  | {
      kind: 'dismantle' | 'harvesting';
      name: string;
      text: string;
      basic: number;
      adept: number;
      advanced: number;
      /** The two resource types the player chooses between, first is the default. */
      types: readonly [string, string];
    }
  | { kind: 'familiar-gather'; name: string; text: string }
  | {
      kind: 'profession-pick';
      name: string;
      text: string;
      field: string;
      options: readonly { id: string; name: string }[];
    };

export interface UpkeepInfo {
  due: boolean;
  /** Why it is not due, for example "first event". */
  reason: string | null;
}

function partLevel(sheet: Sheet, skillId: string, part: string): number {
  return (
    sheet.skills.find((s) => s.skillId === skillId)?.parts.find((p) => p.part === part)?.level ?? 0
  );
}

function partText(ruleset: Ruleset, skillId: string, part: string): string {
  return ruleset.skillsById[skillId]?.parts[part as 'basic']?.text ?? '';
}

/** Every check-in source this character has. */
export function checkInSources(ruleset: Ruleset, sheet: Sheet): CheckInSource[] {
  const out: CheckInSource[] = [];
  const ancestry = sheet.ancestry;
  if (ancestry) {
    for (const passive of ancestry.passives ?? [])
      if (passive.id === 'human-passive')
        out.push({ kind: 'human-passive', name: 'Human passive (Scavenger)', text: passive.text });
    for (const ability of ancestry.abilities) {
      if (ability.id === 'deep-pockets' && ability.level > 0)
        out.push({
          kind: 'deep-pockets',
          name: ability.name,
          text: ability.text,
          level: ability.level,
        });
      if (ability.id === 'look-what-i-found' && ability.level > 0)
        out.push({
          kind: 'look-what-i-found',
          name: ability.name,
          text: ability.text,
          level: ability.level,
        });
    }
  }

  const scav = partLevel(sheet, 'scavenging', 'basic');
  if (scav > 0)
    out.push({
      kind: 'scavenging',
      name: 'Scavenging',
      text: partText(ruleset, 'scavenging', 'basic'),
      basic: scav,
      adept: partLevel(sheet, 'scavenging', 'adept'),
      advanced: partLevel(sheet, 'scavenging', 'advanced'),
      mastery: partLevel(sheet, 'scavenging', 'mastery') > 0,
    });

  for (const [id, types] of [
    ['dismantle', ['scrap', 'junk']],
    ['harvesting', ['chemical', 'organic']],
  ] as const) {
    const basic = partLevel(sheet, id, 'basic');
    if (basic > 0)
      out.push({
        kind: id,
        name: ruleset.skillsById[id]?.name ?? id,
        text: partText(ruleset, id, 'basic'),
        basic,
        adept: partLevel(sheet, id, 'adept'),
        advanced: partLevel(sheet, id, 'advanced'),
        types,
      });
  }

  const familiar = sheet.familiar;
  if (familiar?.awakenedSkill?.id === 'gather')
    out.push({
      kind: 'familiar-gather',
      name: `Gather (familiar ${familiar.name})`,
      text: familiar.awakenedSkill.text,
    });

  const profession = sheet.profession;
  const profData = profession ? ruleset.professionsById[profession.professionId] : undefined;
  if (profession && profData) {
    const picks: {
      name: string;
      text: string;
      choice: NonNullable<typeof profData.passive.perEventChoice>;
    }[] = [];
    if (profData.passive.perEventChoice)
      picks.push({
        name: profData.passive.name,
        text: profData.passive.text,
        choice: profData.passive.perEventChoice,
      });
    for (const skill of profData.skills) {
      const choice = skill.perEventChoice;
      if (!choice) continue;
      const view = profession.skills.find((s) => s.id === skill.id);
      if (!view || view.level < 1) continue;
      if (choice.tier && !view.tiers.some((t) => t.tier === choice.tier && t.unlocked)) continue;
      const tierText = choice.tier ? skill.tiers?.[choice.tier].text : undefined;
      picks.push({
        name: choice.tier ? `${skill.name} (${choice.tier})` : skill.name,
        text: tierText ?? skill.text ?? '',
        choice,
      });
    }
    for (const pick of picks) {
      const options =
        pick.choice.kind === 'magic-school'
          ? ruleset.ruleset.magicSchools.map((s) => ({ id: s.id, name: `${s.name} magic` }))
          : sheet.memory.entries
              .filter(
                (e) =>
                  e.kind === 'spell' &&
                  e.refId !== null &&
                  (!pick.choice.rank || e.rank === pick.choice.rank) &&
                  !(pick.choice.excludeSpells ?? []).includes(e.refId),
              )
              .map((e) => ({ id: e.refId ?? '', name: e.name }));
      out.push({
        kind: 'profession-pick',
        name: pick.name,
        text: pick.text,
        field: pick.choice.field,
        options,
      });
    }
  }
  return out;
}

/** Upkeep for this event: due unless it is the character's first event or the ancestry pays none. */
export function upkeepFor(ruleset: Ruleset, sheet: Sheet, eventKey: string): UpkeepInfo {
  const rules = ruleset.ruleset.upkeep;
  const ancestryId = sheet.ancestry?.ancestryId;
  if (ancestryId !== undefined && rules.zeroForAncestries.includes(ancestryId))
    return { due: false, reason: `${sheet.ancestry?.ancestryName ?? ancestryId} pay no upkeep` };
  const before = sheet.events.filter((e) => e.key !== eventKey);
  if (rules.firstEventFree && before.length === 0)
    return { due: false, reason: 'first event: no upkeep' };
  return { due: true, reason: null };
}

function rarityName(ruleset: Ruleset, id: string): string {
  return ruleset.ruleset.rarities.find((r) => r.id === id)?.name ?? id;
}

function typeName(ruleset: Ruleset, id: string): string {
  return ruleset.ruleset.resourceTypes.find((r) => r.id === id)?.name ?? id;
}

function resourceItem(
  ruleset: Ruleset,
  source: string,
  qty: number,
  rarity: Rarity | null,
  type: string | null,
): PullItem {
  const rarityText = rarity ? `${rarityName(ruleset, rarity)} ` : '';
  const text = type
    ? `${qty} ${rarityText}${typeName(ruleset, type)}`
    : `${qty} random ${rarityText}resource${qty === 1 ? '' : 's'}`;
  return {
    from: source.startsWith('Shinies: ') ? 'purchase' : 'check-in',
    source,
    qty,
    what: 'resource',
    rarity,
    type,
    text,
  };
}

function bitsItem(source: string, qty: number): PullItem {
  return {
    from: source.startsWith('Shinies: ') ? 'purchase' : 'check-in',
    source,
    qty,
    what: 'bits',
    rarity: null,
    type: null,
    text: `${qty} Bits`,
  };
}

const clamp = (n: number | undefined, max: number) => Math.max(0, Math.min(n ?? 0, max));

/** Tiers for Dismantle and Harvesting: automatic upgrades, advanced first, capped at the basic level. */
export function gatherTiers(basic: number, adept: number, advanced: number) {
  const rare = Math.min(advanced, basic);
  const uncommon = Math.min(adept, basic - rare);
  return { common: (basic - rare - uncommon) * 2, uncommon: uncommon * 2, rare };
}

/** Scavenging uses per tier after the chosen upgrades (default: all upgrades, advanced first). */
export function scavengingTiers(
  source: Extract<CheckInSource, { kind: 'scavenging' }>,
  choices: CheckInChoices,
) {
  const advanced = clamp(
    choices.scavengingAdvanced ?? source.advanced,
    Math.min(source.advanced, source.basic),
  );
  const adept = clamp(
    choices.scavengingAdept ?? source.adept,
    Math.min(source.adept, source.basic - advanced),
  );
  return { common: source.basic - adept - advanced, uncommon: adept, rare: advanced };
}

const SCAV_BITS: Record<Rarity, number> = { common: 10, uncommon: 15, rare: 20 };

/** Items a character collects from their check-in sources with these choices. */
export function checkInItems(
  ruleset: Ruleset,
  sources: readonly CheckInSource[],
  choices: CheckInChoices,
): { items: PullItem[]; picks: string[]; problems: string[] } {
  const items: PullItem[] = [];
  const picks: string[] = [];
  const problems: string[] = [];
  for (const source of sources) {
    switch (source.kind) {
      case 'human-passive':
        items.push(
          choices.humanPassiveBits
            ? bitsItem(source.name, 10)
            : resourceItem(ruleset, source.name, 2, 'common', null),
        );
        break;
      case 'deep-pockets': {
        const bits = clamp(choices.deepPocketsBitsLevels, source.level);
        if (bits > 0) items.push(bitsItem(source.name, bits * 10));
        if (source.level - bits > 0)
          items.push(resourceItem(ruleset, source.name, (source.level - bits) * 2, 'common', null));
        if (choices.deepPocketsNote) picks.push(`${source.name}: ${choices.deepPocketsNote}`);
        break;
      }
      case 'look-what-i-found':
        items.push({
          from: 'check-in',
          source: source.name,
          qty: source.level * 2,
          what: 'random-draw',
          rarity: null,
          type: null,
          text: `${source.level * 2} random draws (a resource or a consumable that falls apart after the event)`,
        });
        break;
      case 'scavenging': {
        const tiers = scavengingTiers(source, choices);
        for (const rarity of RARITIES) {
          const uses = tiers[rarity];
          if (uses === 0) continue;
          const bits = clamp(choices.scavengingBits?.[rarity], uses);
          if (bits > 0) items.push(bitsItem(source.name, bits * SCAV_BITS[rarity]));
          if (uses - bits > 0)
            items.push(resourceItem(ruleset, source.name, uses - bits, rarity, null));
          if (source.mastery)
            items.push(resourceItem(ruleset, `${source.name} Mastery`, uses, rarity, null));
        }
        break;
      }
      case 'dismantle':
      case 'harvesting': {
        const tiers = gatherTiers(source.basic, source.adept, source.advanced);
        const split =
          source.kind === 'dismantle' ? choices.dismantleFirstType : choices.harvestingFirstType;
        for (const rarity of RARITIES) {
          const total = tiers[rarity];
          if (total === 0) continue;
          const first = split ? clamp(split[rarity], total) : total;
          if (first > 0)
            items.push(resourceItem(ruleset, source.name, first, rarity, source.types[0]));
          if (total - first > 0)
            items.push(resourceItem(ruleset, source.name, total - first, rarity, source.types[1]));
        }
        break;
      }
      case 'familiar-gather':
        if (choices.familiarGather === false) picks.push(`${source.name}: not used this event`);
        else items.push(resourceItem(ruleset, source.name, 3, null, null));
        break;
      case 'profession-pick': {
        const picked = choices.professionPicks?.[source.field];
        const option = source.options.find((o) => o.id === picked);
        if (option) picks.push(`${source.name}: ${option.name}`);
        else if (picked) problems.push(`${source.name}: choose one of the options.`);
        break;
      }
    }
  }
  return { items, picks, problems };
}

export interface PlannedPurchaseResult {
  purchaseId: string;
  name: string;
  qty: number;
  cost: number;
  /** Resource types chosen, as text, for example "2 Scrap, 1 Junk". */
  typesText: string | null;
  /** Bought with staff at the desk (missed-event and alternate-character Event CXP). */
  atDesk?: boolean;
}

export interface RegistrationCheck {
  /** Readable problems; empty when the plan can be saved. */
  errors: string[];
  sources: CheckInSource[];
  upkeep: UpkeepInfo & { paidWith: CheckInChoices['upkeep'] | null };
  purchases: PlannedPurchaseResult[];
  shiniesCost: number;
  shiniesBalance: number;
  /** Everything staff hand over, in order: check-in skills, then Shiny purchases. */
  items: PullItem[];
  /** Start-of-event choices and notes, as text. */
  picks: string[];
  /** The engine commands staff run at check-in, before the check-in itself. */
  purchaseCommands: { purchaseId: string; qty: number; note?: string }[];
}

function purchaseItems(ruleset: Ruleset, purchase: PlannedPurchase, name: string): PullItem[] {
  const def = ruleset.shinyPurchasesById[purchase.purchaseId];
  const items: PullItem[] = [];
  for (const item of def?.items ?? []) {
    const qty = item.qty * purchase.qty;
    if (item.kind === 'bits') items.push(bitsItem(`Shinies: ${name}`, qty));
    if (item.kind === 'resource') {
      const rarity = (item.rarity ?? null) as Rarity | null;
      const types = Object.entries(purchase.types ?? {}).filter(([, n]) => n > 0);
      if (types.length === 0)
        items.push(resourceItem(ruleset, `Shinies: ${name}`, qty, rarity, null));
      for (const [type, n] of types)
        items.push(resourceItem(ruleset, `Shinies: ${name}`, n, rarity, type));
    }
  }
  return items;
}

/**
 * Checks a pre-registration against the rules: the choices, every Shiny purchase in order (price,
 * per-event cap, balance), and upkeep. Returns the pull list staff use at check-in.
 */
export function checkRegistration(
  ruleset: Ruleset,
  actions: readonly Action[],
  event: GameEvent,
  input: RegistrationPlanInput,
): RegistrationCheck {
  const parsed = RegistrationPlanSchema.safeParse(input);
  const sheet = deriveSheet(ruleset, actions);
  const sources = checkInSources(ruleset, sheet);
  const upkeepBase = upkeepFor(ruleset, sheet, event.key);
  const empty: RegistrationCheck = {
    errors: ['The registration is not valid.'],
    sources,
    upkeep: { ...upkeepBase, paidWith: null },
    purchases: [],
    shiniesCost: 0,
    shiniesBalance: sheet.points.shinies.balance,
    items: [],
    picks: [],
    purchaseCommands: [],
  };
  if (!parsed.success) return empty;
  const regPlan = parsed.data;
  const errors: string[] = [];
  if (!ruleset.attendanceById[regPlan.attendance]) errors.push('Choose how you are attending.');
  if (sheet.events.some((e) => e.key === event.key))
    errors.push(`${sheet.profile.characterName} is already checked in to ${event.name}.`);

  const paidWith = upkeepBase.due ? (regPlan.choices.upkeep ?? null) : null;
  const scavenging = sources.find((s) => s.kind === 'scavenging');
  if (paidWith === 'scavenging' && (!scavenging || scavenging.basic < 1))
    errors.push('Paying upkeep with Scavenging needs a level of Scavenging.');
  // Upkeep paid with Scavenging spends one basic use, so one fewer use collects at check-in.
  const itemSources =
    paidWith === 'scavenging'
      ? sources.map((s) =>
          s.kind === 'scavenging' && s.basic > 0
            ? {
                ...s,
                basic: s.basic - 1,
                advanced: Math.min(s.advanced, s.basic - 1),
                adept: Math.min(s.adept, s.basic - 1),
              }
            : s,
        )
      : sources;
  const { items, picks, problems } = checkInItems(ruleset, itemSources, regPlan.choices);
  errors.push(...problems);

  // Shiny purchases, planned one by one on the running sheet, like staff would at the desk.
  const commands: RegistrationCheck['purchaseCommands'] = [];
  const results: PlannedPurchaseResult[] = [];
  const pullFromPurchases: PullItem[] = [];
  const seen = new Set<string>();
  for (const p of regPlan.purchases) {
    const def = ruleset.shinyPurchasesById[p.purchaseId];
    if (!def || !(PREREG_PURCHASES as readonly string[]).includes(p.purchaseId)) {
      errors.push(`${def?.name ?? p.purchaseId} cannot be bought when pre-registering.`);
      continue;
    }
    if (seen.has(p.purchaseId)) {
      errors.push(`${def.name} is listed twice.`);
      continue;
    }
    seen.add(p.purchaseId);
    const isResource = def.items?.some((i) => i.kind === 'resource') ?? false;
    let typesText: string | null = null;
    if (isResource) {
      const types = Object.entries(p.types ?? {}).filter(([, n]) => n > 0);
      const known = new Set<string>(ruleset.ruleset.resourceTypes.map((t) => t.id));
      const total = types.reduce((sum, [, n]) => sum + n, 0);
      if (types.some(([t]) => !known.has(t))) errors.push(`${def.name}: unknown resource type.`);
      else if (total !== p.qty)
        errors.push(`${def.name}: choose a type for each of the ${p.qty} resources.`);
      else typesText = types.map(([t, n]) => `${n} ${typeName(ruleset, t)}`).join(', ');
    }
    commands.push({
      purchaseId: p.purchaseId,
      qty: p.qty,
      ...(typesText ? { note: `Types: ${typesText}` } : {}),
    });
    results.push({
      purchaseId: p.purchaseId,
      name: def.name,
      qty: p.qty,
      cost: def.price * p.qty,
      typesText,
    });
    pullFromPurchases.push(...purchaseItems(ruleset, p, def.name));
  }

  if (upkeepBase.due && !paidWith) errors.push('Choose how you pay upkeep.');
  if (paidWith === 'shinies') {
    const def = ruleset.shinyPurchasesById[UPKEEP_PURCHASE];
    if (def) {
      commands.push({ purchaseId: UPKEEP_PURCHASE, qty: 1 });
      results.push({
        purchaseId: UPKEEP_PURCHASE,
        name: def.name,
        qty: 1,
        cost: def.price,
        typesText: null,
      });
    }
  }
  if (paidWith === 'resources') picks.push('Upkeep: paying 2 basic resources');
  if (paidWith === 'bits') picks.push('Upkeep: paying 10 Bits');
  if (paidWith === 'shinies') picks.push('Upkeep: covered with Shinies');
  if (paidWith === 'scavenging') picks.push('Upkeep: paying 1 level of Scavenging');
  if (paidWith === 'other-character') {
    const payer = regPlan.choices.upkeepPayer?.trim() ?? '';
    if (payer === '') errors.push('Say which character is paying your upkeep.');
    else picks.push(`Upkeep: paid by another character (${payer})`);
  }

  // Event CXP bought at the desk: counted against the balance here, recorded by staff.
  const deskResults: PlannedPurchaseResult[] = [];
  const cxp = regPlan.eventCxp;
  const desk = (purchaseId: string, qty: number, details: string, missing: string) => {
    const def = ruleset.shinyPurchasesById[purchaseId];
    if (!def || qty === 0) return;
    if (details === '') errors.push(missing);
    deskResults.push({
      purchaseId,
      name: def.name,
      qty,
      cost: def.price * qty,
      typesText: details || null,
      atDesk: true,
    });
  };
  if (cxp) {
    desk(
      MISSED_EVENT_PURCHASE,
      cxp.missedEvents,
      cxp.missedDetails,
      'Missed event CXP: list the event dates you are buying for.',
    );
    desk(
      ALT_CHARACTER_PURCHASE,
      cxp.altCharacterEvents,
      cxp.altCharacterName,
      'Alternate character CXP: name the character it is for.',
    );
  }

  // Run the purchases through the engine for prices, caps, and the balance.
  let running = [...actions];
  let n = 0;
  for (const c of commands) {
    const current = deriveSheet(ruleset, running);
    const result = plan(
      ruleset,
      current,
      { type: 'spendShinies', purchaseId: c.purchaseId, qty: c.qty, eventKey: event.key },
      {
        actor: { role: 'staff' },
        now: () => '2000-01-01T00:00:00.000Z',
        newId: () => `registration-check-${++n}`,
        nextSeq: current.lastSeq + 1,
      },
    );
    if (!result.ok) {
      const name = ruleset.shinyPurchasesById[c.purchaseId]?.name ?? c.purchaseId;
      for (const e of result.errors) errors.push(`${name}: ${e.message}`);
      continue;
    }
    running = [...running, ...result.actions];
  }

  const allResults = [...results, ...deskResults];
  const shiniesCost = allResults.reduce((sum, r) => sum + r.cost, 0);
  if (deskResults.length > 0 && shiniesCost > sheet.points.shinies.balance)
    errors.push(
      `These choices cost ${shiniesCost} Shinies, but ${sheet.profile.characterName} has ${sheet.points.shinies.balance}.`,
    );

  return {
    errors,
    sources,
    upkeep: { ...upkeepBase, paidWith },
    purchases: allResults,
    shiniesCost,
    shiniesBalance: sheet.points.shinies.balance,
    items: [...items, ...pullFromPurchases],
    picks,
    purchaseCommands: commands,
  };
}
