// refundSkill: Unlearn or a staff correction takes back the top level or the top Technique of
// one skill, with a reason; the XP (or CXP for Calling skills, locked ones included) comes back
// ([MAG-RIT] Unlearn, [CALL-CHANGE]). The refund is the price stored when that step was learned
// (the latest skill.learned for it), so a later change to the cost table never changes it; the
// table price is the fallback when no purchase is on the log.
import { z } from 'zod';
import { RefIdSchema } from '../actions/define.ts';
import { notice, ruleError } from '../errors.ts';
import { EventKeySchema, SkillStepSchema, stepLabel, type SkillStep } from '../model.ts';
import type { Sheet } from '../sheet.ts';
import { skillCurrency, stepCost } from '../rules/costs.ts';
import { checkPrereqs, refundableSteps, removeStep } from '../rules/skills.ts';
import { defineCommand, evaluation } from './define.ts';
import { OptionalText, orList, ownedFromSheet } from './helpers.ts';

export const RefundSkillCommand = z.object({
  type: z.literal('refundSkill'),
  skillId: RefIdSchema,
  /** The top level or the top Technique. */
  step: SkillStepSchema,
  reason: OptionalText,
  eventKey: EventKeySchema.optional(),
  note: OptionalText,
});
export type RefundSkillCommand = z.input<typeof RefundSkillCommand>;

function sameStep(a: SkillStep, b: SkillStep): boolean {
  if ('level' in a) return 'level' in b && a.level === b.level;
  return 'technique' in b && a.technique === b.technique;
}

/** The price paid for the step as it is owned now: the latest purchase of it on the log. */
export function storedStepCost(sheet: Sheet, skillId: string, step: SkillStep): number | null {
  for (let i = sheet.learningLog.length - 1; i >= 0; i -= 1) {
    const entry = sheet.learningLog[i]!;
    if (entry.skillId === skillId && sameStep(entry.step, step)) return entry.cost;
  }
  return null;
}

export const refundSkill = defineCommand<z.output<typeof RefundSkillCommand>>({
  type: 'refundSkill',
  schema: RefundSkillCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const skill = ruleset.skillsById[cmd.skillId];
    if (!skill) {
      ev.errors.push(ruleError('UNKNOWN_SKILL', `Unknown skill "${cmd.skillId}".`, 'SKL-LEVELS'));
      return ev;
    }
    const owned = ownedFromSheet(sheet);
    const current = owned(skill.id);
    if (current.level === 0) {
      ev.errors.push(ruleError('NOT_OWNED', `${skill.name} is not on the sheet.`, 'SKL-LEVELS'));
      return ev;
    }
    const allowed = refundableSteps(ruleset, current);
    if (!allowed.some((s) => sameStep(s, cmd.step))) {
      ev.errors.push(
        ruleError(
          'REFUND_NOT_TOP',
          `Only the top level or the top Technique can be taken back: ${orList(allowed.map(stepLabel))} of ${skill.name}.`,
          'MAG-RIT',
        ),
      );
      return ev;
    }
    const reason = cmd.reason ?? '';
    if (reason === '')
      ev.errors.push(ruleError('REASON_REQUIRED', 'A refund needs a reason.', 'MAG-RIT'));
    const refund = {
      currency: skillCurrency(skill),
      amount: storedStepCost(sheet, skill.id, cmd.step) ?? stepCost(ruleset, cmd.step),
    };
    ev.refund = refund;

    // Advanced skills that would lose a prerequisite stay, but cannot advance.
    const after = removeStep(current, cmd.step);
    const lookupAfter = (id: string) => (id === skill.id ? after : owned(id));
    for (const s of sheet.skills) {
      const adv = ruleset.skillsById[s.skillId];
      if (!adv?.advanced || adv.id === skill.id) continue;
      if (checkPrereqs(ruleset, adv, owned).ok && !checkPrereqs(ruleset, adv, lookupAfter).ok)
        ev.notices.push(
          notice(
            'PREREQ_LOST',
            `${adv.name} loses a prerequisite; it stays but cannot advance until it is met again.`,
            'SKL-ADV',
          ),
        );
    }
    if (after.level === 0 && after.techniques.length === 0)
      ev.notices.push(notice('SKILL_REMOVED', `${skill.name} leaves the sheet.`, 'MAG-RIT'));
    if (ev.errors.length > 0) return ev;
    builder.add(
      'skill.refunded',
      { skillId: skill.id, step: cmd.step, reason, refund },
      { eventKey: cmd.eventKey, note: cmd.note },
    );
    return ev;
  },
});
