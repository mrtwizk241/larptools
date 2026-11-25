// Repository for the no-login builder: characters, trackers, events, and settings in the
// browser's localStorage, which works for a page opened from a file. Every record is checked
// with the same schemas as the app's other repositories. When storage is blocked (a private
// window, some file viewers) it keeps everything in memory and says so (`persistent: false`).
import {
  DEFAULT_SETTINGS,
  GameEventSchema,
  RequestSchema,
  SettingsSchema,
  StoredCharacterSchema,
  UseTrackerSchema,
  actionLogErrors,
  formatIssues,
  type GameEvent,
  type Request,
  type Settings,
  type StoredCharacter,
  type UseTracker,
} from '../engine/model.ts';
import type { z } from 'zod';
import {
  InvalidRecordError,
  type InvalidRecord,
  type ListResult,
  type Repository,
} from './repository.ts';

export const LOCAL_PREFIX = 'sylvaris-builder:';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export type LocalRepository = Repository & {
  /** False when the browser would not let the page save: data lasts until the page closes. */
  readonly persistent: boolean;
};

/** A Map with the localStorage shape, for tests and for browsers that block storage. */
export function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

/** The page's localStorage if it can be written, or null. */
export function browserStore(): KeyValueStore | null {
  try {
    const store = window.localStorage;
    const probe = `${LOCAL_PREFIX}probe`;
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

const keys = {
  character: (id: string) => `${LOCAL_PREFIX}char:${id}`,
  tracker: (id: string) => `${LOCAL_PREFIX}tracker:${id}`,
  request: (id: string) => `${LOCAL_PREFIX}req:${id}`,
  event: (key: string) => `${LOCAL_PREFIX}event:${key}`,
  settings: `${LOCAL_PREFIX}settings`,
};

type Checked<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function check<T>(schema: z.ZodType<T>, raw: unknown): Checked<T> {
  const result = schema.safeParse(raw);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, errors: formatIssues(result.error.issues) };
}

function checkCharacter(raw: unknown): Checked<StoredCharacter> {
  const result = check(StoredCharacterSchema, raw);
  if (!result.ok) return result;
  const errors = actionLogErrors(result.value.actions);
  return errors.length > 0 ? { ok: false, errors } : result;
}

export function createLocalRepository(
  store: KeyValueStore | null = browserStore(),
  now: () => Date = () => new Date(),
): LocalRepository {
  const persistent = store !== null;
  const kv = store ?? memoryStore();

  function read(key: string): unknown {
    const text = kv.getItem(key);
    if (text === null) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { unreadable: true };
    }
  }

  function write(key: string, value: unknown): void {
    try {
      kv.setItem(key, JSON.stringify(value));
    } catch (error) {
      throw new Error(
        `This browser could not save (${error instanceof Error ? error.message : 'storage full'}). Back up your characters from Settings.`,
      );
    }
  }

  function keysWith(prefix: string): string[] {
    const out: string[] = [];
    for (let i = 0; i < kv.length; i++) {
      const key = kv.key(i);
      if (key?.startsWith(prefix)) out.push(key);
    }
    return out;
  }

  function list<T>(prefix: string, checker: (raw: unknown) => Checked<T>): ListResult<T> {
    const items: T[] = [];
    const invalid: InvalidRecord[] = [];
    for (const key of keysWith(prefix)) {
      const result = checker(read(key));
      if (result.ok) items.push(result.value);
      else invalid.push({ key, errors: result.errors });
    }
    return { items, invalid };
  }

  function getOne<T>(key: string, checker: (raw: unknown) => Checked<T>): T | undefined {
    const raw = read(key);
    if (raw === undefined) return undefined;
    const result = checker(raw);
    if (!result.ok) throw new InvalidRecordError(key, result.errors);
    return result.value;
  }

  return {
    persistent,
    runMigrations: () => Promise.resolve({ ok: true, from: 1, to: 1, applied: [] }),
    listCharacters: () => {
      const result = list(`${LOCAL_PREFIX}char:`, checkCharacter);
      result.items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return Promise.resolve(result);
    },
    getCharacter: (id) => Promise.resolve(getOne(keys.character(id), checkCharacter)),
    saveCharacter: (character) => {
      const stored = { ...character, updatedAt: now().toISOString() };
      const result = checkCharacter(stored);
      if (!result.ok) return Promise.reject(new InvalidRecordError(stored.id, result.errors));
      write(keys.character(stored.id), result.value);
      return Promise.resolve(result.value);
    },
    deleteCharacter: (id) => {
      kv.removeItem(keys.character(id));
      kv.removeItem(keys.tracker(id));
      for (const key of keysWith(`${LOCAL_PREFIX}req:`)) {
        const raw = read(key) as { characterId?: unknown } | undefined;
        if (raw?.characterId === id) kv.removeItem(key);
      }
      return Promise.resolve();
    },
    getTracker: (characterId) =>
      Promise.resolve(
        getOne(keys.tracker(characterId), (raw) => check<UseTracker>(UseTrackerSchema, raw)),
      ),
    saveTracker: (tracker) => {
      const stored = { ...tracker, updatedAt: now().toISOString() };
      const result = check<UseTracker>(UseTrackerSchema, stored);
      if (!result.ok)
        return Promise.reject(new InvalidRecordError(tracker.characterId, result.errors));
      write(keys.tracker(stored.characterId), result.value);
      return Promise.resolve(result.value);
    },
    listRequests: (characterId) => {
      const result = list(`${LOCAL_PREFIX}req:`, (raw) => check<Request>(RequestSchema, raw));
      result.items = result.items
        .filter((r) => characterId === undefined || r.characterId === characterId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      return Promise.resolve(result);
    },
    saveRequest: (request) => {
      const result = check<Request>(RequestSchema, request);
      if (!result.ok) return Promise.reject(new InvalidRecordError(request.id, result.errors));
      write(keys.request(request.id), result.value);
      return Promise.resolve(result.value);
    },
    deleteRequest: (id) => {
      kv.removeItem(keys.request(id));
      return Promise.resolve();
    },
    listEvents: () => {
      const result = list(`${LOCAL_PREFIX}event:`, (raw) => check<GameEvent>(GameEventSchema, raw));
      result.items.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
      return Promise.resolve(result);
    },
    saveEvent: (event) => {
      const result = check<GameEvent>(GameEventSchema, event);
      if (!result.ok) return Promise.reject(new InvalidRecordError(event.key, result.errors));
      write(keys.event(event.key), result.value);
      return Promise.resolve(result.value);
    },
    getSettings: () => {
      const raw = read(keys.settings);
      const result = raw === undefined ? null : check<Settings>(SettingsSchema, raw);
      return Promise.resolve(result?.ok ? result.value : { ...DEFAULT_SETTINGS });
    },
    saveSettings: (settings) => {
      const result = check<Settings>(SettingsSchema, settings);
      if (!result.ok) return Promise.reject(new InvalidRecordError('settings', result.errors));
      write(keys.settings, result.value);
      return Promise.resolve(result.value);
    },
  };
}
