// skill.learned and skill.refunded ([SKL-COST], [SKL-TECH], [SKL-LOG], [CALL-COST]).
// Replay applies the step and moves XP and CXP spent by the stored `cost` and `refund`, so
// history keeps the prices paid when the ruleset's table changes (SPEC "Character model"); a
// stored amount that differs from the current table adds a warning.
import { z } from 'zod';
import { ownedOf, setSkill, teachingKey, warn, warnPriceDiffers } from '../derive/draft.ts';
import { IdSchema, SkillStepSchema, stepLabel } from '../model.ts';
import { skillCurrency } from '../rules/costs.ts';
import { applyStep, refundableSteps, removeStep, stepOrderProblem } from '../rules/skills.ts';
import {
  defineAction,
  ReasonSchema,
  RefIdSchema,
  ShortTextSchema,
  SkillCurrencySchema,
} from './define.ts';

export const SkillLearnedPayload = z.object({
  skillId: RefIdSchema,
  step: SkillStepSchema,
  /** xp, or cxp for Calling skills. */
  currency: SkillCurrencySchema,
  /** Price paid for this step, for reading history. */
  cost: z.int().min(0),
  teacher: ShortTextSchema.optional(),
  /** The mt.spent teaching purchase used instead of a teacher. */
  viaMt: IdSchema.optional(),
  atCreation: z.boolean(),
});
export type SkillLearnedPayload = z.infer<typeof SkillLearnedPayload>;

export const skillLearned = defineAction({
  type: 'skill.learned',
  payload: SkillLearnedPayload,
  apply(draft, p, action) {
    const rs = draft.ruleset;
    const skill = rs.skillsById[p.skillId];
    if (!skill) {
      warn(draft, action.id, 'UNKNOWN_SKILL', `Unknown skill "${p.skillId}"; skipped.`);
      return;
    }
    const owned = ownedOf(draft, skill.id);
    const problem = stepOrderProblem(rs, owned, p.step);
    if (problem) {
      warn(
        draft,
        action.id,
        'STEP_ORDER',
        `${skill.name} ${stepLabel(p.step)}: ${problem.message} Skipped.`,
      );
      return;
    }
    const currency = skillCurrency(skill);
    if (p.currency !== currency)
      warn(
        draft,
        action.id,
        'CURRENCY_MISMATCH',
        `${skill.name} is paid in ${currency.toUpperCase()}, not ${p.currency.toUpperCase()}.`,
      );
    const table = setSkill(draft, skill.id, applyStep(owned, p.step), p.cost);
    warnPriceDiffers(draft, action, `${skill.name} ${stepLabel(p.step)}`, p.cost, table, currency);
    const eventKey = action.eventKey ?? null;
    const key = teachingKey(p.step);
    if (key)
      draft.skills.get(skill.id)?.teaching.set(key, {
        teacher: p.teacher ? p.teacher : null,
        viaMt: p.viaMt ?? null,
        eventKey,
        atCreation: p.atCreation,
        actionId: action.id,
      });
    if (p.viaMt !== undefined) {
      const purchase = draft.mtPurchases.find((m) => m.actionId === p.viaMt);
      if (!purchase)
        warn(draft, action.id, 'MT_TEACHING_NOT_FOUND', 'The Mist Token teaching was not found.');
      else if (purchase.usedBy !== null)
        warn(draft, action.id, 'MT_TEACHING_USED', 'That Mist Token teaching was already used.');
      else purchase.usedBy = action.id;
    }
    draft.learningLog.push({
      actionId: action.id,
      at: action.at,
      eventKey,
      skillId: skill.id,
      step: p.step,
      currency,
      cost: p.cost,
      teacher: p.teacher ? p.teacher : null,
      viaMt: p.viaMt ?? null,
      atCreation: p.atCreation,
    });
  },
});

export const SkillRefundedPayload = z.object({
  skillId: RefIdSchema,
  /** The top level or the top Technique. */
  step: SkillStepSchema,
  reason: ReasonSchema,
  /** Amount returned, for reading history. */
  refund: z.object({ currency: SkillCurrencySchema, amount: z.int().min(0) }),
});
export type SkillRefundedPayload = z.infer<typeof SkillRefundedPayload>;

function sameStep(a: z.infer<typeof SkillStepSchema>, b: z.infer<typeof SkillStepSchema>) {
  if ('level' in a) return 'level' in b && a.level === b.level;
  return 'technique' in b && a.technique === b.technique;
}

export const skillRefunded = defineAction({
  type: 'skill.refunded',
  payload: SkillRefundedPayload,
  apply(draft, p, action) {
    const rs = draft.ruleset;
    const skill = rs.skillsById[p.skillId];
    if (!skill) {
      warn(draft, action.id, 'UNKNOWN_SKILL', `Unknown skill "${p.skillId}"; skipped.`);
      return;
    }
    const owned = ownedOf(draft, skill.id);
    if (!refundableSteps(rs, owned).some((s) => sameStep(s, p.step))) {
      warn(
        draft,
        action.id,
        'REFUND_STEP',
        `${skill.name} ${stepLabel(p.step)} is not the top level or Technique; skipped.`,
      );
      return;
    }
    const key = teachingKey(p.step);
    if (key) draft.skills.get(skill.id)?.teaching.delete(key);
    const table = -setSkill(draft, skill.id, removeStep(owned, p.step), -p.refund.amount);
    warnPriceDiffers(
      draft,
      action,
      `${skill.name} ${stepLabel(p.step)}`,
      p.refund.amount,
      table,
      skillCurrency(skill),
    );
    draft.refunds.push({
      actionId: action.id,
      at: action.at,
      skillId: skill.id,
      step: p.step,
      reason: p.reason,
      refund: { currency: skillCurrency(skill), amount: p.refund.amount },
    });
  },
});
