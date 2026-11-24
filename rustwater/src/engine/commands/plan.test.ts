import { describe, expect, it } from 'vitest';
import { deriveSheet } from '../derive/deriveSheet.ts';
import {
  BASE_CHARACTER,
  event,
  grantCxp,
  grantShinies,
  harness,
  learnBasic,
  rs,
  withCharacter,
} from '../testkit.ts';
import { plan, preview } from './plan.ts';
import type { Command } from './registry.ts';

describe('roles (ADR 0003)', () => {
  it('rejects every command from a player actor', () => {
    const h = withCharacter();
    const commands: Command[] = [
      { ...BASE_CHARACTER },
      { type: 'updateProfile', notes: 'x' },
      { type: 'awardPoints', currency: 'cxp', amount: 5, kind: 'npc' },
      { type: 'adjustPoints', currency: 'cxp', amount: 5, reason: 'x' },
      { type: 'checkIn', event: event('2026-05-16', 'spring-thaw'), attendance: 'player' },
      { type: 'spendShinies', purchaseId: 'buy-bits', eventKey: '2026-05-16-spring-thaw' },
      { type: 'levelAncestryAbility', abilityId: 'human-resilience' },
      { type: 'changeInfection', toLevel: 4, reason: 'x' },
      { type: 'learnSkill', skillId: 'assault', part: 'basic', teacher: 'x' },
      { type: 'refundSkill', skillId: 'assault', part: 'basic', reason: 'x' },
    ];
    for (const command of commands) {
      const result = h.plan(command, 'player');
      expect(result).toEqual({
        ok: false,
        errors: [
          {
            code: 'ROLE_NOT_ALLOWED',
            message: 'Only staff can make this change. Players send a request instead.',
            ruleId: 'ADR-0003-ROLES',
          },
        ],
      });
    }
    expect(h.plan({ type: 'updateProfile', notes: 'x' }, 'system').ok).toBe(false);
  });
});

describe('plan', () => {
  it('needs a character first', () => {
    const h = harness();
    const result = h.plan({ type: 'awardPoints', currency: 'cxp', amount: 5, kind: 'npc' });
    expect(result.ok ? [] : result.errors.map((e) => e.code)).toEqual(['NO_CHARACTER']);
  });

  it('turns an unknown or malformed command into errors, never throws', () => {
    const h = withCharacter();
    const unknown = h.plan({ type: 'teleport' } as unknown as Command);
    expect(unknown.ok ? [] : unknown.errors.map((e) => e.code)).toEqual(['INVALID_COMMAND']);
    const malformed = h.plan(null as unknown as Command);
    expect(malformed.ok).toBe(false);
    const badField = h.plan({ type: 'learnSkill', skillId: 'Assault!', part: 'basic' });
    expect(badField.ok ? [] : badField.errors.map((e) => e.code)).toEqual(['INVALID_COMMAND']);
  });

  it('numbers actions from ctx.nextSeq and uses ctx ids and time', () => {
    const sheet = deriveSheet(rs, []);
    let n = 0;
    const result = plan(
      rs,
      sheet,
      { ...BASE_CHARACTER, startingSkills: [{ skillId: 'assault', part: 'basic', level: 2 }] },
      {
        actor: { role: 'staff' },
        now: () => '2026-11-07T10:00:00.000Z',
        newId: () => `id-${++n}`,
        nextSeq: 1,
      },
    );
    expect(result.ok && result.actions.map((a) => [a.id, a.seq, a.at, a.actor])).toEqual([
      ['id-1', 1, '2026-11-07T10:00:00.000Z', { role: 'staff' }],
      ['id-2', 2, '2026-11-07T10:00:00.000Z', { role: 'staff' }],
      ['id-3', 3, '2026-11-07T10:00:00.000Z', { role: 'staff' }],
    ]);
  });
});

describe('preview', () => {
  it('labels the next skill level with its cost', () => {
    const h = withCharacter({ startingSkills: [{ skillId: 'assault', part: 'basic', level: 3 }] });
    expect(
      preview(rs, h.sheet(), { type: 'learnSkill', skillId: 'assault', part: 'basic' }),
    ).toEqual({
      allowed: true,
      cost: { currency: 'cxp', amount: 40 },
      teacherRequired: false,
      reasons: [],
      errors: [],
      notices: [],
    });
  });

  it('explains a missing prerequisite and still shows the cost', () => {
    const h = withCharacter({ startingSkills: [{ skillId: 'assault', part: 'basic', level: 5 }] });
    const result = preview(rs, h.sheet(), {
      type: 'learnSkill',
      skillId: 'assault',
      part: 'mastery',
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual(['Needs Assault level 9.']);
    expect(result.cost).toEqual({ currency: 'ap', amount: 10, archetype: 'warrior' });
    expect(result.teacherRequired).toBe(true);
  });

  it('does not count a missing teacher or reason as blocking', () => {
    const h = withCharacter();
    const learn = preview(rs, h.sheet(), { type: 'learnSkill', skillId: 'bash', part: 'basic' });
    expect(learn).toMatchObject({
      allowed: true,
      teacherRequired: true,
      cost: { currency: 'cxp', amount: 10 },
    });
    learnBasic(h, 'bash', 2);
    const refund = preview(rs, h.sheet(), { type: 'refundSkill', skillId: 'bash', part: 'basic' });
    expect(refund).toMatchObject({ allowed: true, refund: { currency: 'cxp', amount: 20 } });
  });

  it('works for ancestry levels, Shiny purchases, and check-in', () => {
    const h = withCharacter();
    expect(
      preview(rs, h.sheet(), { type: 'levelAncestryAbility', abilityId: 'make-it-work' }),
    ).toMatchObject({
      allowed: true,
      cost: { currency: 'lxp', amount: 1 },
    });
    const shinies = preview(rs, h.sheet(), {
      type: 'spendShinies',
      purchaseId: 'buy-rare-resource',
      qty: 2,
      eventKey: '2026-05-16-spring-thaw',
    });
    expect(shinies).toMatchObject({
      allowed: false,
      cost: { currency: 'shinies', amount: 120 },
      reasons: ['Not enough Shinies: needs 120, 0 left.'],
    });
    grantShinies(h, 200);
    expect(
      preview(rs, h.sheet(), {
        type: 'spendShinies',
        purchaseId: 'buy-rare-resource',
        qty: 2,
        eventKey: '2026-05-16-spring-thaw',
      }).allowed,
    ).toBe(true);
    const checkIn = preview(rs, h.sheet(), {
      type: 'checkIn',
      event: event('2026-05-16', 'spring-thaw'),
      attendance: 'npc-unpaid',
    });
    expect(checkIn.allowed).toBe(true);
    expect(checkIn.awards).toHaveLength(5);
    expect(checkIn.owed).toHaveLength(1);
  });

  it('does not change the sheet or need a staff actor', () => {
    const h = withCharacter();
    grantCxp(h, 100);
    const before = JSON.stringify(h.sheet());
    preview(rs, h.sheet(), { type: 'learnSkill', skillId: 'assault', part: 'basic', toLevel: 5 });
    expect(JSON.stringify(h.sheet())).toBe(before);
  });
});
