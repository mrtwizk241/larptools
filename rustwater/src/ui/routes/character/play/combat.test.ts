import { describe, expect, it } from 'vitest';
import { grantCxp, learnBasic, rs, withCharacter } from '../../../../engine/testkit.ts';
import type { Sheet } from '../../../../engine/index.ts';
import {
  addDamageLine,
  armorBuffs,
  armorLines,
  attacks,
  buffTotals,
  changeLineAttack,
  chooseInGroup,
  damageBuffs,
  damageFor,
  damageLineSummaries,
  EMPTY_COMBAT,
  groupByTiming,
  healthBuffs,
  healthLines,
  MAX_DAMAGE_LINES,
  NO_GEAR,
  parseCombatState,
  permanentDamage,
  physrepArmor,
  reflexArmor,
  removeDamageLine,
  TIMINGS,
  toggleBuff,
  toggleOpen,
  type Attack,
  type DamageOptions,
} from './combat.ts';
import { masteryMoves, movesLeft, spendMove, trackedUses } from './usage.ts';

function learnPassive(h: ReturnType<typeof withCharacter>, skillId: string, level: number) {
  h.run({ type: 'learnSkill', skillId, part: 'main', toLevel: level, teacher: 'Old Jory' });
}

const NONE: DamageOptions = { fromBehind: false, targetStunned: false };

function attack(sheet: Sheet, id: string): Attack {
  const found = attacks(rs, sheet).find((a) => a.id === id);
  if (!found) throw new Error(`no attack ${id}`);
  return found;
}

function total(sheet: Sheet, id: string, chosen: string[] = [], options = NONE, gear = NO_GEAR) {
  return damageFor(
    rs,
    sheet,
    attack(sheet, id),
    damageBuffs(rs, sheet),
    new Set(chosen),
    options,
    gear,
  );
}

describe('health', () => {
  it('adds Toughness to the base, and only the highest slotted buff counts', () => {
    const h = withCharacter();
    grantCxp(h, 2000);
    learnBasic(h, 'assault', 6);
    learnPassive(h, 'toughness-warrior', 2);
    const sheet = h.sheet();
    const lines = healthLines(rs, sheet);
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(30);
    const buffs = healthBuffs(rs, sheet);
    const totals = buffTotals(buffs, new Set(['bolster-toughness', 'fortify-toughness']));
    expect(totals.slot?.id).toBe('fortify-toughness');
    expect(totals.ignored.map((b) => b.id)).toEqual(['bolster-toughness']);
  });

  it('the Vigor Stimulant Injector boon adds 10 max Health', () => {
    const h = withCharacter();
    h.run({ type: 'addBoon', boonId: 'vigor-stimulant-injector' });
    expect(healthLines(rs, h.sheet())).toContainEqual({
      label: 'Vigor Stimulant Injector',
      amount: 10,
    });
  });
});

describe('armor', () => {
  it('phys rep locations give 2 each, or 5 for each Armor skill level; Reflexes are blocked by armor', () => {
    const h = withCharacter();
    grantCxp(h, 2000);
    learnBasic(h, 'deflection', 6);
    learnPassive(h, 'armor', 2);
    const sheet = h.sheet();
    expect(armorLines(rs, sheet).reduce((s, l) => s + l.amount, 0)).toBe(10);
    expect(physrepArmor(sheet, 7)).toEqual({ amount: 2 * 5 + 5 * 2, upgraded: 2 });
    expect(physrepArmor(withCharacter().sheet(), 3)).toEqual({ amount: 6, upgraded: 0 });
    expect(reflexArmor(sheet, 0).amount).toBe(0);
  });
});

describe('dropped buffs and grouping', () => {
  it('temporary health and armor and single-attack damage buffs are gone', () => {
    const sheet = withCharacter().sheet();
    const ids = [
      ...healthBuffs(rs, sheet),
      ...armorBuffs(rs, sheet),
      ...damageBuffs(rs, sheet),
    ].map((b) => b.id);
    for (const gone of [
      'thick-fur',
      'barkskin',
      'impervious-body',
      'chitinous-carapace',
      'scatter-shot',
      'coated-rounds',
      'acid-round',
      'the-big-one',
      'it-will-cut',
      'oil-of-acid',
      'elemental-blade',
      'basic-scope',
    ])
      expect(ids).not.toContain(gone);
  });

  it('groups buffs Permanent, Repop, Encounter in that order', () => {
    expect(TIMINGS.map((t) => t.title)).toEqual(['Permanent', 'Repop', 'Encounter']);
    const sheet = withCharacter().sheet();
    const groups = groupByTiming(damageBuffs(rs, sheet));
    expect(groups.map((g) => g.timing)).toEqual(['repop', 'encounter']);
    expect(groups[0]?.buffs.map((b) => b.id)).toEqual(['enhance-weapon']);
    expect(groups[1]?.buffs.map((b) => b.id)).toEqual([
      'sharpen-weapon',
      'prepared-for-battle',
      'elemental-alignment',
      'mantle-of-death',
      'siphon-strength',
      'beasts-might',
      'tactics',
      'tactics-mastery',
    ]);
    expect(groupByTiming(healthBuffs(rs, sheet)).map((g) => g.timing)).toEqual([
      'repop',
      'encounter',
    ]);
  });
});

describe('damage', () => {
  it('a great weapon adds the Weapon Damage half points, rounded down', () => {
    const h = withCharacter();
    grantCxp(h, 2000);
    learnBasic(h, 'assault', 6);
    learnPassive(h, 'weapon-damage', 3);
    const sheet = h.sheet();
    expect(total(sheet, 'great').total).toBe(3 + 3 + 1);
    expect(total(sheet, 'short').total).toBe(1 + 3);
  });

  it('weapons are Steel or Wood; every character has a Claw (2 Claw) that takes weapon bonuses', () => {
    const h = withCharacter({ ancestryId: 'elf', subtypeId: 'elf-windwalker' });
    grantCxp(h, 2000);
    learnBasic(h, 'assault', 6);
    learnPassive(h, 'weapon-damage', 2);
    h.run({ type: 'addBoon', boonId: 'bionic-arms' });
    const sheet = h.sheet();
    expect(attack(sheet, 'long').types).toEqual(['Steel', 'Wood']);
    const claw = attack(sheet, 'claw');
    expect(claw.types).toEqual(['Claw']);
    // 2 base + 2 Weapon Damage + 1 Elf + 1 Bionic Arms, then Sharpen Weapon +2.
    expect(total(sheet, 'claw').total).toBe(6);
    expect(total(sheet, 'claw', ['sharpen-weapon']).total).toBe(8);
    expect(withCharacter().sheet() && total(withCharacter().sheet(), 'claw').total).toBe(2);
  });

  it('Bionic Arms adds 1 to packets too; Weapon Damage does not', () => {
    const h = withCharacter();
    grantCxp(h, 2000);
    learnBasic(h, 'assault', 6);
    learnPassive(h, 'weapon-damage', 2);
    learnBasic(h, 'death-magic', 1);
    const before = total(h.sheet(), 'packet-death').total;
    h.run({ type: 'addBoon', boonId: 'bionic-arms' });
    const sheet = h.sheet();
    const packet = total(sheet, 'packet-death');
    expect(packet.total).toBe(before + 1);
    expect(packet.lines.map((l) => l.label)).toContain('Bionic Arms');
    expect(packet.lines.map((l) => l.label)).not.toContain('Weapon Damage');
    expect(permanentDamage(rs, sheet).find((p) => p.label === 'Bionic Arms')?.applies).toBe('any');
  });

  it('Damage Enhancement and Barbed Wire add on one line; Staples & Tape and Barbed Wire do not stack', () => {
    const sheet = withCharacter().sheet();
    const both = total(sheet, 'long', [], NONE, {
      enhancement: 'best',
      temp: 'barbed-wire',
      scope: 'none',
    });
    expect(both.total).toBe(2 + 3 + 2);
    // One temporary enhancement per line: picking Staples & Tape replaces Barbed Wire.
    const staples = total(sheet, 'long', [], NONE, {
      enhancement: 'best',
      temp: 'staples-and-tape',
      scope: 'none',
    });
    expect(staples.total).toBe(2 + 3 + 1);
    // Weapons only: a packet ignores them, with a note.
    const h = withCharacter();
    grantCxp(h, 500);
    learnBasic(h, 'life-magic', 1);
    const packet = total(h.sheet(), 'packet-life', [], NONE, {
      enhancement: 'basic',
      temp: 'barbed-wire',
      scope: 'none',
    });
    expect(packet.total).toBe(1);
    expect(packet.notes).toContain('Barbed Wire does not apply to this attack.');
  });

  it('scopes fit projectile weapons only', () => {
    const sheet = withCharacter().sheet();
    const gear = { ...NO_GEAR, scope: 'best' as const };
    expect(total(sheet, 'bow', [], NONE, gear).total).toBe(2 + 4);
    const thrown = total(sheet, 'thrown', [], NONE, gear);
    expect(thrown.total).toBe(1);
    expect(thrown.notes).toContain('Best Scope does not apply to this attack.');
    expect(total(sheet, 'long', [], NONE, gear).total).toBe(2);
    // Changing a line to a melee weapon clears the scope.
    const line = { ...EMPTY_COMBAT.lines[0]!, attack: 'bow', scope: 'best' as const };
    expect(changeLineAttack(line, attacks(rs, sheet), 'long').scope).toBe('none');
  });

  it('only the highest slotted damage buff counts', () => {
    const sheet = withCharacter().sheet();
    const melee = total(sheet, 'long', ['enhance-weapon', 'sharpen-weapon']);
    expect(melee.total).toBe(2 + 2);
    expect(melee.notes).toContain(
      'Enhance Weapon does not add: only the highest damage buff in a buff slot counts.',
    );
  });

  it('a Tactics unit gives +1, one led by Tactics Mastery +2, never both', () => {
    const sheet = withCharacter().sheet();
    const buffs = damageBuffs(rs, sheet);
    const unit = chooseInGroup(buffs, new Set(), 'tactics', 'tactics');
    expect(total(sheet, 'long', [...unit]).total).toBe(3);
    const led = chooseInGroup(buffs, unit, 'tactics', 'tactics-mastery');
    expect([...led]).toEqual(['tactics-mastery']);
    expect(total(sheet, 'long', [...led]).total).toBe(4);
    expect([...toggleBuff(buffs, led, 'tactics')]).toEqual(['tactics']);
    expect([...chooseInGroup(buffs, led, 'tactics', null)]).toEqual([]);
    // Weapon attacks only.
    const h = withCharacter();
    grantCxp(h, 500);
    learnBasic(h, 'life-magic', 1);
    expect(total(h.sheet(), 'packet-life', [...led]).notes).toContain(
      'Tactics unit led by Tactics Mastery does not apply to this attack.',
    );
  });

  it('Raw Magic Enhancement stacks add to packets, at most 10', () => {
    const h = withCharacter();
    grantCxp(h, 500);
    learnBasic(h, 'life-magic', 1);
    const sheet = h.sheet();
    const base = total(sheet, 'packet-life').total;
    expect(total(sheet, 'packet-life', [], { ...NONE, rawMagic: 4 }).total).toBe(base + 4);
    expect(total(sheet, 'packet-life', [], { ...NONE, rawMagic: 25 }).total).toBe(base + 10);
    expect(total(sheet, 'long', [], { ...NONE, rawMagic: 4 }).total).toBe(2);
    expect(parseCombatState({ rawMagic: 99 }).rawMagic).toBe(10);
  });

  it('Mantle of Death adds 1 to Harm packets only, and holds the buff slot', () => {
    const h = withCharacter();
    grantCxp(h, 2000);
    learnBasic(h, 'death-magic', 1);
    learnBasic(h, 'life-magic', 1);
    const sheet = h.sheet();
    const harm = total(sheet, 'packet-death').total;
    const essence = total(sheet, 'packet-life').total;
    expect(total(sheet, 'packet-death', ['mantle-of-death']).total).toBe(harm + 1);
    expect(total(sheet, 'packet-life', ['mantle-of-death']).total).toBe(essence);
    const withAlignment = total(sheet, 'packet-death', ['mantle-of-death', 'elemental-alignment']);
    expect(withAlignment.total).toBe(harm + 1);
    expect(withAlignment.notes).toContain(
      'Elemental Alignment does not add: Mantle of Death holds the buff slot.',
    );
    const sword = total(sheet, 'long', ['mantle-of-death', 'sharpen-weapon']);
    expect(sword.total).toBe(2);
    expect(sword.notes).toContain('Mantle of Death does not apply to this attack.');
  });

  it('packets only for schools the character knows', () => {
    const h = withCharacter();
    grantCxp(h, 500);
    learnBasic(h, 'life-magic', 1);
    expect(
      attacks(rs, h.sheet())
        .filter((a) => a.kind === 'packet')
        .map((a) => a.name),
    ).toEqual(['Life packet']);
  });
});

describe('saved damage lines', () => {
  it('keeps up to 5 lines and never removes the last one', () => {
    const list = attacks(rs, withCharacter().sheet());
    let lines = [...EMPTY_COMBAT.lines];
    for (let i = 0; i < 7; i += 1) lines = addDamageLine(lines, list);
    expect(lines).toHaveLength(MAX_DAMAGE_LINES);
    expect(new Set(lines.map((l) => l.id)).size).toBe(MAX_DAMAGE_LINES);
    expect(lines[1]?.name).toBe('Short weapon');
    let one = lines;
    for (const l of lines) one = removeDamageLine(one, l.id);
    expect(one).toHaveLength(1);
    expect(
      parseCombatState({ lines: Array.from({ length: 9 }, () => ({ attack: 'long' })) }).lines,
    ).toHaveLength(MAX_DAMAGE_LINES);
  });

  it('moves the old single choice into line 1 and tolerates bad data', () => {
    const old = parseCombatState({
      health: ['bolster-toughness'],
      armor: [],
      covered: ['Head'],
      damage: ['sharpen-weapon', 'best-scope'],
      attack: 'bow',
      type: 'Wood',
      fromBehind: true,
      stunned: false,
    });
    expect(old.lines).toEqual([
      {
        id: 'line-1',
        name: '',
        attack: 'bow',
        type: 'Wood',
        enhancement: 'none',
        temp: 'none',
        scope: 'best',
      },
    ]);
    expect(old.damage).toEqual(['sharpen-weapon']);
    expect(old.health).toEqual(['bolster-toughness']);
    expect(old.fromBehind).toBe(true);

    expect(parseCombatState(null)).toEqual(EMPTY_COMBAT);
    expect(parseCombatState('junk')).toEqual(EMPTY_COMBAT);
    const bad = parseCombatState({
      lines: [null, 3, { id: 'x', attack: 7, enhancement: 'mega', temp: 'barbed-wire' }],
      damage: 'nope',
    });
    expect(bad.lines).toEqual([
      {
        id: 'x',
        name: '',
        attack: 'short',
        type: '',
        enhancement: 'none',
        temp: 'barbed-wire',
        scope: 'none',
      },
    ]);
    expect(bad.damage).toEqual([]);
    expect(bad.open).toEqual([]);
  });

  it('remembers which cards have their details open, tolerating bad data', () => {
    expect(EMPTY_COMBAT.open).toEqual([]);
    expect(parseCombatState({ attack: 'long' }).open).toEqual([]);
    expect(parseCombatState({ open: ['damage', 'junk', 3, 'health'] }).open).toEqual([
      'health',
      'damage',
    ]);
    expect(parseCombatState({ open: 'armor' }).open).toEqual([]);
    expect(toggleOpen([], 'armor')).toEqual(['armor']);
    expect(toggleOpen(['armor', 'damage'], 'armor')).toEqual(['damage']);
  });

  it('summaries give name, call, and total with permanent bonuses only', () => {
    const h = withCharacter();
    grantCxp(h, 2000);
    learnBasic(h, 'assault', 6);
    learnPassive(h, 'weapon-damage', 1);
    const sheet = h.sheet();
    const state = parseCombatState({
      damage: ['sharpen-weapon'],
      stunned: true,
      lines: [
        { id: 'a', name: 'Old Faithful', attack: 'long', type: 'Wood', enhancement: 'better' },
        { id: 'b', attack: 'claw', temp: 'barbed-wire' },
      ],
    });
    expect(damageLineSummaries(state, sheet, rs)).toEqual([
      { id: 'a', name: 'Old Faithful', attackId: 'long', type: 'Wood', total: 5, call: '5 Wood' },
      { id: 'b', name: 'Claw', attackId: 'claw', type: 'Claw', total: 3, call: '3 Claw' },
    ]);
  });
});

describe('mastery magic on the Play Tracker', () => {
  it('using an ability spends a use of each school; it stops when one runs out', () => {
    const h = withCharacter();
    grantCxp(h, 2000);
    learnBasic(h, 'life-magic', 6);
    learnBasic(h, 'death-magic', 6);
    h.run({ type: 'learnSkill', skillId: 'blood-magic', part: 'main', teacher: 'Old Jory' });
    const sheet = h.sheet();
    const moves = masteryMoves(sheet, rs);
    const basic = moves.find((m) => m.id === 'blood-magic-basic');
    if (!basic) throw new Error('no Blood Magic basic');
    expect(moves.map((m) => m.id)).toEqual([
      'blood-magic-basic',
      'blood-magic-adept',
      'blood-magic-advanced',
    ]);
    const items = trackedUses(sheet, rs);
    expect(movesLeft({}, items, basic)).toBe(6);
    const spent = spendMove({}, items, basic);
    expect(spent).toEqual({ 'skill:life-magic:basic': 1, 'skill:death-magic:basic': 1 });
    const adept = moves.find((m) => m.id === 'blood-magic-adept');
    if (!adept) throw new Error('no adept');
    expect(movesLeft({}, items, adept)).toBe(0);
    expect(spendMove({}, items, adept)).toEqual({});
  });
});
