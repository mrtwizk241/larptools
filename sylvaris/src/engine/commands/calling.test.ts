import { describe, expect, it } from 'vitest';
import { attend, event, grant, learn, withCharacter } from '../testkit.ts';

function eligible(raceId = 'human') {
  const h = withCharacter({ raceId });
  const keys = attend(h, 6);
  return { h, keys, sixth: keys[5] ?? '' };
}

describe('startCalling [CALL-ELIGIBLE]', () => {
  it('needs 5 full events before the start event', () => {
    const h = withCharacter();
    const keys = attend(h, 5);
    // The 5th event itself does not count (Q-CALL-11): eligible from the 6th.
    expect(
      h.fail({ type: 'startCalling', callingId: 'protector', eventKey: keys[4] ?? '' }),
    ).toEqual(['NOT_ENOUGH_EVENTS']);
    const next = event('2026-12-01', 'winter');
    h.run({ type: 'checkIn', event: next });
    h.run({ type: 'startCalling', callingId: 'protector', eventKey: next.key });
    expect(h.sheet().calling?.callingId).toBe('protector');
  });

  it('starts at an event the character checked in at', () => {
    const { h } = eligible();
    expect(
      h.fail({ type: 'startCalling', callingId: 'protector', eventKey: '2026-12-01-made-up' }),
    ).toEqual(['EVENT_NOT_ATTENDED']);
  });

  it('counts only full events dated before the start event', () => {
    const h = withCharacter();
    attend(h, 4);
    // A fifth check-in on the start date is not before it (old rule counted it).
    const sameDay = event('2026-06-15', 'day-market');
    const start = event('2026-06-15', 'main-game');
    h.run({ type: 'checkIn', event: sameDay });
    h.run({ type: 'checkIn', event: start });
    expect(h.fail({ type: 'startCalling', callingId: 'protector', eventKey: start.key })).toEqual([
      'NOT_ENOUGH_EVENTS',
    ]);
  });

  it('needs the event, 10 CXP, and no active Calling', () => {
    const { h, sixth } = eligible();
    expect(h.fail({ type: 'startCalling', callingId: 'protector' })).toEqual(['EVENT_REQUIRED']);
    h.run({ type: 'adjustPoints', currency: 'cxp', amount: -25, reason: 'test' });
    // hand-derived: 30 - 25 = 5 CXP, the start costs 10
    expect(h.fail({ type: 'startCalling', callingId: 'protector', eventKey: sixth })).toEqual([
      'NOT_ENOUGH_CXP',
    ]);
    grant(h, 'cxp', 25);
    const actions = h.run({ type: 'startCalling', callingId: 'protector', eventKey: sixth });
    expect(actions.map((a) => a.type)).toEqual([
      'calling.started',
      'skill.learned',
      'skill.learned',
    ]);
    expect(h.sheet().points.cxp).toMatchObject({ spent: 10, available: 20 });
    expect(h.fail({ type: 'startCalling', callingId: 'librarian', eventKey: sixth })).toEqual([
      'CALLING_ACTIVE',
    ]);
    expect(h.fail({ type: 'startCalling', callingId: 'unknown', eventKey: sixth })).toEqual([
      'UNKNOWN_CALLING',
    ]);
  });

  it('checks the choices', () => {
    const { h, sixth } = eligible();
    expect(h.fail({ type: 'startCalling', callingId: 'elemental-mage', eventKey: sixth })).toEqual([
      'CHOICE_REQUIRED',
    ]);
    expect(
      h.fail({
        type: 'startCalling',
        callingId: 'elemental-mage',
        eventKey: sixth,
        choices: { element: 'shadow' },
      }),
    ).toEqual(['CHOICE_INVALID']);
    expect(
      h.fail({
        type: 'startCalling',
        callingId: 'distinctive',
        eventKey: sixth,
        choices: {
          'racial-passive': 'human-innate-passive',
          'racial-skill-a': 'i-know-a',
          'racial-skill-b': 'armor-plating',
        },
      }),
    ).toEqual(['CHOICE_INVALID', 'CHOICE_INVALID']);
    expect(
      h.fail({
        type: 'startCalling',
        callingId: 'distinctive',
        eventKey: sixth,
        choices: {
          'racial-passive': 'dwarf-innate-passive',
          'racial-skill-a': 'acrobatics',
          'racial-skill-b': 'acrobatics',
        },
      }),
    ).toEqual(['CHOICE_INVALID']);
  });

  it('Sorcerer known spells: castable, at most 2 per magic type and level', () => {
    const { h, sixth } = eligible();
    learn(h, 'fire-magic', 3, ['expert']);
    expect(
      h.fail({
        type: 'startCalling',
        callingId: 'sorcerer',
        eventKey: sixth,
        choices: { 'known-spells': ['fire-dart', 'fire-blade', 'inferno'] },
      }),
    ).toEqual(['CHOICE_INVALID']);
    expect(
      h.fail({
        type: 'startCalling',
        callingId: 'sorcerer',
        eventKey: sixth,
        choices: { 'known-spells': ['fireball'] },
      }),
    ).toEqual(['CHOICE_INVALID']);
    h.run({
      type: 'startCalling',
      callingId: 'sorcerer',
      eventKey: sixth,
      choices: { 'known-spells': ['fire-dart', 'fire-blade', 'dragons-breath'] },
    });
    h.run({ type: 'addJournal', kind: 'spell', refId: 'fire-burst', source: 'other' });
    const j = h.sheet().journals;
    expect(j.spellbookCastingBlocked).toBe(true);
    expect(j.spellbook[0]).toMatchObject({ usableNow: false });
    expect(j.knownSpells.map((k) => [k.spellId, k.usableNow])).toEqual([
      ['fire-dart', true],
      ['fire-blade', true],
      ['dragons-breath', true],
    ]);
  });

  it('Elemental Mage cannot learn the opposing magic', () => {
    const { h, sixth } = eligible();
    h.run({
      type: 'startCalling',
      callingId: 'elemental-mage',
      eventKey: sixth,
      choices: { element: 'fire' },
    });
    expect(h.fail({ type: 'learnSkill', skillId: 'water-magic', step: { level: 1 } })).toEqual([
      'MAGIC_SCHOOL_BLOCKED',
    ]);
    h.run({ type: 'learnSkill', skillId: 'fire-magic', step: { level: 1 }, teacher: 'x' });
  });
});

describe('Calling Techniques [CALL-TECH]', () => {
  function onProtector() {
    const { h, sixth } = eligible();
    grant(h, 'cxp', 400);
    h.run({ type: 'startCalling', callingId: 'protector', eventKey: sixth });
    learn(h, 'guardianship', 6);
    learn(h, 'protector-protection', 6);
    return { h, sixth };
  }
  const tech = (
    skillId: string,
    technique: 'expert' | 'master' | 'grandmaster',
    eventKey?: string,
  ) => ({
    type: 'learnSkill' as const,
    skillId,
    step: { technique },
    teacher: 'Calling book',
    ...(eventKey ? { eventKey } : {}),
  });

  it('not at the start event, and the event is needed', () => {
    const { h, sixth } = onProtector();
    expect(h.fail(tech('guardianship', 'expert', sixth))).toEqual([
      'CALLING_TECHNIQUE_START_EVENT',
    ]);
    expect(h.fail(tech('guardianship', 'expert'))).toEqual(['EVENT_REQUIRED']);
  });

  it('one per event; the two skills within one Technique of each other', () => {
    const { h } = onProtector();
    const [e7, e8, e9] = ['2026-07-10-a', '2026-08-10-b', '2026-09-10-c'];
    for (const k of [e7, e8, e9])
      h.run({ type: 'checkIn', event: event(k.slice(0, 10), k.slice(11)) });
    h.run(tech('guardianship', 'expert', e7));
    expect(h.fail(tech('protector-protection', 'expert', e7))).toEqual([
      'CALLING_TECHNIQUE_PER_EVENT',
    ]);
    expect(h.fail(tech('guardianship', 'master', e8))).toEqual(['CALLING_TECHNIQUE_BALANCE']);
    h.run(tech('protector-protection', 'expert', e8));
    h.run(tech('guardianship', 'master', e9));
    const c = h.sheet().calling;
    expect(c?.balance).toMatchObject({
      tiers: { guardianship: 2, 'protector-protection': 1 },
      gap: 1,
      ok: true,
    });
    expect(c?.techniqueEvents.map((t) => t.eventKey)).toEqual([e7, e9, e8]);
    // hand-derived: Protection stack 1 + 1 Technique = 2; Guardianship Master adds an intercept slot: 2;
    //   no Protection Master yet: refit count stays 100
    const other = Object.fromEntries(h.sheet().stats.other.map((o) => [o.stat, o.value]));
    expect(other).toMatchObject({
      protectionStackMax: 2,
      wardInterceptSlots: 2,
      armorRefitCount: 100,
    });
  });
});

describe('Calling Technique timing [CALL-TECH]', () => {
  it('only at a check-in after the start event; one per event by key and date', () => {
    const { h, keys, sixth } = eligible();
    grant(h, 'cxp', 400);
    h.run({ type: 'startCalling', callingId: 'protector', eventKey: sixth });
    learn(h, 'guardianship', 6);
    learn(h, 'protector-protection', 6);
    const tech = (skillId: string, eventKey: string) => ({
      type: 'learnSkill' as const,
      skillId,
      step: { technique: 'expert' as const },
      teacher: 'Calling book',
      eventKey,
    });
    // Not a check-in.
    expect(h.fail(tech('guardianship', '2026-07-10-a'))).toEqual(['EVENT_NOT_ATTENDED']);
    // A check-in before the Calling started.
    expect(h.fail(tech('guardianship', keys[4] ?? ''))).toEqual(['CALLING_TECHNIQUE_BEFORE_START']);
    // Another key on the start date is the start event.
    const startDay = event(sixth.slice(0, 10), 'side-quest');
    h.run({ type: 'checkIn', event: startDay });
    expect(h.fail(tech('guardianship', startDay.key))).toEqual(['CALLING_TECHNIQUE_START_EVENT']);
    // Two keys on the same date count as one event.
    const a = event('2026-07-10', 'a');
    const b = event('2026-07-10', 'b');
    h.run({ type: 'checkIn', event: a });
    h.run({ type: 'checkIn', event: b });
    h.run(tech('guardianship', a.key));
    expect(h.fail(tech('protector-protection', b.key))).toEqual(['CALLING_TECHNIQUE_PER_EVENT']);
  });
});

describe('leaveCalling [CALL-CHANGE]', () => {
  it('locks the skills, stops their numbers, refunds by Unlearn, next Calling at a later event', () => {
    const { h, sixth } = eligible();
    h.run({ type: 'startCalling', callingId: 'protector', eventKey: sixth });
    expect(h.fail({ type: 'leaveCalling' })).toEqual(['REASON_REQUIRED']);
    h.run({ type: 'leaveCalling', reason: 'Emailed staff', eventKey: sixth });
    const s = h.sheet();
    expect(s.calling).toBeNull();
    expect(s.formerCallings[0]).toMatchObject({
      callingId: 'protector',
      status: 'left',
      leftReason: 'Emailed staff',
    });
    expect(s.skills.filter((k) => k.locked).map((k) => k.skillId)).toEqual([
      'guardianship',
      'protector-protection',
    ]);
    expect(s.stats.other).toEqual([]);
    expect(h.fail({ type: 'learnSkill', skillId: 'guardianship', step: { level: 2 } })).toEqual([
      'CALLING_SKILL_LOCKED',
    ]);
    h.run({
      type: 'refundSkill',
      skillId: 'guardianship',
      step: { level: 1 },
      reason: 'Unlearn ritual',
    });
    expect(h.sheet().points.cxp.spent).toBe(5);
    expect(h.fail({ type: 'leaveCalling', reason: 'again' })).toEqual(['NO_ACTIVE_CALLING']);
    expect(
      h.fail({ type: 'startCalling', callingId: 'librarian', eventKey: sixth, choices: {} }),
    ).toEqual(['CALLING_CHANGE_TOO_SOON']);
    h.run({ type: 'checkIn', event: event('2027-01-10', 'x') });
    h.run({ type: 'startCalling', callingId: 'librarian', eventKey: '2027-01-10-x' });
    expect(h.sheet().calling?.callingId).toBe('librarian');
  });

  it('a former Calling can be taken again; its skills unlock, only missing ones are bought (Q-CALL-14)', () => {
    const { h, sixth } = eligible();
    h.run({ type: 'startCalling', callingId: 'protector', eventKey: sixth });
    h.run({ type: 'leaveCalling', reason: 'Emailed staff', eventKey: sixth });
    h.run({
      type: 'refundSkill',
      skillId: 'guardianship',
      step: { level: 1 },
      reason: 'Unlearn ritual',
    });
    const back = event('2027-01-10', 'return');
    h.run({ type: 'checkIn', event: back });
    const actions = h.run({ type: 'startCalling', callingId: 'protector', eventKey: back.key });
    // hand-derived: Protection is still owned; only Guardianship Basic (5 CXP) is bought.
    expect(actions.map((a) => a.type)).toEqual(['calling.started', 'skill.learned']);
    const s = h.sheet();
    expect(s.calling?.callingId).toBe('protector');
    expect(s.skills.filter((k) => k.locked)).toEqual([]);
    // hand-derived: 10 at the first start - 5 refunded + 5 again = 10 CXP spent
    expect(s.points.cxp.spent).toBe(10);
  });
});

describe('setCallingChoices', () => {
  it('Reliquist damage types grow with Relic Mastery Techniques', () => {
    const { h, sixth } = eligible();
    grant(h, 'cxp', 100);
    h.run({ type: 'startCalling', callingId: 'reliquist', eventKey: sixth });
    expect(
      h.fail({ type: 'setCallingChoices', choices: { 'permanent-damage-types': ['fire'] } }),
    ).toEqual(['CHOICE_INVALID']);
    learn(h, 'relic-mastery', 3);
    h.run({ type: 'checkIn', event: event('2026-07-01', 'x') });
    h.run({
      type: 'learnSkill',
      skillId: 'relic-mastery',
      step: { technique: 'expert' },
      eventKey: '2026-07-01-x',
      teacher: 'book',
    });
    h.run({
      type: 'setCallingChoices',
      choices: { 'permanent-damage-types': ['fire'], 'spirit-forged-relic': 'Ember staff' },
    });
    expect(h.sheet().calling?.choices).toEqual({
      'permanent-damage-types': ['fire'],
      'spirit-forged-relic': 'Ember staff',
    });
  });
});
