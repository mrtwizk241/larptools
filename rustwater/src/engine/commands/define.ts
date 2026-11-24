// Command plumbing: the context plan() runs in, the action builder, and how a command type
// plugs into the registry. Add a command by adding a file that calls defineCommand() and
// listing it in registry.ts.
import type { z } from 'zod';
import type { Ruleset } from '../../data/index.ts';
import { getActionDefinition } from '../actions/registry.ts';
import type { Notice, RuleError } from '../errors.ts';
import { ActionSchema, formatIssues, type Action, type ActionType } from '../model.ts';
import type { Award, Cost, Sheet } from '../sheet.ts';

export interface PlanContext {
  readonly actor: Action['actor'];
  /** Current time as an ISO 8601 string with offset, for example `new Date().toISOString()`. */
  now(): string;
  /** A fresh unique action id (uuid in the app). */
  newId(): string;
  /** Seq for the first new action, normally sheet.lastSeq + 1. */
  readonly nextSeq: number;
}

export type PlanResult =
  | { readonly ok: true; readonly actions: Action[]; readonly notices: Notice[] }
  | { readonly ok: false; readonly errors: RuleError[] };

export interface PreviewResult {
  /** True when the command would pass, ignoring inputs not filled in yet (teacher, reason). */
  readonly allowed: boolean;
  /** What the command costs (CXP, AP, LXP, Shinies). */
  readonly cost?: Cost;
  /** What a refund returns. */
  readonly refund?: Cost;
  /** Check-in: the awards that would be credited. */
  readonly awards?: readonly Award[];
  /** Check-in: item rewards handed out, as text. */
  readonly owed?: readonly string[];
  /** Learn: a teacher must be named before this can be recorded. */
  readonly teacherRequired?: boolean;
  /** Retire: what the next character would carry over. */
  readonly carry?: { readonly cxp: number; readonly fp: number; readonly shinies: number };
  /** Plain-English reasons it is not allowed (messages of `errors`). */
  readonly reasons: string[];
  readonly errors: RuleError[];
  readonly notices: Notice[];
}

/** What a command's evaluate() reports besides the actions it added. */
export interface Evaluation {
  errors: RuleError[];
  notices: Notice[];
  cost?: Cost;
  refund?: Cost;
  awards?: Award[];
  owed?: string[];
  teacherRequired?: boolean;
  carry?: { cxp: number; fp: number; shinies: number };
}

export interface AddOptions {
  readonly eventKey?: string | undefined;
  readonly causedBy?: string | undefined;
  readonly note?: string | undefined;
}

/** Collects new actions with ids, seq numbers, actor, and one shared timestamp. */
export interface Builder {
  readonly actions: Action[];
  add(type: ActionType, payload: unknown, options?: AddOptions): Action;
}

export class PlanInvariantError extends Error {
  override name = 'PlanInvariantError';
}

export function createBuilder(ctx: PlanContext): Builder {
  const at = ctx.now();
  const actions: Action[] = [];
  return {
    actions,
    add(type, payload, options = {}) {
      const def = getActionDefinition(type);
      if (!def) throw new PlanInvariantError(`no handler for planned action ${type}`);
      const parsed = def.payload.safeParse(payload);
      if (!parsed.success)
        throw new PlanInvariantError(
          `planned ${type} payload is invalid: ${formatIssues(parsed.error.issues).join('; ')}`,
        );
      const action: Action = {
        id: ctx.newId(),
        seq: ctx.nextSeq + actions.length,
        at,
        actor: ctx.actor.name === undefined ? { role: ctx.actor.role } : { ...ctx.actor },
        type,
        payload,
        ...(options.eventKey !== undefined ? { eventKey: options.eventKey } : {}),
        ...(options.causedBy !== undefined ? { causedBy: options.causedBy } : {}),
        ...(options.note !== undefined && options.note !== '' ? { note: options.note } : {}),
      };
      const envelope = ActionSchema.safeParse(action);
      if (!envelope.success)
        throw new PlanInvariantError(
          `planned ${type} action is invalid: ${formatIssues(envelope.error.issues).join('; ')}`,
        );
      actions.push(action);
      return action;
    },
  };
}

export interface CommandDefinition<C> {
  readonly type: string;
  readonly schema: z.ZodType<C>;
  /** False only for createCharacter. */
  readonly requiresCharacter: boolean;
  evaluate(ruleset: Ruleset, sheet: Sheet, command: C, builder: Builder): Evaluation;
  /** True when the command may still run on a retired character (notes, owed delivery). */
  allowedWhenRetired?(command: C): boolean;
}

export interface RegisteredCommand {
  readonly type: string;
  readonly schema: z.ZodType<unknown>;
  readonly requiresCharacter: boolean;
  evaluate(ruleset: Ruleset, sheet: Sheet, command: unknown, builder: Builder): Evaluation;
  allowedWhenRetired(command: unknown): boolean;
}

export function defineCommand<C>(
  def: Omit<CommandDefinition<C>, 'requiresCharacter'> & { requiresCharacter?: boolean },
): RegisteredCommand {
  return {
    type: def.type,
    schema: def.schema,
    requiresCharacter: def.requiresCharacter ?? true,
    evaluate: (rs, sheet, cmd, b) => def.evaluate(rs, sheet, cmd as C, b),
    allowedWhenRetired: (cmd) => def.allowedWhenRetired?.(cmd as C) ?? false,
  };
}

export function evaluation(): Evaluation {
  return { errors: [], notices: [] };
}
