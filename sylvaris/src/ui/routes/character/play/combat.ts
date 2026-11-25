// Life, Armor, and Damage calculators for the Play screen (cribbed from Rustwater's combat panel).
// Pure: no React. Each starts from the sheet's own numbers (skill passives, race, Calling,
// Artifact), adds what the player ticks (armor phys rep, buffs they have or were given), and
// applies the rules on stacking and caps:
// - Only the largest numeric enhancement for the same thing counts (Rulebook p.78); a buff that
//   does not count takes no Enhancement Slot.
// - An Amplified Life or Armor slot doubles the enhancement in it (Q-PLAY-12 default).
// - Healable Life and refittable Armor stop at 100; passive damage at 20, 30 from behind, and a
//   Weakened character's passive damage is halved (rounded down) with a cap of 10 (p.76, p.86).
// - Temporary Life and Armor are left out: they are a separate pool (Rustwater backlog I-5).
import type { Ruleset, Sheet, StatLine, StatSource } from '../../../../engine/index.ts';
import { weaponName } from '../overview/overviewModel.ts';

type Combat = Ruleset['ruleset']['combat'];
export type CombatBuff = Combat['buffs'][number];
export type AttackClass = 'one-handed' | 'two-handed' | 'ranged' | 'relic';

/** One row of a breakdown: where a number comes from. */
export interface Line {
  readonly label: string;
  readonly amount: number;
}

/** A buff the player can tick, with how many times it can be counted. */
export interface BuffOption {
  readonly buff: CombatBuff;
  /** 1 for a one-off buff; more for a skill whose uses stack. */
  readonly max: number;
  /** The character's own (a skill, spell, or Artifact power they have). */
  readonly yours: boolean;
}

/** Buff id to how many times it is counted (missing or 0: off). */
export type Chosen = Readonly<Record<string, number>>;

export interface Ignored {
  readonly id: string;
  readonly name: string;
  readonly reason: string;
}

// ---- Which buffs this character can pick ----

/** The skill on the sheet that gives `skillId` (its own, or a Calling skill working as it). */
function ownSkill(sheet: Sheet, skillId: string) {
  return sheet.skills.find(
    (s) => !s.locked && (s.skillId === skillId || s.mirrors?.skillId === skillId),
  );
}

function knowsSpell(sheet: Sheet, spellId: string): boolean {
  const j = sheet.journals;
  return (
    (!j.spellbookCastingBlocked && j.spellbook.some((e) => e.refId === spellId && e.usableNow)) ||
    j.knownSpells.some((k) => k.spellId === spellId && k.usableNow)
  );
}

/** How many times a buff of the character's own can be counted now; 0 when they lack it. */
function ownCount(sheet: Sheet, buff: CombatBuff): number {
  const { kind, id, at } = buff.from;
  if (kind === 'spell') return knowsSpell(sheet, id) ? 1 : 0;
  if (kind === 'artifact') return sheet.artifact?.powers.some((p) => p.powerId === id) ? 1 : 0;
  if (kind !== 'skill') return 1;
  const skill = ownSkill(sheet, id);
  const ability = skill?.abilities.find((a) => a.named === (at ?? 'basic'));
  if (!skill || !ability?.unlocked) return 0;
  if (buff.stacks === 'uses')
    return Math.max(1, Math.floor(skill.maxUses / Math.max(1, ability.uses)));
  if (buff.stacks === 'techniques-plus-one') return 1 + skill.techniques.length;
  return 1;
}

/** The buffs the character has (theirs first) and the ones anyone can be given. */
export function buffOptions(ruleset: Ruleset, sheet: Sheet): BuffOption[] {
  const yours: BuffOption[] = [];
  const given: BuffOption[] = [];
  for (const buff of ruleset.ruleset.combat.buffs) {
    if (buff.who === 'given') {
      given.push({ buff, max: 1, yours: false });
      continue;
    }
    const max = ownCount(sheet, buff);
    if (max > 0) yours.push({ buff, max, yours: true });
  }
  return [...yours, ...given];
}

/** Sets a buff's count, clamped to its maximum; ticking one of a group unticks the others. */
export function setBuff(
  options: readonly BuffOption[],
  chosen: Chosen,
  id: string,
  count: number,
): Chosen {
  const option = options.find((o) => o.buff.id === id);
  if (!option) return chosen;
  const n = Math.max(0, Math.min(option.max, Math.floor(count)));
  const next: Record<string, number> = { ...chosen };
  if (n === 0) {
    delete next[id];
    return next;
  }
  const group = option.buff.group;
  if (group !== undefined)
    for (const o of options) if (o.buff.group === group && o.buff.id !== id) delete next[o.buff.id];
  next[id] = n;
  return next;
}

/** The ticked options with their counts, clamped to what the character can count now. */
function picked(options: readonly BuffOption[], chosen: Chosen) {
  const out: { option: BuffOption; count: number }[] = [];
  for (const option of options) {
    const n = Math.min(option.max, Math.floor(chosen[option.buff.id] ?? 0));
    if (n > 0) out.push({ option, count: n });
  }
  return out;
}

const times = (name: string, count: number) => (count > 1 ? `${name} x${count}` : name);

/** Splits picked buffs into the ones that add and the enhancements a larger one beats. */
function stack(
  entries: readonly { id: string; name: string; amount: number; enhancement: boolean }[],
  doubleEnhancement = false,
): { lines: Line[]; counted: string[]; ignored: Ignored[] } {
  const lines: Line[] = [];
  const counted: string[] = [];
  const ignored: Ignored[] = [];
  const enh = entries.filter((e) => e.enhancement);
  const best = enh.reduce<(typeof enh)[number] | null>(
    (top, e) => (top === null || e.amount > top.amount ? e : top),
    null,
  );
  for (const e of entries) {
    if (e.enhancement && e !== best) {
      ignored.push({
        id: e.id,
        name: e.name,
        reason: `only the largest enhancement counts (${best?.name ?? ''})`,
      });
      continue;
    }
    const amplified = e.enhancement && doubleEnhancement;
    lines.push({
      label: amplified ? `${e.name} (amplified)` : e.name,
      amount: amplified ? e.amount * 2 : e.amount,
    });
    counted.push(e.id);
  }
  return { lines, counted, ignored };
}

// ---- Life and Armor ----

export interface PoolInput {
  /** Armor phys rep locations at least half covered. */
  readonly covered: readonly string[];
  readonly amplified: boolean;
}

export interface PoolResult {
  readonly lines: readonly Line[];
  readonly total: number;
  readonly value: number;
  readonly cap: number;
  readonly ignored: readonly Ignored[];
  /** Conditional sheet sources that do not apply now, with why. */
  readonly notCounted: readonly string[];
  /** Ids of the buffs that count (for the Enhancement Slot count). */
  readonly counted: readonly string[];
}

/** The sheet's own sources as lines; one line when they do not simply add up. */
function sheetLines(line: StatLine, fallback: string): Line[] {
  const lines = line.sources.map((s) => ({ label: s.name, amount: s.amount }));
  const sum = lines.reduce((n, l) => n + l.amount, 0);
  if (sum === line.total) return lines.filter((l) => l.amount !== 0);
  return [{ label: fallback, amount: line.total }];
}

/** True when a conditional source applies with this much armor phys rep. */
function conditionApplies(s: StatSource, wearing: boolean): boolean | null {
  if (s.when === 'wearing physical armor') return wearing;
  if (s.when === 'no physical armor worn') return !wearing;
  return null;
}

/** True when the race's body is its suit of armor (Clockwork): no phys rep locations. */
export function shellBody(ruleset: Ruleset, sheet: Sheet): boolean {
  const race = sheet.race?.raceId ?? null;
  return race !== null && ruleset.ruleset.combat.armorPhysRep.shellRaces.includes(race);
}

function pool(
  kind: 'life' | 'armor',
  ruleset: Ruleset,
  sheet: Sheet,
  options: readonly BuffOption[],
  chosen: Chosen,
  input: PoolInput,
): PoolResult {
  const rs = ruleset.ruleset;
  const statLine = kind === 'life' ? sheet.stats.lifePoints : sheet.stats.armorPoints;
  const cap = kind === 'life' ? rs.caps.healableLifePoints : rs.caps.refittableArmorPoints;
  const lines = sheetLines(
    statLine,
    kind === 'life' ? 'Life Points on the sheet' : 'Armor Points on the sheet',
  );
  const notCounted: string[] = [];

  if (kind === 'armor') {
    const phys = rs.combat.armorPhysRep;
    const covered = shellBody(ruleset, sheet)
      ? []
      : input.covered.filter((l) => phys.locations.includes(l));
    const wearing = covered.length > 0;
    if (wearing)
      lines.push({
        label: `Armor phys rep (${covered.length} ${covered.length === 1 ? 'location' : 'locations'})`,
        amount: covered.length * phys.pointsPerLocation,
      });
    for (const s of statLine.conditional) {
      const on = conditionApplies(s, wearing);
      if (on === true) lines.push({ label: `${s.name} (${s.when ?? ''})`, amount: s.amount });
      else notCounted.push(`${s.name}: +${s.amount} ${s.when ?? 'sometimes'}`);
    }
  } else {
    for (const s of statLine.conditional)
      notCounted.push(`${s.name}: +${s.amount} ${s.when ?? 'sometimes'}`);
  }

  const entries = picked(options, chosen).flatMap(({ option, count }) => {
    const amount = kind === 'life' ? option.buff.life : option.buff.armor;
    if (amount === undefined) return [];
    return [
      {
        id: option.buff.id,
        name: times(option.buff.name, count),
        amount: amount * count,
        enhancement: option.buff.enhancement,
      },
    ];
  });
  const stacked = stack(entries, input.amplified);
  lines.push(...stacked.lines);
  const total = lines.reduce((n, l) => n + l.amount, 0);
  return {
    lines,
    total,
    value: Math.min(total, cap),
    cap,
    ignored: stacked.ignored,
    notCounted,
    counted: stacked.counted,
  };
}

export function lifeFor(
  ruleset: Ruleset,
  sheet: Sheet,
  options: readonly BuffOption[],
  chosen: Chosen,
  amplified: boolean,
): PoolResult {
  return pool('life', ruleset, sheet, options, chosen, { covered: [], amplified });
}

export function armorFor(
  ruleset: Ruleset,
  sheet: Sheet,
  options: readonly BuffOption[],
  chosen: Chosen,
  input: PoolInput,
): PoolResult {
  return pool('armor', ruleset, sheet, options, chosen, input);
}

// ---- Damage ----

export interface Attack {
  readonly id: string;
  readonly name: string;
  readonly attack: AttackClass;
  readonly base: number;
  readonly types: readonly string[];
}

export const ATTACK_LABELS: Record<AttackClass, string> = {
  'one-handed': 'one-handed',
  'two-handed': 'two-handed',
  ranged: 'ranged',
  relic: 'Relic',
};

/** Weapons by type, a Relic, and the character's natural weapons (claws one-handed, bites two-handed). */
export function attacks(ruleset: Ruleset, sheet: Sheet): Attack[] {
  const rs = ruleset.ruleset;
  const list: Attack[] = rs.combat.weapons.map((w) => ({
    id: w.id,
    name: w.name,
    attack: w.attack,
    base: w.baseDamage,
    types: w.types,
  }));
  list.push({
    id: 'relic',
    name: 'Relic',
    attack: 'relic',
    base: rs.relic.baseDamage,
    types: Object.values(rs.relic.damageByElement),
  });
  for (const w of sheet.stats.naturalWeapons)
    list.push({
      id: `natural:${w.id}`,
      name: `${weaponName(w.id)}${w.greatclaw ? ' (Greatclaw)' : ''}`,
      attack: w.greatclaw ? 'two-handed' : 'one-handed',
      base: w.baseDamage,
      types: ['Claw'],
    });
  return list;
}

export interface DamageInput {
  readonly fromBehind: boolean;
  readonly dualWield: boolean;
  readonly bonded: boolean;
  readonly weakened: boolean;
}

export interface DamageResult {
  readonly base: number;
  /** Passive damage before the cap. */
  readonly passive: number;
  readonly cap: number;
  /** Passive damage that counts. */
  readonly passiveValue: number;
  readonly total: number;
  readonly lines: readonly Line[];
  readonly ignored: readonly Ignored[];
  readonly notes: readonly string[];
  readonly counted: readonly string[];
  /** Options that make sense for this attack and character. */
  readonly can: {
    readonly fromBehind: boolean;
    readonly dualWield: boolean;
    readonly bonded: boolean;
  };
}

const isMelee = (a: AttackClass) => a === 'one-handed' || a === 'two-handed';

export function damageFor(
  ruleset: Ruleset,
  sheet: Sheet,
  attack: Attack,
  options: readonly BuffOption[],
  chosen: Chosen,
  input: DamageInput,
): DamageResult {
  const caps = ruleset.ruleset.caps;
  const pd = sheet.stats.passiveDamage;
  const melee = isMelee(attack.attack);
  const behind = melee && input.fromBehind;
  const can = {
    fromBehind: melee,
    dualWield: melee && pd.dualWield.applies && pd.dualWield.total > 0,
    bonded: attack.attack !== 'relic' && pd.bondedWeapon.total > 0,
  };

  const sheetLine =
    attack.attack === 'one-handed'
      ? behind
        ? pd.fromBehindOneHanded
        : pd.oneHanded
      : attack.attack === 'two-handed'
        ? behind
          ? pd.fromBehindTwoHanded
          : pd.twoHanded
        : attack.attack === 'ranged'
          ? pd.ranged
          : pd.relic;
  const lines: Line[] = [{ label: `${attack.name} base damage`, amount: attack.base }];
  const passiveLines: Line[] = sheetLines(sheetLine, 'Passive damage on the sheet');
  if (can.dualWield && input.dualWield)
    passiveLines.push(...sheetLines(pd.dualWield, 'Dual wield bonus'));
  if (can.bonded && input.bonded)
    passiveLines.push(...sheetLines(pd.bondedWeapon, 'Bonded weapon'));

  const entries = picked(options, chosen).flatMap(({ option, count }) => {
    const parts = (option.buff.damage ?? []).filter(
      (p) => p.attacks.includes(attack.attack) && (p.fromBehind !== true || behind),
    );
    const amount = parts.reduce((n, p) => n + p.amount, 0);
    if (amount === 0) return [];
    return [
      {
        id: option.buff.id,
        name: times(option.buff.name, count),
        amount: amount * count,
        enhancement: option.buff.enhancement,
      },
    ];
  });
  const stacked = stack(entries);
  passiveLines.push(...stacked.lines);

  const passive = passiveLines.reduce((n, l) => n + l.amount, 0);
  const notes: string[] = [];
  let cap = behind ? caps.passiveDamageFromBehind : caps.passiveDamage;
  let counted = passive;
  if (input.weakened) {
    counted = Math.floor(passive / 2);
    cap = caps.passiveDamageWeakened;
    notes.push(`Weakened: passive damage halved (${passive} to ${counted}), cap ${cap}.`);
  }
  const passiveValue = Math.min(counted, cap);
  if (counted > cap) notes.push(`Passive damage ${counted} stops at the cap of ${cap}.`);
  if (behind) notes.push('From behind: the cap is 30 instead of 20.');
  lines.push(...passiveLines);
  return {
    base: attack.base,
    passive,
    cap,
    passiveValue,
    total: attack.base + passiveValue,
    lines,
    ignored: stacked.ignored,
    notes,
    counted: stacked.counted,
    can,
  };
}

// ---- Enhancement Slots ----

/**
 * Slots the ticked enhancements fill and the slots the sheet has. One buff that does several
 * things fills one slot; an enhancement a larger one beats has no effect and fills none.
 */
export function enhancementSlots(
  sheet: Sheet,
  options: readonly BuffOption[],
  chosen: Chosen,
  ignored: readonly Ignored[],
): { used: number; have: number } {
  const beaten = new Set(ignored.map((i) => i.id));
  const used = picked(options, chosen).filter(
    ({ option }) => option.buff.enhancement && !beaten.has(option.buff.id),
  ).length;
  const s = sheet.stats.slots;
  return { used, have: s.enhancement + s.amplifiedLife + s.amplifiedArmor };
}

/** "+3" or "-1". */
export function signed(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

// ---- Saved choices ----

/** What the player ticked and picked in the calculators (kept on this device). */
export interface CombatState {
  chosen: Record<string, number>;
  covered: string[];
  amplifiedLife: boolean;
  amplifiedArmor: boolean;
  attack: string;
  type: string;
  fromBehind: boolean;
  dualWield: boolean;
  bonded: boolean;
  weakened: boolean;
}

/** Nothing ticked, a longsword, and the Amplified boxes ticked when the sheet has those slots. */
export function defaultCombatState(sheet: Sheet): CombatState {
  return {
    chosen: {},
    covered: [],
    amplifiedLife: sheet.stats.slots.amplifiedLife > 0,
    amplifiedArmor: sheet.stats.slots.amplifiedArmor > 0,
    attack: 'long',
    type: '',
    fromBehind: false,
    dualWield: false,
    bonded: false,
    weakened: false,
  };
}

/** Reads stored choices; anything missing or of the wrong kind takes its default. */
export function parseCombatState(value: unknown, defaults: CombatState): CombatState {
  if (typeof value !== 'object' || value === null) return defaults;
  const p = value as Partial<Record<keyof CombatState, unknown>>;
  const flag = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const chosen: Record<string, number> = {};
  if (p.chosen && typeof p.chosen === 'object')
    for (const [k, v] of Object.entries(p.chosen))
      if (typeof v === 'number' && v > 0) chosen[k] = Math.floor(v);
  return {
    chosen,
    covered: Array.isArray(p.covered)
      ? p.covered.filter((x): x is string => typeof x === 'string')
      : [],
    amplifiedLife: flag(p.amplifiedLife, defaults.amplifiedLife),
    amplifiedArmor: flag(p.amplifiedArmor, defaults.amplifiedArmor),
    attack: typeof p.attack === 'string' ? p.attack : defaults.attack,
    type: typeof p.type === 'string' ? p.type : '',
    fromBehind: flag(p.fromBehind, false),
    dualWield: flag(p.dualWield, false),
    bonded: flag(p.bonded, false),
    weakened: flag(p.weakened, false),
  };
}
