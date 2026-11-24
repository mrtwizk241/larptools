import { describe, expect, it } from 'vitest';
import {
  buildRuleset,
  findReferenceProblems,
  validateRulesetFiles,
  type RawRulesetFiles,
} from './index.ts';
import ancestries from './rulesets/2026-2.0/ancestries.json';
import archetypes from './rulesets/2026-2.0/archetypes.json';
import awards from './rulesets/2026-2.0/awards.json';
import boons from './rulesets/2026-2.0/boons.json';
import familiar from './rulesets/2026-2.0/familiar.json';
import infection from './rulesets/2026-2.0/infection.json';
import performances from './rulesets/2026-2.0/performances.json';
import professions from './rulesets/2026-2.0/professions.json';
import recipes from './rulesets/2026-2.0/recipes.json';
import ruleset from './rulesets/2026-2.0/ruleset.json';
import skills from './rulesets/2026-2.0/skills.json';
import spells from './rulesets/2026-2.0/spells.json';
import startingItems from './rulesets/2026-2.0/starting-items.json';
import { RulesetFile, SkillsFile, SpellsFile } from './schema/index.ts';

/** A fresh deep copy of the season, safe to mutate. */
const freshRaw = (): RawRulesetFiles =>
  structuredClone({
    ruleset,
    archetypes,
    skills,
    ancestries,
    professions,
    spells,
    recipes,
    performances,
    familiar,
    boons,
    startingItems,
    infection,
    awards,
  });

type Rec = Record<string, unknown>;
const first = (v: unknown): Rec => (v as Rec[])[0] as Rec;

describe('schemas reject bad data', () => {
  it('accepts an unchanged copy', () => {
    expect(() => buildRuleset(freshRaw())).not.toThrow();
  });

  it('rejects an unknown key on a skill', () => {
    const raw = freshRaw();
    first(raw.skills)['costPerLvl'] = 10;
    expect(SkillsFile.safeParse(raw.skills).success).toBe(false);
    expect(() => validateRulesetFiles(raw)).toThrow(/skills\.json 0: Unrecognized key/);
  });

  it('rejects an unknown key deep inside a skill part', () => {
    const raw = freshRaw();
    const parts = first(raw.skills)['parts'] as Rec;
    (parts['basic'] as Rec)['maxLevl'] = 10;
    expect(SkillsFile.safeParse(raw.skills).success).toBe(false);
  });

  it('rejects an unknown key in ruleset.json', () => {
    const raw = freshRaw();
    (raw.ruleset as Rec)['startingCXP'] = 250;
    expect(RulesetFile.safeParse(raw.ruleset).success).toBe(false);
  });

  it('rejects a record with a missing id', () => {
    const raw = freshRaw();
    delete first(raw.spells)['id'];
    expect(SpellsFile.safeParse(raw.spells).success).toBe(false);
    expect(() => validateRulesetFiles(raw)).toThrow(/spells\.json 0\.id/);
  });

  it('rejects a duplicate id', () => {
    const raw = freshRaw();
    const list = raw.skills as Rec[];
    list.push(structuredClone(list[0] as Rec));
    expect(() => validateRulesetFiles(raw)).toThrow(/duplicate id "assault"/);
  });

  it('rejects a non kebab-case id', () => {
    const raw = freshRaw();
    first(raw.archetypes)['id'] = 'Warrior';
    expect(() => validateRulesetFiles(raw)).toThrow(/kebab-case/);
  });

  it('rejects a formula string where a number belongs', () => {
    const raw = freshRaw();
    (raw.ruleset as Rec)['eventCxp'] = '75 * events';
    expect(RulesetFile.safeParse(raw.ruleset).success).toBe(false);
  });

  it('reports a broken cross reference', () => {
    const raw = freshRaw();
    const parts = first(raw.skills)['parts'] as Rec;
    const prereqs = (parts['mastery'] as Rec)['prereqs'] as Rec[];
    (prereqs[0] as Rec)['skill'] = 'no-such-skill';
    const data = validateRulesetFiles({ ...raw, skills: skills });
    expect(findReferenceProblems({ ...data, skills: SkillsFile.parse(raw.skills) })).toEqual([
      'skill assault.mastery: unknown skill "no-such-skill"',
    ]);
    expect(() => validateRulesetFiles(raw)).toThrow(/Broken rules data references/);
  });
});
