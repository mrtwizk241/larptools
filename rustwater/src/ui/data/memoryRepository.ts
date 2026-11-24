// In-memory Repository for UI tests. Mirrors the IndexedDB one where screens can tell the
// difference: copies on read and write, `updatedAt` set on save, most recent first, delete
// cascades to the tracker and requests.
import {
  DEFAULT_SETTINGS,
  type GameEvent,
  type Request,
  type Settings,
  type StoredCharacter,
  type UseTracker,
} from '../../engine/model.ts';
import type { MigrationReport, Repository } from '../../storage/repository.ts';

export interface MemoryRepositoryOptions {
  characters?: StoredCharacter[];
  settings?: Settings;
  now?: () => Date;
  /** Result of runMigrations, for testing the startup banner. */
  migration?: MigrationReport;
}

export type MemoryRepository = Repository & {
  /** Raw stored state, for assertions. */
  readonly data: {
    characters: Map<string, StoredCharacter>;
    trackers: Map<string, UseTracker>;
    requests: Map<string, Request>;
    events: Map<string, GameEvent>;
    settings: Settings | undefined;
  };
};

const clone = <T>(value: T): T => structuredClone(value);

export function createMemoryRepository(options: MemoryRepositoryOptions = {}): MemoryRepository {
  const now = options.now ?? (() => new Date());
  const data: MemoryRepository['data'] = {
    characters: new Map((options.characters ?? []).map((c) => [c.id, clone(c)])),
    trackers: new Map(),
    requests: new Map(),
    events: new Map(),
    settings: options.settings ? clone(options.settings) : undefined,
  };

  return {
    data,
    runMigrations: () =>
      Promise.resolve(options.migration ?? { ok: true, from: 1, to: 1, applied: [] }),
    listCharacters: () =>
      Promise.resolve({
        items: [...data.characters.values()]
          .map(clone)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        invalid: [],
      }),
    getCharacter: (id) => Promise.resolve(clone(data.characters.get(id))),
    saveCharacter: (character) => {
      const stored = { ...clone(character), updatedAt: now().toISOString() };
      data.characters.set(stored.id, stored);
      return Promise.resolve(clone(stored));
    },
    deleteCharacter: (id) => {
      data.characters.delete(id);
      data.trackers.delete(id);
      for (const [key, request] of data.requests) {
        if (request.characterId === id) data.requests.delete(key);
      }
      return Promise.resolve();
    },
    getTracker: (characterId) => Promise.resolve(clone(data.trackers.get(characterId))),
    saveTracker: (tracker) => {
      const stored = { ...clone(tracker), updatedAt: now().toISOString() };
      data.trackers.set(stored.characterId, stored);
      return Promise.resolve(clone(stored));
    },
    listRequests: (characterId) =>
      Promise.resolve({
        items: [...data.requests.values()]
          .filter((r) => characterId === undefined || r.characterId === characterId)
          .map(clone)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
        invalid: [],
      }),
    saveRequest: (request) => {
      data.requests.set(request.id, clone(request));
      return Promise.resolve(clone(request));
    },
    deleteRequest: (id) => {
      data.requests.delete(id);
      return Promise.resolve();
    },
    listEvents: () =>
      Promise.resolve({
        items: [...data.events.values()].map(clone).sort((a, b) => a.date.localeCompare(b.date)),
        invalid: [],
      }),
    saveEvent: (event) => {
      data.events.set(event.key, clone(event));
      return Promise.resolve(clone(event));
    },
    getSettings: () => Promise.resolve(clone(data.settings ?? { ...DEFAULT_SETTINGS })),
    saveSettings: (settings) => {
      data.settings = clone(settings);
      return Promise.resolve(clone(settings));
    },
  };
}
