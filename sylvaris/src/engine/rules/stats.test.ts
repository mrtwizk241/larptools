import { describe, expect, it } from 'vitest';
import { event, grant, learn, rs, withCharacter } from '../testkit.ts';

const other = (h: ReturnType<typeof withCharacter>) =>
  Object.fromEntries(h.sheet().stats.other.map((o) => [o.stat, o.value]));

describe('stats from skills, races, and Callings', () => {
  it('a new Human: base numbers', () => {
    const s = withCharacter().sheet().stats;
    expect(s.lifePoints).toMatchObject({ total: 10, value: 10, cap: 100 });
    expect(s.armorPoints).toMatchObject({ total: 0, value: 0, cap: 100 });
    expect(s.bleedOutSeconds.value).toBe(60);
    expect(s.deathCountMinutes.value).toBe(5);
    expect(s.slots).toEqual({
      enhancement: 4,
      attunement: 6,
      attunementToolOnly: 0,
      greaterBoon: 4,
      lesserBoon: 4,
      amplifiedLife: 0,
      amplifiedArmor: 0,
    });
    expect(s.languages).toMatchObject({ count: 1, known: [{ id: 'common', name: 'Common' }] });
    expect(s.spiritFragments).toEqual({ current: 10, max: 10 });
    expect(s.ageCategory).toBe(2);
    expect(s.upkeep).toEqual({ silverPerEvent: 1, firstEventFree: true, covers: [] });
    expect(s.checkInIncome.map((i) => i.id)).toEqual(['race:human-innate-passive:checkInSilver']);
    expect(s.locations).toMatchObject({ capacity: 1, portalSlots: 0, treeSlots: 0, max: 20 });
  });

  it('literacy can be Common instead of the race language', () => {
    const s = withCharacter({ raceId: 'dwarf', literacy: 'common' }).sheet().stats;
    expect(s.languages.known).toEqual([{ id: 'common', name: 'Common' }]);
  });

  it('Knowledge and Research: one language per named level reached (Q-SKL-7)', () => {
    const h = withCharacter();
    learn(h, 'knowledge', 3);
    learn(h, 'research', 1);
    // hand-derived: literacy 1 + Knowledge levels 1 and 3 reached 2 + Research level 1 1 = 4
    expect(h.sheet().stats.languages).toMatchObject({ count: 4, unnamed: 3 });
  });

  it('Delay Effect sets the bleed out count, the higher set wins', () => {
    const h = withCharacter();
    grant(h, 'xp', 200);
    learn(h, 'delay-effect', 10, ['expert', 'master', 'grandmaster']);
    expect(h.sheet().stats.bleedOutSeconds.value).toBe(300);
  });

  it('conditional armor is listed, not totalled (Dwarf, Halfling)', () => {
    const dwarf = withCharacter({ raceId: 'dwarf' }).sheet();
    expect(dwarf.stats.armorPoints.value).toBe(0);
    expect(dwarf.stats.armorPoints.conditional).toEqual([
      expect.objectContaining({ amount: 10, when: 'wearing physical armor' }),
    ]);
    expect(dwarf.race?.conditionalEffects).toHaveLength(1);

    const h = withCharacter({ raceId: 'halfling' });
    learn(h, 'halfling-agility', 3, ['expert']);
    const s = h.sheet().stats.armorPoints;
    expect(s.value).toBe(0);
    expect(s.conditional).toEqual([
      expect.objectContaining({ amount: 20, pool: 'dex', when: 'no physical armor worn' }),
    ]);
  });

  it('Aeshu dual wield bonus applies once a skill allows two long weapons (Q-RACE-8)', () => {
    const h = withCharacter({ raceId: 'aeshu' });
    expect(h.sheet().stats.passiveDamage.dualWield).toMatchObject({ applies: false, value: 0 });
    grant(h, 'xp', 100);
    learn(h, 'finesse', 6, ['expert', 'master']);
    expect(h.sheet().stats.passiveDamage.dualWield).toMatchObject({ applies: true, value: 1 });
  });

  it('Gargoyle +1 weapon, Gnome tool slot, Totemic +10 Life', () => {
    expect(withCharacter({ raceId: 'gargoyle' }).sheet().stats.passiveDamage.ranged.value).toBe(1);
    expect(withCharacter({ raceId: 'gnome' }).sheet().stats.slots.attunementToolOnly).toBe(1);
    expect(withCharacter({ raceId: 'totemic' }).sheet().stats.lifePoints.value).toBe(20);
  });

  it('Beast-Kin Guardian of Sylvaris Grandmaster adds a Lesser Boon Slot', () => {
    const h = withCharacter({
      raceId: 'beast-kin',
      choices: { 'natural-weapon': 'short-claws', size: 'medium' },
    });
    grant(h, 'xp', 200);
    learn(h, 'guardian-of-sylvaris', 10, ['expert', 'master', 'grandmaster']);
    expect(h.sheet().stats.slots.lesserBoon).toBe(5);
    expect(h.sheet().boons.lesserSlots).toBe(5);
  });

  it('Fae Blessing and Endurance Grandmaster grant immunity to aging', () => {
    const h = withCharacter();
    grant(h, 'xp', 200);
    learn(h, 'endurance', 10, ['expert', 'master', 'grandmaster']);
    expect(h.sheet().stats.grants).toContainEqual({
      grant: 'immune-aging',
      sources: ['Endurance (Grandmaster)'],
    });
  });

  it('locations: Blink and Air Magic portals, Elf trees only with the Master Technique', () => {
    const h = withCharacter({ raceId: 'elf', choices: { 'bonus-language': 'common' } });
    grant(h, 'xp', 200);
    learn(h, 'blink', 2);
    learn(h, 'air-magic', 1);
    learn(h, 'friend-of-the-forest', 5, ['expert']);
    // Data fix: Friend of the Forest trees come with the Master Technique (Rulebook p.37).
    expect(h.sheet().stats.locations).toMatchObject({ portalSlots: 3, treeSlots: 0, capacity: 4 });
    learn(h, 'friend-of-the-forest', 6, ['expert', 'master']);
    // hand-derived: tavern 1 + portals 3 + trees 6 = 10
    expect(h.sheet().stats.locations).toMatchObject({ portalSlots: 3, treeSlots: 6, capacity: 10 });
  });

  it('Harvesting and Merchanting income with the highest Technique only', () => {
    const h = withCharacter();
    grant(h, 'xp', 600);
    learn(h, 'harvesting', 10, ['expert', 'master', 'grandmaster']);
    learn(h, 'merchanting', 6, ['expert', 'master']);
    const income = h.sheet().stats.checkInIncome;
    const harv = income.find((i) => i.id === 'skill:harvesting');
    // hand-derived: 2 x 10 = 20 Basic Components per level; Grandmaster bonus only: 2 Exotic
    expect(harv?.fixed).toMatchObject({ basicComponents: 20 });
    expect(harv?.technique).toMatchObject({
      technique: 'grandmaster',
      fixed: { exoticComponents: 2, text: '2 Exotic Components' },
      alternative: { masterBuildingMaterials: 1 },
      trade: { basicPerExotic: 4, maxExoticTotal: 6 },
    });
    const merch = income.find((i) => i.id === 'skill:merchanting');
    // hand-derived: 5 Copper x 6 = 30, or cover 2 x 6 = 12 Silver of own upkeep
    expect(merch?.choice?.map((o) => o.text)).toEqual([
      '30 Copper',
      'cover 12 Silver of own upkeep',
    ]);
    expect(merch?.technique?.choice?.map((o) => o.text)).toEqual([
      '20 Copper',
      '1 Master Trade Item',
      'a mix worth 20 Copper (at most 1 item)',
    ]);
  });
});

describe('Calling numbers', () => {
  function onCalling(callingId: string, choices = {}) {
    const h = withCharacter();
    const keys: string[] = [];
    for (let i = 0; i < 6; i++) {
      const e = event(`2026-0${i + 1}-10`, `game-${i}`);
      h.run({ type: 'checkIn', event: e });
      keys.push(e.key);
    }
    // 30 event CXP + 580 = the 610 cap.
    grant(h, 'cxp', 580);
    h.run({ type: 'startCalling', callingId, choices, eventKey: keys[5] ?? '' });
    return { h, keys };
  }

  it('Fortune Favored pays no upkeep; lucky items = 1 + Calling Techniques', () => {
    const { h } = onCalling('fortune-favored');
    expect(h.sheet().stats.upkeep.silverPerEvent).toBe(0);
    expect(other(h).luckyItemsRequired).toBe(1);
    learn(h, 'heads-i-win', 3);
    h.run({ type: 'checkIn', event: event('2026-07-10', 'later') });
    h.run({
      type: 'learnSkill',
      skillId: 'heads-i-win',
      step: { technique: 'expert' },
      eventKey: '2026-07-10-later',
      teacher: 'Calling book',
    });
    expect(other(h).luckyItemsRequired).toBe(2);
  });

  it('Umbral Guide group size stops at 4', () => {
    const { h } = onCalling('umbral-guide');
    expect(other(h).infiltrationGroupSize).toBe(1);
  });

  it('Elemental Mage blocks the opposing magic school', () => {
    const { h } = onCalling('elemental-mage', { element: 'fire' });
    expect(other(h).blockedMagicSchool).toBe('water');
  });

  it('The Distinctive: a borrowed passive and a mirrored racial skill, armor capped at 100', () => {
    const { h } = onCalling('distinctive', {
      'racial-passive': 'clockwork-innate-passive',
      'racial-skill-a': 'armor-plating',
      'racial-skill-b': 'acrobatics',
    });
    grant(h, 'xp', 400);
    learn(h, 'wear-armor', 10, ['expert', 'master', 'grandmaster']);
    // Calling Techniques one per event, alternating to keep the balance rule.
    learn(h, 'distinctive-racial-skill-a', 10);
    const steps: [string, 'expert' | 'master' | 'grandmaster', string][] = [
      ['distinctive-racial-skill-a', 'expert', '2026-08-01-a'],
      ['distinctive-racial-skill-b', 'expert', '2026-08-02-b'],
      ['distinctive-racial-skill-a', 'master', '2026-08-03-c'],
    ];
    learn(h, 'distinctive-racial-skill-b', 6);
    steps.push(['distinctive-racial-skill-b', 'master', '2026-08-04-d']);
    steps.push(['distinctive-racial-skill-a', 'grandmaster', '2026-08-05-e']);
    for (const [skillId, technique, eventKey] of steps) {
      h.run({ type: 'checkIn', event: event(eventKey.slice(0, 10), eventKey.slice(11)) });
      h.run({
        type: 'learnSkill',
        skillId,
        step: { technique },
        eventKey,
        teacher: 'Calling book',
      });
    }
    const sheet = h.sheet();
    expect(sheet.warnings).toEqual([]);
    // hand-derived: Wear Armor 60 + Distinctive (as Armor Plating) 60 + borrowed Clockwork 10 = 130,
    //   capped at 100
    expect(sheet.stats.armorPoints).toMatchObject({ total: 130, value: 100, cap: 100 });
    const a = sheet.skills.find((s) => s.skillId === 'distinctive-racial-skill-a');
    expect(a?.mirrors).toEqual({ skillId: 'armor-plating', name: 'Armor Plating' });
    // The Distinctive skill shows the mirrored racial skill's abilities.
    expect(a?.abilities.map((x) => x.summary)).toEqual(
      Object.values(rs.skillsById['armor-plating']?.levels ?? {}).map((l) => l.summary),
    );
  });
});
