import { describe, expect, it } from 'vitest';
import artifacts from './rulesets/sylvaris-1.3.1/artifacts.json';
import awards from './rulesets/sylvaris-1.3.1/awards.json';
import callings from './rulesets/sylvaris-1.3.1/callings.json';
import familiars from './rulesets/sylvaris-1.3.1/familiars.json';
import gems from './rulesets/sylvaris-1.3.1/gems.json';
import performances from './rulesets/sylvaris-1.3.1/performances.json';
import races from './rulesets/sylvaris-1.3.1/races.json';
import recipes from './rulesets/sylvaris-1.3.1/recipes.json';
import rituals from './rulesets/sylvaris-1.3.1/rituals.json';
import ruleset from './rulesets/sylvaris-1.3.1/ruleset.json';
import skills from './rulesets/sylvaris-1.3.1/skills.json';
import spells from './rulesets/sylvaris-1.3.1/spells.json';
import startingEquipment from './rulesets/sylvaris-1.3.1/starting-equipment.json';
import { RecipesFile, SkillsFile, SpellsFile, SyRulesetFile } from './schema/index.ts';
import { buildSylvarisRuleset, validateSylvarisFiles, type SyRawRulesetFiles } from './index.ts';

/** A fresh deep copy of the season, safe to mutate. */
const freshRaw = (): SyRawRulesetFiles =>
  structuredClone({
    ruleset,
    skills,
    races,
    callings,
    spells,
    rituals,
    recipes,
    performances,
    gems,
    startingEquipment,
    artifacts,
    familiars,
    awards,
  });

type Rec = Record<string, unknown>;
const at = (v: unknown, i: number): Rec => (v as Rec[])[i] as Rec;
const byId = (v: unknown, id: string): Rec => (v as Rec[]).find((x) => x['id'] === id) as Rec;

describe('Sylvaris schemas reject bad data', () => {
  it('accepts an unchanged copy', () => {
    expect(() => buildSylvarisRuleset(freshRaw())).not.toThrow();
  });

  it('rejects an unknown key on a skill', () => {
    const raw = freshRaw();
    at(raw.skills, 0)['costPerLvl'] = 10;
    expect(SkillsFile.safeParse(raw.skills).success).toBe(false);
    expect(() => validateSylvarisFiles(raw)).toThrow(/skills\.json 0: Unrecognized key/);
  });

  it('rejects an unknown key deep inside a level', () => {
    const raw = freshRaw();
    const levels = at(raw.skills, 0)['levels'] as Rec;
    (levels['expert'] as Rec)['usez'] = 2;
    expect(() => validateSylvarisFiles(raw)).toThrow(/skills\.json 0\.levels\.expert/);
  });

  it('rejects an unknown key on a racial skill', () => {
    const raw = freshRaw();
    const dwarf = byId(raw.races, 'dwarf');
    at(dwarf['skills'], 0)['race'] = 'dwarf';
    expect(() => validateSylvarisFiles(raw)).toThrow(/races\.json 4\.skills\.0: Unrecognized key/);
  });

  it('rejects a bad id', () => {
    const raw = freshRaw();
    at(raw.spells, 0)['id'] = 'Lightning Bolt';
    expect(SpellsFile.safeParse(raw.spells).success).toBe(false);
    expect(() => validateSylvarisFiles(raw)).toThrow(
      /spells\.json 0\.id: ids are lowercase kebab-case/,
    );
  });

  it('rejects a duplicate id', () => {
    const raw = freshRaw();
    at(raw.spells, 1)['id'] = at(raw.spells, 0)['id'];
    expect(() => validateSylvarisFiles(raw)).toThrow(/duplicate id/);
  });

  it('rejects a negative cost', () => {
    const raw = freshRaw();
    (at(raw.recipes, 0)['stableCost'] as Rec)['basic'] = -1;
    expect(RecipesFile.safeParse(raw.recipes).success).toBe(false);
    const rs = raw.ruleset as Rec;
    const techniques = (rs['skills'] as Rec)['techniques'] as Rec[];
    (techniques[0] as Rec)['cost'] = -5;
    expect(SyRulesetFile.safeParse(rs).success).toBe(false);
    expect(() => validateSylvarisFiles(raw)).toThrow(/ruleset\.json skills\.techniques\.0\.cost/);
  });

  it('rejects a number written as text', () => {
    const raw = freshRaw();
    ((raw.ruleset as Rec)['xp'] as Rec)['start'] = '150';
    expect(() => validateSylvarisFiles(raw)).toThrow(/ruleset\.json xp\.start/);
  });

  it('rejects a passive ability with uses', () => {
    const raw = freshRaw();
    const levels = byId(raw.skills, 'toughness')['levels'] as Rec;
    (levels['expert'] as Rec)['uses'] = 2;
    expect(() => validateSylvarisFiles(raw)).toThrow(/passive abilities have 0 uses/);
  });

  it('rejects a prerequisite group that needs more than it lists', () => {
    const raw = freshRaw();
    const groups = byId(raw.skills, 'artificing')['prereqs'] as Rec[];
    (groups[0] as Rec)['need'] = 4;
    expect(() => validateSylvarisFiles(raw)).toThrow(/need is larger than the group/);
  });

  it('rejects an advanced skill without prereqs', () => {
    const raw = freshRaw();
    byId(raw.skills, 'slay')['prereqs'] = [];
    expect(() => validateSylvarisFiles(raw)).toThrow(
      /advanced skills, and only they, have prereqs/,
    );
  });
});

describe('Sylvaris reference checks catch broken links', () => {
  it('a prerequisite naming an unknown skill', () => {
    const raw = freshRaw();
    const groups = byId(raw.skills, 'slay')['prereqs'] as Rec[];
    ((groups[0] as Rec)['of'] as Rec[])[0] = { skill: 'aggresion', technique: 'master' };
    expect(() => validateSylvarisFiles(raw)).toThrow(
      /skill slay: prereq names unknown skill "aggresion"/,
    );
  });

  it('a racial skill id that clashes with a regular skill', () => {
    const raw = freshRaw();
    at(byId(raw.races, 'orc')['skills'], 0)['id'] = 'aggression';
    expect(() => validateSylvarisFiles(raw)).toThrow(/skill id "aggression" used more than once/);
  });

  it('a racial skill whose raceId does not match its race', () => {
    const raw = freshRaw();
    at(byId(raw.races, 'orc')['skills'], 0)['raceId'] = 'elf';
    expect(() => validateSylvarisFiles(raw)).toThrow(/race orc: skill mmmm-tasty has raceId "elf"/);
  });

  it('a recipe whose craft is not a crafting skill', () => {
    const raw = freshRaw();
    at(raw.recipes, 0)['craft'] = 'stun';
    expect(() => validateSylvarisFiles(raw)).toThrow(/is not a crafting skill/);
  });

  it('a spell whose uses disagree with its level', () => {
    const raw = freshRaw();
    at(raw.spells, 0)['uses'] = 4;
    expect(() => validateSylvarisFiles(raw)).toThrow(/uses 4, expected/);
  });

  it('a CXP cap that is not the cost of one full Calling', () => {
    const raw = freshRaw();
    ((raw.ruleset as Rec)['cxp'] as Rec)['earnedCap'] = 600;
    expect(() => validateSylvarisFiles(raw)).toThrow(/one full Calling costs 610/);
  });

  it('a source path that names no value', () => {
    const raw = freshRaw();
    ((raw.ruleset as Rec)['sources'] as Rec)['xp.startt'] = 'Rulebook p.10';
    expect(() => validateSylvarisFiles(raw)).toThrow(/"xp\.startt" names no value/);
  });

  it('an award with an unknown ledger kind', () => {
    const raw = freshRaw();
    const player = at((raw.awards as Rec)['attendance'], 0);
    at(player['grants'], 0)['kind'] = 'evnt';
    expect(() => validateSylvarisFiles(raw)).toThrow(/unknown ledger kind "evnt"/);
  });
});
