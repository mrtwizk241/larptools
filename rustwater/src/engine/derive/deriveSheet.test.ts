import { describe, expect, it } from 'vitest';
import type { Action } from '../model.ts';
import { summarize } from '../sheet.ts';
import { AT, event, grantCxp, harness, learnBasic, rs, withCharacter } from '../testkit.ts';
import { deriveSheet } from './deriveSheet.ts';

let seq = 0;
function act(type: string, payload: unknown, extra: Partial<Action> = {}): Action {
  seq += 1;
  return {
    id: `raw-${seq}`,
    seq,
    at: AT,
    actor: { role: 'staff' },
    type: type as Action['type'],
    payload,
    ...extra,
  };
}

const CREATED = {
  characterName: 'Ivo Brand',
  playerName: 'Sample Player',
  ancestryId: 'human',
  subtypeId: 'human-bloodborne',
  extraInfection: 0,
};

describe('deriveSheet basics', () => {
  it('derives an empty, uncreated sheet from an empty log', () => {
    const sheet = deriveSheet(rs, []);
    expect(sheet.created).toBe(false);
    expect(sheet.lastSeq).toBe(0);
    expect(sheet.points.cxp.total).toBe(0);
    expect(sheet.points.lxp.total).toBe(0);
    expect(sheet.stats.maxHealth).toBe(10);
    expect(sheet.warnings).toEqual([]);
    expect(sheet.memory.entries).toEqual([]);
    expect(sheet.memory.slots.every((p) => p.slots === 0 && p.used === 0)).toBe(true);
    expect(sheet.profession).toBeNull();
    expect(sheet.familiar).toBeNull();
    expect(sheet.boons).toEqual([]);
    expect(sheet.startingItems).toEqual([]);
    expect(sheet.owed).toEqual([]);
    expect(sheet.retired).toBeNull();
  });

  it('a new character has 250 CXP, 1 LXP, base infection, abilities at level 1', () => {
    seq = 0;
    const sheet = deriveSheet(rs, [act('character.created', CREATED)]);
    expect(sheet.created).toBe(true);
    expect(sheet.profile.characterName).toBe('Ivo Brand');
    expect(sheet.points.cxp).toEqual({
      total: 250,
      earned: 0,
      capRemaining: 2000,
      spent: 0,
      available: 250,
    });
    expect(sheet.points.lxp).toEqual({ total: 1, spent: 0, available: 1 });
    expect(sheet.infection).toMatchObject({ track: 'infection', base: 3, extra: 0, current: 3 });
    expect(sheet.ancestry?.abilities.map((a) => [a.id, a.level])).toEqual([
      ['human-resilience', 1],
      ['engineered-metabolism', 1],
    ]);
    expect(sheet.ancestry?.passives.map((p) => p.id)).toEqual(['human-passive']);
    expect(sheet.ancestry?.passives[0]?.checkIn).toEqual({
      resources: { qty: 2, rarity: 'common' },
      orBits: 10,
      randomDraws: null,
      stackForHigherRarity: false,
    });
    expect(Object.keys(sheet.points.ap)).toEqual([
      'warrior',
      'defender',
      'rogue',
      'utility',
      'magic',
      'crafting',
    ]);
    expect(sheet.lastSeq).toBe(1);
  });

  it('summarize gives the list row', () => {
    seq = 0;
    const sheet = deriveSheet(rs, [act('character.created', CREATED)]);
    expect(summarize(sheet)).toEqual({
      characterName: 'Ivo Brand',
      playerName: 'Sample Player',
      ancestryName: 'Human',
      subtypeName: 'Bloodborne',
      cxpTotal: 250,
      retired: false,
    });
  });

  it('converts an old age in years to a step with the ancestry max age', () => {
    seq = 0;
    const sheet = deriveSheet(rs, [act('character.created', { ...CREATED, age: 57 })]);
    expect(sheet.profile.age).toBe(5);
    expect(sheet.warnings).toEqual([]);
  });
});

describe('LXP [PTS-LXP-TOTAL]', () => {
  it.each([
    [499, 1],
    [500, 2],
    [999, 2],
    [1000, 3],
  ])('at %i total CXP the character has %i LXP', (total, lxp) => {
    const h = withCharacter();
    grantCxp(h, total - 250);
    expect(h.sheet().points.cxp.total).toBe(total);
    expect(h.sheet().points.lxp.total).toBe(lxp);
  });

  it('the second LXP arrives at the 4th event (250 + 4 x 75 = 550)', () => {
    const h = withCharacter();
    const dates = ['2026-01-10', '2026-02-14', '2026-03-14'];
    for (const d of dates)
      h.run({ type: 'checkIn', event: event(d, 'game'), attendance: 'player' });
    expect(h.sheet().points.lxp.total).toBe(1);
    h.run({ type: 'checkIn', event: event('2026-04-11', 'game'), attendance: 'player' });
    expect(h.sheet().points.cxp.total).toBe(550);
    expect(h.sheet().points.lxp.total).toBe(2);
  });

  it('warns when a penalty leaves LXP spent above LXP total [Q-PTS-5]', () => {
    const h = withCharacter({ startingLxpAbilityId: 'human-resilience' });
    grantCxp(h, 250);
    h.run({ type: 'levelAncestryAbility', abilityId: 'make-it-work' });
    expect(h.sheet().points.lxp).toEqual({ total: 2, spent: 2, available: 0 });
    h.run({ type: 'adjustPoints', currency: 'cxp', amount: -10, reason: 'Second strike' });
    const sheet = h.sheet();
    expect(sheet.points.lxp.available).toBe(-1);
    expect(sheet.warnings.map((w) => w.code)).toContain('NEGATIVE_LXP');
    expect(sheet.warnings.at(-1)?.actionId).toBe(h.actions.at(-1)?.id);
  });
});

describe('stats from effects', () => {
  it('Toughness levels 1-5 give 10, 20, 30, 40, 60 extra Max Health (rulebook, not the sheet)', () => {
    const h = withCharacter();
    grantCxp(h, 400);
    learnBasic(h, 'assault', 9); // 45 Warrior AP
    const extra: number[] = [];
    for (let level = 1; level <= 5; level++) {
      h.run({
        type: 'learnSkill',
        skillId: 'toughness-warrior',
        part: 'main',
        teacher: 'Old Jory',
      });
      extra.push(h.sheet().stats.maxHealth - rs.ruleset.baseStats.maxHealth);
    }
    expect(extra).toEqual([10, 20, 30, 40, 60]);
    expect(h.sheet().points.ap['warrior']).toEqual({ earned: 45, spent: 45, available: 0 });
  });

  it('both Toughness copies add up, and Conscious adds 10 (Q-SKL-2)', () => {
    const h = withCharacter({ ancestryId: 'conscious', subtypeId: 'conscious-fungal' });
    grantCxp(h, 400);
    learnBasic(h, 'assault', 3); // 6 Warrior AP
    learnBasic(h, 'taunt', 3); // 6 Defender AP
    h.run({ type: 'learnSkill', skillId: 'toughness-warrior', part: 'main', teacher: 'Jory' });
    h.run({ type: 'learnSkill', skillId: 'toughness-defender', part: 'main', teacher: 'Jory' });
    const stats = h.sheet().stats;
    expect(stats.maxHealth).toBe(10 + 10 + 10 + 10);
    expect(
      stats.contributions.filter((c) => c.stat === 'maxHealth').map((c) => c.source.kind),
    ).toEqual(['base', 'ancestry', 'skill', 'skill']);
  });

  it('Armor gives 5 per level and 10 more at level 5; Elf passive adds weapon damage', () => {
    const h = withCharacter({ ancestryId: 'elf', subtypeId: 'elf-windwalker' });
    grantCxp(h, 400);
    learnBasic(h, 'taunt', 9); // 45 Defender AP
    for (let i = 0; i < 5; i++)
      h.run({ type: 'learnSkill', skillId: 'armor', part: 'main', teacher: 'Jory' });
    const stats = h.sheet().stats;
    expect(stats.armor).toBe(35);
    expect(stats.totals['weaponDamage']).toBe(1);
  });

  it('conditional bonuses are listed but not totalled', () => {
    const h = withCharacter();
    grantCxp(h, 100);
    learnBasic(h, 'dash', 3); // 6 Rogue AP
    h.run({ type: 'learnSkill', skillId: 'precision', part: 'main', teacher: 'Jory' });
    const stats = h.sheet().stats;
    expect(stats.totals['damage']).toBeUndefined();
    expect(stats.contributions.filter((c) => c.stat === 'damage')).toHaveLength(2);
    expect(stats.contributions.every((c) => c.stat !== 'damage' || c.condition !== null)).toBe(
      true,
    );
  });
});

describe('uses per period', () => {
  it('basic uses equal the level per repop; mastery adds one basic use each encounter', () => {
    const h = withCharacter();
    grantCxp(h, 400);
    learnBasic(h, 'assault', 9);
    h.run({ type: 'learnSkill', skillId: 'assault', part: 'adept', toLevel: 2 });
    h.run({ type: 'learnSkill', skillId: 'assault', part: 'mastery', teacher: 'Master Hal' });
    const skill = h.sheet().skills.find((s) => s.skillId === 'assault');
    const basic = skill?.parts.find((p) => p.part === 'basic');
    expect(basic?.uses).toEqual({ count: 9, per: 'repop' });
    expect(basic?.extraUses).toEqual([
      { count: 1, per: 'encounter', fromSkillId: 'assault', fromPart: 'mastery' },
    ]);
    expect(skill?.parts.find((p) => p.part === 'adept')?.uses).toEqual({
      count: 2,
      per: 'encounter',
    });
    expect(skill?.parts.find((p) => p.part === 'mastery')?.uses).toBeNull();
    expect(basic?.teacher).toBe('Old Jory');
  });

  it('an encounter skill gains its level-5 extra use in the same period (Resilience)', () => {
    const h = withCharacter();
    grantCxp(h, 400);
    learnBasic(h, 'assault', 6); // 21 Warrior AP; Resilience 1..5 costs 30
    learnBasic(h, 'bash', 4); // +10 AP
    h.run({ type: 'learnSkill', skillId: 'resilience', part: 'main', toLevel: 5, teacher: 'Jory' });
    const part = h.sheet().skills.find((s) => s.skillId === 'resilience')?.parts[0];
    expect(part?.uses).toEqual({ count: 6, per: 'encounter' });
  });

  it('check-in skills count per event; ancestry abilities scale with level', () => {
    const h = withCharacter({
      subtypeId: 'human-sheltered',
      startingLxpAbilityId: 'deep-pockets',
      startingSkills: [{ skillId: 'scavenging', part: 'basic', level: 2 }],
    });
    const sheet = h.sheet();
    expect(sheet.skills[0]?.parts[0]?.uses).toEqual({ count: 2, per: 'event' });
    const deep = sheet.ancestry?.abilities[1];
    expect(deep?.uses).toEqual({ count: 2, per: 'event' });
    expect(deep?.checkIn).toEqual({
      resources: { qty: 4, rarity: 'common' },
      orBits: 20,
      randomDraws: null,
      stackForHigherRarity: true,
    });
  });

  it('From Legends takes the copied ability frequency and the slot level', () => {
    const h = withCharacter({
      ancestryId: 'cryptid',
      subtypeId: 'cryptid-canine',
      fromLegendsChoice: 'quick-reflexes',
      startingLxpAbilityId: 'from-legends',
    });
    const shared = h.sheet().ancestry?.abilities[0];
    expect(shared).toMatchObject({
      id: 'from-legends',
      level: 2,
      frequency: 'per-encounter',
      uses: { count: 2, per: 'encounter' },
      copied: { id: 'quick-reflexes', name: 'Quick Reflexes' },
    });
  });
});

describe('ledger', () => {
  it('keeps one row per currency movement with running totals per currency', () => {
    const h = withCharacter({ extraInfection: 1 });
    h.run({ type: 'checkIn', event: event('2026-05-16', 'spring-thaw'), attendance: 'gm-staff' });
    h.run({
      type: 'spendShinies',
      purchaseId: 'buy-cxp',
      qty: 2,
      eventKey: '2026-05-16-spring-thaw',
    });
    const rows = h.sheet().ledger.map((r) => [r.currency, r.amount, r.kind, r.runningTotal]);
    expect(rows).toEqual([
      ['cxp', 250, 'start', 250],
      ['cxp', 10, 'infection-bonus', 260],
      ['cxp', 75, 'event', 335],
      ['cxp', 10, 'staff', 345],
      ['pxp', 10, 'staff', 10],
      ['shinies', 500, 'staff', 500],
      ['fp', 1, 'attendance', 1],
      ['shinies', -100, 'shiny-spend', 400],
      ['cxp', 2, 'shiny-purchase', 347],
    ]);
    const eventRow = h.sheet().ledger[2];
    expect(eventRow?.eventKey).toBe('2026-05-16-spring-thaw');
    expect(eventRow?.date).toBe(AT);
    expect(h.sheet().points.cxp.earned).toBe(87);
  });
});

describe('bad data becomes warnings', () => {
  it('skips unknown types, invalid payloads, and actions before creation, without throwing', () => {
    seq = 0;
    const actions = [
      act('points.awarded', { currency: 'cxp', amount: 5, kind: 'npc' }),
      act('character.created', CREATED),
      act('character.created', CREATED),
      act('telepathy.used', {}),
      // Every catalogue type is supported now; a payload without a slot is invalid.
      act('memorized.added', { kind: 'spell' }),
      act('points.awarded', { currency: 'cxp', amount: -5, kind: 'npc' }),
      act('skill.learned', {
        skillId: 'no-such-skill',
        part: 'basic',
        toLevel: 1,
        cost: { currency: 'cxp', amount: 10 },
        atCreation: false,
      }),
      act('skill.learned', {
        skillId: 'assault',
        part: 'basic',
        toLevel: 2,
        cost: { currency: 'cxp', amount: 20 },
        atCreation: false,
      }),
      act('skill.learned', {
        skillId: 'assault',
        part: 'basic',
        toLevel: 2,
        cost: { currency: 'cxp', amount: 20 },
        atCreation: false,
      }),
      act('skill.learned', {
        skillId: 'bardic-performance',
        part: 'basic',
        toLevel: 1,
        cost: { currency: 'cxp', amount: 10 },
        atCreation: false,
      }),
      act('ancestry.leveled', { abilityId: 'ghostly', toLevel: 2 }),
      act('infection.changed', { track: 'connection', toLevel: 4, reason: 'x' }),
      act('event.checkedIn', {
        event: event('2026-05-16', 'a'),
        attendance: 'player',
        npcHours: 0,
        preSignedShift: false,
        extras: [],
        awards: [],
        owed: [],
      }),
      act('event.checkedIn', {
        event: event('2026-05-16', 'a'),
        attendance: 'player',
        npcHours: 0,
        preSignedShift: false,
        extras: [],
        awards: [],
        owed: [],
      }),
      null as unknown as Action,
      act('skill.refunded', { skillId: 'assault', part: 'basic', toLevel: 5, reason: 'oops' }),
    ];
    let sheet: ReturnType<typeof deriveSheet> | undefined;
    expect(() => {
      sheet = deriveSheet(rs, actions);
    }).not.toThrow();
    const codes = sheet?.warnings.map((w) => w.code);
    expect(codes).toEqual([
      'NO_CHARACTER',
      'DUPLICATE_CREATED',
      'UNKNOWN_ACTION_TYPE',
      'INVALID_PAYLOAD',
      'INVALID_PAYLOAD',
      'UNKNOWN_SKILL',
      'LEVEL_ORDER',
      'LEVEL_ORDER',
      'ARCHETYPE_MISSING',
      'UNKNOWN_ABILITY',
      'INFECTION_TRACK',
      'DUPLICATE_CHECK_IN',
      'MALFORMED_ACTION',
      'REFUND_LEVEL',
    ]);
    expect(sheet?.warnings[0]?.actionId).toBe('raw-1');
    // The out-of-order jump to level 2 still counts levels 1 and 2.
    expect(sheet?.points.cxp.spent).toBe(30);
    expect(sheet?.events).toHaveLength(1);
  });

  it('warns once when a correction makes CXP available negative', () => {
    const h = withCharacter({ startingSkills: [{ skillId: 'assault', part: 'basic', level: 6 }] });
    h.run({ type: 'adjustPoints', currency: 'cxp', amount: -100, reason: 'Award entered twice' });
    h.run({ type: 'adjustPoints', currency: 'cxp', amount: -10, reason: 'Second strike' });
    const warnings = h.sheet().warnings;
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ code: 'NEGATIVE_CXP', actionId: h.actions.at(-2)?.id });
    expect(h.sheet().points.cxp.available).toBe(-70);
  });
});

describe('replay', () => {
  it('replaying the planned log (also after a JSON round trip) gives the same sheet', () => {
    const h = withCharacter({
      extraInfection: 2,
      startingLxpAbilityId: 'make-it-work',
      startingSkills: [
        { skillId: 'assault', part: 'basic', level: 5 },
        { skillId: 'toughness-warrior', part: 'main', level: 2 },
        { skillId: 'bardic-performance', part: 'basic', level: 4, archetype: 'magic' },
      ],
    });
    h.run({ type: 'checkIn', event: event('2026-05-16', 'spring-thaw'), attendance: 'npc-paid' });
    h.run({ type: 'learnSkill', skillId: 'bardic-performance', part: 'adept', toLevel: 2 });
    h.run({
      type: 'spendShinies',
      purchaseId: 'buy-rare-resource',
      qty: 2,
      eventKey: '2026-05-16-spring-thaw',
    });
    h.run({
      type: 'changeInfection',
      toLevel: 6,
      reason: 'Rose by the virus',
      cause: 'death-rise',
    });
    h.run({
      type: 'refundSkill',
      skillId: 'toughness-warrior',
      part: 'main',
      reason: 'Entered by mistake',
    });
    const json = JSON.parse(JSON.stringify(h.actions)) as Action[];
    const replayed = deriveSheet(rs, json);
    expect(replayed).toEqual(h.sheet());
    expect(replayed.warnings).toEqual([]);
    expect(replayed.infection?.current).toBe(6);
    expect(replayed.points.ap['magic']).toEqual({ earned: 10, spent: 9, available: 1 });
    expect(replayed.events[0]?.owed).toEqual([
      '3 Common resources, 2 Uncommon resources, 1 Rare resource (Full Event NPC (Paid))',
      '1 Rare resource (Full Event NPC (Paid), no crafting skills)',
    ]);
  });

  it('derives a 500-action log in under 50 ms', () => {
    seq = 0;
    const actions: Action[] = [act('character.created', CREATED)];
    const skills = ['assault', 'bash', 'slay', 'stun', 'dash', 'evasion', 'taunt', 'disarm'];
    for (const id of skills)
      for (let level = 1; level <= 5; level++)
        actions.push(
          act('skill.learned', {
            skillId: id,
            part: 'basic',
            toLevel: level,
            cost: { currency: 'cxp', amount: level * 10 },
            atCreation: false,
          }),
        );
    for (let i = 0; actions.length < 500; i++) {
      const day = String((i % 28) + 1).padStart(2, '0');
      const month = String((Math.floor(i / 28) % 12) + 1).padStart(2, '0');
      const year = 2000 + Math.floor(i / 336);
      if (i % 3 === 0)
        actions.push(
          act(
            'event.checkedIn',
            {
              event: {
                key: `${year}-${month}-${day}-game`,
                name: 'Game',
                date: `${year}-${month}-${day}`,
              },
              attendance: 'player',
              npcHours: 0,
              preSignedShift: false,
              extras: [],
              awards: [
                { currency: 'cxp', amount: 75, kind: 'event' },
                { currency: 'fp', amount: 1, kind: 'attendance' },
              ],
              owed: [],
            },
            { eventKey: `${year}-${month}-${day}-game` },
          ),
        );
      else if (i % 3 === 1)
        actions.push(act('points.awarded', { currency: 'shinies', amount: 50, kind: 'volunteer' }));
      else
        actions.push(
          act('shinies.spent', {
            purchaseId: 'buy-bits',
            qty: 1,
            shiniesCost: 5,
            grants: [],
            items: ['1 Bits'],
          }),
        );
    }
    expect(actions).toHaveLength(500);
    deriveSheet(rs, actions); // warm up
    let best = Infinity;
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const sheet = deriveSheet(rs, actions);
      best = Math.min(best, performance.now() - start);
      expect(sheet.ledger.length).toBeGreaterThan(400);
    }
    expect(best).toBeLessThan(50);
  });
});

describe('harness sanity', () => {
  it('starts with a fresh sheet', () => {
    expect(harness().sheet().created).toBe(false);
  });
});
