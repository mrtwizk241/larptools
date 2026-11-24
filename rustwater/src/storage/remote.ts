// Repository backed by the server (ADR 0006). Characters, requests, and events live on the
// server; settings and Play trackers stay on this device. The last copy the server sent is kept
// in IndexedDB, so a sheet opened before still shows with no signal (read only).
import { clear, createStore, del, get, set, type UseStore } from 'idb-keyval';
import { ApiError, api } from '../api/client.ts';
import type {
  CharacterEntry,
  CharacterMeta,
  RequestEntry,
  TestBuildBody,
} from '../api/contract.ts';
import type { GameEvent, Request, StoredCharacter } from '../engine/model.ts';
import { PUBLIC_MODE, publicTestBuildMeta } from '../publicMode.ts';
import { createIdbRepository } from './idb.ts';
import type { ListResult, Repository, SaveCharacterOptions } from './repository.ts';

export const CACHE_DB_NAME = 'rustwater-cache';

const cacheKeys = {
  entries: 'entries',
  entry: (id: string) => `entry:${id}`,
  requests: 'requests',
  events: 'events',
};

/** Server facts (owner, approval status) for characters read so far, by id. */
const metaById = new Map<string, CharacterMeta>();

/** The owner and approval status of a character this device has read from the server. */
export function characterMetaFor(id: string): CharacterMeta | undefined {
  // The public site has no server: every character there is the visitor's own test build.
  if (PUBLIC_MODE) return publicTestBuildMeta(id);
  return metaById.get(id);
}

/** True for the signed-in player's own test build (ADR 0007), as last read from the server. */
export function isTestBuild(id: string): boolean {
  return characterMetaFor(id)?.kind === 'test';
}

function noteMeta(entries: readonly CharacterEntry[]): void {
  for (const entry of entries) metaById.set(entry.character.id, entry.meta);
}

let cacheStore: UseStore | undefined;
function cache(): UseStore {
  cacheStore ??= createStore(CACHE_DB_NAME, 'kv');
  return cacheStore;
}

async function cacheGet<T>(key: string): Promise<T | undefined> {
  try {
    return await get<T>(key, cache());
  } catch {
    return undefined;
  }
}

async function cacheSet(key: string, value: unknown): Promise<void> {
  try {
    await set(key, value, cache());
  } catch {
    // The cache is a convenience; a full or blocked store must not break the app.
  }
}

/** Forgets every server copy kept on this device. Called on sign-out. */
export async function clearServerCache(): Promise<void> {
  metaById.clear();
  try {
    await clear(cache());
  } catch {
    // Nothing cached, or storage is blocked.
  }
}

/**
 * Reads from the server, or from the device copy when the server cannot be reached. Other errors
 * (signed out, not allowed) are thrown.
 */
async function readThrough<T>(key: string, load: () => Promise<T>): Promise<T> {
  try {
    const value = await load();
    await cacheSet(key, value);
    return value;
  } catch (error) {
    if (error instanceof ApiError && error.offline) {
      const cached = await cacheGet<T>(key);
      if (cached !== undefined) return cached;
    }
    throw error;
  }
}

export async function loadCharacterEntries(): Promise<CharacterEntry[]> {
  const entries = await readThrough(cacheKeys.entries, async () => (await api.characters()).items);
  noteMeta(entries);
  return entries;
}

export async function loadCharacterEntry(id: string): Promise<CharacterEntry | undefined> {
  try {
    const entry = await readThrough(cacheKeys.entry(id), () => api.character(id));
    noteMeta([entry]);
    return entry;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      await del(cacheKeys.entry(id), cache()).catch(() => undefined);
      return undefined;
    }
    if (error instanceof ApiError && error.offline) {
      const list = await cacheGet<CharacterEntry[]>(cacheKeys.entries);
      const found = list?.find((entry) => entry.character.id === id);
      if (found) {
        noteMeta([found]);
        return found;
      }
    }
    throw error;
  }
}

export async function loadRequestEntries(): Promise<RequestEntry[]> {
  return readThrough(cacheKeys.requests, async () => (await api.requests()).items);
}

/** Keeps the device copy in step after a save, so the next offline read is current. */
export async function rememberEntry(entry: CharacterEntry): Promise<void> {
  noteMeta([entry]);
  await cacheSet(cacheKeys.entry(entry.character.id), entry);
  const list = await cacheGet<CharacterEntry[]>(cacheKeys.entries);
  if (list) {
    const others = list.filter((e) => e.character.id !== entry.character.id);
    await cacheSet(cacheKeys.entries, [entry, ...others]);
  }
}

/** Makes a test build on the server and keeps the device copy in step. */
export async function createTestBuild(body: TestBuildBody): Promise<CharacterEntry> {
  const entry = await api.createTestBuild(body);
  await rememberEntry(entry);
  return entry;
}

function sortRequests(list: Request[]): Request[] {
  return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function createRemoteRepository(): Repository {
  const local = createIdbRepository();
  const ok = <T>(items: T[]): ListResult<T> => ({ items, invalid: [] });

  return {
    server: true,
    runMigrations: () => local.runMigrations(),

    async listCharacters() {
      // Live characters only: test builds stay out of events, requests, and staff screens.
      const entries = await loadCharacterEntries();
      return ok(
        entries
          .filter((e) => e.meta.status === 'active' && e.meta.kind !== 'test')
          .map((e) => e.character),
      );
    },

    async getCharacter(id) {
      return (await loadCharacterEntry(id))?.character;
    },

    async saveCharacter(character: StoredCharacter, options: SaveCharacterOptions = {}) {
      const entry = await api.saveCharacter(character, options);
      await rememberEntry(entry);
      return entry.character;
    },

    async deleteCharacter(id) {
      await api.deleteCharacter(id);
      await del(cacheKeys.entry(id), cache()).catch(() => undefined);
      const list = await cacheGet<CharacterEntry[]>(cacheKeys.entries);
      if (list)
        await cacheSet(
          cacheKeys.entries,
          list.filter((e) => e.character.id !== id),
        );
    },

    getTracker: (characterId) => local.getTracker(characterId),
    saveTracker: (tracker) => local.saveTracker(tracker),

    async listRequests(characterId) {
      const entries = await loadRequestEntries();
      const requests = entries
        .map((e) => e.request)
        .filter((r) => characterId === undefined || r.characterId === characterId);
      return ok(sortRequests(requests));
    },

    async saveRequest(request) {
      return (await api.sendRequest(request)).request;
    },

    async deleteRequest(id) {
      await api.deleteRequest(id);
    },

    async decideRequest(requestId, decision) {
      const result = await api.decide(requestId, decision);
      await rememberEntry(result.character);
      return { character: result.character.character, request: result.request.request };
    },

    async runCommand(characterId, command) {
      const entry = await api.runCommand(characterId, command);
      await rememberEntry(entry);
      return entry.character;
    },

    async listEvents() {
      return ok(
        await readThrough<GameEvent[]>(cacheKeys.events, async () => (await api.events()).items),
      );
    },

    async saveEvent(event) {
      return (await api.saveEvent(event)).event;
    },

    getSettings: () => local.getSettings(),
    saveSettings: (settings) => local.saveSettings(settings),
  };
}
