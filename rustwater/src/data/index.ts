// Rules data loader. Imports each season's JSON statically (bundled by Vite), validates it
// with the Zod schemas, checks cross references, builds id lookups, and deep-freezes it.
// JSON is only ever parsed, never evaluated.
import type { z } from 'zod';
import ancestries2026 from './rulesets/2026-2.0/ancestries.json' with { type: 'json' };
import archetypes2026 from './rulesets/2026-2.0/archetypes.json' with { type: 'json' };
import awards2026 from './rulesets/2026-2.0/awards.json' with { type: 'json' };
import boons2026 from './rulesets/2026-2.0/boons.json' with { type: 'json' };
import familiar2026 from './rulesets/2026-2.0/familiar.json' with { type: 'json' };
import infection2026 from './rulesets/2026-2.0/infection.json' with { type: 'json' };
import performances2026 from './rulesets/2026-2.0/performances.json' with { type: 'json' };
import professions2026 from './rulesets/2026-2.0/professions.json' with { type: 'json' };
import recipes2026 from './rulesets/2026-2.0/recipes.json' with { type: 'json' };
import ruleset2026 from './rulesets/2026-2.0/ruleset.json' with { type: 'json' };
import skills2026 from './rulesets/2026-2.0/skills.json' with { type: 'json' };
import spells2026 from './rulesets/2026-2.0/spells.json' with { type: 'json' };
import startingItems2026 from './rulesets/2026-2.0/starting-items.json' with { type: 'json' };
import { findReferenceProblems, type RulesetData } from './references.ts';
import {
  AncestriesFile,
  ArchetypesFile,
  AwardsFile,
  BoonsFile,
  FamiliarFile,
  InfectionFile,
  PerformancesFile,
  ProfessionsFile,
  RecipesFile,
  RulesetFile,
  SkillsFile,
  SpellsFile,
  StartingItemsFile,
} from './schema/index.ts';

export type { RulesetData } from './references.ts';
export { findReferenceProblems } from './references.ts';

/** Raw (unvalidated) JSON for one season folder, keyed like RulesetData. */
export type RawRulesetFiles = { [K in keyof RulesetData]: unknown };

/** File name and schema for every key of RulesetData. */
export const RULESET_FILES = {
  ruleset: { file: 'ruleset.json', schema: RulesetFile },
  archetypes: { file: 'archetypes.json', schema: ArchetypesFile },
  skills: { file: 'skills.json', schema: SkillsFile },
  ancestries: { file: 'ancestries.json', schema: AncestriesFile },
  professions: { file: 'professions.json', schema: ProfessionsFile },
  spells: { file: 'spells.json', schema: SpellsFile },
  recipes: { file: 'recipes.json', schema: RecipesFile },
  performances: { file: 'performances.json', schema: PerformancesFile },
  familiar: { file: 'familiar.json', schema: FamiliarFile },
  boons: { file: 'boons.json', schema: BoonsFile },
  startingItems: { file: 'starting-items.json', schema: StartingItemsFile },
  infection: { file: 'infection.json', schema: InfectionFile },
  awards: { file: 'awards.json', schema: AwardsFile },
} as const satisfies {
  [K in keyof RulesetData]: { file: string; schema: z.ZodType<RulesetData[K]> };
};

const RAW: Readonly<Record<string, RawRulesetFiles>> = {
  '2026-2.0': {
    ruleset: ruleset2026,
    archetypes: archetypes2026,
    skills: skills2026,
    ancestries: ancestries2026,
    professions: professions2026,
    spells: spells2026,
    recipes: recipes2026,
    performances: performances2026,
    familiar: familiar2026,
    boons: boons2026,
    startingItems: startingItems2026,
    infection: infection2026,
    awards: awards2026,
  },
};

export const DEFAULT_RULESET_ID = '2026-2.0';

export type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/** Id lookup. Missing ids read as undefined. */
export type Lookup<T> = Readonly<Record<string, T>>;

type Data = DeepReadonly<RulesetData>;
type Item<T> = T extends readonly (infer U)[] ? U : never;
export type Archetype = Item<Data['archetypes']>;
export type Skill = Item<Data['skills']>;
export type Ancestry = Item<Data['ancestries']['ancestries']>;
export type Subtype = Item<Ancestry['subtypes']>;
export type AncestryAbility = Ancestry['sharedAbility'];
export type Profession = Item<Data['professions']['professions']>;
export type ProfessionSkill = Item<Profession['skills']>;
export type ProfessionPassive = Profession['passive'];
export type Spell = Item<Data['spells']>;
export type Recipe = Item<Data['recipes']>;
export type Performance = Item<Data['performances']['performances']>;
export type Ritual = Item<Data['performances']['rituals']>;
export type FamiliarSkill = Item<Data['familiar']['skills']>;
export type AwakenedSkill = Item<Data['familiar']['awakenedSkills']>;
export type Boon = Item<Data['boons']['boons']>;
export type StartingItemOption = Item<Data['startingItems']['options']>;
export type ShinyPurchase = Item<Data['awards']['shinyPurchases']>;
export type AttendanceBundle = Item<Data['awards']['attendance']>;

export type SubtypeEntry = { readonly ancestry: Ancestry; readonly subtype: Subtype };
export type AncestryAbilityEntry = {
  readonly ability: AncestryAbility;
  readonly ancestry: Ancestry;
  /** Set for subtype abilities and subtype passives. */
  readonly subtype?: Subtype;
  readonly role: 'passive' | 'shared' | 'subtype' | 'subtype-passive';
};
export type ProfessionAbilityEntry = {
  readonly ability: ProfessionPassive | ProfessionSkill;
  readonly profession: Profession;
  readonly slot: 'passive' | 'skill-1' | 'skill-2';
};

/** A loaded, validated, frozen season. Engine code reads rules only from here. */
export type Ruleset = Data & {
  readonly id: string;
  readonly name: string;
  readonly archetypesById: Lookup<Archetype>;
  readonly skillsById: Lookup<Skill>;
  readonly ancestriesById: Lookup<Ancestry>;
  readonly subtypesById: Lookup<SubtypeEntry>;
  readonly ancestryAbilitiesById: Lookup<AncestryAbilityEntry>;
  readonly professionsById: Lookup<Profession>;
  readonly professionAbilitiesById: Lookup<ProfessionAbilityEntry>;
  readonly spellsById: Lookup<Spell>;
  readonly recipesById: Lookup<Recipe>;
  readonly performancesById: Lookup<Performance>;
  readonly ritualsById: Lookup<Ritual>;
  readonly familiarSkillsById: Lookup<FamiliarSkill>;
  readonly awakenedSkillsById: Lookup<AwakenedSkill>;
  readonly boonsById: Lookup<Boon>;
  readonly startingItemsById: Lookup<StartingItemOption>;
  readonly shinyPurchasesById: Lookup<ShinyPurchase>;
  readonly attendanceById: Lookup<AttendanceBundle>;
};

export class RulesetError extends Error {
  override name = 'RulesetError';
}

/** Validates raw season files. Throws RulesetError listing every problem found. */
export function validateRulesetFiles(raw: RawRulesetFiles): RulesetData {
  const problems: string[] = [];
  const parsed: Partial<Record<keyof RulesetData, unknown>> = {};
  for (const key of Object.keys(RULESET_FILES) as (keyof RulesetData)[]) {
    const { file, schema } = RULESET_FILES[key];
    const result = schema.safeParse(raw[key]);
    if (result.success) parsed[key] = result.data;
    else
      for (const issue of result.error.issues)
        problems.push(`${file} ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  if (problems.length) throw new RulesetError(`Invalid rules data:\n${problems.join('\n')}`);
  const data = parsed as RulesetData;
  const refs = findReferenceProblems(data);
  if (refs.length) throw new RulesetError(`Broken rules data references:\n${refs.join('\n')}`);
  return data;
}

function index<T extends { readonly id: string }>(items: readonly T[]): Lookup<T>;
function index<T, E>(items: readonly T[], key: (t: T) => string, value: (t: T) => E): Lookup<E>;
function index<T, E>(
  items: readonly T[],
  key: (t: T) => string = (t) => (t as { id: string }).id,
  value: (t: T) => E = (t) => t as unknown as E,
): Lookup<E> {
  const out: Record<string, E> = Object.create(null) as Record<string, E>;
  for (const item of items) {
    const k = key(item);
    if (Object.hasOwn(out, k)) throw new RulesetError(`duplicate id "${k}"`);
    out[k] = value(item);
  }
  return out;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** Validates, indexes, and freezes raw season files. Used by loadRuleset and by tests. */
export function buildRuleset(raw: RawRulesetFiles): Ruleset {
  const d = validateRulesetFiles(raw);
  const anc = d.ancestries.ancestries;
  const profs = d.professions.professions;
  const ruleset = {
    ...d,
    id: d.ruleset.id,
    name: d.ruleset.name,
    archetypesById: index(d.archetypes),
    skillsById: index(d.skills),
    ancestriesById: index(anc),
    subtypesById: index(
      anc.flatMap((ancestry) => ancestry.subtypes.map((subtype) => ({ ancestry, subtype }))),
      (e) => e.subtype.id,
      (e) => e,
    ),
    ancestryAbilitiesById: index(
      anc.flatMap((ancestry) => {
        const list: AncestryAbilityEntry[] = [];
        if (ancestry.passive) list.push({ ability: ancestry.passive, ancestry, role: 'passive' });
        list.push({ ability: ancestry.sharedAbility, ancestry, role: 'shared' });
        for (const subtype of ancestry.subtypes) {
          if (subtype.passive)
            list.push({ ability: subtype.passive, ancestry, subtype, role: 'subtype-passive' });
          list.push({ ability: subtype.ability, ancestry, subtype, role: 'subtype' });
        }
        return list;
      }),
      (e) => e.ability.id,
      (e) => e,
    ),
    professionsById: index(profs),
    professionAbilitiesById: index(
      profs.flatMap((profession): ProfessionAbilityEntry[] => [
        { ability: profession.passive, profession, slot: 'passive' },
        ...profession.skills.map((s) => ({ ability: s, profession, slot: s.slot })),
      ]),
      (e) => e.ability.id,
      (e) => e,
    ),
    spellsById: index(d.spells),
    recipesById: index(d.recipes),
    performancesById: index(d.performances.performances),
    ritualsById: index(d.performances.rituals),
    familiarSkillsById: index(d.familiar.skills),
    awakenedSkillsById: index(d.familiar.awakenedSkills),
    boonsById: index(d.boons.boons),
    startingItemsById: index(d.startingItems.options),
    shinyPurchasesById: index(d.awards.shinyPurchases),
    attendanceById: index(d.awards.attendance),
  };
  return deepFreeze(ruleset) as Ruleset;
}

const cache = new Map<string, Ruleset>();

/** Loads a bundled season by id. Validated once, then cached. Throws RulesetError. */
export function loadRuleset(id: string = DEFAULT_RULESET_ID): Ruleset {
  const cached = cache.get(id);
  if (cached) return cached;
  const raw = Object.hasOwn(RAW, id) ? RAW[id] : undefined;
  if (!raw) throw new RulesetError(`Unknown ruleset "${id}"`);
  const ruleset = buildRuleset(raw);
  cache.set(id, ruleset);
  return ruleset;
}

/** Bundled seasons, newest first. Reads ids and names without validating. */
export function listRulesets(): { id: string; name: string }[] {
  return Object.entries(RAW)
    .map(([id, raw]) => {
      const meta = raw.ruleset as { name?: unknown };
      return { id, name: typeof meta.name === 'string' ? meta.name : id };
    })
    .sort((a, b) => b.id.localeCompare(a.id));
}
