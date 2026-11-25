// Life and Damage Calculator (`#/`): the "Your Character" form and the sheet built from it.
// The Play screen's calculators (`../character/play/combat.ts`) read a Sheet, so the calculator
// replays a short, made-up action log through the engine's own `deriveSheet`: race innates,
// skill passives, Calling effects, and Artifact powers come out exactly as on a real sheet, and
// none of the rules are copied here. The form asks only for what feeds those numbers, found from
// the rules data:
// - skills whose passives change Life, Armor, or passive damage, skills behind a buff of your own,
//   and (for a race with a dual wield bonus) the skills that allow two long weapons;
// - racial skills of the chosen race and Calling skills of the chosen Calling, the same way;
// - Callings with such an effect or skill, Artifact powers that add a number, a natural weapon,
//   or a buff, and the spells behind a buff of your own.
// Spells are not replayed (casting needs the school skill and a spellbook); a ticked spell is
// offered as one of your own buffs instead. Choices are kept in localStorage `sy.calculator`.
import { deriveSheet, type Ruleset, type Sheet } from '../../../engine/index.ts';
import type { Action, ActionType } from '../../../engine/model.ts';
import {
  buffOptions,
  defaultCombatState,
  parseCombatState,
  type BuffOption,
  type CombatState,
} from '../character/play/combat.ts';

export type Technique = 'expert' | 'master' | 'grandmaster';

export const TECHNIQUES: readonly Technique[] = ['expert', 'master', 'grandmaster'];

/** A skill the form asks for: a level stepper and its Techniques. */
export interface SkillField {
  readonly skillId: string;
  readonly label: string;
  /** Set for a racial skill: only that race has it. */
  readonly raceId: string | null;
  /** Set for a Calling skill: only on that Calling. */
  readonly callingId: string | null;
  /** The skill this racial skill replaces (Armor Plating replaces Wear Armor). */
  readonly replaces: string | null;
  /** Only matters for a race with a dual wield bonus (it allows two long weapons). */
  readonly dualWieldOnly: boolean;
}

export interface PickField {
  readonly id: string;
  readonly label: string;
}

/** A race choice that changes the numbers (the natural weapon). */
export interface RaceChoiceField {
  readonly choiceId: string;
  readonly label: string;
  readonly options: readonly PickField[];
}

export interface CalculatorFields {
  readonly skills: readonly SkillField[];
  readonly callings: readonly PickField[];
  readonly spells: readonly PickField[];
  readonly powers: readonly PickField[];
}

export interface SkillInput {
  readonly level: number;
  readonly techniques: readonly Technique[];
}

/** What the form holds: the parts of a sheet the calculators read. */
export interface CalculatorInputs {
  readonly raceId: string;
  /** Race choice id to the option picked (only choices from `raceChoiceFields`). */
  readonly choices: Readonly<Record<string, string>>;
  /** '' for no Calling. */
  readonly callingId: string;
  readonly skills: Readonly<Record<string, SkillInput>>;
  /** Spells with a buff of your own that you can cast. */
  readonly spells: readonly string[];
  /** Artifact powers set. */
  readonly powers: readonly string[];
}

export interface CalculatorState {
  readonly inputs: CalculatorInputs;
  readonly combat: CombatState;
}

export const CALCULATOR_KEY = 'sy.calculator';

const COMBAT_STAT =
  /^(lifePoints|armorPoints|passiveDamage|amplifiedLifeSlots|amplifiedArmorSlots)/;
const DUAL_WIELD_GRANT = 'dual-wield-long-long';

type Effects = readonly { readonly stat: string }[] | undefined;
const touches = (...lists: Effects[]) =>
  lists.some((list) => (list ?? []).some((e) => COMBAT_STAT.test(e.stat)));

function ownBuffSources(rs: Ruleset, kind: string): Set<string> {
  return new Set(
    rs.ruleset.combat.buffs
      .filter((b) => b.who !== 'given' && b.from.kind === kind)
      .map((b) => b.from.id),
  );
}

/** The form's fields, from the rules data. */
export function calculatorFields(rs: Ruleset): CalculatorFields {
  const buffSkills = ownBuffSources(rs, 'skill');
  const skills: SkillField[] = [];
  for (const skill of Object.values(rs.skillsById)) {
    const dual = (skill.grants ?? []).some((g) => g.grant === DUAL_WIELD_GRANT);
    const relevant = touches(skill.passives, skill.derived) || buffSkills.has(skill.id);
    if (!relevant && !dual) continue;
    skills.push({
      skillId: skill.id,
      label: skill.name,
      raceId: 'raceId' in skill && typeof skill.raceId === 'string' ? skill.raceId : null,
      callingId:
        'callingId' in skill && typeof skill.callingId === 'string' ? skill.callingId : null,
      replaces:
        'replacesSkill' in skill && typeof skill.replacesSkill === 'string'
          ? skill.replacesSkill
          : null,
      dualWieldOnly: !relevant,
    });
  }
  skills.sort((a, b) => a.label.localeCompare(b.label));

  const callings = rs.callings
    .filter(
      (c) => touches(c.effects) || skills.some((s) => s.callingId === c.id && !s.dualWieldOnly),
    )
    .map((c) => ({ id: c.id, label: c.name }));

  const spells = [...ownBuffSources(rs, 'spell')].map((id) => ({
    id,
    label: rs.spellsById[id]?.name ?? id,
  }));

  const buffPowers = ownBuffSources(rs, 'artifact');
  const powers = rs.artifacts.powers
    .filter((p) => buffPowers.has(p.id) || p.naturalWeapon !== undefined || touches(p.effects))
    .map((p) => ({ id: p.id, label: p.name }));

  return { skills, callings, spells, powers };
}

const optionLabel = (id: string) =>
  id
    .split('-')
    .map((w, i) => (i === 0 ? `${w.charAt(0).toUpperCase()}${w.slice(1)}` : w))
    .join(' ');

/** Race choices that change the numbers: the natural weapon of Beast-Kin and Dragonborn. */
export function raceChoiceFields(rs: Ruleset, raceId: string): RaceChoiceField[] {
  const race = rs.racesById[raceId];
  if (!race) return [];
  const out: RaceChoiceField[] = [];
  for (const innate of race.innate) {
    const nw = innate.naturalWeapon;
    if (!nw) continue;
    const choice = race.choices.find((c) => c.id === nw.choiceId);
    out.push({
      choiceId: nw.choiceId,
      label: choice?.label ?? 'Natural weapon',
      options: nw.options.map((o) => ({
        id: o.id,
        label: `${optionLabel(o.id)} (base ${o.baseDamage}${o.greatclaw ? ', Greatclaw' : ''})`,
      })),
    });
  }
  return out;
}

/** True when the race has a dual wield bonus (Aeshu). */
function hasDualWieldBonus(rs: Ruleset, raceId: string): boolean {
  const race = rs.racesById[raceId];
  return (race?.innate ?? []).some((i) =>
    (i.effects ?? []).some((e) => e.stat === 'passiveDamageDualWield'),
  );
}

/** The skills to ask for with this race and Calling. */
export function skillsFor(
  rs: Ruleset,
  fields: CalculatorFields,
  raceId: string,
  callingId: string,
): SkillField[] {
  const own = fields.skills.filter(
    (s) =>
      (s.raceId === null || s.raceId === raceId) &&
      (s.callingId === null || s.callingId === callingId) &&
      (!s.dualWieldOnly || hasDualWieldBonus(rs, raceId)),
  );
  const replaced = new Set(own.filter((s) => s.raceId !== null).map((s) => s.replaces));
  return own.filter((s) => !replaced.has(s.skillId));
}

export function maxLevel(rs: Ruleset): number {
  return rs.ruleset.skills.maxLevel;
}

/** The level a Technique needs, and the Technique it needs first. */
function techniqueRow(rs: Ruleset, t: Technique): { level: number; requires: Technique | null } {
  const row = rs.ruleset.skills.techniques.find((r) => r.id === t);
  const requires = row && 'requires' in row ? (row.requires as Technique | undefined) : undefined;
  return { level: row?.level ?? Infinity, requires: requires ?? null };
}

export function techniqueLevel(rs: Ruleset, t: Technique): number {
  return techniqueRow(rs, t).level;
}

function defaultChoices(rs: Ruleset, raceId: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of raceChoiceFields(rs, raceId)) {
    const first = c.options[0];
    if (first) out[c.choiceId] = first.id;
  }
  return out;
}

export function defaultInputs(rs: Ruleset): CalculatorInputs {
  const raceId = rs.racesById['human'] ? 'human' : (rs.races[0]?.id ?? '');
  return {
    raceId,
    choices: defaultChoices(rs, raceId),
    callingId: '',
    skills: {},
    spells: [],
    powers: [],
  };
}

export function defaultCalculatorState(rs: Ruleset): CalculatorState {
  const inputs = defaultInputs(rs);
  return { inputs, combat: defaultCombatState(calculatorSheet(rs, inputs)) };
}

/** Keeps only the skills this race and Calling can have. */
function pruneSkills(rs: Ruleset, inputs: CalculatorInputs): CalculatorInputs {
  const allowed = new Set(
    skillsFor(rs, calculatorFields(rs), inputs.raceId, inputs.callingId).map((s) => s.skillId),
  );
  const skills: Record<string, SkillInput> = {};
  for (const [id, s] of Object.entries(inputs.skills)) if (allowed.has(id)) skills[id] = s;
  return { ...inputs, skills };
}

/** Changes the race: its choices go back to the defaults and other races' skills go. */
export function withRace(rs: Ruleset, inputs: CalculatorInputs, raceId: string): CalculatorInputs {
  if (!rs.racesById[raceId]) return inputs;
  return pruneSkills(rs, { ...inputs, raceId, choices: defaultChoices(rs, raceId) });
}

/** Changes the Calling ('' for none): other Callings' skills go. */
export function withCalling(
  rs: Ruleset,
  inputs: CalculatorInputs,
  callingId: string,
): CalculatorInputs {
  if (callingId !== '' && !rs.callingsById[callingId]) return inputs;
  return pruneSkills(rs, { ...inputs, callingId });
}

/** Sets a skill's level (0 to the maximum); Techniques the new level does not allow go. */
export function withLevel(
  rs: Ruleset,
  inputs: CalculatorInputs,
  skillId: string,
  level: number,
): CalculatorInputs {
  const n = Math.max(0, Math.min(maxLevel(rs), Math.floor(level)));
  const skills: Record<string, SkillInput> = { ...inputs.skills };
  const techniques = (skills[skillId]?.techniques ?? []).filter((t) => techniqueLevel(rs, t) <= n);
  if (n === 0) delete skills[skillId];
  else skills[skillId] = { level: n, techniques };
  return { ...inputs, skills };
}

/**
 * Ticks or unticks a Technique. Ticking one also ticks the ones it needs (Master needs Expert);
 * unticking one also unticks the ones that need it. Needs the level for it.
 */
export function withTechnique(
  rs: Ruleset,
  inputs: CalculatorInputs,
  skillId: string,
  technique: Technique,
  on: boolean,
): CalculatorInputs {
  const current = inputs.skills[skillId];
  if (!current) return inputs;
  const owned = new Set(current.techniques);
  if (on) {
    if (techniqueLevel(rs, technique) > current.level) return inputs;
    let t: Technique | null = technique;
    while (t !== null) {
      owned.add(t);
      t = techniqueRow(rs, t).requires;
    }
  } else {
    owned.delete(technique);
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of owned) {
        const req = techniqueRow(rs, t).requires;
        if (req !== null && !owned.has(req)) {
          owned.delete(t);
          changed = true;
        }
      }
    }
  }
  const techniques = TECHNIQUES.filter((t) => owned.has(t));
  return { ...inputs, skills: { ...inputs.skills, [skillId]: { ...current, techniques } } };
}

const AT = '2000-01-01T00:00:00.000Z';

/**
 * A sheet with only what the form holds, from a made-up action log replayed by the engine.
 * Recorded as staff (Artifact actions are staff-only). Levels are set directly with no cost
 * (replay does not check points, teachers, or prerequisites; it only warns).
 */
export function calculatorSheet(rs: Ruleset, inputs: CalculatorInputs): Sheet {
  const actions: Action[] = [];
  const push = (type: ActionType, payload: unknown) => {
    const seq = actions.length + 1;
    actions.push({ id: `calc-${seq}`, seq, at: AT, actor: { role: 'staff' }, type, payload });
  };
  push('character.created', {
    characterName: 'Calculator',
    playerName: 'Calculator',
    raceId: inputs.raceId,
    choices: { ...inputs.choices },
    ageCategory: rs.ruleset.creation.defaultAgeCategory,
    startingXp: 0,
  });
  if (inputs.callingId !== '') push('calling.started', { callingId: inputs.callingId });
  const allowed = new Set(
    skillsFor(rs, calculatorFields(rs), inputs.raceId, inputs.callingId).map((s) => s.skillId),
  );
  for (const [skillId, s] of Object.entries(inputs.skills)) {
    if (!allowed.has(skillId)) continue;
    const currency = rs.skillsById[skillId]?.category === 'calling' ? 'cxp' : 'xp';
    const learn = (step: { level: number } | { technique: Technique }) =>
      push('skill.learned', { skillId, step, currency, cost: 0, atCreation: false });
    for (let level = 1; level <= s.level; level += 1) learn({ level });
    for (const technique of TECHNIQUES) if (s.techniques.includes(technique)) learn({ technique });
  }
  if (inputs.powers.length > 0) {
    push('artifact.awakened', { name: 'Artifact', axpCost: 0 });
    for (const powerId of inputs.powers) push('artifact.powerSet', { powerId });
  }
  return deriveSheet(rs, actions);
}

/**
 * The buffs to offer: the sheet's own (`buffOptions`), plus the ticked spells as buffs of your
 * own (the sheet has no spellbook).
 */
export function calculatorOptions(
  rs: Ruleset,
  sheet: Sheet,
  spells: readonly string[],
): BuffOption[] {
  const base = buffOptions(rs, sheet);
  const known = new Set(base.map((o) => o.buff.id));
  const cast: BuffOption[] = rs.ruleset.combat.buffs
    .filter(
      (b) =>
        b.who !== 'given' &&
        b.from.kind === 'spell' &&
        spells.includes(b.from.id) &&
        !known.has(b.id),
    )
    .map((buff) => ({ buff, max: 1, yours: true }));
  return [...base.filter((o) => o.yours), ...cast, ...base.filter((o) => !o.yours)];
}

/**
 * Applies a form change. When it gives or takes away an Amplified Life or Armor slot, the
 * matching "In an Amplified slot" box follows, as it starts on the Play screen.
 */
export function changeInputs(
  rs: Ruleset,
  state: CalculatorState,
  change: (inputs: CalculatorInputs) => CalculatorInputs,
): CalculatorState {
  const inputs = change(state.inputs);
  if (inputs === state.inputs) return state;
  const before = calculatorSheet(rs, state.inputs).stats.slots;
  const after = calculatorSheet(rs, inputs).stats.slots;
  const combat = { ...state.combat };
  if (before.amplifiedLife > 0 !== after.amplifiedLife > 0)
    combat.amplifiedLife = after.amplifiedLife > 0;
  if (before.amplifiedArmor > 0 !== after.amplifiedArmor > 0)
    combat.amplifiedArmor = after.amplifiedArmor > 0;
  return { inputs, combat };
}

// ---------- Saved choices ----------

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

const record = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Reads stored choices, keeping only what the rules data allows. Bad data gives the defaults. */
export function parseCalculatorState(rs: Ruleset, value: unknown): CalculatorState {
  const fallback = defaultCalculatorState(rs);
  if (typeof value !== 'object' || value === null) return fallback;
  const v = record(value);
  const raw = record(v['inputs']);
  const fields = calculatorFields(rs);

  let inputs = fallback.inputs;
  if (typeof raw['raceId'] === 'string') inputs = withRace(rs, inputs, raw['raceId']);
  const rawChoices = record(raw['choices']);
  const choices: Record<string, string> = { ...inputs.choices };
  for (const c of raceChoiceFields(rs, inputs.raceId)) {
    const picked = rawChoices[c.choiceId];
    if (typeof picked === 'string' && c.options.some((o) => o.id === picked))
      choices[c.choiceId] = picked;
  }
  inputs = { ...inputs, choices };
  if (typeof raw['callingId'] === 'string') inputs = withCalling(rs, inputs, raw['callingId']);

  const rawSkills = record(raw['skills']);
  for (const field of skillsFor(rs, fields, inputs.raceId, inputs.callingId)) {
    const s = record(rawSkills[field.skillId]);
    const level = s['level'];
    if (typeof level !== 'number' || !Number.isFinite(level)) continue;
    inputs = withLevel(rs, inputs, field.skillId, level);
    for (const t of TECHNIQUES)
      if (strings(s['techniques']).includes(t))
        inputs = withTechnique(rs, inputs, field.skillId, t, true);
  }
  const pick = (list: readonly string[], known: readonly PickField[]) =>
    known.map((k) => k.id).filter((id) => list.includes(id));
  inputs = {
    ...inputs,
    spells: pick(strings(raw['spells']), fields.spells),
    powers: pick(strings(raw['powers']), fields.powers),
  };
  return { inputs, combat: parseCombatState(v['combat'], fallback.combat) };
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
