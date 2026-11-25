import { describe, expect, it } from 'vitest';
import { loadRuleset } from '../../engine/index.ts';
import { ACTION_TYPES, type Action, type ActionType } from '../../engine/model.ts';
import { ash } from '../test/veteran.ts';
import {
  ACTION_GROUPS,
  ACTION_TYPE_INFO,
  GROUP_LABELS,
  actionLookup,
  describeAction,
} from './describeAction.ts';
import { amountText, costText, currencyAbbr, signedTotals, skillStepName } from './names.ts';

const rs = loadRuleset('sylvaris-1.3.1');
const SPRING = { key: '2026-04-18-spring-thaw', name: 'Spring Thaw', date: '2026-04-18' };

let seq = 0;
function act(type: ActionType, payload: unknown, extra: Partial<Action> = {}): Action {
  seq += 1;
  return {
    id: `a${seq}`,
    seq,
    at: '2026-04-18T10:00:00.000Z',
    actor: { role: 'staff' },
    type,
    payload,
    ...extra,
  };
}

/** One valid payload per action type, with the summary each should read as. */
const CASES: Record<
  ActionType,
  { payload: unknown; summary: string | RegExp; extra?: Partial<Action> }
> = {
  'character.created': {
    payload: {
      characterName: 'Mira Voss',
      playerName: 'Sam Hollis',
      raceId: 'elf',
      choices: { 'bonus-language': 'common' },
      ageCategory: 2,
      startingXp: 150,
    },
    summary: 'Created Mira Voss (Elf), player Sam Hollis, with 150 XP.',
  },
  'profile.updated': {
    payload: { notes: 'Owes the ferryman.', ageCategory: 3, callingChoices: { element: 'fire' } },
    summary: 'Updated notes, age category, Calling choices.',
  },
  'points.awarded': {
    payload: { currency: 'xp', amount: 5, kind: 'npc-time', requested: 10 },
    summary: 'Awarded 5 XP for npc time (10 asked, the rest is over the cap).',
  },
  'points.adjusted': {
    payload: { currency: 'cxp', amount: -5, reason: 'Typo.' },
    summary: 'Correction: -5 CXP. Reason: Typo.',
  },
  'event.checkedIn': {
    payload: {
      event: SPRING,
      attendance: 'player',
      npcHours: 0,
      extras: ['sunday-cleanup'],
      awards: [
        { currency: 'xp', amount: 60, kind: 'event' },
        { currency: 'cxp', amount: 5, kind: 'event' },
        { currency: 'axp', amount: 1, kind: 'event' },
        { currency: 'mt', amount: 100, kind: 'extra' },
      ],
      upkeep: { dueSilver: 0, coveredBy: null },
      handedOut: ['1 Silver (Human innate)'],
    },
    summary:
      'Checked in to Spring Thaw (Player): +60 XP, +5 CXP, +1 AXP, +100 Mist Tokens. Handed over: 1 Silver (Human innate).',
  },
  'event.checkInVoided': {
    payload: { checkInActionId: 'checkin-1', reason: 'Wrong character.' },
    summary: 'Voided the check-in to Spring Thaw: Wrong character.',
  },
  'mt.spent': {
    payload: {
      purchaseId: 'basic-component',
      qty: 2,
      mtCost: 50,
      items: ['2 Basic Components'],
    },
    summary: 'Spent 50 Mist Tokens on Basic Component: 2 Basic Components.',
  },
  'skill.learned': {
    payload: {
      skillId: 'toughness',
      step: { technique: 'expert' },
      currency: 'xp',
      cost: 5,
      teacher: 'Old Jory',
      atCreation: false,
    },
    summary: 'Learned Toughness Expert Technique from Old Jory (5 XP).',
  },
  'skill.refunded': {
    payload: {
      skillId: 'toughness',
      step: { level: 3 },
      reason: 'Unlearn',
      refund: { currency: 'xp', amount: 15 },
    },
    summary: 'Took back Toughness level 3 (15 XP back). Reason: Unlearn.',
  },
  'journal.added': {
    payload: { kind: 'spell', refId: 'fire-dart', source: 'teacher', teacher: 'Sister Wren' },
    summary: 'Added the spell Fire Dart to the spellbook from Sister Wren.',
  },
  'journal.tagged': {
    payload: { entryId: 'journal-1' },
    summary: 'Tagged the recipe Miniature Individual Clockwork Assistant (M.I.C.A.).',
  },
  'journal.removed': {
    payload: { entryId: 'journal-1', reason: 'Lost the journal' },
    summary:
      'Removed the recipe Miniature Individual Clockwork Assistant (M.I.C.A.). Reason: Lost the journal.',
  },
  'calling.started': {
    payload: { callingId: 'protector', choices: {} },
    summary: 'Started the Calling The Protector.',
  },
  'calling.left': {
    payload: { reason: 'A new path' },
    summary: 'Left the Calling. Reason: A new path.',
  },
  'items.startingSet': {
    payload: {
      picks: [{ optionId: 'basic-spell', detail: 'fire-dart' }, { optionId: 'simple-pet' }],
    },
    summary: 'Set the starting items: Basic Spell in Spellbook (fire-dart), Simple Pet.',
  },
  'spirit.changed': {
    payload: { delta: -1, reason: 'Died in the river fight' },
    summary: 'Lost 1 Spirit Fragment. Reason: Died in the river fight.',
  },
  'request.approved': {
    payload: {
      requestId: 'r1',
      submittedAt: '2026-04-18T09:00:00.000Z',
      skillId: 'deflection',
      step: { level: 3 },
      teacher: 'Captain Dorn',
    },
    summary: 'Approved the request for Deflection level 3 from Captain Dorn.',
  },
  'request.rejected': {
    payload: {
      requestId: 'r2',
      submittedAt: '2026-04-18T09:00:00.000Z',
      skillId: 'toughness',
      step: { technique: 'expert' },
      reason: 'Learn level 3 first',
    },
    summary: 'Rejected the request for Toughness Expert Technique. Reason: Learn level 3 first.',
  },
  'character.retired': {
    payload: {
      reason: 'Moved away',
      goodsValueCopper: 400,
      carry: { xp: 200, cxp: 10, axp: 3, coinCopper: 200 },
    },
    summary: 'Retired. Reason: Moved away. Carries 200 XP, 10 CXP, 3 AXP, 200 Copper in goods.',
  },
  'retirement.assigned': {
    payload: { toCharacterId: 'char-young-bear', toName: 'Young Bear', kind: 'new' },
    summary: 'Gave the carry-over to Young Bear, the new character built from it.',
  },
  'artifact.awakened': {
    payload: { name: 'The Ember Ring', axpCost: 5 },
    summary: 'Awakened the Artifact The Ember Ring (5 AXP).',
  },
  'artifact.slotUnlocked': {
    payload: { axpCost: 5 },
    summary: 'Unlocked an Artifact slot (5 AXP).',
  },
  'artifact.powerSet': {
    payload: { powerId: 'art-basic-skill-use', choice: 'Toughness' },
    summary: 'Set the Artifact power Use a chosen Basic skill once per re-pop (tier 1): Toughness.',
  },
  'artifact.powerRemoved': {
    payload: { entryIds: ['p1', 'p2'], reason: 'Rebuilt' },
    summary: 'Removed 2 Artifact powers. Reason: Rebuilt.',
  },
  'location.familiarized': {
    payload: { name: 'The Old Mill', kind: 'portal', date: '2026-04-18' },
    summary: 'Familiarized The Old Mill.',
  },
  'location.removed': {
    payload: { entryId: 'place-1', reason: 'Burned down' },
    summary: 'Removed the familiarized place The Old Mill. Reason: Burned down.',
  },
  'boon.added': {
    payload: { slot: 'lesser', name: 'Lucky Charm' },
    summary: 'Added the lesser boon Lucky Charm.',
  },
  'boon.removed': {
    payload: { boonActionId: 'boon-1', reason: 'Used up' },
    summary: 'Removed the boon Lucky Charm. Reason: Used up.',
  },
  'familiar.set': {
    payload: { name: 'Pip', quality: 'expert', tricks: [{ id: 'hide', slots: 1 }] },
    summary: 'Set the familiar Pip (Expert quality, 1 trick).',
  },
  'familiar.removed': {
    payload: { reason: 'Released' },
    summary: 'Removed the familiar. Reason: Released.',
  },
  'owed.added': {
    payload: { text: 'Basic Shield repair kit' },
    summary: 'Owed: Basic Shield repair kit.',
  },
  'owed.delivered': {
    payload: { owedId: 'owed-1' },
    summary: 'Handed over: Basic Shield repair kit.',
  },
  'race.changed': {
    payload: { fromRaceId: 'human', toRaceId: 'elf', reason: 'Ritual' },
    summary: 'Changed race from Human to Elf. Reason: Ritual.',
  },
};

const lookup = actionLookup([
  act('boon.added', { slot: 'lesser', name: 'Lucky Charm' }, { id: 'boon-1' }),
  act('owed.added', { text: 'Basic Shield repair kit' }, { id: 'owed-1' }),
  act(
    'location.familiarized',
    { name: 'The Old Mill', kind: 'portal', date: '2026-04-18' },
    { id: 'place-1' },
  ),
  act(
    'journal.added',
    { kind: 'recipe', refId: 'tinkering-mica', source: 'starting' },
    { id: 'journal-1' },
  ),
  act(
    'event.checkedIn',
    {
      event: SPRING,
      attendance: 'player',
      awards: [],
      upkeep: { dueSilver: 0, coveredBy: null },
    },
    { id: 'checkin-1' },
  ),
]);

describe('describeAction', () => {
  it('has a case, a label, and a group for every Sylvaris action type', () => {
    expect(Object.keys(CASES).sort()).toEqual([...ACTION_TYPES].sort());
    expect(Object.keys(ACTION_TYPE_INFO).sort()).toEqual([...ACTION_TYPES].sort());
    expect(Object.keys(GROUP_LABELS)).toEqual([...ACTION_GROUPS]);
  });

  for (const type of ACTION_TYPES) {
    it(`describes ${type}`, () => {
      const c = CASES[type];
      const d = describeAction(rs, act(type, c.payload, c.extra), lookup);
      expect(ACTION_GROUPS).toContain(d.group);
      expect(d.label).not.toBe('');
      if (typeof c.summary === 'string') expect(d.summary).toBe(c.summary);
      else expect(d.summary).toMatch(c.summary);
    });
  }

  it('puts actions in the expected groups', () => {
    const group = (type: ActionType) =>
      describeAction(rs, act(type, CASES[type].payload), lookup).group;
    expect(group('points.awarded')).toBe('points');
    expect(group('mt.spent')).toBe('points');
    expect(group('event.checkedIn')).toBe('check-ins');
    expect(group('skill.learned')).toBe('skills');
    expect(group('points.adjusted')).toBe('corrections');
    expect(group('skill.refunded')).toBe('corrections');
    expect(group('event.checkInVoided')).toBe('corrections');
    expect(group('journal.added')).toBe('journals');
    expect(group('calling.started')).toBe('calling');
    expect(group('artifact.powerSet')).toBe('artifact');
    expect(group('familiar.set')).toBe('extras');
    expect(group('owed.added')).toBe('extras');
    expect(group('request.approved')).toBe('requests');
    expect(group('race.changed')).toBe('profile');
    expect(group('character.retired')).toBe('other');
  });

  it('describes every action of the veteran sample without falling back', () => {
    const { actions } = ash();
    const all = actionLookup(actions);
    for (const action of actions) {
      const d = describeAction(rs, action, all);
      expect(d.summary, action.type).not.toMatch(/could not be read|^Recorded/);
    }
  });

  it('falls back safely for payloads it cannot read', () => {
    const d = describeAction(rs, act('skill.learned', { skillId: 42 }));
    expect(d).toEqual({
      label: 'Skill',
      group: 'skills',
      summary: 'Recorded skill learned; the details could not be read.',
    });
    expect(describeAction(rs, act('points.awarded', null)).summary).toMatch(/could not be read/);
  });

  it('falls back for an unknown action type', () => {
    const d = describeAction(rs, act('mystery.thing' as ActionType, {}));
    expect(d).toEqual({ label: 'Other', group: 'other', summary: 'Recorded "Mystery thing".' });
  });

  it('uses ids when the ruleset does not name them, and resolves missing references', () => {
    expect(
      describeAction(
        rs,
        act('skill.learned', {
          skillId: 'no-such-skill',
          step: { level: 1 },
          currency: 'xp',
          cost: 0,
          atCreation: true,
        }),
      ).summary,
    ).toBe('Learned no-such-skill level 1 at creation (free).');
    expect(describeAction(rs, act('boon.removed', { boonActionId: 'gone' })).summary).toBe(
      'Removed the boon.',
    );
    expect(describeAction(rs, act('owed.delivered', { owedId: 'gone' })).summary).toBe(
      'Handed over an owed item.',
    );
    expect(describeAction(rs, act('journal.tagged', { entryId: 'gone' })).summary).toBe(
      'Tagged a journal entry.',
    );
    expect(
      describeAction(rs, act('event.checkInVoided', { checkInActionId: 'gone', reason: 'Oops' }))
        .summary,
    ).toBe('Voided a check-in: Oops.');
  });

  it('describes penalties, retirement carry-overs, and Mist Token teaching', () => {
    expect(
      describeAction(
        rs,
        act('points.adjusted', { currency: 'mt', amount: -1, reason: 'Late', kind: 'penalty' }),
      ).summary,
    ).toBe('Penalty: -1 Mist Token. Reason: Late.');
    expect(
      describeAction(
        rs,
        act('character.created', {
          characterName: 'Wren',
          playerName: 'Jo Park',
          raceId: 'orc',
          ageCategory: 2,
          startingXp: 300,
          retirement: { fromName: 'Old Hero', xp: 400, cxp: 0, axp: 0, coinCopper: 0 },
        }),
      ).summary,
    ).toBe('Created Wren (Orc), player Jo Park, with 300 XP, carrying points over from Old Hero.');
    expect(
      describeAction(
        rs,
        act('mt.spent', {
          purchaseId: 'teaching-normal',
          qty: 1,
          mtCost: 100,
          namedLevel: 'basic',
          skillId: 'toughness',
        }),
      ).summary,
    ).toBe(
      'Spent 100 Mist Tokens on Teaching (normal skill) (Toughness): 1 x Teaching (normal skill).',
    );
  });
});

describe('names', () => {
  it('names currencies, amounts, costs, and skill steps', () => {
    expect(['xp', 'cxp', 'axp', 'mt'].map((c) => currencyAbbr(rs, c))).toEqual([
      'XP',
      'CXP',
      'AXP',
      'MT',
    ]);
    expect(amountText(rs, 'mt', 1)).toBe('1 Mist Token');
    expect(amountText(rs, 'mt', 25)).toBe('25 Mist Tokens');
    expect(amountText(rs, 'axp', 5)).toBe('5 AXP');
    expect(costText(rs, { currency: 'cxp', amount: 0 })).toBe('free');
    expect(costText(rs, { currency: 'cxp', amount: 10 })).toBe('10 CXP');
    expect(skillStepName(rs, 'toughness', { level: 4 })).toBe('Toughness level 4');
    expect(skillStepName(rs, 'guardianship', { technique: 'master' })).toBe(
      'Guardianship Master Technique',
    );
    expect(
      signedTotals(rs, [
        { currency: 'mt', amount: 50 },
        { currency: 'xp', amount: 60 },
        { currency: 'xp', amount: 5 },
        { currency: 'axp', amount: 0 },
      ]),
    ).toBe('+65 XP, +50 Mist Tokens');
  });
});
