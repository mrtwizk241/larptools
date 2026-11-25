// plan(): validate a command against the sheet and return the actions to append, or readable
// errors. preview(): the same check without an actor, for labelling buttons.
import type { SyRuleset } from '../../data/index.ts';
import { RULE_IDS, ruleError, type Notice, type RuleError } from '../errors.ts';
import { formatIssues, type Action } from '../model.ts';
import type { Sheet } from '../sheet.ts';
import {
  createBuilder,
  PlanInvariantError,
  type Evaluation,
  type PlanContext,
  type PlanResult,
  type PreviewResult,
} from './define.ts';
import { getCommandDefinition, type Command } from './registry.ts';

/** Errors that only mean "an input is not filled in yet"; preview() does not count them. */
const PREVIEW_IGNORED: ReadonlySet<string> = new Set([
  'TEACHER_REQUIRED',
  'REASON_REQUIRED',
  'CHOICE_REQUIRED',
  'EVENT_REQUIRED',
  'EVENT_LIST_REQUIRED',
]);

function run(
  ruleset: SyRuleset,
  sheet: Sheet,
  command: Command,
  ctx: PlanContext,
): Evaluation & { actions: Action[] } {
  const fail = (...errors: RuleError[]) => ({ errors, notices: [] as Notice[], actions: [] });
  const type = (command as { type?: unknown } | null)?.type;
  const def = getCommandDefinition(type);
  if (!def)
    return fail(
      ruleError('INVALID_COMMAND', `Unknown command "${String(type)}".`, RULE_IDS.command),
    );
  const parsed = def.schema.safeParse(command);
  if (!parsed.success)
    return fail(
      ...formatIssues(parsed.error.issues).map((m) =>
        ruleError('INVALID_COMMAND', m, RULE_IDS.command),
      ),
    );
  if (def.requiresCharacter && !sheet.created)
    return fail(ruleError('NO_CHARACTER', 'Create the character first.', RULE_IDS.command));
  if (!def.requiresCharacter && sheet.created)
    return fail(ruleError('ALREADY_CREATED', 'This character already exists.', RULE_IDS.command));
  if (sheet.retired !== null && !def.allowedWhenRetired(parsed.data))
    return fail(ruleError('CHARACTER_RETIRED', 'This character is retired.', 'RET-CHOICE'));
  const builder = createBuilder(ctx);
  try {
    const ev = def.evaluate(ruleset, sheet, parsed.data, builder);
    return { ...ev, actions: ev.errors.length > 0 ? [] : builder.actions };
  } catch (error) {
    const message =
      error instanceof PlanInvariantError || error instanceof Error ? error.message : String(error);
    return fail(ruleError('INTERNAL_ERROR', `Engine error: ${message}`, RULE_IDS.command));
  }
}

/**
 * Validates `command` for the character in `sheet` and returns the actions to append (with ids
 * and seq numbers from `ctx`) or every rule it breaks. Only staff may run commands; players act
 * through requests and the use tracker.
 */
export function plan(
  ruleset: SyRuleset,
  sheet: Sheet,
  command: Command,
  ctx: PlanContext,
): PlanResult {
  if (ctx.actor.role !== 'staff')
    return {
      ok: false,
      errors: [
        ruleError(
          'ROLE_NOT_ALLOWED',
          'Only staff can change a character. Players send a request instead.',
          RULE_IDS.roles,
        ),
      ],
    };
  const r = run(ruleset, sheet, command, ctx);
  if (r.errors.length > 0) return { ok: false, errors: r.errors };
  return { ok: true, actions: r.actions, notices: r.notices };
}

/**
 * What a command would cost and whether it is allowed, for labels such as "Next level: 20 XP"
 * or "Needs Toughness level 6". Ignores the actor, and inputs not filled in yet (reason,
 * choices, event), so a button can be labelled before those are typed. `playground` checks as
 * the build playground plans (PlanContext.playground).
 */
export function preview(
  ruleset: SyRuleset,
  sheet: Sheet,
  command: Command,
  options: { readonly playground?: boolean } = {},
): PreviewResult {
  let n = 0;
  const ctx: PlanContext = {
    actor: { role: 'staff' },
    now: () => '2000-01-01T00:00:00.000Z',
    newId: () => `preview-${++n}`,
    nextSeq: sheet.lastSeq + 1,
    playground: options.playground === true,
  };
  const r = run(ruleset, sheet, command, ctx);
  const errors = r.errors.filter((e) => !PREVIEW_IGNORED.has(e.code));
  return {
    allowed: errors.length === 0,
    ...(r.cost ? { cost: r.cost } : {}),
    ...(r.refund ? { refund: r.refund } : {}),
    ...(r.awards ? { awards: r.awards } : {}),
    ...(r.notCredited ? { notCredited: r.notCredited } : {}),
    ...(r.teacherRequired !== undefined ? { teacherRequired: r.teacherRequired } : {}),
    ...(r.carry ? { carry: r.carry } : {}),
    reasons: errors.map((e) => e.message),
    errors,
    notices: r.notices,
  };
}
