// Soak and Damage Calculator (`#/calculator`): the "Your Character" form and the sheet built
// from it. The Play Tracker's combat math (`../character/play/combat.ts`) reads a Sheet, so the
// calculator replays a short, made-up action log through the engine's own `deriveSheet`: the
// stats, ancestry passives, boons, and familiar skills come out exactly as on a real sheet, and
// nothing in the math is copied. Choices are kept on this device in localStorage `rw.calculator`.
import { deriveSheet, maxLevelOf, type Ruleset, type Sheet } from '../../../engine/index.ts';
import type { Action, ActionType, SkillPart } from '../../../engine/model.ts';
import { EMPTY_COMBAT, parseCombatState, type CombatState } from '../character/play/combat.ts';

/** The form sections of the "Your Character" card. */
export type FormSection = 'weapon' | 'defense' | 'magic';

/** A passive skill the combat math reads, set with a level stepper. */
export interface LevelField {
  readonly skillId: string;
  readonly label: string;
  readonly max: number;
  readonly section: FormSection;
}

/** A skill part the combat math checks for (owned or not), set with a checkbox. */
export interface ToggleField {
  /** `skillId:part`, the key kept in `CalculatorInputs.owned`. */
  readonly key: string;
  readonly skillId: string;
  readonly part: SkillPart;
  readonly label: string;
  readonly section: FormSection;
  /** Magic schools are one group of checkboxes. */
  readonly school: boolean;
}

export interface ChoiceField {
  readonly id: string;
  readonly label: string;
}

export interface CalculatorFields {
  readonly levels: readonly LevelField[];
  readonly toggles: readonly ToggleField[];
  /** Boons that change Health, Armor, or damage. */
  readonly boons: readonly ChoiceField[];
  /** Familiar skills the combat math reads. */
  readonly familiar: readonly ChoiceField[];
}

/** What the form holds: the parts of a sheet the combat math reads. */
export interface CalculatorInputs {
  readonly ancestryId: string;
  readonly subtypeId: string;
  /** Passive skill id to level (0 or missing means not owned). */
  readonly levels: Readonly<Record<string, number>>;
  /** Owned `skillId:part` keys from `CalculatorFields.toggles`. */
  readonly owned: readonly string[];
  readonly boons: readonly string[];
  readonly familiar: readonly string[];
}

export interface CalculatorState {
  readonly inputs: CalculatorInputs;
  readonly combat: CombatState;
}

export const CALCULATOR_KEY = 'rw.calculator';

/** Stats whose skill effects make a passive skill worth a stepper. */
const STAT_SECTION: Readonly<Record<string, FormSection>> = {
  weaponDamage: 'weapon',
  damage: 'weapon',
  maxHealth: 'defense',
  armor: 'defense',
  reflexArmor: 'defense',
  armorLocationsUpgraded: 'defense',
  packetDamage: 'magic',
};

/** Boon effects the combat math adds up. */
const BOON_STATS: ReadonlySet<string> = new Set(['maxHealth', 'armor', 'weaponDamage']);

/**
 * Skill parts and familiar skills `combat.ts` checks by id: Stun Mastery (target Stunned),
 * Ruin Magic (passive), Raw Magic Enhancement (stacks), and the magic schools (packets, added
 * from the rules data below).
 */
const PART_TOGGLES: readonly { skillId: string; part: SkillPart; section: FormSection }[] = [
  { skillId: 'stun', part: 'mastery', section: 'weapon' },
  { skillId: 'ruin-magic', part: 'main', section: 'magic' },
  { skillId: 'raw-magic-enhancement', part: 'basic', section: 'magic' },
];

const FAMILIAR_SKILLS: readonly string[] = [
  'fam-max-health',
  'fam-health-buff',
  'fam-max-armor',
  'fam-armor-buff',
  'fam-passive-damage',
  'fam-damage-buff',
];

const PART_NAMES: Readonly<Record<SkillPart, string>> = {
  main: '',
  basic: 'Basic',
  adept: 'Adept',
  advanced: 'Advanced',
  mastery: 'Mastery',
};

/** The form's fields, from the rules data. */
export function calculatorFields(rs: Ruleset): CalculatorFields {
  const levels: LevelField[] = [];
  for (const skill of rs.skills) {
    const main = skill.parts.main;
    if (!main) continue;
    const stat = main.effects?.map((e) => STAT_SECTION[e.stat]).find((s) => s !== undefined);
    if (!stat) continue;
    levels.push({
      skillId: skill.id,
      label: skill.name,
      max: maxLevelOf(rs, main.costKind) ?? 5,
      section: stat,
    });
  }
  // Two skills with one name (Toughness): add the archetype.
  const named = levels.map((l) => {
    if (levels.filter((o) => o.label === l.label).length < 2) return l;
    const archetype = rs.skillsById[l.skillId]?.archetype;
    const name = archetype ? (rs.archetypesById[archetype]?.name ?? archetype) : '';
    return name ? { ...l, label: `${l.label} (${name})` } : l;
  });

  const toggles: ToggleField[] = [];
  const addToggle = (skillId: string, part: SkillPart, section: FormSection, school: boolean) => {
    const skill = rs.skillsById[skillId];
    if (!skill?.parts[part]) return;
    const partName = school ? '' : PART_NAMES[part];
    toggles.push({
      key: `${skillId}:${part}`,
      skillId,
      part,
      label: part === 'mastery' ? `${skill.name} ${partName}` : skill.name,
      section,
      school,
    });
  };
  for (const t of PART_TOGGLES.filter((p) => p.section === 'weapon'))
    addToggle(t.skillId, t.part, t.section, false);
  for (const school of rs.ruleset.magicSchools) addToggle(school.skill, 'basic', 'magic', true);
  for (const t of PART_TOGGLES.filter((p) => p.section !== 'weapon'))
    addToggle(t.skillId, t.part, t.section, false);

  const boons = rs.boons.boons
    .filter((b) => b.effects?.some((e) => BOON_STATS.has(e.stat) && e.add !== undefined))
    .map((b) => ({ id: b.id, label: b.name }));
  const familiar = FAMILIAR_SKILLS.flatMap((id) => {
    const skill = rs.familiarSkillsById[id];
    return skill ? [{ id, label: `Familiar ${skill.name}` }] : [];
  });
  return { levels: named, toggles, boons, familiar };
}

function firstSubtype(rs: Ruleset, ancestryId: string): string {
  return rs.ancestriesById[ancestryId]?.subtypes[0]?.id ?? '';
}

export function defaultInputs(rs: Ruleset): CalculatorInputs {
  const ancestryId = rs.ancestries.ancestries[0]?.id ?? '';
  return {
    ancestryId,
    subtypeId: firstSubtype(rs, ancestryId),
    levels: {},
    owned: [],
    boons: [],
    familiar: [],
  };
}

export function defaultCalculatorState(rs: Ruleset): CalculatorState {
  return { inputs: defaultInputs(rs), combat: EMPTY_COMBAT };
}

/** Changes the ancestry; the subtype goes back to the new ancestry's first. */
export function withAncestry(
  rs: Ruleset,
  inputs: CalculatorInputs,
  ancestryId: string,
): CalculatorInputs {
  if (!rs.ancestriesById[ancestryId]) return inputs;
  return { ...inputs, ancestryId, subtypeId: firstSubtype(rs, ancestryId) };
}

const AT = '2000-01-01T00:00:00.000Z';

/**
 * A sheet with only what the form holds, from a made-up action log replayed by the engine.
 * Levels are set directly (no points, teachers, or prerequisites: replay does not check them).
 * The familiar has no name, so its lines read "Familiar".
 */
export function calculatorSheet(rs: Ruleset, inputs: CalculatorInputs): Sheet {
  const actions: Action[] = [];
  const push = (type: ActionType, payload: unknown) => {
    const seq = actions.length + 1;
    actions.push({ id: `calc-${seq}`, seq, at: AT, actor: { role: 'player' }, type, payload });
  };
  const learn = (skillId: string, part: SkillPart, toLevel: number) =>
    push('skill.learned', {
      skillId,
      part,
      toLevel,
      cost: { currency: 'cxp', amount: 0 },
      atCreation: false,
    });

  push('character.created', {
    characterName: 'Calculator',
    playerName: 'Calculator',
    ancestryId: inputs.ancestryId,
    subtypeId: inputs.subtypeId,
    extraInfection: 0,
  });
  for (const [skillId, level] of Object.entries(inputs.levels))
    if (level > 0) learn(skillId, 'main', level);
  for (const key of inputs.owned) {
    const [skillId, part] = key.split(':') as [string, SkillPart];
    learn(skillId, part, 1);
  }
  for (const boonId of inputs.boons)
    push('boon.added', { boonId, name: rs.boonsById[boonId]?.name ?? boonId });
  const awakened = rs.familiar.awakenedSkills[0];
  if (inputs.familiar.length > 0 && awakened) {
    push('familiar.bonded', { name: 'Familiar' });
    push('familiar.awakened', { awakenedSkillId: awakened.id, fpCost: 0 });
    for (const skillId of inputs.familiar)
      push('familiar.skillLearned', { skillId, essenceCost: 0 });
  }
  const sheet = deriveSheet(rs, actions);
  return sheet.familiar ? { ...sheet, familiar: { ...sheet.familiar, name: '' } } : sheet;
}

/** The form for an existing sheet (for checking that the calculator matches the Play Tracker). */
export function calculatorInputsFromSheet(rs: Ruleset, sheet: Sheet): CalculatorInputs {
  const fields = calculatorFields(rs);
  const levelOf = (skillId: string, part: SkillPart) =>
    sheet.skills.find((s) => s.skillId === skillId)?.parts.find((p) => p.part === part)?.level ?? 0;
  const levels: Record<string, number> = {};
  for (const f of fields.levels) {
    const level = levelOf(f.skillId, 'main');
    if (level > 0) levels[f.skillId] = level;
  }
  const base = defaultInputs(rs);
  const learned = new Set(sheet.familiar?.learned.map((l) => l.skillId) ?? []);
  return {
    ancestryId: sheet.ancestry?.ancestryId ?? base.ancestryId,
    subtypeId: sheet.ancestry?.subtypeId ?? base.subtypeId,
    levels,
    owned: fields.toggles.filter((t) => levelOf(t.skillId, t.part) > 0).map((t) => t.key),
    boons: fields.boons.filter((b) => sheet.boons.some((x) => x.boonId === b.id)).map((b) => b.id),
    familiar: fields.familiar.filter((f) => learned.has(f.id)).map((f) => f.id),
  };
}

/**
 * True when the subtypes of an ancestry differ in Health, Armor, or damage (a subtype passive
 * or ability with such an effect, or one that replaces the ancestry passive). Only then does the
 * form ask for the subtype.
 */
export function subtypeMatters(rs: Ruleset, ancestryId: string): boolean {
  const ancestry = rs.ancestriesById[ancestryId];
  if (!ancestry || ancestry.subtypes.length < 2) return false;
  const base = defaultInputs(rs);
  const prints = ancestry.subtypes.map((s) =>
    JSON.stringify(
      calculatorSheet(rs, { ...base, ancestryId, subtypeId: s.id }).stats.contributions.map((c) => [
        c.stat,
        c.amount,
        c.condition,
      ]),
    ),
  );
  return new Set(prints).size > 1;
}

// ---------- Saved choices ----------

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Reads stored choices, keeping only what the rules data knows. Bad data gives the defaults. */
export function parseCalculatorState(rs: Ruleset, value: unknown): CalculatorState {
  const fallback = defaultCalculatorState(rs);
  if (typeof value !== 'object' || value === null) return fallback;
  const v = value as Record<string, unknown>;
  const raw =
    typeof v['inputs'] === 'object' && v['inputs'] !== null
      ? (v['inputs'] as Record<string, unknown>)
      : {};
  const fields = calculatorFields(rs);
  const ancestry =
    typeof raw['ancestryId'] === 'string' && rs.ancestriesById[raw['ancestryId']]
      ? raw['ancestryId']
      : fallback.inputs.ancestryId;
  const subtypes = rs.ancestriesById[ancestry]?.subtypes.map((s) => s.id) ?? [];
  const subtype =
    typeof raw['subtypeId'] === 'string' && subtypes.includes(raw['subtypeId'])
      ? raw['subtypeId']
      : firstSubtype(rs, ancestry);
  const rawLevels =
    typeof raw['levels'] === 'object' && raw['levels'] !== null
      ? (raw['levels'] as Record<string, unknown>)
      : {};
  const levels: Record<string, number> = {};
  for (const f of fields.levels) {
    const n = rawLevels[f.skillId];
    if (typeof n !== 'number' || !Number.isFinite(n)) continue;
    const level = Math.max(0, Math.min(f.max, Math.floor(n)));
    if (level > 0) levels[f.skillId] = level;
  }
  const pick = (list: readonly string[], known: readonly string[]) =>
    known.filter((id) => list.includes(id));
  return {
    inputs: {
      ancestryId: ancestry,
      subtypeId: subtype,
      levels,
      owned: pick(
        strings(raw['owned']),
        fields.toggles.map((t) => t.key),
      ),
      boons: pick(
        strings(raw['boons']),
        fields.boons.map((b) => b.id),
      ),
      familiar: pick(
        strings(raw['familiar']),
        fields.familiar.map((f) => f.id),
      ),
    },
    combat: parseCombatState(v['combat']),
  };
}

export function readCalculatorState(rs: Ruleset): CalculatorState {
  try {
    const raw = localStorage.getItem(CALCULATOR_KEY);
    return raw ? parseCalculatorState(rs, JSON.parse(raw)) : defaultCalculatorState(rs);
  } catch {
    return defaultCalculatorState(rs);
  }
}

export function saveCalculatorState(state: CalculatorState): void {
  try {
    localStorage.setItem(CALCULATOR_KEY, JSON.stringify(state));
  } catch {
    // Private mode or full storage: the choices just do not survive a reload.
  }
}
