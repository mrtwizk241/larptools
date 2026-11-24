import { describe, expect, it } from 'vitest';
import { loadRuleset } from '../../engine/index.ts';
import { ACTION_TYPES, type Action, type ActionType } from '../../engine/model.ts';
import { ACTION_GROUPS, actionLookup, describeAction } from './describeAction.ts';

const rs = loadRuleset('2026-2.0');
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

const elf = rs.ancestriesById['elf'];
if (!elf) throw new Error('elf missing from the ruleset');

/** One valid payload per action type, with the summary each should read as. */
const CASES: Record<
  ActionType,
  { payload: unknown; summary: string | RegExp; extra?: Partial<Action> }
> = {
  'character.created': {
    payload: {
      characterName: 'Mira Voss',
      playerName: 'Sam Hollis',
      ancestryId: 'elf',
      subtypeId: 'elf-windwalker',
      extraInfection: 0,
    },
    summary: 'Created Mira Voss (Elf, Windwalker), player Sam Hollis.',
  },
  'profile.updated': {
    payload: { notes: 'Owes the ferryman.', age: 30 },
    summary: 'Updated age, notes.',
  },
  'points.awarded': {
    payload: { currency: 'cxp', amount: 5, kind: 'npc', requested: 10 },
    summary: 'Awarded 5 CXP for NPC time (10 asked, capped).',
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
      preSignedShift: false,
      extras: [],
      awards: [
        { currency: 'cxp', amount: 50, kind: 'event' },
        { currency: 'cxp', amount: 25, kind: 'npc' },
        { currency: 'fp', amount: 1, kind: 'attendance' },
      ],
      owed: [],
    },
    summary: 'Checked in to Spring Thaw (Player): +75 CXP, +1 FP.',
  },
  'event.checkInVoided': {
    payload: { checkInActionId: 'checkin-1', reason: 'Wrong character.' },
    summary: 'Voided check-in to Spring Thaw: Wrong character.',
  },
  'shinies.spent': {
    payload: {
      purchaseId: 'buy-cxp',
      qty: 2,
      shiniesCost: 100,
      grants: [{ currency: 'cxp', amount: 2, kind: 'shiny-purchase' }],
      items: [],
    },
    summary: 'Spent 100 Shinies: 2 CXP.',
  },
  'ancestry.leveled': {
    payload: { abilityId: elf.sharedAbility.id, toLevel: 2 },
    summary: `Raised ${elf.sharedAbility.name} to level 2 (1 LXP).`,
  },
  'infection.changed': {
    payload: { track: 'infection', toLevel: 3, fromLevel: 2, reason: 'Rose at the gate' },
    summary: 'Infection set to 3 (was 2). Reason: Rose at the gate.',
  },
  'skill.learned': {
    payload: {
      skillId: 'assault',
      part: 'basic',
      toLevel: 3,
      cost: { currency: 'cxp', amount: 40 },
      teacher: 'Ana',
      atCreation: false,
    },
    summary: 'Learned Assault level 3 from Ana (40 CXP).',
  },
  'skill.refunded': {
    payload: {
      skillId: 'assault',
      part: 'adept',
      toLevel: 0,
      reason: 'Wrong skill',
      refund: { currency: 'ap', amount: 3 },
    },
    summary: 'Removed Assault Adept (3 AP back). Reason: Wrong skill.',
  },
  'memorized.added': {
    payload: { kind: 'spell', refId: 'elemental-bolt', slot: 'elemental' },
    summary: 'Memorized Elemental Bolt (spell).',
  },
  'memorized.removed': {
    payload: { entryId: 'x1', kind: 'knowledge', text: 'Swamp lore' },
    summary: 'Forgot Swamp lore.',
  },
  'profession.started': {
    payload: { professionId: 'sniper' },
    summary: 'Started the Sniper profession.',
  },
  'profession.leveled': {
    payload: {
      abilityId: 'sniper-open-spots',
      toLevel: 2,
      cost: { currency: 'pxp', amount: 20 },
    },
    summary: 'Raised Open Spots to level 2 (20 PXP).',
  },
  'familiar.bonded': {
    payload: { name: 'Pip', creature: 'raven' },
    summary: 'Bonded the familiar Pip (raven).',
  },
  'familiar.awakened': {
    payload: { awakenedSkillId: 'gather', fpCost: 5 },
    summary: 'Awakened the familiar with Gather (5 FP).',
  },
  'familiar.leveled': {
    payload: { toLevel: 3, fpCost: 4 },
    summary: 'Raised the familiar to level 3 (4 FP).',
  },
  'familiar.skillLearned': {
    payload: { skillId: 'fam-amplify-healing', essenceCost: 2 },
    summary: 'Familiar learned Amplify Healing (2 Essence).',
  },
  'familiar.skillForgotten': {
    payload: { learnedActionId: 'x2', skillId: 'fam-amplify-healing', fpCost: 0 },
    summary: 'Familiar forgot Amplify Healing (free).',
  },
  'familiar.slotUnlocked': {
    payload: { essenceCost: 3 },
    summary: 'Unlocked a familiar skill slot (3 Essence).',
  },
  'familiar.bondBroken': {
    payload: { fpCost: 2, reason: 'Released' },
    summary: 'Broke the familiar bond (2 FP). Reason: Released.',
  },
  'familiar.renamed': {
    payload: { name: 'Pip' },
    summary: 'Named the familiar Pip.',
  },
  'boon.added': {
    payload: { boonId: 'baby-health-boon', name: 'Baby Health Boon', expires: 'next event' },
    summary: 'Added the boon Baby Health Boon (expires next event).',
  },
  'boon.removed': {
    payload: { boonActionId: 'boon-1' },
    summary: 'Removed the boon Lucky Charm.',
  },
  'items.startingSet': {
    payload: {
      picks: [{ optionId: 'basic-armor' }, { optionId: 'basic-armor', detail: 'leather' }],
    },
    summary: 'Set the starting items: Basic Armor, Basic Armor (leather).',
  },
  'owed.added': { payload: { text: '1 Rare resource' }, summary: 'Owed: 1 Rare resource.' },
  'owed.delivered': {
    payload: { owedId: 'checkin-1#0' },
    summary: 'Handed over: 3 Common resources.',
  },
  'request.approved': {
    payload: {
      requestId: 'r1',
      submittedAt: '2026-04-18T09:00:00.000Z',
      skillId: 'assault',
      part: 'basic',
      toLevel: 2,
      teacher: 'Ana',
    },
    summary: 'Approved the request for Assault level 2 from Ana.',
  },
  'request.rejected': {
    payload: {
      requestId: 'r2',
      submittedAt: '2026-04-18T09:00:00.000Z',
      skillId: 'assault',
      part: 'basic',
      toLevel: 2,
      reason: 'No teacher at the event',
    },
    summary: 'Rejected the request for Assault level 2. Reason: No teacher at the event.',
  },
  'character.retired': {
    payload: { reason: 'Moved away', kind: 'planned', carry: { cxp: 100, fp: 2, shinies: 300 } },
    summary: 'Retired (planned). Reason: Moved away. Carries 100 CXP, 2 FP, 300 Shinies.',
  },
  'trauma.added': {
    payload: { text: 'Flinches at bells' },
    summary: 'Added trauma: Flinches at bells.',
  },
  'trauma.edited': {
    payload: { traumaId: 'trauma-1', text: 'Flinches at loud bells' },
    summary: 'Changed trauma to: Flinches at loud bells.',
  },
  'trauma.removed': {
    payload: { traumaId: 'trauma-1', reason: 'Healed at the Home', text: 'Flinches at bells' },
    summary: 'Removed trauma: Flinches at bells. Reason: Healed at the Home.',
  },
  'storyNote.added': {
    payload: { text: 'Owes the ferryman' },
    summary: 'Added story note: Owes the ferryman.',
  },
  'storyNote.edited': {
    payload: { noteId: 'note-1', text: 'Paid the ferryman' },
    summary: 'Changed story note to: Paid the ferryman.',
  },
  'storyNote.removed': {
    payload: { noteId: 'note-1' },
    summary: 'Removed a story note.',
  },
};

const lookup = actionLookup([
  act('boon.added', { name: 'Lucky Charm' }, { id: 'boon-1' }),
  act(
    'event.checkedIn',
    {
      event: SPRING,
      attendance: 'npc-unpaid',
      npcHours: 0,
      preSignedShift: false,
      extras: [],
      awards: [],
      owed: ['3 Common resources'],
    },
    { id: 'checkin-1' },
  ),
]);

describe('describeAction', () => {
  it('has a case for every action type', () => {
    expect(Object.keys(CASES).sort()).toEqual([...ACTION_TYPES].sort());
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
    expect(group('shinies.spent')).toBe('points');
    expect(group('event.checkedIn')).toBe('check-ins');
    expect(group('skill.learned')).toBe('skills');
    expect(group('points.adjusted')).toBe('corrections');
    expect(group('skill.refunded')).toBe('corrections');
    expect(group('event.checkInVoided')).toBe('corrections');
    expect(group('memorized.added')).toBe('memory');
    expect(group('profession.leveled')).toBe('profession');
    expect(group('familiar.bonded')).toBe('familiar');
    expect(group('owed.added')).toBe('items');
    expect(group('request.approved')).toBe('requests');
    expect(group('ancestry.leveled')).toBe('ancestry');
    expect(group('profile.updated')).toBe('profile');
    expect(group('character.retired')).toBe('other');
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
          part: 'basic',
          toLevel: 1,
          cost: { currency: 'cxp', amount: 0 },
          atCreation: true,
        }),
      ).summary,
    ).toBe('Learned no-such-skill level 1 at creation (free).');
    expect(describeAction(rs, act('boon.removed', { boonActionId: 'gone' })).summary).toBe(
      'Removed the boon.',
    );
    expect(describeAction(rs, act('owed.delivered', { owedId: 'gone#2' })).summary).toBe(
      'Handed over an owed reward.',
    );
    expect(
      describeAction(rs, act('event.checkInVoided', { checkInActionId: 'gone', reason: 'Oops' }))
        .summary,
    ).toBe('Voided a check-in: Oops.');
  });

  it('describes missed-event Shiny purchases and penalties', () => {
    const missed = describeAction(
      rs,
      act('shinies.spent', {
        purchaseId: 'buy-missed-event-cxp',
        qty: 1,
        shiniesCost: 500,
        grants: [{ currency: 'cxp', amount: 50, kind: 'event', eventKey: SPRING.key }],
        items: [],
        forEvent: SPRING,
      }),
    );
    expect(missed.summary).toBe(
      'Spent 500 Shinies: 50 Event CXP for the missed event Spring Thaw.',
    );
    const penalty = describeAction(
      rs,
      act('points.adjusted', { currency: 'fp', amount: 2, reason: 'Back pay', kind: 'penalty' }),
    );
    expect(penalty.summary).toBe('Penalty: +2 FP. Reason: Back pay.');
  });
});
