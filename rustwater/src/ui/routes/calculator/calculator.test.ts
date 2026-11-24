import { describe, expect, it } from 'vitest';
import { deriveSheet, type Sheet } from '../../../engine/index.ts';
import { grantCxp, learnBasic, rs, withCharacter } from '../../../engine/testkit.ts';
import {
  armorBuffs,
  armorLines,
  attacks,
  damageBuffs,
  damageFor,
  EMPTY_COMBAT,
  hasRawMagicEnhancement,
  healthBuffs,
  healthLines,
  NO_GEAR,
  permanentDamage,
  physrepArmor,
  reflexArmor,
  type Attack,
  type DamageOptions,
  type Line,
} from '../character/play/combat.ts';
import { lark } from '../character/memory/testCharacter.ts';
import { printAsh } from '../character/print/testCharacter.ts';
import { ash } from '../../test/veteran.ts';
import {
  calculatorFields,
  calculatorInputsFromSheet,
  calculatorSheet,
  defaultCalculatorState,
  defaultInputs,
  parseCalculatorState,
  subtypeMatters,
  withAncestry,
  type CalculatorInputs,
} from './calculatorInputs.ts';

const sum = (lines: readonly Line[]) => lines.reduce((t, l) => t + l.amount, 0);
const NONE: DamageOptions = { fromBehind: false, targetStunned: false };
const ALL: DamageOptions = { fromBehind: true, targetStunned: true, rawMagic: 3 };

function hit(sheet: Sheet, id: string, chosen: string[] = [], options = NONE) {
  const found = attacks(rs, sheet).find((a) => a.id === id);
  if (!found) throw new Error(`no attack ${id}`);
  return damageFor(rs, sheet, found, damageBuffs(rs, sheet), new Set(chosen), options, NO_GEAR);
}

/** Every number the Play Tracker shows for a sheet, without labels that name the familiar. */
function combatNumbers(sheet: Sheet) {
  const list = attacks(rs, sheet);
  const dBuffs = damageBuffs(rs, sheet);
  const totals = (a: Attack, chosen: string[], options: DamageOptions) =>
    damageFor(rs, sheet, a, dBuffs, new Set(chosen), options, {
      enhancement: 'better',
      temp: 'barbed-wire',
      scope: 'best',
    }).total;
  return {
    health: sum(healthLines(rs, sheet)),
    healthBuffs: healthBuffs(rs, sheet).map((b) => [b.id, b.amount]),
    armor: sum(armorLines(rs, sheet)),
    armorBuffs: armorBuffs(rs, sheet).map((b) => [b.id, b.amount]),
    physrep: [0, 1, 2, 3, 4, 5, 6, 7].map((n) => physrepArmor(sheet, n)),
    reflex: [0, 1].map((n) => reflexArmor(sheet, n).amount),
    rawMagic: hasRawMagicEnhancement(sheet),
    stunMastery: sheet.skills.some(
      (s) => s.skillId === 'stun' && s.parts.some((p) => p.part === 'mastery'),
    ),
    precision: sheet.skills.some((s) => s.skillId === 'precision'),
    permanent: permanentDamage(rs, sheet).map((p) => [p.amount, p.applies, p.great ?? 0]),
    damageBuffs: dBuffs.map((b) => [b.id, b.amount]),
    damage: list.map((a) => [
      a.id,
      a.types,
      totals(a, [], NONE),
      totals(a, [], ALL),
      ...dBuffs.map((b) => totals(a, [b.id], ALL)),
    ]),
  };
}

/** A built character with most of what the combat math reads. */
function fighter(): Sheet {
  const h = withCharacter({ ancestryId: 'elf', subtypeId: 'elf-windwalker' });
  grantCxp(h, 20000);
  learnBasic(h, 'assault', 9);
  learnBasic(h, 'dash', 6);
  learnBasic(h, 'death-magic', 6);
  const passive = (skillId: string, toLevel: number) =>
    h.run({ type: 'learnSkill', skillId, part: 'main', toLevel, teacher: 'Old Jory' });
  passive('weapon-damage', 3);
  passive('toughness-warrior', 2);
  passive('precision', 1);
  passive('reflexes', 2);
  passive('raw-magic-proficiency', 1);
  h.run({ type: 'addBoon', boonId: 'bionic-arms' });
  h.run({ type: 'addBoon', boonId: 'vigor-stimulant-injector' });
  h.run({ type: 'addBoon', boonId: 'built-in-armor' });
  // The familiar skills straight into the log (replay does not check Essence).
  const n = h.actions.length;
  const raw = (i: number, type: string, payload: unknown) => ({
    id: `fam-${i}`,
    seq: n + i,
    at: '2026-05-16T12:00:00.000Z',
    actor: { role: 'staff' as const },
    type: type as 'familiar.bonded',
    payload,
  });
  return deriveSheet(rs, [
    ...h.actions,
    raw(1, 'familiar.bonded', { name: 'Murk' }),
    raw(2, 'familiar.awakened', { awakenedSkillId: 'push', fpCost: 0 }),
    raw(3, 'familiar.skillLearned', { skillId: 'fam-max-health', essenceCost: 0 }),
    raw(4, 'familiar.skillLearned', { skillId: 'fam-armor-buff', essenceCost: 0 }),
    raw(5, 'familiar.skillLearned', { skillId: 'fam-passive-damage', essenceCost: 0 }),
    raw(6, 'familiar.skillLearned', { skillId: 'fam-damage-buff', essenceCost: 0 }),
  ]);
}

function inputs(patch: Partial<CalculatorInputs>): CalculatorInputs {
  return { ...defaultInputs(rs), ...patch };
}

describe('calculator inputs from a sheet', () => {
  const fixtures: [string, () => Sheet][] = [
    ['Ash veteran', () => deriveSheet(rs, ash().actions)],
    [
      'Ash print (familiar, boon, Toughness, Armor, Life Magic)',
      () => deriveSheet(rs, printAsh().actions),
    ],
    ['Lark caster', () => deriveSheet(rs, lark().actions)],
    ['a new character', () => withCharacter().sheet()],
    ['an elf fighter with boons and a familiar', fighter],
  ];
  it.each(fixtures)('gives the Play Tracker numbers for %s', (_name, make) => {
    const sheet = make();
    const built = calculatorSheet(rs, calculatorInputsFromSheet(rs, sheet));
    expect(combatNumbers(built)).toEqual(combatNumbers(sheet));
  });

  it('reads levels, schools, boons, and familiar skills from the sheet', () => {
    // 10 base + 20 Toughness + 10 Vigor Stimulant Injector + 10 familiar.
    expect(combatNumbers(fighter()).health).toBe(50);
    const read = calculatorInputsFromSheet(rs, fighter());
    expect(read).toEqual({
      ancestryId: 'elf',
      subtypeId: 'elf-windwalker',
      levels: {
        'weapon-damage': 3,
        'toughness-warrior': 2,
        precision: 1,
        reflexes: 2,
        'raw-magic-proficiency': 1,
      },
      owned: ['death-magic:basic'],
      boons: ['bionic-arms', 'vigor-stimulant-injector', 'built-in-armor'],
      familiar: ['fam-max-health', 'fam-armor-buff', 'fam-passive-damage', 'fam-damage-buff'],
    });
  });
});

describe('calculator fields', () => {
  it('offers every passive skill the combat math reads, Toughness once per archetype', () => {
    const fields = calculatorFields(rs);
    expect(fields.levels.map((f) => [f.label, f.section, f.max])).toEqual(
      expect.arrayContaining([
        ['Weapon Damage', 'weapon', 5],
        ['Precision', 'weapon', 5],
        ['Toughness (Warrior)', 'defense', 5],
        ['Toughness (Defender)', 'defense', 5],
        ['Armor', 'defense', 5],
        ['Reflexes', 'defense', 5],
        ['Raw Magic Proficiency', 'magic', 5],
      ]),
    );
    expect(fields.levels).toHaveLength(7);
    expect(fields.toggles.map((t) => t.label)).toEqual([
      'Stun Mastery',
      'Elemental Magic',
      'Life Magic',
      'Death Magic',
      'Tech Magic',
      'Ruin Magic',
      'Raw Magic Enhancement',
    ]);
    expect(fields.boons.map((b) => b.id)).toEqual([
      'bionic-arms',
      'vigor-stimulant-injector',
      'built-in-armor',
    ]);
    expect(fields.familiar).toHaveLength(6);
  });

  it('asks for the subtype only where it changes the numbers (no ancestry today)', () => {
    for (const a of rs.ancestries.ancestries) expect(subtypeMatters(rs, a.id)).toBe(false);
  });

  it('resets the subtype when the ancestry changes', () => {
    const next = withAncestry(rs, defaultInputs(rs), 'conscious');
    expect(next.ancestryId).toBe('conscious');
    expect(next.subtypeId).toBe(rs.ancestriesById['conscious']?.subtypes[0]?.id);
    expect(withAncestry(rs, next, 'nope')).toBe(next);
  });
});

describe('calculator totals', () => {
  it('starts at 10 Health, 0 Armor, and a 1 Steel short weapon', () => {
    const sheet = calculatorSheet(rs, defaultInputs(rs));
    expect(sum(healthLines(rs, sheet))).toBe(10);
    expect(sum(armorLines(rs, sheet))).toBe(0);
    expect(hit(sheet, 'short').total).toBe(1);
    expect(sheet.warnings.filter((w) => w.code !== 'LEVEL_ORDER')).toEqual([]);
  });

  it('Weapon Damage 3 with a great weapon: 3 base, +3, +1 great weapon bonus', () => {
    const sheet = calculatorSheet(rs, inputs({ levels: { 'weapon-damage': 3 } }));
    expect(hit(sheet, 'great').total).toBe(7);
    expect(hit(sheet, 'short').total).toBe(4);
  });

  it('Toughness levels add to Health, with +10 more at level 5', () => {
    const health = (levels: Record<string, number>) =>
      sum(healthLines(rs, calculatorSheet(rs, inputs({ levels }))));
    expect(health({ 'toughness-warrior': 2 })).toBe(30);
    expect(health({ 'toughness-warrior': 5 })).toBe(70);
    expect(health({ 'toughness-warrior': 5, 'toughness-defender': 1 })).toBe(80);
  });

  it('the Armor skill upgrades covered locations; Reflexes count only without armor', () => {
    const armored = calculatorSheet(rs, inputs({ levels: { armor: 2 } }));
    expect(sum(armorLines(rs, armored))).toBe(10);
    expect(physrepArmor(armored, 3)).toEqual({ amount: 2 * 5 + 2, upgraded: 2 });
    const full = calculatorSheet(rs, inputs({ levels: { armor: 5 } }));
    expect(sum(armorLines(rs, full))).toBe(35);
    expect(physrepArmor(full, 7)).toEqual({ amount: 35, upgraded: 7 });
    const nimble = calculatorSheet(rs, inputs({ levels: { reflexes: 2 } }));
    expect(reflexArmor(nimble, 0).amount).toBe(10);
    expect(reflexArmor(nimble, 1).amount).toBe(0);
    const both = calculatorSheet(rs, inputs({ levels: { reflexes: 2, armor: 1 } }));
    expect(reflexArmor(both, 0).blocked).toMatch(/Armor skill/);
  });

  it('packets need a school; Ruin Magic and Raw Magic Proficiency add to them', () => {
    const none = calculatorSheet(rs, defaultInputs(rs));
    expect(attacks(rs, none).some((a) => a.kind === 'packet')).toBe(false);
    const caster = calculatorSheet(
      rs,
      inputs({
        owned: ['death-magic:basic', 'ruin-magic:main'],
        levels: { 'raw-magic-proficiency': 2 },
      }),
    );
    expect(attacks(rs, caster).map((a) => a.id)).toContain('packet-death');
    expect(attacks(rs, caster).map((a) => a.id)).not.toContain('packet-life');
    // 1 base + 2 Raw Magic Proficiency + 1 Ruin Magic on Harm.
    expect(hit(caster, 'packet-death').total).toBe(4);
  });

  it('Stun Mastery and Raw Magic Enhancement turn on their Damage card options', () => {
    const sheet = calculatorSheet(
      rs,
      inputs({ owned: ['stun:mastery', 'raw-magic-enhancement:basic', 'life-magic:basic'] }),
    );
    expect(hit(sheet, 'short', [], { fromBehind: false, targetStunned: true }).total).toBe(6);
    expect(hasRawMagicEnhancement(sheet)).toBe(true);
    expect(hit(sheet, 'packet-life', [], { ...NONE, rawMagic: 4 }).total).toBe(5);
  });

  it('ancestry, boons, and the familiar add their bonuses and buffs', () => {
    const sheet = calculatorSheet(
      rs,
      inputs({
        ...withAncestry(rs, defaultInputs(rs), 'elf'),
        boons: ['bionic-arms', 'vigor-stimulant-injector', 'built-in-armor'],
        familiar: ['fam-max-health', 'fam-passive-damage', 'fam-health-buff'],
      }),
    );
    expect(sum(healthLines(rs, sheet))).toBe(10 + 10 + 10);
    expect(healthLines(rs, sheet).map((l) => l.label)).toContain('Familiar');
    expect(sum(armorLines(rs, sheet))).toBe(10);
    // 1 base + 1 Elf + 1 Bionic Arms + 1 familiar passive.
    expect(hit(sheet, 'short').total).toBe(4);
    expect(healthBuffs(rs, sheet).map((b) => b.id)).toContain('fam-health-buff');
    const conscious = calculatorSheet(rs, withAncestry(rs, defaultInputs(rs), 'conscious'));
    expect(sum(healthLines(rs, conscious))).toBe(20);
  });
});

describe('saved calculator choices', () => {
  it('tolerates bad data', () => {
    const empty = defaultCalculatorState(rs);
    expect(parseCalculatorState(rs, null)).toEqual(empty);
    expect(parseCalculatorState(rs, 'x')).toEqual(empty);
    expect(parseCalculatorState(rs, { inputs: 4, combat: [] })).toEqual(empty);
  });

  it('keeps known choices, clamps levels, and drops the rest', () => {
    const parsed = parseCalculatorState(rs, {
      inputs: {
        ancestryId: 'elf',
        subtypeId: 'human-sheltered',
        levels: { 'weapon-damage': 9, armor: 2.7, reflexes: -1, assault: 3, precision: 'x' },
        owned: ['death-magic:basic', 'assault:basic', 7],
        boons: ['bionic-arms', 'slap-in-the-face'],
        familiar: ['fam-max-armor', 'fam-feint'],
      },
      combat: { health: ['bolster-toughness'], rawMagic: 99 },
    });
    expect(parsed.inputs).toEqual({
      ancestryId: 'elf',
      subtypeId: rs.ancestriesById['elf']?.subtypes[0]?.id,
      levels: { 'weapon-damage': 5, armor: 2 },
      owned: ['death-magic:basic'],
      boons: ['bionic-arms'],
      familiar: ['fam-max-armor'],
    });
    expect(parsed.combat).toEqual({
      ...EMPTY_COMBAT,
      health: ['bolster-toughness'],
      rawMagic: 10,
    });
  });
});
