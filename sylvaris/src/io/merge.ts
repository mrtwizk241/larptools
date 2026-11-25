// What to do when an imported character file has the same id as a local character (ADR 0003).
import type { Action, StoredCharacter } from '../engine/model.ts';
import { parseActionPayload } from './payloads.ts';

export type ImportDecision =
  /** No local copy: save the incoming one. */
  | { kind: 'new' }
  /** Same action log as the local copy: nothing to do. */
  | { kind: 'same' }
  /**
   * Incoming starts with the whole local log and adds `added` actions. `addedActions` are those
   * actions, so the UI can show what the file adds before saving (audit S-01). `fromPrefix` marks
   * that the decision rests only on the shared prefix: nothing in the file proves who wrote them.
   */
  | { kind: 'replace'; added: number; addedActions: Action[]; fromPrefix: true }
  /**
   * Ask the user. `local-newer`: the local log already contains the whole incoming log and more.
   * `diverged`: the logs differ after the first `sharedCount` actions.
   */
  | {
      kind: 'conflict';
      reason: 'local-newer' | 'diverged';
      localCount: number;
      incomingCount: number;
      sharedCount: number;
    };

/** Plain objects get their keys sorted, so key order never makes two actions differ. */
function sortedKeys(_key: string, value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const entries = Object.entries(value as Record<string, unknown>);
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries);
}

/**
 * Comparable form of an action. The payload is replaced by its schema's parse output when valid,
 * so a local copy saved before imports stripped payloads (untrimmed strings, other key order)
 * still matches the same action read back from a file.
 */
function canonical(action: Action): string {
  const parsed = parseActionPayload(action);
  const payload = parsed ? parsed.payload : action.payload;
  return JSON.stringify({ ...action, payload }, sortedKeys);
}

/**
 * True when two actions are the same entry: every field equal, payloads compared in their parsed
 * form with sorted keys. The server uses it to check that a staff save only appends (audit S-1).
 */
export function sameAction(a: Action, b: Action): boolean {
  return canonical(a) === canonical(b);
}

function sharedPrefixLength(a: readonly Action[], b: readonly Action[]): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && sameAction(a[i] as Action, b[i] as Action)) i += 1;
  return i;
}

/**
 * Replace when the incoming copy has more actions and starts with the whole local log; otherwise
 * report a conflict for the UI to ask about. Throws if the ids differ (caller bug).
 */
export function decideCharacterImport(
  local: StoredCharacter | undefined,
  incoming: StoredCharacter,
): ImportDecision {
  if (!local) return { kind: 'new' };
  if (local.id !== incoming.id) {
    throw new Error('decideCharacterImport needs two copies of the same character.');
  }
  const localCount = local.actions.length;
  const incomingCount = incoming.actions.length;
  const sharedCount = sharedPrefixLength(local.actions, incoming.actions);
  if (sharedCount === localCount && sharedCount === incomingCount) return { kind: 'same' };
  if (sharedCount === localCount) {
    return {
      kind: 'replace',
      added: incomingCount - localCount,
      addedActions: incoming.actions.slice(localCount),
      fromPrefix: true,
    };
  }
  const reason = sharedCount === incomingCount ? 'local-newer' : 'diverged';
  return { kind: 'conflict', reason, localCount, incomingCount, sharedCount };
}
