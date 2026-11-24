// deriveSheet(ruleset, actions): replays the action log into a Sheet. Pure and deterministic.
// Never throws on bad data: an unknown type or invalid payload becomes a warning and is skipped.
import type { Ruleset } from '../../data/index.ts';
import { getActionDefinition } from '../actions/registry.ts';
import { ACTION_TYPES, formatIssues, type Action } from '../model.ts';
import type { Sheet } from '../sheet.ts';
import { checkBalances, createDraft, warn } from './draft.ts';
import { finalize } from './finalize.ts';

const CATALOGUE: ReadonlySet<string> = new Set(ACTION_TYPES);

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

export function deriveSheet(ruleset: Ruleset, actions: readonly Action[]): Sheet {
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
    try {
      def.apply(draft, parsed.data, action);
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
