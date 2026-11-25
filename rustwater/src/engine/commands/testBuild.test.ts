// plan() for a player's own test build (ADR 0007): every command, a default teacher, and CXP
// and PXP may be overspent.
import { describe, expect, it } from 'vitest';
import { event, rs as RULESET, withCharacter } from '../testkit.ts';
import { plan, preview, TEST_BUILD_TEACHER } from './plan.ts';
import type { Command } from './registry.ts';

describe('plan with testBuild', () => {
  const player = (h: ReturnType<typeof withCharacter>) => ({
    ...h.ctx('player'),
    actor: { role: 'player' as const, name: 'Sample Player' },
  });

  it('lets a player run staff commands only in a test build', () => {
    const h = withCharacter();
    const learn = {
      type: 'learnSkill',
      skillId: 'assault',
      part: 'basic',
      teacher: 'Old Jory',
    } as const;
    const live = plan(RULESET, h.sheet(), learn, player(h));
    expect(live.ok).toBe(false);
    if (!live.ok) expect(live.errors.map((e) => e.code)).toEqual(['ROLE_NOT_ALLOWED']);
    const test = plan(RULESET, h.sheet(), learn, player(h), { testBuild: true });
    expect(test.ok).toBe(true);
    if (test.ok) expect(test.actions[0]?.actor).toEqual({ role: 'player', name: 'Sample Player' });
  });

  it('records a missing teacher as "Test build" in a test build only', () => {
    const h = withCharacter();
    const learn = { type: 'learnSkill', skillId: 'assault', part: 'basic' } as const;
    const staff = plan(RULESET, h.sheet(), learn, h.ctx('staff'));
    expect(staff.ok).toBe(false);
    if (!staff.ok) expect(staff.errors.map((e) => e.code)).toContain('TEACHER_REQUIRED');
    const test = plan(RULESET, h.sheet(), learn, player(h), { testBuild: true });
    expect(test.ok).toBe(true);
    if (test.ok)
      expect(test.actions[0]?.payload).toMatchObject({
        skillId: 'assault',
        teacher: TEST_BUILD_TEACHER,
      });
  });

  it('keeps every other rule in a test build', () => {
    const h = withCharacter();
    const tooFar = { type: 'learnSkill', skillId: 'assault', part: 'basic', toLevel: 500 } as const;
    const result = plan(RULESET, h.sheet(), tooFar, player(h), { testBuild: true });
    expect(result.ok).toBe(false);
  });

  it('lets a test build spend more CXP than it has; the balance goes negative', () => {
    const h = withCharacter();
    const learn = {
      type: 'learnSkill',
      skillId: 'assault',
      part: 'basic',
      teacher: 'Old Jory',
      toLevel: 9,
    } as const;
    const staff = plan(RULESET, h.sheet(), learn, h.ctx('staff'));
    expect(staff.ok).toBe(false);
    if (!staff.ok) expect(staff.errors.map((e) => e.code)).toEqual(['NOT_ENOUGH_CXP']);
    expect(preview(RULESET, h.sheet(), learn).allowed).toBe(false);
    expect(preview(RULESET, h.sheet(), learn, { testBuild: true }).allowed).toBe(true);

    const test = plan(RULESET, h.sheet(), learn, player(h), { testBuild: true });
    expect(test.ok).toBe(true);
    if (test.ok) h.actions.push(...test.actions);
    expect(h.sheet().points.cxp.available).toBeLessThan(0);
  });

  it('lets a test build spend more PXP than it has', () => {
    const h = withCharacter();
    for (const date of ['2026-01-10', '2026-02-10', '2026-03-10', '2026-04-10'])
      h.run({ type: 'checkIn', event: event(date, 'game'), attendance: 'player' });
    h.run({ type: 'adjustPoints', currency: 'pxp', amount: 15, reason: 'test setup' });
    const start: Command = {
      type: 'startProfession',
      professionId: 'medic',
      eventKey: '2026-04-10-game',
      skills: ['medic-get-back-in-there', 'medic-stitch-em-up'],
    };
    const staff = plan(RULESET, h.sheet(), start, h.ctx('staff'));
    expect(staff.ok).toBe(false);
    if (!staff.ok) expect(staff.errors.map((e) => e.code)).toEqual(['NOT_ENOUGH_PXP']);
    const test = plan(RULESET, h.sheet(), start, player(h), { testBuild: true });
    expect(test.ok).toBe(true);
    if (test.ok) h.actions.push(...test.actions);
    expect(h.sheet().points.pxp.available).toBe(-5);
  });

  it('still blocks AP a test build does not have', () => {
    const h = withCharacter();
    const adept = {
      type: 'learnSkill',
      skillId: 'assault',
      part: 'adept',
      teacher: 'Old Jory',
      toLevel: 3,
    } as const;
    const result = plan(RULESET, h.sheet(), adept, player(h), { testBuild: true });
    expect(result.ok).toBe(false);
  });
});
