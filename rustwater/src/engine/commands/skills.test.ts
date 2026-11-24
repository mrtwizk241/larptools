import { describe, expect, it } from 'vitest';
import type { PlanResult } from './define.ts';
import { grantCxp, learnBasic, withCharacter, type Harness } from '../testkit.ts';

function errors(result: PlanResult): { code: string; message: string; ruleId: string }[] {
  return result.ok ? [] : result.errors.map((e) => ({ ...e }));
}

function codes(result: PlanResult): string[] {
  return errors(result).map((e) => e.code);
}

function rich(): Harness {
  const h = withCharacter();
  grantCxp(h, 1000);
  return h;
}

describe('learnSkill', () => {
  it('buys the next basic level for 10 x level CXP and earns that many AP', () => {
    const h = withCharacter({ startingSkills: [{ skillId: 'assault', part: 'basic', level: 3 }] });
    const result = h.plan({ type: 'learnSkill', skillId: 'assault', part: 'basic' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      type: 'skill.learned',
      seq: 5,
      actor: { role: 'staff', name: 'Test Staff' },
      payload: {
        skillId: 'assault',
        part: 'basic',
        toLevel: 4,
        cost: { currency: 'cxp', amount: 40 },
        atCreation: false,
      },
    });
    h.actions.push(...result.actions);
    expect(h.sheet().points.cxp.spent).toBe(100);
    expect(h.sheet().points.ap['warrior']?.earned).toBe(10);
  });

  it('says how much CXP is missing', () => {
    const h = withCharacter({
      startingSkills: [
        { skillId: 'assault', part: 'basic', level: 3 },
        { skillId: 'bash', part: 'basic', level: 4 },
        { skillId: 'slay', part: 'basic', level: 2 },
      ],
    });
    // 60 + 100 + 30 = 190 spent, 60 left; level 4 of Assault costs 40, level 3 of Slay 30.
    h.run({ type: 'learnSkill', skillId: 'slay', part: 'basic' });
    h.run({ type: 'adjustPoints', currency: 'cxp', amount: -5, reason: 'Late check-out' });
    const result = h.plan({ type: 'learnSkill', skillId: 'assault', part: 'basic' });
    expect(errors(result)).toEqual([
      {
        code: 'NOT_ENOUGH_CXP',
        message: 'Not enough CXP: needs 40, 25 left.',
        ruleId: 'PTS-CXP-SPEND',
      },
    ]);
  });

  it('buys several levels in order with one action per level', () => {
    const h = rich();
    const actions = h.run({
      type: 'learnSkill',
      skillId: 'assault',
      part: 'basic',
      toLevel: 4,
      teacher: 'Old Jory',
    });
    expect(actions.map((a) => (a.payload as { toLevel: number }).toLevel)).toEqual([1, 2, 3, 4]);
    expect(actions.map((a) => (a.payload as { cost: { amount: number } }).cost.amount)).toEqual([
      10, 20, 30, 40,
    ]);
    expect(actions.every((a) => (a.payload as { teacher?: string }).teacher === 'Old Jory')).toBe(
      true,
    );
  });

  it('stops at the maximum level and refuses levels already owned', () => {
    const h = rich();
    learnBasic(h, 'assault', 10);
    expect(codes(h.plan({ type: 'learnSkill', skillId: 'assault', part: 'basic' }))).toEqual([
      'MAX_LEVEL',
    ]);
    expect(
      codes(h.plan({ type: 'learnSkill', skillId: 'assault', part: 'basic', toLevel: 3 })),
    ).toEqual(['ALREADY_AT_LEVEL']);
    expect(
      codes(
        h.plan({
          type: 'learnSkill',
          skillId: 'resilience',
          part: 'main',
          toLevel: 6,
          teacher: 'J',
        }),
      ),
    ).toEqual(['MAX_LEVEL']);
  });

  it('memorization has no level cap and costs 1 AP per level', () => {
    const h = rich();
    learnBasic(h, 'elemental-magic', 5); // 15 Magic AP
    h.run({
      type: 'learnSkill',
      skillId: 'spell-memorization',
      part: 'main',
      toLevel: 7,
      teacher: 'Wren',
    });
    expect(h.sheet().points.ap['magic']).toEqual({ earned: 15, spent: 7, available: 8 });
    expect(
      h.sheet().skills.find((s) => s.skillId === 'spell-memorization')?.parts[0]?.maxLevel,
    ).toBeNull();
  });

  it('spends AP from the skill archetype pool and says how much is missing', () => {
    const h = rich();
    learnBasic(h, 'assault', 2); // 3 Warrior AP
    h.run({ type: 'learnSkill', skillId: 'assault', part: 'adept' });
    expect(h.sheet().points.ap['warrior']).toEqual({ earned: 3, spent: 3, available: 0 });
    expect(errors(h.plan({ type: 'learnSkill', skillId: 'assault', part: 'adept' }))).toEqual([
      {
        code: 'NOT_ENOUGH_AP',
        message: 'Not enough Warrior AP: needs 6, 0 left.',
        ruleId: 'PTS-AP-SPEND',
      },
    ]);
    // Defender AP cannot pay for a Warrior skill.
    learnBasic(h, 'taunt', 4);
    expect(codes(h.plan({ type: 'learnSkill', skillId: 'assault', part: 'adept' }))).toEqual([
      'NOT_ENOUGH_AP',
    ]);
  });

  it('adept needs basic level 1 (Q-SKL-1)', () => {
    const h = rich();
    expect(
      errors(h.plan({ type: 'learnSkill', skillId: 'assault', part: 'adept' })),
    ).toContainEqual({
      code: 'PREREQ_NOT_MET',
      message: 'Needs Assault level 1.',
      ruleId: 'SKL-PREREQ',
    });
  });

  describe('teacher rule (Q-SKL-4, Q-MULTI-6)', () => {
    it('needs a teacher for level 1 of a basic or standalone skill, not for later levels', () => {
      const h = rich();
      expect(errors(h.plan({ type: 'learnSkill', skillId: 'assault', part: 'basic' }))).toEqual([
        {
          code: 'TEACHER_REQUIRED',
          message: 'A teacher is needed to learn Assault level 1.',
          ruleId: 'SKL-LEARN',
        },
      ]);
      learnBasic(h, 'assault', 3);
      expect(h.plan({ type: 'learnSkill', skillId: 'assault', part: 'basic' }).ok).toBe(true);
      expect(codes(h.plan({ type: 'learnSkill', skillId: 'resilience', part: 'main' }))).toEqual([
        'TEACHER_REQUIRED',
      ]);
    });

    it('adept and advanced of a known skill can be self-taught', () => {
      const h = rich();
      learnBasic(h, 'assault', 4);
      expect(h.plan({ type: 'learnSkill', skillId: 'assault', part: 'adept' }).ok).toBe(true);
      expect(h.plan({ type: 'learnSkill', skillId: 'assault', part: 'advanced' }).ok).toBe(true);
    });

    it('every mastery needs a teacher', () => {
      const h = rich();
      learnBasic(h, 'assault', 9);
      expect(codes(h.plan({ type: 'learnSkill', skillId: 'assault', part: 'mastery' }))).toEqual([
        'TEACHER_REQUIRED',
      ]);
      expect(
        h.plan({ type: 'learnSkill', skillId: 'assault', part: 'mastery', teacher: 'Hal' }).ok,
      ).toBe(true);
    });
  });

  describe('mastery prerequisite and refunds', () => {
    it('mastery needs basic level 9', () => {
      const h = rich();
      learnBasic(h, 'assault', 8);
      expect(
        errors(h.plan({ type: 'learnSkill', skillId: 'assault', part: 'mastery', teacher: 'Hal' })),
      ).toEqual([
        { code: 'PREREQ_NOT_MET', message: 'Needs Assault level 9.', ruleId: 'SKL-MASTERY' },
      ]);
    });

    it('a refund is blocked while the mastery depends on the level, then allowed', () => {
      const h = rich();
      learnBasic(h, 'assault', 9);
      h.run({ type: 'learnSkill', skillId: 'assault', part: 'mastery', teacher: 'Hal' });
      const blocked = h.plan({
        type: 'refundSkill',
        skillId: 'assault',
        part: 'basic',
        reason: 'Entered one level too many',
      });
      expect(codes(blocked)).toEqual(['REFUND_BLOCKED']);
      expect(errors(blocked)[0]?.message).toBe(
        'Assault Mastery depends on it (needs Assault level 9). Refund that first.',
      );
      h.run({
        type: 'refundSkill',
        skillId: 'assault',
        part: 'mastery',
        reason: 'Teacher was not a master',
      });
      expect(h.sheet().points.ap['warrior']?.spent).toBe(0);
      h.run({
        type: 'refundSkill',
        skillId: 'assault',
        part: 'basic',
        reason: 'One level too many',
      });
      const sheet = h.sheet();
      expect(
        sheet.skills.find((s) => s.skillId === 'assault')?.parts.map((p) => [p.part, p.level]),
      ).toEqual([['basic', 8]]);
      expect(sheet.points.cxp.spent).toBe(360);
      expect(sheet.points.ap['warrior']?.earned).toBe(36);
    });

    it('a refund is blocked when the AP it earned is already spent', () => {
      const h = rich();
      learnBasic(h, 'assault', 3); // 6 Warrior AP
      h.run({ type: 'learnSkill', skillId: 'assault', part: 'adept' }); // 3 AP
      h.run({ type: 'learnSkill', skillId: 'toughness-warrior', part: 'main', teacher: 'J' }); // 3 AP
      const blocked = h.plan({
        type: 'refundSkill',
        skillId: 'assault',
        part: 'basic',
        reason: 'x',
      });
      expect(errors(blocked)).toEqual([
        {
          code: 'REFUND_BLOCKED_AP',
          message: 'Refunding would leave Warrior AP at -3. Refund Warrior archetype skills first.',
          ruleId: 'PTS-AP-SPEND',
        },
      ]);
    });

    it('refunds need a reason and a lower level', () => {
      const h = rich();
      learnBasic(h, 'assault', 2);
      expect(codes(h.plan({ type: 'refundSkill', skillId: 'assault', part: 'basic' }))).toEqual([
        'REASON_REQUIRED',
      ]);
      expect(
        codes(
          h.plan({
            type: 'refundSkill',
            skillId: 'assault',
            part: 'basic',
            toLevel: 2,
            reason: 'x',
          }),
        ),
      ).toEqual(['REFUND_LEVEL']);
      expect(
        codes(h.plan({ type: 'refundSkill', skillId: 'bash', part: 'basic', reason: 'x' })),
      ).toEqual(['NOT_OWNED']);
      const ok = h.plan({
        type: 'refundSkill',
        skillId: 'assault',
        part: 'basic',
        toLevel: 0,
        reason: 'Wrong character',
      });
      expect(ok.ok && ok.actions[0]?.payload).toEqual({
        skillId: 'assault',
        part: 'basic',
        toLevel: 0,
        reason: 'Wrong character',
        refund: { currency: 'cxp', amount: 30 },
      });
    });
  });

  describe('multi-archetype skills [MULTI-RULE]', () => {
    it('Bardic Performance bought in Magic earns and spends Magic AP and keeps that archetype', () => {
      const h = rich();
      expect(
        errors(
          h.plan({
            type: 'learnSkill',
            skillId: 'bardic-performance',
            part: 'basic',
            teacher: 'Lark',
          }),
        ),
      ).toEqual([
        {
          code: 'ARCHETYPE_REQUIRED',
          message: 'Choose the archetype for Bardic Performance: Utility or Magic.',
          ruleId: 'MULTI-RULE',
        },
      ]);
      expect(
        codes(
          h.plan({
            type: 'learnSkill',
            skillId: 'bardic-performance',
            part: 'basic',
            teacher: 'Lark',
            archetype: 'warrior',
          }),
        ),
      ).toEqual(['ARCHETYPE_INVALID']);
      const first = h.run({
        type: 'learnSkill',
        skillId: 'bardic-performance',
        part: 'basic',
        toLevel: 3,
        teacher: 'Lark',
        archetype: 'magic',
      });
      expect((first[0]?.payload as { archetype?: string }).archetype).toBe('magic');
      expect(h.sheet().points.ap['magic']?.earned).toBe(6);
      expect(h.sheet().points.ap['utility']?.earned).toBe(0);

      expect(
        codes(
          h.plan({
            type: 'learnSkill',
            skillId: 'bardic-performance',
            part: 'basic',
            archetype: 'utility',
          }),
        ),
      ).toEqual(['ARCHETYPE_LOCKED']);
      h.run({ type: 'learnSkill', skillId: 'bardic-performance', part: 'adept' });
      h.run({
        type: 'learnSkill',
        skillId: 'bardic-performance-memorization',
        part: 'main',
        teacher: 'Lark',
      });
      const sheet = h.sheet();
      expect(sheet.points.ap['magic']).toEqual({ earned: 6, spent: 4, available: 2 });
      const bard = sheet.skills.find((s) => s.skillId === 'bardic-performance');
      expect(bard).toMatchObject({ archetype: 'magic', archetypeChosen: true });
      expect(
        sheet.skills.find((s) => s.skillId === 'bardic-performance-memorization')?.archetype,
      ).toBe('magic');
      expect(sheet.stats.totals['performanceSlots']).toBe(3);
    });

    it('Bardic Performance Memorization needs Bardic Performance first', () => {
      const h = rich();
      expect(
        errors(
          h.plan({
            type: 'learnSkill',
            skillId: 'bardic-performance-memorization',
            part: 'main',
            teacher: 'Lark',
          }),
        ),
      ).toEqual([
        {
          code: 'PREREQ_NOT_MET',
          message: 'Needs Bardic Performance level 1.',
          ruleId: 'SKL-PREREQ',
        },
      ]);
    });

    it('Ritualism counts the four crafts and schools only (Q-MULTI-3) and needs a teacher', () => {
      const h = rich();
      learnBasic(h, 'chemistry', 6);
      learnBasic(h, 'efficient-crafting', 6);
      learnBasic(h, 'life-magic', 6);
      const missing = h.plan({
        type: 'learnSkill',
        skillId: 'ritualism',
        part: 'main',
        archetype: 'crafting',
        teacher: 'Sage',
      });
      expect(codes(missing)).toEqual(['PREREQ_NOT_MET']);
      expect(errors(missing)[0]?.ruleId).toBe('MULTI-COG');
      learnBasic(h, 'medicine', 6);
      expect(
        codes(
          h.plan({ type: 'learnSkill', skillId: 'ritualism', part: 'main', archetype: 'crafting' }),
        ),
      ).toEqual(['TEACHER_REQUIRED']);
      const ok = h.run({
        type: 'learnSkill',
        skillId: 'ritualism',
        part: 'main',
        archetype: 'crafting',
        teacher: 'Sage',
      });
      expect(ok[0]?.payload).toMatchObject({
        archetype: 'crafting',
        cost: { currency: 'ap', amount: 10 },
      });
    });

    it('a meditation skill is paid from an archetype used for its prerequisite', () => {
      const h = rich();
      learnBasic(h, 'assault', 6);
      learnBasic(h, 'bash', 6);
      learnBasic(h, 'life-magic', 6);
      const wrong = h.plan({
        type: 'learnSkill',
        skillId: 'meditation-skill-refresh',
        part: 'main',
        archetype: 'defender',
        teacher: 'Monk',
      });
      expect(codes(wrong)).toEqual(['ARCHETYPE_INVALID', 'NOT_ENOUGH_AP']);
      expect(errors(wrong)[0]?.message).toContain('Warrior or Magic');
      expect(
        h.plan({
          type: 'learnSkill',
          skillId: 'meditation-skill-refresh',
          part: 'main',
          archetype: 'warrior',
          teacher: 'Monk',
        }).ok,
      ).toBe(true);
    });

    it('a single-archetype skill rejects another archetype', () => {
      const h = rich();
      expect(
        codes(
          h.plan({
            type: 'learnSkill',
            skillId: 'assault',
            part: 'basic',
            teacher: 'J',
            archetype: 'magic',
          }),
        ),
      ).toEqual(['ARCHETYPE_INVALID']);
    });
  });

  it('rejects an unknown skill or part', () => {
    const h = rich();
    expect(
      codes(h.plan({ type: 'learnSkill', skillId: 'flying', part: 'basic', teacher: 'J' })),
    ).toEqual(['UNKNOWN_SKILL']);
    expect(
      codes(h.plan({ type: 'learnSkill', skillId: 'resilience', part: 'basic', teacher: 'J' })),
    ).toEqual(['UNKNOWN_PART']);
  });
});
