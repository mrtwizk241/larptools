import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset, type Sheet } from '../../../../engine/index.ts';
import { ash, ashAfter } from '../../../test/veteran.ts';
import {
  armorFor,
  attacks,
  buffOptions,
  damageFor,
  enhancementSlots,
  lifeFor,
  setBuff,
  type Attack,
  type Chosen,
} from './combat.ts';

const ruleset = loadRuleset();
const sheetOf = (character = ash()) => deriveSheet(ruleset, character.actions);
const NO_OPTIONS = { fromBehind: false, dualWield: false, bonded: false, weakened: false };

function attack(sheet: Sheet, id: string): Attack {
  const found = attacks(ruleset, sheet).find((a) => a.id === id);
  if (!found) throw new Error(`No attack ${id}`);
  return found;
}

/** Ash (Human, Toughness 3 and Wear Armor 3 with their Expert Techniques, Protector). */
describe('buffOptions', () => {
  it('lists the character own buffs first, with how often a use stacks, then the given ones', () => {
    const options = buffOptions(ruleset, sheetOf());
    const yours = options.filter((o) => o.yours).map((o) => [o.buff.id, o.max]);
    // Toughness and Wear Armor: 3 uses each. Protection: 1 + no Techniques.
    expect(yours).toEqual([
      ['toughness', 3],
      ['protector-protection', 1],
      ['wear-armor', 3],
    ]);
    const given = options.filter((o) => !o.yours).map((o) => o.buff.id);
    expect(given).toContain('grant-life');
    expect(given).toContain('battle-unit');
    // Skills and spells of others' own are not offered.
    expect(given).not.toContain('weapon-proficiency');
    expect(given).not.toContain('chain-lightning');
  });

  it('offers Weapon Proficiency once the character has it, one per use', () => {
    const sheet = sheetOf(
      ashAfter([
        { type: 'learnSkill', skillId: 'weapon-proficiency', step: { level: 1 }, teacher: 'Jory' },
        { type: 'learnSkill', skillId: 'weapon-proficiency', step: { level: 2 }, teacher: 'Jory' },
      ]),
    );
    const option = buffOptions(ruleset, sheet).find((o) => o.buff.id === 'weapon-proficiency');
    expect(option).toMatchObject({ yours: true, max: 2 });
  });
});

describe('setBuff', () => {
  const options = buffOptions(ruleset, sheetOf());

  it('clamps a count to what the character can use', () => {
    expect(setBuff(options, {}, 'toughness', 5)).toEqual({ toughness: 3 });
    expect(setBuff(options, { toughness: 2 }, 'toughness', 0)).toEqual({});
    expect(setBuff(options, {}, 'no-such-buff', 1)).toEqual({});
  });

  it('keeps one buff of a group: one Battle Unit at a time', () => {
    const one = setBuff(options, {}, 'battle-unit', 1);
    expect(setBuff(options, one, 'battle-unit-master', 1)).toEqual({ 'battle-unit-master': 1 });
  });
});

describe('lifeFor', () => {
  const sheet = sheetOf();
  const options = buffOptions(ruleset, sheet);

  it('starts from the sheet: 10 base + 20 Toughness Expert', () => {
    const life = lifeFor(ruleset, sheet, options, {}, false);
    expect(life.lines).toEqual([
      { label: 'Base Life Points', amount: 10 },
      { label: 'Toughness (Expert)', amount: 20 },
    ]);
    expect(life.value).toBe(30);
  });

  it('adds uses that stack and only the largest Life enhancement', () => {
    const chosen: Chosen = { toughness: 2, 'grant-life': 1, 'toughness-potion': 1 };
    const life = lifeFor(ruleset, sheet, options, chosen, false);
    // hand-derived: 30 + 2 x 10 Toughness + 20 Grant Life; the Toughness Potion (also 20) does not add
    expect(life.value).toBe(70);
    expect(life.lines.map((l) => l.label)).toContain('Toughness x2');
    expect(life.ignored.map((i) => i.id)).toEqual(['toughness-potion']);
    expect(life.counted).toEqual(['toughness', 'grant-life']);
  });

  it('doubles the enhancement in an Amplified Life slot and stops at the cap of 100', () => {
    const life = lifeFor(
      ruleset,
      sheet,
      options,
      { toughness: 3, 'grant-life': 1, 'protector-protection': 1, 'fortitude-mutagen-life': 1 },
      true,
    );
    // hand-derived: 30 + 30 Toughness + 40 amplified Grant Life + 10 Protection + 10 Fortitude = 120
    expect(life.lines).toContainEqual({ label: 'Grant Life (amplified)', amount: 40 });
    expect(life.total).toBe(120);
    expect(life.value).toBe(100);
  });
});

describe('armorFor', () => {
  const sheet = sheetOf();
  const options = buffOptions(ruleset, sheet);

  it('adds 5 per covered phys rep location and the buffs', () => {
    const armor = armorFor(
      ruleset,
      sheet,
      options,
      { 'wear-armor': 3, 'ice-armor': 1, 'bandage-of-barkskin': 1 },
      { covered: ['Head', 'Chest front', 'Chest back', 'Not a location'], amplified: false },
    );
    // hand-derived: 20 Wear Armor Expert + 3 x 5 phys rep + 30 Wear Armor uses + 20 Ice Armor
    expect(armor.lines).toContainEqual({ label: 'Armor phys rep (3 locations)', amount: 15 });
    expect(armor.value).toBe(85);
    expect(armor.ignored.map((i) => i.id)).toEqual(['bandage-of-barkskin']);
  });

  it('applies race armor only with, or only without, physical armor', () => {
    const base = sheetOf();
    const dwarfLike: Sheet = {
      ...base,
      stats: {
        ...base.stats,
        armorPoints: {
          ...base.stats.armorPoints,
          conditional: [
            {
              stat: 'armorPoints',
              amount: 10,
              op: 'add',
              source: { kind: 'race', id: 'dwarf-innate-passive' },
              name: 'Dwarf innate',
              when: 'wearing physical armor',
              pool: null,
              note: null,
            },
          ],
        },
      },
    };
    const bare = armorFor(ruleset, dwarfLike, [], {}, { covered: [], amplified: false });
    expect(bare.value).toBe(20);
    expect(bare.notCounted).toEqual(['Dwarf innate: +10 wearing physical armor']);
    const worn = armorFor(ruleset, dwarfLike, [], {}, { covered: ['Head'], amplified: false });
    // hand-derived: 20 + 5 phys rep + 10 Dwarf innate
    expect(worn.value).toBe(35);
  });
});

describe('damageFor', () => {
  const sheet = sheetOf();
  const options = buffOptions(ruleset, sheet);

  it('lists weapons by type with their base damage, and a Relic', () => {
    const list = attacks(ruleset, sheet);
    expect(list.map((a) => [a.id, a.base])).toEqual([
      ['wand', 2],
      ['short', 2],
      ['long', 2],
      ['two-handed', 3],
      ['staff', 3],
      ['bow', 3],
      ['crossbow', 3],
      ['thrown', 2],
      ['relic', 2],
    ]);
    expect(attack(sheet, 'relic').types).toContain('Physical Fire');
  });

  it('counts the largest damage enhancement plus the buffs that take no slot', () => {
    const chosen: Chosen = {
      'grant-ogre-strength': 1,
      'performance-of-battle': 1,
      'battle-unit': 1,
      'pain-venom': 1,
    };
    const long = attack(sheet, 'long');
    const front = damageFor(ruleset, sheet, long, options, chosen, NO_OPTIONS);
    // hand-derived: base 2 + Ogre 2 (beats Performance of Battle 1) + Battle Unit 1; venom only from behind
    expect(front.total).toBe(5);
    expect(front.ignored.map((i) => i.id)).toEqual(['performance-of-battle']);

    const behind = damageFor(ruleset, sheet, long, options, chosen, {
      ...NO_OPTIONS,
      fromBehind: true,
    });
    expect(behind.total).toBe(7);
    expect(behind.cap).toBe(30);

    const weak = damageFor(ruleset, sheet, long, options, chosen, {
      ...NO_OPTIONS,
      weakened: true,
    });
    // hand-derived: passive 3 halved to 1, cap 10
    expect(weak.total).toBe(3);
    expect(weak.cap).toBe(10);
  });

  it('adds melee buffs only to melee and ranged buffs only to ranged', () => {
    const chosen: Chosen = { 'grant-titan-strength': 1, 'radiance-strengthening-augment': 1 };
    const twoHanded = damageFor(
      ruleset,
      sheet,
      attack(sheet, 'two-handed'),
      options,
      chosen,
      NO_OPTIONS,
    );
    // hand-derived: base 3 + Titan 5 + Radiance 3 (two-handed)
    expect(twoHanded.total).toBe(11);
    const bow = damageFor(ruleset, sheet, attack(sheet, 'bow'), options, chosen, NO_OPTIONS);
    expect(bow.total).toBe(3);
    // From behind does not apply to ranged attacks.
    expect(bow.can.fromBehind).toBe(false);
  });

  it('stops passive damage at the cap', () => {
    const base = sheetOf();
    const strong: Sheet = {
      ...base,
      stats: {
        ...base.stats,
        passiveDamage: {
          ...base.stats.passiveDamage,
          oneHanded: {
            total: 18,
            value: 18,
            cap: 20,
            sources: [
              {
                stat: 'passiveDamage1h',
                amount: 18,
                op: 'add',
                source: { kind: 'base' },
                name: 'Invented passives',
                when: null,
                pool: null,
                note: null,
              },
            ],
            conditional: [],
          },
        },
      },
    };
    const result = damageFor(
      ruleset,
      strong,
      attack(strong, 'short'),
      options,
      { 'grant-titan-strength': 1 },
      NO_OPTIONS,
    );
    // hand-derived: base 2 + min(18 + 5, 20)
    expect(result.passive).toBe(23);
    expect(result.total).toBe(22);
    expect(result.notes).toContain('Passive damage 23 stops at the cap of 20.');
  });
});

describe('enhancementSlots', () => {
  it('counts one slot per enhancement that counts, against the slots the sheet has', () => {
    const sheet = sheetOf();
    const options = buffOptions(ruleset, sheet);
    const chosen: Chosen = {
      'grant-life': 1,
      'toughness-potion': 1,
      'ice-armor': 1,
      toughness: 2,
    };
    const life = lifeFor(ruleset, sheet, options, chosen, false);
    // Grant Life and Ice Armor fill slots; the beaten potion and the Toughness uses do not.
    expect(enhancementSlots(sheet, options, chosen, life.ignored)).toEqual({ used: 2, have: 4 });
  });
});
