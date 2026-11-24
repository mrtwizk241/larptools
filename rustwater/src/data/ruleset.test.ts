import { describe, expect, it } from 'vitest';
import {
  RULESET_FILES,
  findReferenceProblems,
  listRulesets,
  loadRuleset,
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

const RAW: RawRulesetFiles = {
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
};

const countBy = <T>(items: readonly T[], key: (t: T) => string) => {
  const out: Record<string, number> = {};
  for (const i of items) out[key(i)] = (out[key(i)] ?? 0) + 1;
  return out;
};

describe('2026-2.0 rules data files', () => {
  for (const [key, { file, schema }] of Object.entries(RULESET_FILES)) {
    it(`${file} validates`, () => {
      const result = schema.safeParse(RAW[key as keyof RawRulesetFiles]);
      expect(result.error?.issues ?? []).toEqual([]);
    });
  }

  it('has no broken cross references', () => {
    expect(findReferenceProblems(validateRulesetFiles(RAW))).toEqual([]);
  });

  it('contains no formula strings', () => {
    const formula = /\s\*\s|[<>]=|\?\s*\d+\s*:|\b(T|floor|ceil|min|max|sum|count)\(|^L\d?$/;
    const hits: string[] = [];
    const walk = (v: unknown, path: string) => {
      if (typeof v === 'string') {
        if (formula.test(v)) hits.push(`${path}: ${v}`);
      } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v && typeof v === 'object')
        for (const [k, x] of Object.entries(v)) {
          if (/formula/i.test(k)) hits.push(`${path}.${k}: formula key`);
          walk(x, `${path}.${k}`);
        }
    };
    walk(RAW, '');
    expect(hits).toEqual([]);
  });
});

describe('loadRuleset', () => {
  const r = loadRuleset();

  it('loads the default season and caches it', () => {
    expect(r.id).toBe('2026-2.0');
    expect(loadRuleset('2026-2.0')).toBe(r);
    expect(listRulesets()).toEqual([{ id: '2026-2.0', name: r.name }]);
  });

  it('rejects an unknown id', () => {
    expect(() => loadRuleset('1999-0.1')).toThrow(/Unknown ruleset/);
    expect(() => loadRuleset('constructor')).toThrow(/Unknown ruleset/);
  });

  it('is deeply frozen', () => {
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.skills)).toBe(true);
    expect(Object.isFrozen(r.skillsById['assault']?.parts.basic)).toBe(true);
    expect(() => {
      (r.ruleset as { startingCxp: number }).startingCxp = 1;
    }).toThrow(TypeError);
  });

  it('builds lookups', () => {
    expect(r.skillsById['aimed-strike']?.archetype).toBe('rogue');
    expect(r.skillsById['constructor']).toBeUndefined();
    expect(r.subtypesById['human-sheltered']?.ancestry.id).toBe('human');
    expect(r.ancestryAbilitiesById['deep-pockets']?.role).toBe('subtype');
    expect(r.professionAbilitiesById['dealer-lets-make-a-deal']?.slot).toBe('skill-2');
    expect(r.spellsById['elemental-bolt']?.mastery).toBe(false);
    expect(r.recipesById['better-lock']?.rank).toBe('adept');
    expect(r.shinyPurchasesById['buy-cxp']?.price).toBe(50);
  });

  it('holds the season constants', () => {
    const c = r.ruleset;
    expect(c.startingCxp).toBe(250);
    expect(c.eventCxp).toBe(75);
    expect(c.earnedCxpCap.amount).toBe(2000);
    expect(c.earnedCxpCap.excludedKinds).toEqual(['start', 'infection-bonus', 'retirement-carry']);
    expect(c.lxp).toMatchObject({ atCreation: 1, perCxp: 500 });
    expect(c.basicSkill).toMatchObject({ costPerLevel: 10, maxLevel: 10 });
    const costs = Object.fromEntries(
      Object.entries(c.archetypeSkill.costs).map(([k, v]) => [k, v.costPerLevel]),
    );
    expect(costs).toEqual({
      adept: 3,
      advanced: 5,
      encounter: 2,
      passive: 3,
      memorization: 1,
      mastery: 10,
    });
    expect(c.archetypeSkill.costs.memorization.scaling).toBe('flat');
    expect(c.archetypeSkill.maxLevel).toBe(5);
    expect(c.retirement).toMatchObject({ subtractCxp: 250, divisor: 3 });
    expect(c.extraInfection).toMatchObject({ maxLevels: 2, cxpPerLevel: 10 });
    expect(r.professions.rules).toMatchObject({
      costPerLevel: 10,
      maxLevel: 5,
      maxLevelsPerSkillPerEvent: 1,
    });
  });
});

describe('counts match the research', () => {
  const r = loadRuleset();

  it('archetypes', () => {
    expect(r.archetypes.map((a) => a.id)).toEqual([
      'warrior',
      'defender',
      'rogue',
      'utility',
      'magic',
      'crafting',
    ]);
  });

  it('standard skills: 56 (13, 13, 13, 17)', () => {
    const std = r.skills.filter((s) => s.category === 'standard');
    expect(std).toHaveLength(56);
    expect(countBy(std, (s) => s.archetype ?? '')).toEqual({
      warrior: 13,
      defender: 13,
      rogue: 13,
      utility: 17,
    });
  });

  it('magic skills: 14 plus 6 mastery', () => {
    const m = r.skills.filter((s) => s.category === 'magic');
    expect(m.filter((s) => s.type !== 'mastery')).toHaveLength(14);
    expect(m.filter((s) => s.type === 'mastery')).toHaveLength(6);
  });

  it('crafting skills: 11 plus 6 mastery', () => {
    const c = r.skills.filter((s) => s.category === 'crafting');
    expect(c.filter((s) => s.type !== 'mastery')).toHaveLength(11);
    expect(c.filter((s) => s.type === 'mastery')).toHaveLength(6);
  });

  it('multi-archetype skills: 9, with archetypeOptions instead of archetype', () => {
    const m = r.skills.filter((s) => s.category === 'multi');
    expect(m).toHaveLength(9);
    for (const s of m) {
      expect(s.archetype).toBeUndefined();
      expect(s.archetypeOptions?.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('performances 12 and rituals 5', () => {
    expect(r.performances.performances).toHaveLength(12);
    expect(r.performances.rituals).toHaveLength(5);
  });

  it('recipes: 150 (engineering 20, chemistry 18, medicine 19, gearcraft 21, mastery 72)', () => {
    expect(r.recipes).toHaveLength(150);
    expect(countBy(r.recipes, (x) => (x.mastery ? 'mastery' : x.discipline))).toEqual({
      engineering: 20,
      chemistry: 18,
      medicine: 19,
      gearcraft: 21,
      mastery: 72,
    });
  });

  it('spells: 84 (15 per school, 24 mastery)', () => {
    expect(r.spells).toHaveLength(84);
    expect(countBy(r.spells, (x) => (x.mastery ? 'mastery' : x.school))).toEqual({
      elemental: 15,
      life: 15,
      death: 15,
      tech: 15,
      mastery: 24,
    });
  });

  it('familiar skills: 13, 11, 10 by tier plus 4 awakened', () => {
    expect(countBy(r.familiar.skills, (s) => String(s.tier))).toEqual({ 5: 13, 10: 11, 15: 10 });
    expect(r.familiar.awakenedSkills).toHaveLength(4);
  });

  it('ancestries 8 with 21 subtypes', () => {
    expect(r.ancestries.ancestries).toHaveLength(8);
    expect(Object.keys(r.subtypesById)).toHaveLength(21);
  });

  it('professions 19 with 57 abilities', () => {
    expect(r.professions.professions).toHaveLength(19);
    expect(Object.keys(r.professionAbilitiesById)).toHaveLength(57);
  });

  it('starting item options 12 and boons 17', () => {
    expect(r.startingItems.options).toHaveLength(12);
    expect(r.boons.boons).toHaveLength(17);
  });
});
