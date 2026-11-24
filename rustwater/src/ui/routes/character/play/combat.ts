// Health, armor, and damage for the Play Tracker ([PLAY-COMBAT] in docs/rules-spec/03-play-rules.md).
// Permanent numbers come from the sheet (skills, ancestry, boons, familiar passives); repop and
// encounter buffs are chosen by the player. Buff slot rule (Rulebook p.45-46): of the slotted
// buffs to one stat only the highest counts; unslotted buffs add on top. Buffs that cannot be
// healed or refit (temporary health or armor) are not tracked here.
// Pure apart from `readCombatState` and `savedDamageLines`, which read this device's choices.
import type { Ruleset, Sheet } from '../../../../engine/index.ts';

/** When a buff ends, which is also how the cards group them. */
export type Timing = 'permanent' | 'repop' | 'encounter';

/** Group order in every card: Permanent, Repop, Encounter. */
export const TIMINGS: readonly { readonly id: Timing; readonly title: string }[] = [
  { id: 'permanent', title: 'Permanent' },
  { id: 'repop', title: 'Repop' },
  { id: 'encounter', title: 'Encounter' },
];

export type BuffKind = 'slot' | 'unslotted';

/** Which attacks a damage bonus applies to. */
export type Applies = 'weapon' | 'packet' | 'ruin-packet' | 'harm-packet' | 'any';

export interface Buff {
  readonly id: string;
  readonly name: string;
  /** Where it comes from, for example "Life spell" or "Crafted tonic". */
  readonly source: string;
  readonly amount: number;
  readonly kind: BuffKind;
  readonly timing: Exclude<Timing, 'permanent'>;
  /** "until the next repop". */
  readonly lasts: string;
  /** Damage buffs: which attacks it applies to. */
  readonly applies?: Applies;
  /** Buffs sharing a group are exclusive (one Blessing of Nature, one Tactics unit). */
  readonly group?: string;
  /**
   * Takes the buff slot whatever its amount (Mantle of Death): while chosen, no other slotted
   * buff to the same stat counts.
   */
  readonly holdsSlot?: boolean;
}

export interface Line {
  readonly label: string;
  readonly amount: number;
}

function spellName(rs: Ruleset, id: string, fallback: string): string {
  return rs.spellsById[id]?.name ?? fallback;
}

function recipeName(rs: Ruleset, id: string, fallback: string): string {
  return rs.recipesById[id]?.name ?? fallback;
}

function performanceName(rs: Ruleset, id: string, fallback: string): string {
  return rs.performancesById[id]?.name ?? fallback;
}

function hasFamiliarSkill(sheet: Sheet, skillId: string): boolean {
  return sheet.familiar?.learned.some((s) => s.skillId === skillId) ?? false;
}

function familiarLabel(sheet: Sheet): string {
  return `Familiar ${sheet.familiar?.name ?? ''}`.trim();
}

function level(sheet: Sheet, skillId: string, part = 'main'): number {
  return (
    sheet.skills.find((s) => s.skillId === skillId)?.parts.find((p) => p.part === part)?.level ?? 0
  );
}

function boonTotal(sheet: Sheet, stat: string): Line[] {
  return sheet.boons.flatMap((b) =>
    b.effects.filter((e) => e.stat === stat).map((e) => ({ label: b.name, amount: e.add })),
  );
}

function skillLines(rs: Ruleset, sheet: Sheet, stat: string): Line[] {
  const byName = new Map<string, number>();
  for (const c of sheet.stats.contributions) {
    if (c.stat !== stat || c.condition !== null || c.amount === 0) continue;
    const label =
      c.source.kind === 'base'
        ? 'Base'
        : c.source.kind === 'skill'
          ? (rs.skillsById[c.source.id]?.name ?? c.source.id)
          : 'Ancestry';
    byName.set(label, (byName.get(label) ?? 0) + c.amount);
  }
  return [...byName].map(([label, amount]) => ({ label, amount }));
}

/** Buffs of one card in display order, grouped by timing; empty groups are left out. */
export function groupByTiming(
  buffs: readonly Buff[],
): { timing: Exclude<Timing, 'permanent'>; buffs: Buff[] }[] {
  return (['repop', 'encounter'] as const)
    .map((timing) => ({ timing, buffs: buffs.filter((b) => b.timing === timing) }))
    .filter((g) => g.buffs.length > 0);
}

// ---------- Health ----------

/** Max Health and where it comes from: base, skills, ancestry, boons, familiar. */
export function healthLines(rs: Ruleset, sheet: Sheet): Line[] {
  return [
    ...skillLines(rs, sheet, 'maxHealth'),
    ...boonTotal(sheet, 'maxHealth'),
    ...(hasFamiliarSkill(sheet, 'fam-max-health')
      ? [{ label: familiarLabel(sheet), amount: 10 }]
      : []),
  ];
}

/** Health buffs that can be healed: repop and encounter buffs in a buff slot. */
export function healthBuffs(rs: Ruleset, sheet: Sheet): Buff[] {
  return [
    {
      id: 'bolster-toughness',
      name: spellName(rs, 'bolster-toughness', 'Bolster Toughness'),
      source: 'Life spell',
      amount: 10,
      kind: 'slot',
      timing: 'repop',
      lasts: 'until the next repop',
    },
    {
      id: 'strong-body-brew',
      name: recipeName(rs, 'strong-body-brew', 'Strong Body Brew'),
      source: 'Crafted tonic',
      amount: 10,
      kind: 'slot',
      timing: 'repop',
      lasts: 'until the next repop',
    },
    ...(hasFamiliarSkill(sheet, 'fam-health-buff')
      ? [
          {
            id: 'fam-health-buff',
            name: 'Familiar Health buff',
            source: familiarLabel(sheet),
            amount: 10,
            kind: 'slot' as const,
            timing: 'repop' as const,
            lasts: 'until the next repop',
          },
        ]
      : []),
    {
      id: 'fortify-toughness',
      name: spellName(rs, 'fortify-toughness', 'Fortify Toughness'),
      source: 'Life spell',
      amount: 20,
      kind: 'slot',
      timing: 'encounter',
      lasts: 'until the end of the encounter',
    },
  ];
}

// ---------- Armor ----------

export const ARMOR_LOCATIONS = [
  'Head',
  'Upper arms',
  'Lower arms',
  'Front torso',
  'Back torso',
  'Upper legs',
  'Lower legs',
] as const;

/** Permanent armor: the Armor skill, boons, familiar. */
export function armorLines(rs: Ruleset, sheet: Sheet): Line[] {
  return [
    ...skillLines(rs, sheet, 'armor'),
    ...boonTotal(sheet, 'armor'),
    ...(hasFamiliarSkill(sheet, 'fam-max-armor')
      ? [{ label: familiarLabel(sheet), amount: 10 }]
      : []),
  ].filter((l) => l.amount !== 0);
}

/** Phys rep coverage (Rulebook p.37, p.53): 2 per location, 5 for each location the Armor skill upgrades. */
export function physrepArmor(sheet: Sheet, covered: number): { amount: number; upgraded: number } {
  const armorLevel = level(sheet, 'armor');
  const upgradedMax = armorLevel >= 5 ? ARMOR_LOCATIONS.length : armorLevel;
  const upgraded = Math.min(covered, upgradedMax);
  return { amount: upgraded * 5 + (covered - upgraded) * 2, upgraded };
}

/** Reflex armor, which counts only without the Armor skill and without worn armor. */
export function reflexArmor(
  sheet: Sheet,
  covered: number,
): { amount: number; blocked: string | null } {
  const amount = sheet.stats.totals['reflexArmor'] ?? 0;
  if (amount === 0) return { amount: 0, blocked: null };
  if (level(sheet, 'armor') > 0)
    return { amount: 0, blocked: 'Reflexes give nothing with the Armor skill.' };
  if (covered > 0) return { amount: 0, blocked: 'Reflexes give nothing while wearing armor.' };
  return { amount, blocked: null };
}

/** Armor buffs that can be refit: repop and encounter buffs in a buff slot. */
export function armorBuffs(rs: Ruleset, sheet: Sheet): Buff[] {
  return [
    {
      id: 'protective-metal',
      name: spellName(rs, 'protective-metal', 'Protective Metal'),
      source: 'Tech spell',
      amount: 10,
      kind: 'slot',
      timing: 'repop',
      lasts: 'until the next repop',
    },
    {
      id: 'stalwart-magic-basic',
      name: spellName(rs, 'stalwart-magic-basic', 'Stalwart Magic: Basic'),
      source: 'Stalwart Magic',
      amount: 20,
      kind: 'slot',
      timing: 'repop',
      lasts: 'until the next repop',
    },
    ...(hasFamiliarSkill(sheet, 'fam-armor-buff')
      ? [
          {
            id: 'fam-armor-buff',
            name: 'Familiar Armor buff',
            source: familiarLabel(sheet),
            amount: 10,
            kind: 'slot' as const,
            timing: 'repop' as const,
            lasts: 'until the next repop',
          },
        ]
      : []),
    {
      id: 'reinforced-metal',
      name: spellName(rs, 'reinforced-metal', 'Reinforced Metal'),
      source: 'Tech spell',
      amount: 20,
      kind: 'slot',
      timing: 'encounter',
      lasts: 'until the end of the encounter',
    },
  ];
}

// ---------- Totals with buffs ----------

export interface BuffTotals {
  /** The slotted buff that counts (the highest), if any. */
  readonly slot: Buff | null;
  /** Slotted buffs that do not count because a higher one does. */
  readonly ignored: readonly Buff[];
  /** Unslotted bonuses that add on. */
  readonly extra: number;
}

/** Applies the buff slot rule to the chosen buffs. */
export function buffTotals(buffs: readonly Buff[], chosen: ReadonlySet<string>): BuffTotals {
  const on = buffs.filter((b) => chosen.has(b.id));
  const slotted = on.filter((b) => b.kind === 'slot').sort((a, b) => b.amount - a.amount);
  return {
    slot: slotted[0] ?? null,
    ignored: slotted.slice(1),
    extra: on.filter((b) => b.kind === 'unslotted').reduce((sum, b) => sum + b.amount, 0),
  };
}

/** Turning one buff on turns off others in its group (one Blessing of Nature, one Tactics unit). */
export function toggleBuff(
  buffs: readonly Buff[],
  chosen: ReadonlySet<string>,
  id: string,
): Set<string> {
  const next = new Set(chosen);
  if (next.has(id)) {
    next.delete(id);
    return next;
  }
  const group = buffs.find((b) => b.id === id)?.group;
  if (group) for (const b of buffs) if (b.group === group) next.delete(b.id);
  next.add(id);
  return next;
}

/** Picks one buff of an either/or group, or none of them with `null`. */
export function chooseInGroup(
  buffs: readonly Buff[],
  chosen: ReadonlySet<string>,
  group: string,
  id: string | null,
): Set<string> {
  const next = new Set(chosen);
  for (const b of buffs) if (b.group === group) next.delete(b.id);
  if (id !== null && buffs.some((b) => b.id === id && b.group === group)) next.add(id);
  return next;
}

// ---------- Damage ----------

export interface Attack {
  readonly id: string;
  readonly name: string;
  readonly base: number;
  readonly kind: 'melee' | 'projectile' | 'packet';
  /** Weapon size for skills that care. */
  readonly size?: 'fist' | 'short' | 'long' | 'great' | 'thrown' | 'bow' | 'claw';
  /** Damage types to choose from (the first is the default). */
  readonly types: readonly string[];
}

/** The attack a new damage line starts with. */
export const DEFAULT_ATTACK = 'short';

/**
 * Weapons from the phys rep table (Rulebook p.104), claws, and passive magic packets (p.84-85).
 * Every character may attack with a claw (base 2, Claw damage); it counts as a weapon.
 */
export function attacks(rs: Ruleset, sheet: Sheet): Attack[] {
  const materials = ['Steel', 'Wood'];
  const weapons: Attack[] = [
    { id: 'fist', name: 'Fist weapon', base: 1, kind: 'melee', size: 'fist', types: materials },
    { id: 'short', name: 'Short weapon', base: 1, kind: 'melee', size: 'short', types: materials },
    { id: 'long', name: 'Long weapon', base: 2, kind: 'melee', size: 'long', types: materials },
    { id: 'great', name: 'Great weapon', base: 3, kind: 'melee', size: 'great', types: materials },
    { id: 'claw', name: 'Claw', base: 2, kind: 'melee', size: 'claw', types: ['Claw'] },
    { id: 'projectile', name: 'Projectile weapon', base: 2, kind: 'projectile', types: materials },
    {
      id: 'bow',
      name: 'Bow or crossbow',
      base: 2,
      kind: 'projectile',
      size: 'bow',
      types: materials,
    },
    {
      id: 'thrown',
      name: 'Thrown weapon',
      base: 1,
      kind: 'projectile',
      size: 'thrown',
      types: materials,
    },
  ];
  const packetTypes: Record<string, string[]> = {
    elemental: ['Fire', 'Air', 'Earth', 'Water'],
    life: ['Essence'],
    death: ['Harm'],
    tech: ['Zap'],
  };
  const packets: Attack[] = rs.ruleset.magicSchools
    .filter((s) => level(sheet, s.skill, 'basic') > 0)
    .map((s) => ({
      id: `packet-${s.id}`,
      name: `${s.name} packet`,
      base: 1,
      kind: 'packet' as const,
      types: packetTypes[s.id] ?? [s.name],
    }));
  return [...weapons, ...packets];
}

export function isWeapon(attack: Attack): boolean {
  return attack.kind !== 'packet';
}

/** Scopes fit projectile weapons only (not thrown weapons). */
export function takesScope(attack: Attack): boolean {
  return attack.kind === 'projectile' && attack.size !== 'thrown';
}

function applies(to: Applies, attack: Attack): boolean {
  switch (to) {
    case 'any':
      return true;
    case 'weapon':
      return attack.kind !== 'packet';
    case 'packet':
      return attack.kind === 'packet';
    case 'ruin-packet':
      return (
        attack.kind === 'packet' &&
        attack.types.some((t) => ['Fire', 'Water', 'Earth', 'Air', 'Harm'].includes(t))
      );
    case 'harm-packet':
      return attack.kind === 'packet' && attack.types.includes('Harm');
  }
}

/** One choice of a per-line select: Damage Enhancement, temporary enhancement, or scope. */
export interface GearOption<Id extends string> {
  readonly id: Id;
  readonly name: string;
  readonly amount: number;
}

export type EnhancementId = 'none' | 'basic' | 'better' | 'best';
export type TempEnhancementId = 'none' | 'staples-and-tape' | 'barbed-wire';
export type ScopeId = 'none' | 'basic' | 'better' | 'best';

/** Damage Enhancement (mastery recipe): permanent, weapons only, one per weapon. */
export const DAMAGE_ENHANCEMENTS: readonly GearOption<EnhancementId>[] = [
  { id: 'none', name: 'None', amount: 0 },
  { id: 'basic', name: 'Basic', amount: 1 },
  { id: 'better', name: 'Better', amount: 2 },
  { id: 'best', name: 'Best', amount: 3 },
];

/** Staples & Tape or Barbed Wire: until the end of the encounter, weapons only, they do not stack. */
export const TEMP_ENHANCEMENTS: readonly GearOption<TempEnhancementId>[] = [
  { id: 'none', name: 'None', amount: 0 },
  { id: 'staples-and-tape', name: 'Staples & Tape', amount: 1 },
  { id: 'barbed-wire', name: 'Barbed Wire', amount: 2 },
];

/** Scopes: for one encounter, projectile weapons only, one scope per weapon. */
export const SCOPES: readonly GearOption<ScopeId>[] = [
  { id: 'none', name: 'None', amount: 0 },
  { id: 'basic', name: 'Basic', amount: 2 },
  { id: 'better', name: 'Better', amount: 3 },
  { id: 'best', name: 'Best', amount: 4 },
];

export interface LineGear {
  readonly enhancement: EnhancementId;
  readonly temp: TempEnhancementId;
  readonly scope: ScopeId;
}

export const NO_GEAR: LineGear = { enhancement: 'none', temp: 'none', scope: 'none' };

/** A permanent damage bonus from the sheet, shown read-only. */
export interface PermanentDamage {
  readonly id: string;
  readonly label: string;
  /** For Precision: the ranged bonus. */
  readonly amount: number;
  readonly applies: Applies;
  /** Weapon Damage on great weapons: the extra half points, before rounding down. */
  readonly great?: number;
  /** Plain text of what it applies to, for the read-only line. */
  readonly detail: string;
}

function ancestryLabel(sheet: Sheet, id: string): string {
  const passive = sheet.ancestry?.passives.find((p) => p.id === id);
  if (passive) return `Ancestry passive (${passive.sheetName})`;
  return sheet.ancestry?.abilities.find((a) => a.id === id)?.name ?? 'Ancestry';
}

function precisionBonus(sheet: Sheet): { ranged: number; behind: number } {
  const p = level(sheet, 'precision');
  return { ranged: p + (p >= 5 ? 1 : 0), behind: p * 2 + (p >= 5 ? 2 : 0) };
}

/**
 * Damage bonuses from the sheet that always apply: Weapon Damage, ancestry, boons (Bionic Arms
 * also adds to packets), Precision, Raw Magic Proficiency, Ruin Magic passive, familiar passive.
 */
export function permanentDamage(rs: Ruleset, sheet: Sheet): PermanentDamage[] {
  const out: PermanentDamage[] = [];
  const weapon = new Map<string, { id: string; amount: number; great: number }>();
  const packet = new Map<string, { id: string; amount: number }>();
  for (const c of sheet.stats.contributions) {
    if (c.stat !== 'weaponDamage' && c.stat !== 'packetDamage') continue;
    const id = c.source.kind === 'base' ? 'base' : `${c.source.kind}:${c.source.id}`;
    const label =
      c.source.kind === 'skill'
        ? (rs.skillsById[c.source.id]?.name ?? c.source.id)
        : c.source.kind === 'ancestry'
          ? ancestryLabel(sheet, c.source.id)
          : 'Base';
    if (c.stat === 'packetDamage') {
      if (c.condition !== null) continue;
      const entry = packet.get(label) ?? { id, amount: 0 };
      entry.amount += c.amount;
      packet.set(label, entry);
      continue;
    }
    const entry = weapon.get(label) ?? { id, amount: 0, great: 0 };
    if (c.condition === null) entry.amount += c.amount;
    else if (c.condition === 'great weapon') entry.great += c.amount;
    else continue;
    weapon.set(label, entry);
  }
  for (const [label, e] of weapon) {
    if (e.amount === 0 && e.great === 0) continue;
    const great = Math.floor(e.great);
    out.push({
      id: e.id,
      label,
      amount: e.amount,
      applies: 'weapon',
      ...(e.great > 0 ? { great: e.great } : {}),
      detail: great > 0 ? `weapons; great weapons +${great} more` : 'weapons',
    });
  }
  for (const b of sheet.boons)
    for (const e of b.effects) {
      if (e.stat !== 'weaponDamage' || e.add === 0) continue;
      const both = b.boonId === 'bionic-arms';
      out.push({
        id: `boon:${b.actionId}`,
        label: b.name,
        amount: e.add,
        applies: both ? 'any' : 'weapon',
        detail: both ? 'weapons and packets' : 'weapons',
      });
    }
  const precision = precisionBonus(sheet);
  if (level(sheet, 'precision') > 0)
    out.push({
      id: 'precision',
      label: rs.skillsById['precision']?.name ?? 'Precision',
      amount: precision.ranged,
      applies: 'weapon',
      detail: `ranged weapons; +${precision.behind} from behind with a fist or short weapon`,
    });
  for (const [label, e] of packet)
    if (e.amount !== 0)
      out.push({ id: e.id, label, amount: e.amount, applies: 'packet', detail: 'packets' });
  if (level(sheet, 'ruin-magic') > 0)
    out.push({
      id: 'ruin-magic-passive',
      label: spellName(rs, 'ruin-magic-passive', 'Ruin Magic: Passive'),
      amount: 1,
      applies: 'ruin-packet',
      detail: 'Fire, Water, Earth, Air, and Harm packets',
    });
  if (hasFamiliarSkill(sheet, 'fam-passive-damage'))
    out.push({
      id: 'fam-passive-damage',
      label: `${familiarLabel(sheet)} passive`,
      amount: 1,
      applies: 'any',
      detail: 'weapons and packets',
    });
  return out;
}

/** Damage buffs the player chooses, applied to every damage line. */
export function damageBuffs(rs: Ruleset, sheet: Sheet): Buff[] {
  return [
    {
      id: 'enhance-weapon',
      name: spellName(rs, 'enhance-weapon', 'Enhance Weapon'),
      source: 'Tech spell',
      amount: 1,
      kind: 'slot',
      timing: 'repop',
      lasts: 'until the next repop',
      applies: 'weapon',
    },
    ...(hasFamiliarSkill(sheet, 'fam-damage-buff')
      ? [
          {
            id: 'fam-damage-buff',
            name: 'Familiar Passive Damage buff',
            source: familiarLabel(sheet),
            amount: 1,
            kind: 'slot' as const,
            timing: 'repop' as const,
            lasts: 'until the next repop',
            applies: 'any' as const,
          },
        ]
      : []),
    {
      id: 'sharpen-weapon',
      name: spellName(rs, 'sharpen-weapon', 'Sharpen Weapon'),
      source: 'Tech spell',
      amount: 2,
      kind: 'slot',
      timing: 'encounter',
      lasts: 'until the end of the encounter',
      applies: 'weapon',
    },
    {
      id: 'prepared-for-battle',
      name: performanceName(rs, 'prepared-for-battle', 'Prepared for Battle'),
      source: 'Bardic performance',
      amount: 1,
      kind: 'slot',
      timing: 'encounter',
      lasts: 'for the next encounter',
      applies: 'any',
    },
    {
      id: 'elemental-alignment',
      name: spellName(rs, 'elemental-alignment', 'Elemental Alignment'),
      source: 'Elemental spell',
      amount: 1,
      kind: 'slot',
      timing: 'encounter',
      lasts: 'packets only',
      applies: 'packet',
    },
    {
      id: 'mantle-of-death',
      name: spellName(rs, 'mantle-of-death', 'Mantle of Death'),
      source: 'Death spell',
      amount: 1,
      kind: 'slot',
      timing: 'encounter',
      lasts: 'takes the buff slot; +1 to Harm packets, until the end of the encounter',
      applies: 'harm-packet',
      holdsSlot: true,
    },
    {
      id: 'siphon-strength',
      name: spellName(rs, 'siphon-strength', 'Siphon Strength'),
      source: 'Death spell (from the caster)',
      amount: 1,
      kind: 'unslotted',
      timing: 'encounter',
      lasts: 'until the end of the encounter, no buff slot, does not stack with itself',
      applies: 'any',
    },
    {
      id: 'beasts-might',
      name: "Beast's Might (Blessing of Nature)",
      source: 'Nature Magic',
      amount: 1,
      kind: 'unslotted',
      timing: 'encounter',
      lasts: 'until the end of the encounter, no buff slot, one blessing at a time',
      applies: 'weapon',
      group: 'blessing',
    },
    {
      id: 'tactics',
      name: 'Tactics unit',
      source: rs.skillsById['tactics']?.name ?? 'Tactics',
      amount: 1,
      kind: 'unslotted',
      timing: 'encounter',
      lasts: 'weapon attacks, until the end of the encounter',
      applies: 'weapon',
      group: 'tactics',
    },
    {
      id: 'tactics-mastery',
      name: 'Tactics unit led by Tactics Mastery',
      source: rs.skillsById['tactics']?.name ?? 'Tactics',
      amount: 2,
      kind: 'unslotted',
      timing: 'encounter',
      lasts: 'weapon attacks, until the end of the encounter',
      applies: 'weapon',
      group: 'tactics',
    },
  ];
}

/** Raw Magic Enhancement stacks up to +10 packet damage (Rulebook, Raw Magic Enhancement basic). */
export const RAW_MAGIC_MAX = 10;

export function clampRawMagic(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(RAW_MAGIC_MAX, Math.floor(value)));
}

/** True when the character can stack Raw Magic Enhancement on themselves. */
export function hasRawMagicEnhancement(sheet: Sheet): boolean {
  return level(sheet, 'raw-magic-enhancement', 'basic') > 0;
}

export interface DamageOptions {
  readonly fromBehind: boolean;
  readonly targetStunned: boolean;
  /** Raw Magic Enhancement stacks used this encounter (0 to 10). */
  readonly rawMagic?: number;
}

export interface DamageResult {
  readonly total: number;
  readonly lines: readonly Line[];
  /** Choices that do not count for this attack, with why. */
  readonly notes: readonly string[];
}

function gearOption<Id extends string>(
  options: readonly GearOption<Id>[],
  id: string,
): GearOption<Id> | null {
  const option = options.find((o) => o.id === id);
  return option && option.amount > 0 ? option : null;
}

/** The number to call for one attack with these buffs and this weapon's gear. */
export function damageFor(
  rs: Ruleset,
  sheet: Sheet,
  attack: Attack,
  buffs: readonly Buff[],
  chosen: ReadonlySet<string>,
  options: DamageOptions,
  gear: LineGear = NO_GEAR,
): DamageResult {
  const lines: Line[] = [{ label: attack.name, amount: attack.base }];
  const notes: string[] = [];
  const add = (label: string, amount: number) => {
    if (amount !== 0) lines.push({ label, amount });
  };

  // Permanent bonuses from the sheet.
  let great = 0;
  for (const p of permanentDamage(rs, sheet)) {
    if (p.id === 'precision') {
      const { ranged, behind } = precisionBonus(sheet);
      if (attack.kind === 'projectile') add(p.label, ranged);
      else if ((attack.size === 'fist' || attack.size === 'short') && options.fromBehind)
        add(`${p.label} (from behind)`, behind);
      continue;
    }
    if (!applies(p.applies, attack)) continue;
    add(p.label, p.amount);
    if (p.great !== undefined) great += p.great;
  }
  // Great weapons add the Weapon Damage half points, rounded down when attacking.
  if (attack.size === 'great' && great > 0) add('Great weapon bonus', Math.floor(great));

  // This weapon's gear.
  const enhancement = gearOption(DAMAGE_ENHANCEMENTS, gear.enhancement);
  const temp = gearOption(TEMP_ENHANCEMENTS, gear.temp);
  const scope = gearOption(SCOPES, gear.scope);
  for (const [option, label, fits] of [
    [enhancement, `${enhancement?.name ?? ''} Damage Enhancement`, isWeapon(attack)],
    [temp, temp?.name ?? '', isWeapon(attack)],
    [scope, `${scope?.name ?? ''} Scope`, takesScope(attack)],
  ] as const) {
    if (!option) continue;
    if (fits) add(label, option.amount);
    else notes.push(`${label} does not apply to this attack.`);
  }

  if (options.targetStunned && level(sheet, 'stun', 'mastery') > 0)
    add('Stun Mastery (target stunned)', 5);
  const raw = clampRawMagic(options.rawMagic ?? 0);
  if (raw > 0) {
    if (attack.kind === 'packet') add(`Raw Magic Enhancement x${raw}`, raw);
    else notes.push('Raw Magic Enhancement does not apply to this attack.');
  }

  // Chosen buffs: one slotted buff counts (Mantle of Death holds the slot), unslotted add on.
  const on = buffs.filter((b) => chosen.has(b.id));
  for (const b of on)
    if (!applies(b.applies ?? 'any', attack))
      notes.push(`${b.name} does not apply to this attack.`);
  const holder = on.find((b) => b.holdsSlot === true) ?? null;
  const slotted = on
    .filter((b) => b.kind === 'slot' && b.holdsSlot !== true && applies(b.applies ?? 'any', attack))
    .sort((a, b) => b.amount - a.amount);
  if (holder) {
    if (applies(holder.applies ?? 'any', attack)) add(holder.name, holder.amount);
    for (const b of slotted)
      notes.push(`${b.name} does not add: ${holder.name} holds the buff slot.`);
  } else {
    const [best, ...rest] = slotted;
    if (best) add(best.name, best.amount);
    for (const b of rest)
      notes.push(`${b.name} does not add: only the highest damage buff in a buff slot counts.`);
  }
  for (const b of on)
    if (b.kind === 'unslotted' && applies(b.applies ?? 'any', attack)) add(b.name, b.amount);

  return { total: lines.reduce((sum, l) => sum + l.amount, 0), lines, notes };
}

// ---------- Saved choices (localStorage `rw.combat.<id>`) ----------

export const MAX_DAMAGE_LINES = 5;

export interface DamageLineState {
  readonly id: string;
  /** Shown above the call; empty means the attack's name. */
  readonly name: string;
  readonly attack: string;
  /** Empty means the attack's first damage type. */
  readonly type: string;
  readonly enhancement: EnhancementId;
  readonly temp: TempEnhancementId;
  readonly scope: ScopeId;
}

export interface CombatState {
  readonly health: readonly string[];
  readonly armor: readonly string[];
  readonly covered: readonly string[];
  /** Damage buffs chosen, applied to every line. */
  readonly damage: readonly string[];
  readonly lines: readonly DamageLineState[];
  readonly fromBehind: boolean;
  readonly stunned: boolean;
  readonly rawMagic: number;
  /** Cards whose buffs and details are open. */
  readonly open: readonly CardId[];
}

/** The Health, Armor, and Damage cards, each with one disclosure. */
export type CardId = 'health' | 'armor' | 'damage';

const CARD_IDS: readonly CardId[] = ['health', 'armor', 'damage'];

/** Opens a card's buffs and details, or closes them when open. */
export function toggleOpen(open: readonly CardId[], id: CardId): CardId[] {
  return open.includes(id) ? open.filter((c) => c !== id) : [...open, id];
}

export function combatKey(characterId: string): string {
  return `rw.combat.${characterId}`;
}

export function emptyLine(id = 'line-1'): DamageLineState {
  return { id, name: '', attack: DEFAULT_ATTACK, type: '', ...NO_GEAR };
}

export const EMPTY_COMBAT: CombatState = {
  health: [],
  armor: [],
  covered: [],
  damage: [],
  lines: [emptyLine()],
  fromBehind: false,
  stunned: false,
  rawMagic: 0,
  open: [],
};

const OLD_SCOPES: Record<string, ScopeId> = {
  'basic-scope': 'basic',
  'better-scope': 'better',
  'best-scope': 'best',
};

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function pick<Id extends string>(options: readonly GearOption<Id>[], v: unknown): Id {
  return options.find((o) => o.id === v)?.id ?? ('none' as Id);
}

function str(v: unknown, max = 60): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

/**
 * Reads stored choices, tolerating bad or missing data. The first version kept one attack
 * (`attack`, `type`, scopes among the damage buffs); it becomes damage line 1.
 */
export function parseCombatState(value: unknown): CombatState {
  if (typeof value !== 'object' || value === null) return EMPTY_COMBAT;
  const v = value as Record<string, unknown>;
  const damage = strings(v['damage']);
  let lines: DamageLineState[] = [];
  if (Array.isArray(v['lines'])) {
    const seen = new Set<string>();
    for (const raw of v['lines'] as unknown[]) {
      if (typeof raw !== 'object' || raw === null) continue;
      const l = raw as Record<string, unknown>;
      let id = str(l['id']);
      if (!id || seen.has(id)) id = nextLineId([...seen]);
      seen.add(id);
      lines.push({
        id,
        name: str(l['name']),
        attack: str(l['attack']) || DEFAULT_ATTACK,
        type: str(l['type']),
        enhancement: pick(DAMAGE_ENHANCEMENTS, l['enhancement']),
        temp: pick(TEMP_ENHANCEMENTS, l['temp']),
        scope: pick(SCOPES, l['scope']),
      });
      if (lines.length >= MAX_DAMAGE_LINES) break;
    }
  } else if (typeof v['attack'] === 'string') {
    const scope = damage.map((id) => OLD_SCOPES[id]).find((s) => s !== undefined) ?? 'none';
    lines = [
      { ...emptyLine(), attack: str(v['attack']) || DEFAULT_ATTACK, type: str(v['type']), scope },
    ];
  }
  if (lines.length === 0) lines = [emptyLine()];
  return {
    health: strings(v['health']),
    armor: strings(v['armor']),
    covered: strings(v['covered']),
    damage: damage.filter((id) => OLD_SCOPES[id] === undefined),
    lines,
    fromBehind: v['fromBehind'] === true,
    stunned: v['stunned'] === true,
    rawMagic: clampRawMagic(typeof v['rawMagic'] === 'number' ? v['rawMagic'] : 0),
    open: CARD_IDS.filter((id) => strings(v['open']).includes(id)),
  };
}

/** Stored choices for a character on this device. */
export function readCombatState(characterId: string): CombatState {
  try {
    const raw = localStorage.getItem(combatKey(characterId));
    return raw ? parseCombatState(JSON.parse(raw)) : EMPTY_COMBAT;
  } catch {
    return EMPTY_COMBAT;
  }
}

function nextLineId(ids: readonly string[]): string {
  let n = 1;
  while (ids.includes(`line-${n}`)) n += 1;
  return `line-${n}`;
}

/** The attack of a line, falling back to a short weapon when the saved one is gone. */
export function lineAttack(line: DamageLineState, list: readonly Attack[]): Attack | null {
  return (
    list.find((a) => a.id === line.attack) ??
    list.find((a) => a.id === DEFAULT_ATTACK) ??
    list[0] ??
    null
  );
}

/** The damage type of a line: the saved one when the attack has it, else its first type. */
export function lineType(line: DamageLineState, attack: Attack): string {
  return attack.types.includes(line.type) ? line.type : (attack.types[0] ?? '');
}

export function lineName(line: DamageLineState, attack: Attack): string {
  return line.name.trim() || attack.name;
}

/** Gear that fits the attack; the rest is dropped. */
export function lineGear(line: DamageLineState, attack: Attack): LineGear {
  return {
    enhancement: isWeapon(attack) ? line.enhancement : 'none',
    temp: isWeapon(attack) ? line.temp : 'none',
    scope: takesScope(attack) ? line.scope : 'none',
  };
}

/** Fills in names from the attacks, so a stored line shows its default name in the field. */
export function withDefaultNames(
  lines: readonly DamageLineState[],
  list: readonly Attack[],
): DamageLineState[] {
  return lines.map((l) => {
    const attack = lineAttack(l, list);
    return l.name.trim() || !attack ? l : { ...l, name: attack.name };
  });
}

/** A new line at the end, unless there are already 5. */
export function addDamageLine(
  lines: readonly DamageLineState[],
  list: readonly Attack[],
): DamageLineState[] {
  if (lines.length >= MAX_DAMAGE_LINES) return [...lines];
  const line = emptyLine(nextLineId(lines.map((l) => l.id)));
  const attack = lineAttack(line, list);
  return [...lines, attack ? { ...line, name: attack.name } : line];
}

/** Removes a line; the last one stays. */
export function removeDamageLine(lines: readonly DamageLineState[], id: string): DamageLineState[] {
  if (lines.length <= 1) return [...lines];
  return lines.filter((l) => l.id !== id);
}

/**
 * Changes a line's attack. A name that was the old attack's default follows the new attack;
 * the damage type resets, and gear that does not fit the new attack is cleared.
 */
export function changeLineAttack(
  line: DamageLineState,
  list: readonly Attack[],
  attackId: string,
): DamageLineState {
  const next = list.find((a) => a.id === attackId);
  if (!next) return line;
  const old = lineAttack(line, list);
  const renamed = line.name.trim() === '' || (old !== null && line.name === old.name);
  return {
    ...line,
    attack: next.id,
    type: '',
    name: renamed ? next.name : line.name,
    ...lineGear(line, next),
  };
}

/** A saved damage line with permanent bonuses only, for the printed sheet. */
export interface SavedDamageLine {
  readonly id: string;
  readonly name: string;
  readonly attackId: string;
  readonly type: string;
  readonly total: number;
  /** "12 Steel". */
  readonly call: string;
}

/** Lines of stored choices with permanent bonuses only (no buffs, conditions, or encounter gear). */
export function damageLineSummaries(
  state: CombatState,
  sheet: Sheet,
  ruleset: Ruleset,
): SavedDamageLine[] {
  const list = attacks(ruleset, sheet);
  return state.lines.flatMap((line) => {
    const attack = lineAttack(line, list);
    if (!attack) return [];
    const type = lineType(line, attack);
    const gear: LineGear = { ...NO_GEAR, enhancement: lineGear(line, attack).enhancement };
    const { total } = damageFor(
      ruleset,
      sheet,
      attack,
      [],
      new Set(),
      {
        fromBehind: false,
        targetStunned: false,
      },
      gear,
    );
    return [
      {
        id: line.id,
        name: lineName(line, attack),
        attackId: attack.id,
        type,
        total,
        call: `${total} ${type}`.trim(),
      },
    ];
  });
}

/** The character's saved damage lines on this device, with permanent bonuses only. */
export function savedDamageLines(
  characterId: string,
  sheet: Sheet,
  ruleset: Ruleset,
): SavedDamageLine[] {
  return damageLineSummaries(readCombatState(characterId), sheet, ruleset);
}
