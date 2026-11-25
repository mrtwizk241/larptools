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
import {
  SY_RULESET_FILES,
  findSylvarisReferenceProblems,
  listSylvarisRulesets,
  loadSylvarisRuleset,
  validateSylvarisFiles,
  type SyRawRulesetFiles,
} from './index.ts';

const RAW: SyRawRulesetFiles = {
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
};

const countBy = <T>(items: readonly T[], key: (t: T) => string) => {
  const out: Record<string, number> = {};
  for (const i of items) out[key(i)] = (out[key(i)] ?? 0) + 1;
  return out;
};

describe('sylvaris-1.3.1 rules data files', () => {
  for (const [key, { file, schema }] of Object.entries(SY_RULESET_FILES)) {
    it(`${file} validates`, () => {
      const result = schema.safeParse(RAW[key as keyof SyRawRulesetFiles]);
      expect(result.error?.issues ?? []).toEqual([]);
    });
  }

  it('has no broken cross references', () => {
    expect(findSylvarisReferenceProblems(validateSylvarisFiles(RAW))).toEqual([]);
  });

  it('flags a combat buff with a wrong source or Enhancement Slot flag', () => {
    const data = structuredClone(validateSylvarisFiles(RAW));
    const buffs = data.ruleset.combat.buffs;
    const ice = buffs.find((b) => b.id === 'ice-armor');
    const toughness = buffs.find((b) => b.id === 'toughness');
    if (!ice || !toughness) throw new Error('fixture buffs missing');
    ice.enhancement = false;
    toughness.from = { kind: 'skill', id: 'no-such-skill' };
    expect(findSylvarisReferenceProblems(data)).toEqual([
      'combat buff toughness: unknown skill "no-such-skill"',
      'combat buff toughness: a skill buff needs the named level that unlocks it',
      'combat buff ice-armor: enhancement false, but the spell says true',
    ]);
  });

  it('contains no formula strings', () => {
    const formula = /\s\*\s|[<>]=|\?\s*\d+\s*:|\b(floor|ceil|min|max|sum|count)\(|\(\w+ - \d+\) \//;
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

  it('uses no em dashes in text', () => {
    expect(JSON.stringify(RAW)).not.toContain(String.fromCharCode(0x2014));
  });
});

describe('loadSylvarisRuleset', () => {
  const r = loadSylvarisRuleset();

  it('loads the default season and caches it', () => {
    expect(r.id).toBe('sylvaris-1.3.1');
    expect(loadSylvarisRuleset('sylvaris-1.3.1')).toBe(r);
    expect(listSylvarisRulesets()).toEqual([{ id: 'sylvaris-1.3.1', name: r.name }]);
  });

  it('rejects an unknown id', () => {
    expect(() => loadSylvarisRuleset('sylvaris-0.1.0')).toThrow(/Unknown ruleset/);
    expect(() => loadSylvarisRuleset('constructor')).toThrow(/Unknown ruleset/);
  });

  it('is deeply frozen, and a mutation throws', () => {
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.skills)).toBe(true);
    expect(Object.isFrozen(r.skillsById['aggression']?.levels.basic)).toBe(true);
    expect(Object.isFrozen(r.racesById['dwarf']?.skills[0])).toBe(true);
    expect(() => {
      (r.ruleset.xp as { start: number }).start = 1;
    }).toThrow(TypeError);
    expect(() => {
      (r.skills as unknown as unknown[]).push({});
    }).toThrow(TypeError);
    expect(() => {
      (r.skillsById as Record<string, unknown>)['new-skill'] = {};
    }).toThrow(TypeError);
    expect(r.ruleset.xp.start).toBe(150);
  });

  it('builds one skillsById across regular, racial, and Calling skills', () => {
    expect(Object.keys(r.skillsById)).toHaveLength(80 + 28 + 26);
    expect(r.skillsById['aggression']?.category).toBe('offensive');
    const racial = r.skillsById['dwarven-persistence'];
    expect(racial?.category).toBe('racial');
    expect(racial && 'raceId' in racial ? racial.raceId : undefined).toBe('dwarf');
    const calling = r.skillsById['relic-mastery'];
    expect(calling?.category).toBe('calling');
    expect(calling && 'callingId' in calling ? calling.callingId : undefined).toBe('reliquist');
    expect(r.skillsById['constructor']).toBeUndefined();
    expect(r.skillsById['toString']).toBeUndefined();
  });

  it('builds the other lookups', () => {
    expect(r.racesById['elf']?.language).toBe('elven');
    expect(r.raceInnatesById['clockwork-innate-passive']?.effects?.[0]).toMatchObject({
      stat: 'armorPoints',
      amount: 10,
    });
    expect(r.callingsById['warblade']?.skills.map((s) => s.id)).toEqual([
      'skill-bond',
      'weapon-bond',
    ]);
    expect(r.techniquesById['master']).toMatchObject({ level: 6, cost: 10, requires: 'expert' });
    expect(r.spellsBySchool['air']).toHaveLength(20);
    expect(r.recipesByCraft['terra-artis']).toHaveLength(24);
    expect(r.ritualsById['summon-planar-creature']?.aliases).toEqual(['Summon Elemental']);
    expect(r.gemsById['diamond']?.valueCopper.triangle).toBe(50);
    expect(r.startingOptionsById['coin-5-copper']?.copper).toBe(5);
    expect(r.artifactPowersById['art-condition-immunity']?.maxPerArtifact).toBe(1);
    expect(r.attendanceById['gm-staff']?.silver).toBe(5);
    expect(r.extrasById['check-in-assist']?.npcHours).toBe(2);
    expect(r.mtPurchasesById['teaching-advanced']?.mtByNamedLevel?.grandmaster).toBe(1600);
  });
});

describe('counts match the rulebook', () => {
  const r = loadSylvarisRuleset();

  it('regular skills: offensive 21, defensive 14, utility 20, magic 13, crafting 12', () => {
    expect(r.skills).toHaveLength(80);
    expect(countBy(r.skills, (s) => s.category)).toEqual({
      offensive: 21,
      defensive: 14,
      utility: 20,
      magic: 13,
      crafting: 12,
    });
    expect(countBy(r.skills, (s) => `${s.category}${s.advanced ? '-advanced' : ''}`)).toEqual({
      offensive: 16,
      'offensive-advanced': 5,
      defensive: 10,
      'defensive-advanced': 4,
      utility: 17,
      'utility-advanced': 3,
      magic: 6,
      'magic-advanced': 7,
      crafting: 9,
      'crafting-advanced': 3,
    });
  });

  it('14 races with 28 racial skills', () => {
    expect(r.races).toHaveLength(14);
    const racial = r.races.flatMap((x) => x.skills);
    expect(racial).toHaveLength(28);
    for (const x of r.races) for (const s of x.skills) expect(s.raceId).toBe(x.id);
    expect(r.racesById['dwarf']?.skills.map((s) => s.id)).toContain('dwarven-persistence');
  });

  it('13 Callings with 26 Calling skills', () => {
    expect(r.callings).toHaveLength(13);
    expect(r.callings.flatMap((c) => c.skills)).toHaveLength(26);
    for (const c of r.callings) for (const s of c.skills) expect(s.callingId).toBe(c.id);
  });

  it('104 spells: air 20, death 18, earth 16, fire 16, life 16, water 18', () => {
    expect(r.spells).toHaveLength(104);
    expect(countBy(r.spells, (s) => s.school)).toEqual({
      air: 20,
      death: 18,
      earth: 16,
      fire: 16,
      life: 16,
      water: 18,
    });
  });

  it('12 rituals, 18 performances, 10 gems', () => {
    expect(r.rituals.rituals).toHaveLength(12);
    expect(r.performances).toHaveLength(18);
    expect(r.gems.gems).toHaveLength(10);
  });

  it('254 recipes with the per-craft counts', () => {
    expect(r.recipes).toHaveLength(254);
    expect(countBy(r.recipes, (x) => x.craft)).toEqual({
      alchemy: 21,
      'aqua-mortis': 20,
      armorsmithing: 23,
      herbalism: 20,
      'mystic-weaving': 20,
      'relic-crafting': 20,
      'terra-artis': 24,
      tinkering: 23,
      weaponsmithing: 22,
      artificing: 20,
      enchanting: 20,
      'flesh-crafting': 21,
    });
  });

  it('17 starting options, 10 picks', () => {
    expect(r.startingEquipment.options).toHaveLength(17);
    expect(r.startingEquipment.picks).toBe(10);
  });

  it('76 Artifact powers: tier 1 23, tier 2 20, tier 3 16, tier 4 10, tier 5 7', () => {
    expect(r.artifacts.powers).toHaveLength(76);
    expect(countBy(r.artifacts.powers, (p) => String(p.tier))).toEqual({
      1: 23,
      2: 20,
      3: 16,
      4: 10,
      5: 7,
    });
    expect(r.artifacts.allowedConditions).toHaveLength(17);
  });
});

describe('cross references', () => {
  const r = loadSylvarisRuleset();
  const all = Object.values(r.skillsById);

  it('skill ids are unique across skills.json, races, and Callings', () => {
    const ids = [
      ...r.skills.map((s) => s.id),
      ...r.races.flatMap((x) => x.skills.map((s) => s.id)),
      ...r.callings.flatMap((c) => c.skills.map((s) => s.id)),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every prerequisite names an existing skill, at the Master Technique', () => {
    const reqs = all.flatMap((s) => s.prereqs.flatMap((g) => g.of));
    expect(reqs.length).toBeGreaterThan(0);
    for (const q of reqs) {
      expect(r.skillsById[q.skill], q.skill).toBeDefined();
      expect(q.technique).toBe('master');
    }
  });

  it('prerequisite groups read as printed', () => {
    const groups = (id: string) =>
      r.skillsById[id]?.prereqs.map((g) => [g.need, g.of.map((q) => q.skill)]);
    expect(groups('flash')).toEqual([
      [1, ['blink', 'evoke-fear']],
      [1, ['precision', 'back-strike']],
    ]);
    expect(groups('destruction-magic')).toEqual([
      [1, ['death-magic']],
      [1, ['fire-magic']],
    ]);
    expect(groups('ritualism')).toEqual([
      [2, ['air-magic', 'death-magic', 'earth-magic', 'fire-magic', 'life-magic', 'water-magic']],
    ]);
    expect(groups('artificing')).toEqual([[2, ['armorsmithing', 'tinkering', 'weaponsmithing']]]);
  });

  it('every spell school maps to a base magic skill', () => {
    for (const s of r.spells) {
      const school = r.ruleset.magicSchools.find((m) => m.id === s.school);
      const skill = r.skillsById[school?.skill ?? ''];
      expect(skill?.category, s.id).toBe('magic');
      expect(skill?.school).toBe(s.school);
    }
  });

  it('every recipe craft is a crafting skill', () => {
    for (const x of r.recipes) {
      const skill = r.skillsById[x.craft];
      expect(skill?.category, x.id).toBe('crafting');
      expect(skill?.advanced).toBe(x.advancedCraft);
    }
  });
});

describe('ruleset numbers match the rulebook', () => {
  const c = loadSylvarisRuleset().ruleset;

  it('points', () => {
    expect(c.xp).toMatchObject({ start: 150, perEvent: 60, earnedCap: 2000 });
    expect(c.cxp).toMatchObject({ start: 0, perEvent: 5, earnedCap: 610 });
    expect(c.axp).toMatchObject({ start: 0, perEvent: 1 });
  });

  it('skill costs and the Technique table', () => {
    expect(c.skills.costPerLevel).toBe(5);
    expect(c.skills.maxLevel).toBe(10);
    expect(c.skills.techniques).toEqual([
      { id: 'expert', level: 3, cost: 5 },
      { id: 'master', level: 6, cost: 10, requires: 'expert' },
      { id: 'grandmaster', level: 10, cost: 15, requires: 'master' },
    ]);
    // Rulebook p.17: a racial skill to level 3 plus its Expert Technique costs 35 XP.
    const levels = [1, 2, 3].reduce((n, l) => n + l * c.skills.costPerLevel, 0);
    expect(levels + (c.skills.techniques[0]?.cost ?? 0)).toBe(35);
  });

  it('creation limits', () => {
    expect(c.creation).toMatchObject({
      startingXp: 150,
      maxSkillLevel: 5,
      maxTechnique: 'expert',
      startingEquipmentPicks: 10,
    });
  });

  it('body, caps, and slots', () => {
    expect(c.body.baseLifePoints).toBe(10);
    expect(c.body.spiritFragmentsMax).toBe(10);
    expect(c.caps).toMatchObject({
      passiveDamage: 20,
      passiveDamageFromBehind: 30,
      healableLifePoints: 100,
      temporaryLifePoints: 50,
      refittableArmorPoints: 100,
      temporaryArmorPoints: 50,
    });
    expect(c.slots).toMatchObject({ enhancement: 4, attunement: 6, greaterBoon: 4, lesserBoon: 4 });
    expect(c.familiarization.maxLocations).toBe(20);
    expect(c.upkeep).toMatchObject({ silverPerEvent: 1, firstEventFree: true });
    expect(c.events.repopsPerEvent).toBe(3);
  });

  it('Calling, Artifact, and retirement', () => {
    expect(c.calling).toMatchObject({ minFullEvents: 5, startCostCxp: 10, maxTechniqueGap: 1 });
    expect(c.artifact).toMatchObject({ minXpEarned: 500, slotCostAxp: 5, maxSlots: 10 });
    expect(c.retirement.xp).toMatchObject({ fraction: 0.25, deduct: 150 });
    expect(c.retirement.cxp.fraction).toBe(0.5);
    expect(c.retirement.axp.fraction).toBe(0.25);
    expect(c.retirement.goods).toEqual({ fraction: 0.25, deductCopper: 50, min: 0 });
  });

  it('combat: weapon base damage, armor phys rep, and buffs', () => {
    const base = Object.fromEntries(c.combat.weapons.map((w) => [w.id, w.baseDamage]));
    // Rulebook p.155
    expect(base).toEqual({
      wand: 2,
      short: 2,
      long: 2,
      'two-handed': 3,
      staff: 3,
      bow: 3,
      crossbow: 3,
      thrown: 2,
    });
    expect(c.combat.armorPhysRep.locations).toHaveLength(7);
    expect(c.combat.armorPhysRep.pointsPerLocation).toBe(5);
    expect(c.combat.buffs.length).toBeGreaterThan(30);
  });

  it('every constant has a page reference path that exists', () => {
    expect(Object.keys(c.sources).length).toBeGreaterThan(50);
  });
});

describe('awards', () => {
  const a = loadSylvarisRuleset().awards;
  const sum = (id: string, currency: string) =>
    a.attendance
      .find((x) => x.id === id)
      ?.grants.filter((g) => g.currency === currency)
      .reduce((n, g) => n + g.amount, 0);

  it('attendance bundles', () => {
    expect(a.attendance.map((x) => x.id)).toEqual(['player', 'npc-unpaid', 'npc-paid', 'gm-staff']);
    expect([sum('player', 'xp'), sum('player', 'cxp'), sum('player', 'axp')]).toEqual([60, 5, 1]);
    expect([sum('gm-staff', 'xp'), sum('gm-staff', 'cxp'), sum('gm-staff', 'mt')]).toEqual([
      70, 10, 500,
    ]);
    expect(a.attendance.find((x) => x.id === 'npc-unpaid')?.npcTimeMax).toBe(true);
  });

  it('NPC time and extras', () => {
    expect(a.npcTime).toMatchObject({
      xpPerHour: 1,
      cxpPerHour: 1,
      maxHours: 5,
      mtPerHourAfterMax: 50,
      mtCap: 500,
    });
    const mt = (id: string) => a.extras.find((x) => x.id === id)?.grants?.[0]?.amount;
    expect(mt('marshal-medic')).toBe(50);
    expect(mt('sunday-cleanup')).toBe(100);
    expect(mt('friday-setup')).toBe(50);
  });

  it('MT purchases and caps', () => {
    const p = (id: string) => a.mtPurchases.find((x) => x.id === id);
    expect(p('xp')).toMatchObject({ mtCost: 50, capPerEvent: 10, backBuy: true });
    expect(p('cxp')).toMatchObject({ mtCost: 50, capPerEvent: 5 });
    expect(p('teaching-normal')?.mtByNamedLevel).toEqual({
      basic: 100,
      expert: 300,
      master: 600,
      grandmaster: 1000,
    });
    expect(p('stable-consumable')).toMatchObject({ capPerYear: 5 });
    expect(p('renewing-augment')?.mtByNamedLevel?.master).toBe(3000);
    expect(p('alt-character-event-xp')).toMatchObject({ mtCost: 500, capPerYear: 3 });
  });
});
