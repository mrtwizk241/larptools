// Readable rule errors and notices returned by plan() and preview().

/** A rule that blocks a command. `code` is stable; `message` is plain English for staff. */
export interface RuleError {
  /** Stable machine code, for example `NOT_ENOUGH_XP`. */
  readonly code: string;
  /** Plain English, for example "Not enough XP: needs 40, 25 left." */
  readonly message: string;
  /** Rules spec id, for example `SKL-COST`. */
  readonly ruleId: string;
}

/** Something staff should know about a command that still went through (a clamp, a warning). */
export interface Notice {
  readonly code: string;
  readonly message: string;
  readonly ruleId?: string;
}

export function ruleError(code: string, message: string, ruleId: string): RuleError {
  return { code, message, ruleId };
}

export function notice(code: string, message: string, ruleId?: string): Notice {
  return ruleId === undefined ? { code, message } : { code, message, ruleId };
}

/** Rule ids used for checks that come from an ADR or the engine rather than the rules spec. */
export const RULE_IDS = {
  roles: 'ADR-0003-ROLES',
  command: 'ENGINE-COMMAND',
} as const;
