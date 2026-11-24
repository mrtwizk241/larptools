// plan(): validate a command against the sheet and return the actions to append, or readable
// errors. preview(): the same check without an actor, for labelling buttons.
import type { Ruleset } from '../../data/index.ts';
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
]);

function run(
  ruleset: Ruleset,
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
    return fail(ruleError('CHARACTER_RETIRED', 'This character is retired.', 'PTS-RETIRE'));
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
 * Commands a player may run on their own character without a request: naming a familiar and
 * spending FP and Essence on it (Robert, 2026-11-08: these need no teacher or approval).
 */
export const PLAYER_COMMANDS: ReadonlySet<string> = new Set([
  'bondFamiliar',
  'renameFamiliar',
  'awakenFamiliar',
  'levelFamiliar',
  'learnFamiliarSkill',
  'unlockFamiliarSlot',
  'forgetFamiliarSkill',
]);

/** The teacher recorded in a test build when none is typed (ADR 0007). */
export const TEST_BUILD_TEACHER = 'Test build';

export interface PlanOptions {
  /**
   * The character is its owner's private test build (ADR 0007): the player may run every
   * command, as staff can, and a missing teacher is recorded as TEST_BUILD_TEACHER. The server
   * sets this only for the owner's own test builds.
   */
  readonly testBuild?: boolean;
}

/**
 * Validates `command` for the character in `sheet` and returns the actions to append (with ids
 * and seq numbers from `ctx`) or every rule it breaks. Only staff may run commands; players act
 * through requests and the use tracker, except in their own test builds (`options.testBuild`).
 */
export function plan(
  ruleset: Ruleset,
  sheet: Sheet,
  command: Command,
  ctx: PlanContext,
  options: PlanOptions = {},
): PlanResult {
  const testBuild = options.testBuild === true;
  const playerMay = ctx.actor.role === 'player' && (testBuild || PLAYER_COMMANDS.has(command.type));
  if (ctx.actor.role !== 'staff' && !playerMay)
    return {
      ok: false,
      errors: [
        ruleError(
          'ROLE_NOT_ALLOWED',
          'Only staff can make this change. Players send a request instead.',
          RULE_IDS.roles,
        ),
      ],
    };
  let r = run(ruleset, sheet, command, ctx);
  if (testBuild && r.errors.some((e) => e.code === 'TEACHER_REQUIRED'))
    r = run(ruleset, sheet, { ...command, teacher: TEST_BUILD_TEACHER } as Command, ctx);
  if (r.errors.length > 0) return { ok: false, errors: r.errors };
  return { ok: true, actions: r.actions, notices: r.notices };
}

/**
 * What a command would cost and whether it is allowed, for labels such as "Next level: 40 CXP"
 * or "Needs Assault level 9". Ignores the actor, and ignores a missing teacher or reason (see
 * `teacherRequired`), so a button can be labelled before those are typed.
 */
export function preview(ruleset: Ruleset, sheet: Sheet, command: Command): PreviewResult {
  let n = 0;
  const ctx: PlanContext = {
    actor: { role: 'staff' },
    now: () => '2000-01-01T00:00:00.000Z',
    newId: () => `preview-${++n}`,
    nextSeq: sheet.lastSeq + 1,
  };
  const r = run(ruleset, sheet, command, ctx);
  const errors = r.errors.filter((e) => !PREVIEW_IGNORED.has(e.code));
  return {
    allowed: errors.length === 0,
    ...(r.cost ? { cost: r.cost } : {}),
    ...(r.refund ? { refund: r.refund } : {}),
    ...(r.awards ? { awards: r.awards } : {}),
    ...(r.owed ? { owed: r.owed } : {}),
    ...(r.teacherRequired !== undefined ? { teacherRequired: r.teacherRequired } : {}),
    ...(r.carry ? { carry: r.carry } : {}),
    reasons: errors.map((e) => e.message),
    errors,
    notices: r.notices,
  };
}
