// Per-type payload checks for action logs read from files (security audit S-03). The envelope
// schema keeps payloads as `unknown`; here each one is parsed with its action type's schema from
// the engine registry, and the parse output replaces it, so unknown keys never reach storage.
import { getActionDefinition } from '../engine/actions/registry.ts';
import { formatIssues, type Action } from '../engine/model.ts';

/** Failing actions listed in full; the rest are counted in one line. */
const MAX_ACTIONS_LISTED = 10;
/** Issue lines shown per failing action. */
const MAX_ISSUES_PER_ACTION = 3;

export interface PayloadCheck {
  /** The actions with each valid payload replaced by its parse output. */
  actions: Action[];
  /** Readable problems naming the action's position, seq, and type. Empty when all are valid. */
  errors: string[];
}

/** Parses one payload with its type's schema. `undefined` when the type or the payload is bad. */
export function parseActionPayload(action: Action): { payload: unknown } | undefined {
  const def = getActionDefinition(action.type);
  if (!def) return undefined;
  const result = def.payload.safeParse(action.payload);
  return result.success ? { payload: result.data } : undefined;
}

/**
 * Validates every action payload with the engine's schema for its type. Valid payloads come back
 * as the schema's parse output (unknown keys dropped, strings trimmed); invalid ones are reported
 * as `path[index], seq N (type): payload.field: problem`.
 */
export function checkActionPayloads(actions: readonly Action[], path = 'actions'): PayloadCheck {
  const errors: string[] = [];
  let failing = 0;
  const parsed = actions.map((action, index) => {
    const label = `${path}[${index}], seq ${action.seq} (${action.type})`;
    const def = getActionDefinition(action.type);
    if (!def) {
      failing += 1;
      if (failing <= MAX_ACTIONS_LISTED) {
        errors.push(`${label}: this version of the app cannot read this action type.`);
      }
      return action;
    }
    const result = def.payload.safeParse(action.payload);
    if (!result.success) {
      failing += 1;
      if (failing <= MAX_ACTIONS_LISTED) {
        const lines = formatIssues(result.error.issues, 'payload', MAX_ISSUES_PER_ACTION);
        for (const line of lines) errors.push(`${label}: ${line}`);
      }
      return action;
    }
    return { ...action, payload: result.data };
  });
  if (failing > MAX_ACTIONS_LISTED) {
    errors.push(`...and ${failing - MAX_ACTIONS_LISTED} more actions with invalid payloads.`);
  }
  return { actions: parsed, errors };
}
