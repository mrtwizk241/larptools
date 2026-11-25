import { describe, expect, it } from 'vitest';
import type { Action } from '../model.ts';
import { ACTION_TYPES } from '../model.ts';
import { ACTION_REGISTRY } from '../actions/registry.ts';
import { summarize } from '../sheet.ts';
import { AT, grant, rs, withCharacter } from '../testkit.ts';
import { allowedForRole, deriveSheet } from './deriveSheet.ts';

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
  raceId: 'human',
  ageCategory: 2,
  startingXp: 150,
};

describe('deriveSheet', () => {
  it('an empty log gives an uncreated sheet', () => {
    const s = deriveSheet(rs, []);
    expect(s.created).toBe(false);
    expect(s.lastSeq).toBe(0);
    expect(s.points.xp).toMatchObject({ earned: 0, available: 0 });
    expect(s.stats.lifePoints.value).toBe(10);
    expect(s.race).toBeNull();
    expect(s.calling).toBeNull();
    expect(s.warnings).toEqual([]);
    expect(summarize(s)).toEqual({
      characterName: '',
      playerName: '',
      raceName: '',
      callingName: '',
      xpAvailable: 0,
      events: 0,
      retired: false,
    });
  });

  it('every catalogue action type has a handler', () => {
    expect(ACTION_TYPES.filter((t) => !ACTION_REGISTRY[t])).toEqual([]);
  });

  it('bad entries become warnings and are skipped', () => {
    seq = 0;
    const actions = [
      act('skill.learned', {
        skillId: 'stun',
        step: { level: 1 },
        currency: 'xp',
        cost: 5,
        atCreation: false,
      }),
      act('character.created', CREATED),
      act('character.created', CREATED),
      act('no.such', {}),
      act('points.awarded', { currency: 'xp', amount: -5, kind: 'gm-award' }),
      act('skill.learned', {
        skillId: 'stun',
        step: { level: 2 },
        currency: 'xp',
        cost: 10,
        atCreation: false,
      }),
      act('skill.learned', {
        skillId: 'guardianship',
        step: { level: 1 },
        currency: 'xp',
        cost: 5,
        atCreation: false,
      }),
      { ...act('profile.updated', { notes: 'x' }), seq: 1 },
      'garbage' as unknown as Action,
    ];
    const s = deriveSheet(rs, actions);
    expect(s.warnings.map((w) => w.code)).toEqual([
      'NO_CHARACTER',
      'DUPLICATE_CREATED',
      'UNKNOWN_ACTION_TYPE',
      'INVALID_PAYLOAD',
      'STEP_ORDER',
      'CURRENCY_MISMATCH',
      'NEGATIVE_CXP',
      'SEQ_ORDER',
      'MALFORMED_ACTION',
    ]);
    expect(s.created).toBe(true);
  });

  it('replay keeps the stored prices when the ruleset table changes', () => {
    const h = withCharacter();
    grant(h, 'xp', 400);
    grant(h, 'axp', 10);
    h.run({ type: 'learnSkill', skillId: 'toughness', step: { level: 2 }, teacher: 'x' });
    h.run({ type: 'refundSkill', skillId: 'toughness', step: { level: 2 }, reason: 'Unlearn' });
    h.run({ type: 'awakenArtifact', name: 'Lantern' });
    h.run({ type: 'unlockArtifactSlot' });
    const before = h.sheet();
    // hand-derived: Toughness 5 + 10 - 10 refunded = 5 XP; Artifact 5 + 5 = 10 AXP
    expect(before.points.xp.spent).toBe(5);
    expect(before.points.axp.spent).toBe(10);
    const pricier = {
      ...rs,
      ruleset: {
        ...rs.ruleset,
        skills: { ...rs.ruleset.skills, costPerLevel: 7 },
        artifact: { ...rs.ruleset.artifact, awakenCostAxp: 8, slotCostAxp: 9 },
      },
    };
    const after = deriveSheet(pricier, h.actions);
    expect(after.points.xp.spent).toBe(5);
    expect(after.points.axp.spent).toBe(10);
    expect(after.skills.find((s) => s.skillId === 'toughness')?.spent).toBe(5);
    expect(after.learningLog.map((l) => l.cost)).toEqual([5, 10]);
    expect(after.refunds[0]?.refund.amount).toBe(10);
    const differs = after.warnings.filter((w) => w.code === 'STORED_PRICE_DIFFERS');
    expect(differs.map((w) => w.message.split(' ')[0])).toEqual([
      'skill.learned',
      'skill.learned',
      'skill.refunded',
      'artifact.awakened',
      'artifact.slotUnlocked',
    ]);
  });

  it('player-authored actions of staff-only types are ignored with a warning', () => {
    seq = 0;
    const player = { actor: { role: 'player' as const, name: 'Sample Player' } };
    const actions = [
      act('character.created', CREATED, player),
      act('points.awarded', { currency: 'xp', amount: 500, kind: 'gm-award' }, player),
      act('points.adjusted', { currency: 'mt', amount: 900, reason: 'gift' }, player),
      act(
        'event.checkedIn',
        {
          event: { key: '2026-03-01-x', name: 'X', date: '2026-03-01' },
          attendance: 'player',
          awards: [{ currency: 'xp', amount: 60, kind: 'event' }],
        },
        player,
      ),
      act(
        'mt.spent',
        {
          purchaseId: 'xp',
          qty: 1,
          mtCost: 0,
          grants: [{ currency: 'xp', amount: 50, kind: 'mt-purchase' }],
          items: [],
        },
        player,
      ),
      act(
        'skill.learned',
        { skillId: 'stun', step: { level: 1 }, currency: 'xp', cost: 5, atCreation: true },
        player,
      ),
      act('points.awarded', { currency: 'mt', amount: 10, kind: 'donation' }),
    ];
    const s = deriveSheet(rs, actions);
    expect(s.warnings.map((w) => w.code)).toEqual([
      'ROLE_NOT_ALLOWED',
      'ROLE_NOT_ALLOWED',
      'ROLE_NOT_ALLOWED',
      'ROLE_NOT_ALLOWED',
    ]);
    // hand-derived: only the 150 starting XP; 5 spent on Stun; 10 MT from the staff award
    expect(s.points.xp).toMatchObject({ earned: 150, spent: 5 });
    expect(s.points.mt.balance).toBe(10);
    expect(s.events).toEqual([]);
    expect(allowedForRole('points.awarded', 'player')).toBe(false);
    expect(allowedForRole('request.approved', 'player')).toBe(false);
    expect(allowedForRole('skill.learned', 'player')).toBe(true);
    expect(allowedForRole('character.created', 'player')).toBe(true);
    expect(allowedForRole('points.awarded', 'staff')).toBe(true);
    // A player-recorded creation cannot carry retirement points.
    seq = 0;
    const forged = deriveSheet(rs, [
      act(
        'character.created',
        {
          ...CREATED,
          startingXp: 900,
          retirement: { fromName: 'Old', xp: 900, cxp: 50, axp: 5, coinCopper: 0 },
        },
        player,
      ),
    ]);
    expect(forged.warnings.map((w) => w.code)).toEqual(['ROLE_NOT_ALLOWED']);
    expect(forged.points.xp.earned).toBe(150);
    expect(forged.points.cxp.earned).toBe(0);
  });

  it('a retired character ignores later actions except notes and owed delivery', () => {
    seq = 0;
    const s = deriveSheet(rs, [
      act('character.created', CREATED),
      act('character.retired', {
        reason: 'Done',
        goodsValueCopper: 0,
        carry: { xp: 0, cxp: 0, axp: 0, coinCopper: 0 },
      }),
      act('points.awarded', { currency: 'xp', amount: 5, kind: 'gm-award' }),
      act('profile.updated', { notes: 'After' }),
    ]);
    expect(s.warnings.map((w) => w.code)).toEqual(['CHARACTER_RETIRED']);
    expect(s.profile.notes).toBe('After');
  });

  it('summarize gives the roster row', () => {
    const h = withCharacter();
    expect(summarize(h.sheet())).toEqual({
      characterName: 'Wren Ashdown',
      playerName: 'Sample Player',
      raceName: 'Human',
      callingName: '',
      xpAvailable: 150,
      events: 0,
      retired: false,
    });
  });

  it('replays 2,000 actions quickly', () => {
    seq = 0;
    const actions: Action[] = [act('character.created', CREATED)];
    const skills = [
      'stun',
      'aggression',
      'toughness',
      'evasion',
      'taunt',
      'disarm',
      'bash',
      'search',
    ];
    for (const id of skills)
      for (let level = 1; level <= 5; level++)
        actions.push(
          act('skill.learned', {
            skillId: id,
            step: { level },
            currency: 'xp',
            cost: level * 5,
            atCreation: false,
          }),
        );
    for (let i = 0; actions.length < 2000; i++) {
      const day = String((i % 28) + 1).padStart(2, '0');
      const month = String((Math.floor(i / 28) % 12) + 1).padStart(2, '0');
      const year = 2000 + Math.floor(i / 336);
      const key = `${year}-${month}-${day}-game`;
      if (i % 4 === 0)
        actions.push(
          act(
            'event.checkedIn',
            {
              event: { key, name: 'Game', date: `${year}-${month}-${day}` },
              attendance: 'player',
              awards: [
                { currency: 'xp', amount: 1, kind: 'event' },
                { currency: 'cxp', amount: 1, kind: 'event' },
              ],
              upkeep: { dueSilver: 1, coveredBy: 'paid' },
              handedOut: ['1 Silver (Human innate)'],
            },
            { eventKey: key },
          ),
        );
      else if (i % 4 === 1)
        actions.push(act('points.awarded', { currency: 'mt', amount: 50, kind: 'volunteer' }));
      else if (i % 4 === 2)
        actions.push(
          act('mt.spent', {
            purchaseId: 'copper',
            qty: 1,
            mtCost: 10,
            items: ['1 Copper'],
          }),
        );
      else actions.push(act('spirit.changed', { delta: i % 8 === 3 ? -1 : 1, reason: 'test' }));
    }
    expect(actions).toHaveLength(2000);
    deriveSheet(rs, actions); // warm up
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      const sheet = deriveSheet(rs, actions);
      best = Math.min(best, performance.now() - start);
      expect(sheet.ledger.length).toBeGreaterThan(1000);
    }
    expect(best).toBeLessThan(500);
  });
});
