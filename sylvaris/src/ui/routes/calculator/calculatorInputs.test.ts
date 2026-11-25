// The calculator's form and sheet: which inputs it asks for, the Technique rules of the form, and
// that its sheet gives the same numbers as a real character with the same skills.
import { describe, expect, it } from 'vitest';
import { grant, learn, rs, withCharacter } from '../../../engine/testkit.ts';
import { attacks, damageFor, lifeFor } from '../character/play/combat.ts';
import {
  calculatorFields,
  calculatorOptions,
  calculatorSheet,
  changeInputs,
  defaultCalculatorState,
  defaultInputs,
  parseCalculatorState,
  raceChoiceFields,
  skillsFor,
  withCalling,
  withLevel,
  withRace,
  withTechnique,
  type CalculatorInputs,
} from './calculatorInputs.ts';

const fields = calculatorFields(rs);
const ids = (raceId: string, callingId = '') =>
  skillsFor(rs, fields, raceId, callingId).map((s) => s.skillId);

function withSkill(
  inputs: CalculatorInputs,
  skillId: string,
  level: number,
  techniques: readonly ('expert' | 'master' | 'grandmaster')[] = [],
): CalculatorInputs {
  let next = withLevel(rs, inputs, skillId, level);
  for (const t of techniques) next = withTechnique(rs, next, skillId, t, true);
  return next;
}

describe('calculator fields', () => {
  it('asks only for the skills that feed Life, Armor, or damage', () => {
    expect(ids('human')).toEqual([
      'monster-ken',
      'precision',
      'relic-proficiency',
      'strength',
      'toughness',
      'weapon-proficiency',
      'wear-armor',
    ]);
  });

  it('adds racial skills, Finesse for a dual wield bonus, and Calling skills', () => {
    // Aeshu: the dual wield bonus needs a skill that allows two long weapons.
    expect(ids('aeshu')).toContain('finesse');
    expect(ids('aeshu')).toContain('weapon-flourish');
    expect(ids('human')).not.toContain('finesse');
    // Clockwork: Armor Plating replaces Wear Armor.
    expect(ids('clockwork')).toContain('armor-plating');
    expect(ids('clockwork')).not.toContain('wear-armor');
    expect(ids('orc')).toContain('orcish-anger');
    expect(ids('human', 'protector')).toContain('protector-protection');
  });

  it('lists the Callings, spells, and Artifact powers that change the numbers', () => {
    expect(fields.callings.map((c) => c.id)).toEqual(['protector', 'warblade']);
    expect(fields.spells.map((s) => s.id)).toEqual([
      'chain-lightning',
      'static-charge',
      'raging-winds',
    ]);
    expect(fields.powers.map((p) => p.id)).toEqual(
      expect.arrayContaining(['art-life-20', 'art-short-claws', 'art-amplified-life-slot']),
    );
    expect(raceChoiceFields(rs, 'beast-kin').map((c) => c.choiceId)).toEqual(['natural-weapon']);
    expect(raceChoiceFields(rs, 'human')).toEqual([]);
  });
});

describe('calculator form rules', () => {
  it('ticks the Techniques a Technique needs, and drops them with the level', () => {
    let i = withLevel(rs, defaultInputs(rs), 'toughness', 6);
    i = withTechnique(rs, i, 'toughness', 'master', true);
    expect(i.skills['toughness']).toEqual({ level: 6, techniques: ['expert', 'master'] });
    // Grandmaster needs level 10.
    expect(withTechnique(rs, i, 'toughness', 'grandmaster', true)).toBe(i);
    expect(withTechnique(rs, i, 'toughness', 'expert', false).skills['toughness']).toEqual({
      level: 6,
      techniques: [],
    });
    expect(withLevel(rs, i, 'toughness', 5).skills['toughness']).toEqual({
      level: 5,
      techniques: ['expert'],
    });
    expect(withLevel(rs, i, 'toughness', 0).skills['toughness']).toBeUndefined();
    expect(withLevel(rs, i, 'toughness', 99).skills['toughness']?.level).toBe(10);
  });

  it("drops another race's or Calling's skills when it changes", () => {
    let i = withRace(rs, defaultInputs(rs), 'orc');
    i = withSkill(i, 'orcish-anger', 3);
    i = withSkill(withCalling(rs, i, 'protector'), 'protector-protection', 1);
    expect(Object.keys(i.skills).sort()).toEqual(['orcish-anger', 'protector-protection']);
    expect(Object.keys(withRace(rs, i, 'human').skills)).toEqual(['protector-protection']);
    expect(Object.keys(withCalling(rs, i, '').skills)).toEqual(['orcish-anger']);
  });

  it('ticks the Amplified Life box when an Artifact power gives the slot', () => {
    const start = defaultCalculatorState(rs);
    expect(start.combat.amplifiedLife).toBe(false);
    const on = changeInputs(rs, start, (i) => ({ ...i, powers: ['art-amplified-life-slot'] }));
    expect(on.combat.amplifiedLife).toBe(true);
    const off = changeInputs(rs, on, (i) => ({ ...i, powers: [] }));
    expect(off.combat.amplifiedLife).toBe(false);
  });
});

describe('calculator sheet', () => {
  it('starts at the base 10 Life and 0 Armor', () => {
    const sheet = calculatorSheet(rs, defaultInputs(rs));
    expect(sheet.stats.lifePoints.total).toBe(10);
    expect(sheet.stats.armorPoints.total).toBe(0);
  });

  it('matches a real character with the same race and skills', () => {
    const h = withCharacter({ raceId: 'orc' });
    grant(h, 'xp', 2000);
    learn(h, 'toughness', 6, ['expert', 'master']);
    learn(h, 'weapon-proficiency', 6, ['expert', 'master']);
    learn(h, 'precision', 3, ['expert']);
    const real = h.sheet();

    let i = withRace(rs, defaultInputs(rs), 'orc');
    i = withSkill(i, 'toughness', 6, ['expert', 'master']);
    i = withSkill(i, 'weapon-proficiency', 6, ['expert', 'master']);
    i = withSkill(i, 'precision', 3, ['expert']);
    const calc = calculatorSheet(rs, i);

    // hand-derived: 10 base + 20 Expert + 20 Master
    expect(calc.stats.lifePoints.total).toBe(50);
    expect(calc.stats.lifePoints.total).toBe(real.stats.lifePoints.total);
    expect(calc.stats.passiveDamage).toEqual(real.stats.passiveDamage);
    const opts = calculatorOptions(rs, calc, []);
    const realOpts = calculatorOptions(rs, real, []);
    expect(opts.map((o) => [o.buff.id, o.max])).toEqual(realOpts.map((o) => [o.buff.id, o.max]));
    const sword = attacks(rs, calc).find((a) => a.id === 'long');
    if (!sword) throw new Error('no longsword');
    const input = { fromBehind: true, dualWield: false, bonded: false, weakened: false };
    expect(damageFor(rs, calc, sword, opts, {}, input).total).toBe(
      damageFor(rs, real, sword, realOpts, {}, input).total,
    );
    expect(lifeFor(rs, calc, opts, { toughness: 2 }, false).value).toBe(
      lifeFor(rs, real, realOpts, { toughness: 2 }, false).value,
    );
  });

  it('counts the race, Calling, natural weapon, and Artifact powers', () => {
    expect(
      calculatorSheet(rs, withRace(rs, defaultInputs(rs), 'clockwork')).stats.armorPoints.total,
    ).toBe(10);
    const warblade = calculatorSheet(rs, withCalling(rs, defaultInputs(rs), 'warblade'));
    expect(warblade.stats.passiveDamage.bondedWeapon.total).toBe(1);
    const beast = withRace(rs, defaultInputs(rs), 'beast-kin');
    const bite = calculatorSheet(rs, { ...beast, choices: { 'natural-weapon': 'bite' } });
    expect(bite.stats.naturalWeapons.map((w) => [w.id, w.baseDamage, w.greatclaw])).toEqual([
      ['bite', 3, true],
    ]);
    const art = calculatorSheet(rs, {
      ...defaultInputs(rs),
      powers: ['art-life-20', 'art-amplified-armor-slot'],
    });
    expect(art.stats.slots.amplifiedArmor).toBe(1);
    expect(calculatorOptions(rs, art, []).find((o) => o.buff.id === 'artifact-life')?.yours).toBe(
      true,
    );
  });

  it('offers a ticked spell as a buff of your own', () => {
    const sheet = calculatorSheet(rs, defaultInputs(rs));
    expect(calculatorOptions(rs, sheet, []).some((o) => o.buff.id === 'raging-winds')).toBe(false);
    const opts = calculatorOptions(rs, sheet, ['raging-winds']);
    expect(opts.find((o) => o.buff.id === 'raging-winds')).toMatchObject({ yours: true, max: 1 });
    // Yours come before what others give.
    const firstGiven = opts.findIndex((o) => !o.yours);
    expect(opts.slice(firstGiven).every((o) => !o.yours)).toBe(true);
  });
});

describe('saved calculator choices', () => {
  it('keeps what the rules allow and drops the rest', () => {
    const state = parseCalculatorState(rs, {
      inputs: {
        raceId: 'beast-kin',
        choices: { 'natural-weapon': 'bite', size: 'large' },
        callingId: 'nope',
        skills: {
          toughness: { level: 4, techniques: ['expert', 'master'] },
          'orcish-anger': { level: 2 },
          'wear-armor': { level: 'x' },
        },
        spells: ['static-charge', 'fireball'],
        powers: ['art-life-20', 'art-nope'],
      },
      combat: { chosen: { toughness: 2 }, weakened: true },
    });
    expect(state.inputs).toEqual({
      raceId: 'beast-kin',
      choices: { 'natural-weapon': 'bite' },
      callingId: '',
      skills: { toughness: { level: 4, techniques: ['expert'] } },
      spells: ['static-charge'],
      powers: ['art-life-20'],
    });
    expect(state.combat).toMatchObject({ chosen: { toughness: 2 }, weakened: true });
    expect(parseCalculatorState(rs, 'junk')).toEqual(defaultCalculatorState(rs));
    expect(parseCalculatorState(rs, { inputs: { raceId: 'nope' } }).inputs.raceId).toBe('human');
  });
});
