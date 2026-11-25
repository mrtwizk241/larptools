// Rules data loader (the canonical one). Imports each Sylvaris season's JSON statically (bundled
// by Vite), validates it with the Zod schemas in schema/, checks cross references, builds id
// lookups, and deep-freezes it. JSON is only ever parsed, never evaluated.
import type { z } from 'zod';
import artifacts131 from './rulesets/sylvaris-1.3.1/artifacts.json' with { type: 'json' };
import awards131 from './rulesets/sylvaris-1.3.1/awards.json' with { type: 'json' };
import callings131 from './rulesets/sylvaris-1.3.1/callings.json' with { type: 'json' };
import familiars131 from './rulesets/sylvaris-1.3.1/familiars.json' with { type: 'json' };
import gems131 from './rulesets/sylvaris-1.3.1/gems.json' with { type: 'json' };
import performances131 from './rulesets/sylvaris-1.3.1/performances.json' with { type: 'json' };
import races131 from './rulesets/sylvaris-1.3.1/races.json' with { type: 'json' };
import recipes131 from './rulesets/sylvaris-1.3.1/recipes.json' with { type: 'json' };
import rituals131 from './rulesets/sylvaris-1.3.1/rituals.json' with { type: 'json' };
import ruleset131 from './rulesets/sylvaris-1.3.1/ruleset.json' with { type: 'json' };
import skills131 from './rulesets/sylvaris-1.3.1/skills.json' with { type: 'json' };
import spells131 from './rulesets/sylvaris-1.3.1/spells.json' with { type: 'json' };
import startingEquipment131 from './rulesets/sylvaris-1.3.1/starting-equipment.json' with { type: 'json' };
import {
  ArtifactsFile,
  AwardsFile,
  CallingsFile,
  FamiliarsFile,
  GemsFile,
  PerformancesFile,
  RacesFile,
  RecipesFile,
  RitualsFile,
  SkillsFile,
  SpellsFile,
  StartingEquipmentFile,
  SyRulesetFile,
} from './schema/index.ts';
import { findSylvarisReferenceProblems, type SyRulesetData } from './references.ts';

export type { SyRulesetData } from './references.ts';
export { findSylvarisReferenceProblems } from './references.ts';

/** Raw (unvalidated) JSON for one season folder, keyed like SyRulesetData. */
export type SyRawRulesetFiles = { [K in keyof SyRulesetData]: unknown };

/** File name and schema for every key of SyRulesetData. */
export const SY_RULESET_FILES = {
  ruleset: { file: 'ruleset.json', schema: SyRulesetFile },
  skills: { file: 'skills.json', schema: SkillsFile },
  races: { file: 'races.json', schema: RacesFile },
  callings: { file: 'callings.json', schema: CallingsFile },
  spells: { file: 'spells.json', schema: SpellsFile },
  rituals: { file: 'rituals.json', schema: RitualsFile },
  recipes: { file: 'recipes.json', schema: RecipesFile },
  performances: { file: 'performances.json', schema: PerformancesFile },
  gems: { file: 'gems.json', schema: GemsFile },
  startingEquipment: { file: 'starting-equipment.json', schema: StartingEquipmentFile },
  artifacts: { file: 'artifacts.json', schema: ArtifactsFile },
  familiars: { file: 'familiars.json', schema: FamiliarsFile },
  awards: { file: 'awards.json', schema: AwardsFile },
} as const satisfies {
  [K in keyof SyRulesetData]: { file: string; schema: z.ZodType<SyRulesetData[K]> };
};

const RAW: Readonly<Record<string, SyRawRulesetFiles>> = {
  'sylvaris-1.3.1': {
    ruleset: ruleset131,
    skills: skills131,
    races: races131,
    callings: callings131,
    spells: spells131,
    rituals: rituals131,
    recipes: recipes131,
    performances: performances131,
    gems: gems131,
    startingEquipment: startingEquipment131,
    artifacts: artifacts131,
    familiars: familiars131,
    awards: awards131,
  },
};

export const SY_DEFAULT_RULESET_ID = 'sylvaris-1.3.1';

export type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/** Id lookup. Missing ids read as undefined. */
export type Lookup<T> = Readonly<Record<string, T>>;

type Data = DeepReadonly<SyRulesetData>;
type Item<T> = T extends readonly (infer U)[] ? U : never;

export type SyRulesetConstants = Data['ruleset'];
export type SyRegularSkill = Item<Data['skills']>;
export type SyRace = Item<Data['races']>;
export type SyRacialSkill = Item<SyRace['skills']>;
export type SyRaceInnate = Item<SyRace['innate']>;
export type SyCalling = Item<Data['callings']>;
export type SyCallingSkill = Item<SyCalling['skills']>;
/** Any skill: regular (offensive to crafting), racial (with raceId), or Calling (with callingId). */
export type SySkill = SyRegularSkill | SyRacialSkill | SyCallingSkill;
export type SySkillCategory = SySkill['category'];
export type SyNamedLevel = keyof SySkill['levels'];
export type SyLevelAbility = SySkill['levels']['basic'];
export type SyPrereqGroup = Item<SySkill['prereqs']>;
export type SyChoice = Item<SyRace['choices']>;
export type SyEffect = Item<NonNullable<SyCalling['effects']>>;
export type SyTechniqueRow = Item<SyRulesetConstants['skills']['techniques']>;
export type SySpell = Item<Data['spells']>;
export type SyRitual = Item<Data['rituals']['rituals']>;
export type SyPlane = Item<Data['rituals']['planarChart']>;
export type SyRecipe = Item<Data['recipes']>;
export type SyPerformance = Item<Data['performances']>;
export type SyGem = Item<Data['gems']['gems']>;
export type SyStartingOption = Item<Data['startingEquipment']['options']>;
export type SyArtifactPower = Item<Data['artifacts']['powers']>;
export type SySpecialTrick = Item<Data['familiars']['specialTricks']>;
export type SyAttendanceBundle = Item<Data['awards']['attendance']>;
export type SyAwardExtra = Item<Data['awards']['extras']>;
export type SyMtPurchase = Item<Data['awards']['mtPurchases']>;

/** A loaded, validated, frozen Sylvaris season. Engine code reads rules only from here. */
export type SyRuleset = Data & {
  readonly id: string;
  readonly name: string;
  /** Regular, racial, and Calling skills in one lookup; `category`, `raceId`, `callingId` tell them apart. */
  readonly skillsById: Lookup<SySkill>;
  readonly racesById: Lookup<SyRace>;
  readonly raceInnatesById: Lookup<SyRaceInnate>;
  readonly callingsById: Lookup<SyCalling>;
  readonly techniquesById: Lookup<SyTechniqueRow>;
  readonly spellsById: Lookup<SySpell>;
  /** School id to its spells. */
  readonly spellsBySchool: Lookup<readonly SySpell[]>;
  readonly ritualsById: Lookup<SyRitual>;
  readonly planesById: Lookup<SyPlane>;
  readonly recipesById: Lookup<SyRecipe>;
  /** Crafting skill id to its recipes. */
  readonly recipesByCraft: Lookup<readonly SyRecipe[]>;
  readonly performancesById: Lookup<SyPerformance>;
  readonly gemsById: Lookup<SyGem>;
  readonly startingOptionsById: Lookup<SyStartingOption>;
  readonly artifactPowersById: Lookup<SyArtifactPower>;
  readonly specialTricksById: Lookup<SySpecialTrick>;
  readonly attendanceById: Lookup<SyAttendanceBundle>;
  readonly extrasById: Lookup<SyAwardExtra>;
  readonly mtPurchasesById: Lookup<SyMtPurchase>;
};

export class SyRulesetError extends Error {
  override name = 'SyRulesetError';
}

/** Validates raw season files. Throws SyRulesetError listing every problem found. */
export function validateSylvarisFiles(raw: SyRawRulesetFiles): SyRulesetData {
  const problems: string[] = [];
  const parsed: Partial<Record<keyof SyRulesetData, unknown>> = {};
  for (const key of Object.keys(SY_RULESET_FILES) as (keyof SyRulesetData)[]) {
    const { file, schema } = SY_RULESET_FILES[key];
    const result = schema.safeParse(raw[key]);
    if (result.success) parsed[key] = result.data;
    else
      for (const issue of result.error.issues)
        problems.push(`${file} ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  if (problems.length) throw new SyRulesetError(`Invalid rules data:\n${problems.join('\n')}`);
  const data = parsed as SyRulesetData;
  const refs = findSylvarisReferenceProblems(data);
  if (refs.length) throw new SyRulesetError(`Broken rules data references:\n${refs.join('\n')}`);
  return data;
}

function index<T extends { readonly id: string }>(items: readonly T[]): Lookup<T> {
  const out: Record<string, T> = Object.create(null) as Record<string, T>;
  for (const item of items) {
    if (Object.hasOwn(out, item.id)) throw new SyRulesetError(`duplicate id "${item.id}"`);
    out[item.id] = item;
  }
  return out;
}

function groupBy<T>(items: readonly T[], key: (t: T) => string): Lookup<readonly T[]> {
  const out: Record<string, T[]> = Object.create(null) as Record<string, T[]>;
  for (const item of items) (out[key(item)] ??= []).push(item);
  return out;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** Validates, indexes, and freezes raw season files. Used by loadSylvarisRuleset and tests. */
export function buildSylvarisRuleset(raw: SyRawRulesetFiles): SyRuleset {
  const d = validateSylvarisFiles(raw);
  const skills = [
    ...d.skills,
    ...d.races.flatMap((r) => r.skills),
    ...d.callings.flatMap((c) => c.skills),
  ];
  const ruleset = {
    ...d,
    id: d.ruleset.id,
    name: d.ruleset.name,
    skillsById: index(skills),
    racesById: index(d.races),
    raceInnatesById: index(d.races.flatMap((r) => r.innate)),
    callingsById: index(d.callings),
    techniquesById: index(d.ruleset.skills.techniques),
    spellsById: index(d.spells),
    spellsBySchool: groupBy(d.spells, (s) => s.school),
    ritualsById: index(d.rituals.rituals),
    planesById: index(d.rituals.planarChart),
    recipesById: index(d.recipes),
    recipesByCraft: groupBy(d.recipes, (x) => x.craft),
    performancesById: index(d.performances),
    gemsById: index(d.gems.gems),
    startingOptionsById: index(d.startingEquipment.options),
    artifactPowersById: index(d.artifacts.powers),
    specialTricksById: index(d.familiars.specialTricks),
    attendanceById: index(d.awards.attendance),
    extrasById: index(d.awards.extras),
    mtPurchasesById: index(d.awards.mtPurchases),
  };
  return deepFreeze(ruleset) as SyRuleset;
}

const cache = new Map<string, SyRuleset>();

/** Loads a bundled Sylvaris season by id. Validated once, then cached. Throws SyRulesetError. */
export function loadSylvarisRuleset(id: string = SY_DEFAULT_RULESET_ID): SyRuleset {
  const cached = cache.get(id);
  if (cached) return cached;
  const raw = Object.hasOwn(RAW, id) ? RAW[id] : undefined;
  if (!raw) throw new SyRulesetError(`Unknown ruleset "${id}"`);
  const ruleset = buildSylvarisRuleset(raw);
  cache.set(id, ruleset);
  return ruleset;
}

/** Bundled Sylvaris seasons, newest first. Reads ids and names without validating. */
export function listSylvarisRulesets(): { id: string; name: string }[] {
  return Object.entries(RAW)
    .map(([id, raw]) => {
      const meta = raw.ruleset as { name?: unknown };
      return { id, name: typeof meta.name === 'string' ? meta.name : id };
    })
    .sort((a, b) => b.id.localeCompare(a.id));
}

// Canonical names: the app, server, and engine load rules through these.
export {
  loadSylvarisRuleset as loadRuleset,
  listSylvarisRulesets as listRulesets,
  SY_DEFAULT_RULESET_ID as DEFAULT_RULESET_ID,
};
export type { SyRuleset as Ruleset };
