// checkRequest: for the staff inbox, whether a learn-skill request can still be approved on this
// sheet and what it would cost. Runs approveRequest through preview().
import type { SyRuleset } from '../../data/index.ts';
import { ruleError, type RuleError } from '../errors.ts';
import type { Request } from '../model.ts';
import type { Cost, Sheet } from '../sheet.ts';
import { preview } from './plan.ts';

export interface RequestCheck {
  /** True when approving now would pass every rule. */
  readonly valid: boolean;
  /** Set when this log already holds a decision for the request. */
  readonly decided: 'approved' | 'rejected' | null;
  /** XP or CXP the approval would spend. */
  readonly cost?: Cost;
  readonly teacherRequired: boolean;
  readonly reasons: readonly string[];
  readonly errors: readonly RuleError[];
}

/**
 * For the staff inbox: whether `request` can still be approved on this sheet and what it costs.
 * A missing teacher counts as invalid here (the request itself names the teacher).
 */
export function checkRequest(ruleset: SyRuleset, sheet: Sheet, request: Request): RequestCheck {
  const decided = sheet.requestDecisions.find((d) => d.requestId === request.id)?.status ?? null;
  const p = preview(ruleset, sheet, { type: 'approveRequest', request });
  const errors = [...p.errors];
  if (p.teacherRequired === true && request.teacher.trim() === '')
    errors.push(ruleError('TEACHER_REQUIRED', 'The request names no teacher.', 'SKL-TEACH'));
  return {
    valid: errors.length === 0,
    decided,
    ...(p.cost ? { cost: p.cost } : {}),
    teacherRequired: p.teacherRequired ?? false,
    reasons: errors.map((e) => e.message),
    errors,
  };
}
