// deriveSheet(ruleset, actions): replays the action log into a Sheet. Pure and deterministic.
// Never throws on bad data: an unknown type or invalid payload becomes a warning and is skipped.
// Actions a player authored only count for the types a player may create (a new character's
// submission); any other player-authored action (points, check-ins, purchases, approvals) is a
// warning and has no effect.
import type { SyRuleset } from '../../data/index.ts';
import { getActionDefinition } from '../actions/registry.ts';
import { ACTION_TYPES, formatIssues, type Action, type ActorRole } from '../model.ts';
import type { Sheet } from '../sheet.ts';
import type { CharacterCreatedPayload } from '../actions/character.ts';
import { checkBalances, createDraft, warn, type Draft } from './draft.ts';
import { finalize } from './finalize.ts';

const CATALOGUE: ReadonlySet<string> = new Set(ACTION_TYPES);

/** Action types a player may author: the parts of a new character's submission. */
export const PLAYER_ACTION_TYPES: ReadonlySet<string> = new Set([
  'character.created',
  'skill.learned',
  'items.startingSet',
  'journal.added',
]);

/**
 * True when an actor with `role` may create an action of `type`. Staff and the system may
 * create every type; players only the parts of a new character's submission. The server uses
 * this to check stored logs, and replay ignores the rest.
 */
export function allowedForRole(type: string, role: ActorRole): boolean {
  return role !== 'player' || PLAYER_ACTION_TYPES.has(type);
}

function isActionLike(value: unknown): value is Action {
  if (typeof value !== 'object' || value === null) return false;
  const a = value as Record<string, unknown>;
  return (
    typeof a.id === 'string' &&
    typeof a.type === 'string' &&
    typeof a.seq === 'number' &&
    typeof a.at === 'string'
  );
}

/** A player's new character starts with the standard XP and no retirement carry-over. */
function limitPlayerCreation(
  draft: Draft,
  ruleset: SyRuleset,
  p: CharacterCreatedPayload,
  actionId: string,
): CharacterCreatedPayload {
  const start = ruleset.ruleset.xp.start;
  if (p.retirement === undefined && p.startingXp <= start) return p;
  warn(
    draft,
    actionId,
    'ROLE_NOT_ALLOWED',
    `A player-recorded character starts with ${start} XP and no retirement carry-over; staff record a retirement rebuild.`,
  );
  const { retirement: _retirement, ...rest } = p;
  void _retirement;
  return { ...rest, startingXp: Math.min(p.startingXp, start) };
}

export function deriveSheet(ruleset: SyRuleset, actions: readonly Action[]): Sheet {
  const draft = createDraft(ruleset);
  let lastSeq = 0;
  for (const action of actions as readonly unknown[]) {
    if (!isActionLike(action)) {
      warn(draft, null, 'MALFORMED_ACTION', 'An entry in the log is not a valid action; skipped.');
      continue;
    }
    if (action.seq <= lastSeq)
      warn(
        draft,
        action.id,
        'SEQ_ORDER',
        `Action seq ${action.seq} is not after ${lastSeq}; replayed in log order.`,
      );
    lastSeq = Math.max(lastSeq, action.seq);
    draft.lastSeq = lastSeq;

    const def = getActionDefinition(action.type);
    if (!def) {
      if (CATALOGUE.has(action.type))
        warn(
          draft,
          action.id,
          'UNSUPPORTED_ACTION',
          `"${action.type}" is not supported by this engine version yet; skipped.`,
        );
      else
        warn(
          draft,
          action.id,
          'UNKNOWN_ACTION_TYPE',
          `Unknown action type "${action.type}"; skipped.`,
        );
      continue;
    }
    if (def.requiresCharacter && !draft.created) {
      warn(
        draft,
        action.id,
        'NO_CHARACTER',
        `"${action.type}" comes before character.created; skipped.`,
      );
      continue;
    }
    const role = (action.actor as { role?: unknown } | undefined)?.role;
    if (role === 'player' && !allowedForRole(action.type, 'player')) {
      warn(
        draft,
        action.id,
        'ROLE_NOT_ALLOWED',
        `"${action.type}" was recorded by a player; only staff record it. Ignored.`,
      );
      continue;
    }
    const parsed = def.payload.safeParse(action.payload);
    if (!parsed.success) {
      warn(
        draft,
        action.id,
        'INVALID_PAYLOAD',
        `Invalid ${action.type} payload: ${formatIssues(parsed.error.issues, '', 3).join('; ')}`,
      );
      continue;
    }
    if (draft.retired !== null && !def.allowedWhenRetired(parsed.data)) {
      warn(
        draft,
        action.id,
        'CHARACTER_RETIRED',
        `"${action.type}" comes after the character retired; skipped.`,
      );
      continue;
    }
    let payload: unknown = parsed.data;
    if (role === 'player' && action.type === 'character.created')
      payload = limitPlayerCreation(draft, ruleset, payload as CharacterCreatedPayload, action.id);
    try {
      def.apply(draft, payload, action);
    } catch (error) {
      warn(
        draft,
        action.id,
        'REPLAY_ERROR',
        `Could not replay ${action.type}: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    checkBalances(draft, action.id);
  }
  return finalize(draft);
}
