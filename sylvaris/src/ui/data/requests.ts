// Player learning requests (SPEC "Outside the action log", ADR 0006): the status to show, and
// loading them per character. Players send them to the server; staff decide them there.
import { useCallback, useEffect, useState } from 'react';
import { deriveSheet, type Sheet } from '../../engine/index.ts';
import type { Request, RequestStatus, StoredCharacter } from '../../engine/model.ts';
import type { Repository } from '../../storage/repository.ts';
import { useDataContext } from './context.ts';
import { rulesetFor } from './rulesetContext.ts';
import { summarizeCharacter } from './summary.ts';

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Draft and sent requests are still waiting for staff (shown as PENDING). */
export function isPending(status: RequestStatus): boolean {
  return status === 'draft' || status === 'sent';
}

/** The status to show: a decision in the character's log wins over the stored status. */
export function shownStatus(request: Request, sheet: Sheet | undefined): RequestStatus {
  const decision = sheet?.requestDecisions.find((d) => d.requestId === request.id);
  return decision ? decision.status : request.status;
}

/** The character's sheet, or undefined when this build lacks its rules season. */
export function sheetOf(character: StoredCharacter): Sheet | undefined {
  const ruleset = rulesetFor(character.rulesetId);
  return ruleset ? deriveSheet(ruleset, character.actions) : undefined;
}

export interface RequestRow {
  request: Request;
  status: RequestStatus;
}

export interface CharacterRequests {
  character: StoredCharacter;
  name: string;
  sheet: Sheet | undefined;
  rows: RequestRow[];
}

/**
 * Requests grouped per character, in roster order (most recently updated first), oldest request
 * first. Requests whose character is not visible to this account are left out.
 */
export async function loadRequests(repository: Repository): Promise<CharacterRequests[]> {
  const [characters, requests] = await Promise.all([
    repository.listCharacters(),
    repository.listRequests(),
  ]);
  const groups: CharacterRequests[] = [];
  for (const character of characters.items) {
    const mine = requests.items.filter((r) => r.characterId === character.id);
    if (mine.length === 0) continue;
    const sheet = sheetOf(character);
    const rows: RequestRow[] = mine.map((request) => ({
      request,
      status: shownStatus(request, sheet),
    }));
    groups.push({ character, name: summarizeCharacter(character).characterName, sheet, rows });
  }
  return groups;
}

/** Requests still waiting for staff, over all characters. */
export function pendingCount(groups: readonly CharacterRequests[]): number {
  return groups.reduce((sum, g) => sum + g.rows.filter((r) => isPending(r.status)).length, 0);
}

export type RequestsState =
  | { status: 'loading' }
  | { status: 'ready'; groups: CharacterRequests[] }
  | { status: 'error'; message: string };

/** All requests per character. `reload` re-reads and resolves when done. */
export function useRequests(): RequestsState & { reload: () => Promise<void> } {
  const { repository, ready } = useDataContext();
  const [state, setState] = useState<RequestsState>({ status: 'loading' });

  const read = useCallback(async (): Promise<RequestsState> => {
    try {
      return { status: 'ready', groups: await loadRequests(repository) };
    } catch (error) {
      return { status: 'error', message: message(error) };
    }
  }, [repository]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void read().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, read]);

  const reload = useCallback(async () => {
    setState(await read());
  }, [read]);

  return { ...state, reload };
}

/**
 * A new request for one skill step (a level, or a Technique), with a fresh id, ready to send to
 * staff. Teacher and note are trimmed.
 */
export function newRequest(
  data: Pick<Request, 'characterId' | 'skillId' | 'step' | 'teacher' | 'note'>,
  now: () => Date = () => new Date(),
): Request {
  return {
    id: crypto.randomUUID(),
    createdAt: now().toISOString(),
    kind: 'learn-skill',
    status: 'sent',
    characterId: data.characterId,
    skillId: data.skillId,
    step: data.step,
    teacher: data.teacher.trim(),
    note: data.note.trim(),
  };
}
