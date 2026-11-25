// Sorts a backup's characters against the local ones using the import merge rule (src/io/merge.ts).
// For every character a restore could replace, it keeps the backup's actions that are not on this
// device, so staff see what the backup changes before confirming (audit S-01).
import type { Action, StoredCharacter } from '../../engine/model.ts';
import { decideCharacterImport } from '../../io/index.ts';

export interface RestoreEntry {
  incoming: StoredCharacter;
  local: StoredCharacter | undefined;
  /**
   * Updates and conflicts: the backup's actions after the history both copies share, in log
   * order. Empty for every other entry.
   */
  addedActions: Action[];
}

export interface RestorePlan {
  /** Not on this device: saved. */
  added: RestoreEntry[];
  /** Identical log: nothing to do. */
  unchanged: RestoreEntry[];
  /** The backup extends the local log: replaced without asking. */
  updated: RestoreEntry[];
  /** This device already has the whole backup log and more: kept. */
  newerHere: RestoreEntry[];
  /** The logs differ: kept unless the user ticks "replace". */
  conflicts: RestoreEntry[];
}

export function planRestore(
  local: readonly StoredCharacter[],
  incoming: readonly StoredCharacter[],
): RestorePlan {
  const byId = new Map(local.map((c) => [c.id, c]));
  const plan: RestorePlan = { added: [], unchanged: [], updated: [], newerHere: [], conflicts: [] };
  for (const character of incoming) {
    const existing = byId.get(character.id);
    const entry: RestoreEntry = { incoming: character, local: existing, addedActions: [] };
    const decision = decideCharacterImport(existing, character);
    switch (decision.kind) {
      case 'new':
        plan.added.push(entry);
        break;
      case 'same':
        plan.unchanged.push(entry);
        break;
      case 'replace':
        plan.updated.push({ ...entry, addedActions: decision.addedActions });
        break;
      case 'conflict':
        if (decision.reason === 'local-newer') plan.newerHere.push(entry);
        else
          plan.conflicts.push({
            ...entry,
            addedActions: character.actions.slice(decision.sharedCount),
          });
        break;
    }
  }
  return plan;
}

/** Characters to save: new, updated, and the conflicts the user chose to replace. */
export function charactersToSave(
  plan: RestorePlan,
  replaceIds: ReadonlySet<string>,
): StoredCharacter[] {
  return [
    ...plan.added,
    ...plan.updated,
    ...plan.conflicts.filter((e) => replaceIds.has(e.incoming.id)),
  ].map((e) => e.incoming);
}
