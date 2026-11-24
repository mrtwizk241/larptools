// skill.refunded: staff correction that lowers a skill part's level, with a reason.
// CXP and AP come back because totals are recomputed from levels.
import { z } from 'zod';
import { setSkillLevel, warn } from '../derive/draft.ts';
import { SkillPartSchema } from '../model.ts';
import { getLevel } from '../rules/levels.ts';
import { partName } from '../rules/prereqs.ts';
import { defineAction, ReasonSchema, RefIdSchema } from './define.ts';

export const SkillRefundedPayload = z.object({
  skillId: RefIdSchema,
  part: SkillPartSchema,
  toLevel: z.int().min(0).max(1000),
  reason: ReasonSchema,
  /** Amount returned, for reading history. */
  refund: z.object({ currency: z.enum(['cxp', 'ap']), amount: z.int().min(0) }).optional(),
});
export type SkillRefundedPayload = z.infer<typeof SkillRefundedPayload>;

export const skillRefunded = defineAction({
  type: 'skill.refunded',
  payload: SkillRefundedPayload,
  apply(draft, p, action) {
    const rs = draft.ruleset;
    const def = rs.skillsById[p.skillId]?.parts[p.part];
    if (!def) {
      warn(
        draft,
        action.id,
        'UNKNOWN_SKILL',
        `Unknown skill part "${p.skillId}" ${p.part}; skipped.`,
      );
      return;
    }
    const current = getLevel(draft.skills, p.skillId, p.part);
    if (p.toLevel >= current) {
      warn(
        draft,
        action.id,
        'REFUND_LEVEL',
        `${partName(rs, p.skillId, p.part)} is level ${current}; a refund to ${p.toLevel} changes nothing.`,
      );
      return;
    }
    setSkillLevel(draft, p.skillId, p.part, def.costKind, p.toLevel, null);
    if (p.toLevel === 0) draft.teachers.delete(`${p.skillId}:${p.part}`);
  },
});
