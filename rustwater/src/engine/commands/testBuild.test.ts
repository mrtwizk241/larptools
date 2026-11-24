// plan() for a player's own test build (ADR 0007): every command, a default teacher.
import { describe, expect, it } from 'vitest';
import { rs as RULESET, withCharacter } from '../testkit.ts';
import { plan, TEST_BUILD_TEACHER } from './plan.ts';

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
});
