// Player learning requests (SPEC "Outside the action log", ADR 0006): the status to show, and
// loading them per character. Players send them to the server; staff decide them there.
import { useCallback, useEffect, useState } from 'react';
import { deriveSheet, type Sheet } from '../../engine/index.ts';
import type {
  Request,
  RequestMemoryKind,
  RequestStatus,
  SkillPart,
  StoredCharacter,
} from '../../engine/model.ts';
import { characterMetaFor } from '../../storage/remote.ts';
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
  /** The player account the character belongs to, when the server says. */
  ownerId: string | null;
  ownerName: string | null;
}

/** One player's characters with waiting requests (staff Approvals). */
export interface PlayerRequests {
  /** Owner id, or `none` for characters without a player. */
  key: string;
  playerName: string;
  groups: CharacterRequests[];
  count: number;
}

/**
 * Waiting requests that pass `filter`, grouped per player and then per character, players by
 * name. Characters without a player come last.
 */
export function pendingByPlayer(
  groups: readonly CharacterRequests[],
  filter: (request: Request) => boolean,
): PlayerRequests[] {
  const byKey = new Map<string, PlayerRequests>();
  for (const group of groups) {
    const rows = group.rows.filter((r) => isPending(r.status) && filter(r.request));
    if (rows.length === 0) continue;
    const key = group.ownerId ?? 'none';
    const entry = byKey.get(key) ?? {
      key,
      playerName: group.ownerName ?? 'No player',
      groups: [],
      count: 0,
    };
    entry.groups.push({ ...group, rows });
    entry.count += rows.length;
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) => {
    if (a.key === 'none' || b.key === 'none') return a.key === 'none' ? 1 : -1;
    return a.playerName.localeCompare(b.playerName);
  });
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
    const meta = characterMetaFor(character.id);
    groups.push({
      character,
      name: summarizeCharacter(character).characterName,
      sheet,
      rows,
      ownerId: meta?.ownerId ?? null,
      ownerName: meta?.ownerName ?? null,
    });
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

/** What a new request asks for: a skill part (the default), something to memorize, or a boon. */
export type RequestInput = { characterId: string; teacher: string; note: string } & (
  | {
      kind?: 'learn-skill';
      skillId: string;
      part: SkillPart;
      toLevel: number;
      archetype?: string | undefined;
    }
  | { kind: 'memorize'; memoryKind: RequestMemoryKind; refId: string }
  | { kind: 'boon'; boonId: string }
);

/**
 * A new request with a fresh id, ready to send to staff. An empty or missing archetype is left
 * out (only multi-archetype skills on first purchase carry one).
 */
export function newRequest(data: RequestInput, now: () => Date = () => new Date()): Request {
  const base = {
    id: crypto.randomUUID(),
    createdAt: now().toISOString(),
    status: 'sent' as const,
    characterId: data.characterId,
    teacher: data.teacher.trim(),
    note: data.note.trim(),
  };
  if (data.kind === 'memorize')
    return { ...base, kind: 'memorize', memoryKind: data.memoryKind, refId: data.refId };
  if (data.kind === 'boon') return { ...base, kind: 'boon', boonId: data.boonId };
  return {
    ...base,
    kind: 'learn-skill',
    skillId: data.skillId,
    part: data.part,
    toLevel: data.toLevel,
    ...(data.archetype ? { archetype: data.archetype } : {}),
  };
}
