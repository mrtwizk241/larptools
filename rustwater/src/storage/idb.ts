// IndexedDB repository over idb-keyval: one database `rustwater`, one object store `kv`.
// Keys: `char:<id>`, `tracker:<id>`, `req:<id>`, `event:<key>`, `settings`, `meta`.
import { createStore, del, delMany, entries, get, set, type UseStore } from 'idb-keyval';
import { z } from 'zod';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  GameEventSchema,
  IdSchema,
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
} from '../engine/model.ts';
import {
  MIGRATIONS,
  isRecord,
  migrateCharacterRecord,
  type MigrationContext,
  type MigrationOptions,
} from './migrations.ts';
import {
  InvalidRecordError,
  type InvalidRecord,
  type ListResult,
  type MigrationReport,
  type Repository,
} from './repository.ts';

export const DB_NAME = 'rustwater';
export const STORE_NAME = 'kv';

const MetaSchema = z.object({ schemaVersion: z.number().int().min(0) });

export const keys = {
  character: (id: string) => `char:${id}`,
  tracker: (characterId: string) => `tracker:${characterId}`,
  request: (id: string) => `req:${id}`,
  event: (key: string) => `event:${key}`,
  settings: 'settings',
  meta: 'meta',
} as const;

export type IdbRepositoryOptions = MigrationOptions & {
  /** Defaults to `createStore('rustwater', 'kv')`. Tests pass their own. */
  store?: UseStore;
  /** Clock for `updatedAt`. Defaults to the system clock. */
  now?: () => Date;
};

type Checked<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function check<T>(schema: z.ZodType<T>, raw: unknown): Checked<T> {
  const result = schema.safeParse(raw);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, errors: formatIssues(result.error.issues) };
}

export function createIdbRepository(options: IdbRepositoryOptions = {}): Repository {
  const store = options.store ?? createStore(DB_NAME, STORE_NAME);
  const now = options.now ?? (() => new Date());
  const migrations = options.migrations ?? MIGRATIONS;
  const targetVersion = options.targetVersion ?? CURRENT_SCHEMA_VERSION;

  async function entriesWithPrefix(prefix: string): Promise<[string, unknown][]> {
    const all = await entries<IDBValidKey, unknown>(store);
    return all.filter(
      (e): e is [string, unknown] => typeof e[0] === 'string' && e[0].startsWith(prefix),
    );
  }

  function checkId(id: string): string {
    const result = IdSchema.safeParse(id);
    if (!result.success) throw new InvalidRecordError(id, formatIssues(result.error.issues, 'id'));
    return result.data;
  }

  function checkCharacter(raw: unknown): Checked<StoredCharacter> {
    let migrated: unknown;
    try {
      migrated = migrateCharacterRecord(raw, migrations, targetVersion);
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
    }
    if (
      isRecord(migrated) &&
      typeof migrated.schemaVersion === 'number' &&
      migrated.schemaVersion > targetVersion
    ) {
      return {
        ok: false,
        errors: [
          `Saved by a newer version of the app (schema ${migrated.schemaVersion}). Update the app.`,
        ],
      };
    }
    const result = check(StoredCharacterSchema, migrated);
    if (!result.ok) return result;
    const logErrors = actionLogErrors(result.value.actions);
    return logErrors.length > 0 ? { ok: false, errors: logErrors } : result;
  }

  async function list<T>(
    prefix: string,
    checker: (raw: unknown) => Checked<T>,
    keep: (value: T) => boolean = () => true,
  ): Promise<ListResult<T>> {
    const items: T[] = [];
    const invalid: InvalidRecord[] = [];
    for (const [key, raw] of await entriesWithPrefix(prefix)) {
      const result = checker(raw);
      if (result.ok) {
        if (keep(result.value)) items.push(result.value);
      } else {
        invalid.push({ key, errors: result.errors });
      }
    }
    return { items, invalid };
  }

  async function getOne<T>(key: string, checker: (raw: unknown) => Checked<T>) {
    const raw = await get<unknown>(key, store);
    if (raw === undefined) return undefined;
    const result = checker(raw);
    if (!result.ok) throw new InvalidRecordError(key, result.errors);
    return result.value;
  }

  async function write<T>(key: string, checker: (raw: unknown) => Checked<T>, value: unknown) {
    const result = checker(value);
    if (!result.ok) throw new InvalidRecordError(key, result.errors);
    await set(key, result.value, store);
    return result.value;
  }

  const ctx: MigrationContext = {
    get: (key) => get<unknown>(key, store),
    set: (key, value) => set(key, value, store),
    del: (key) => del(key, store),
    entries: entriesWithPrefix,
  };

  return {
    async runMigrations(): Promise<MigrationReport> {
      const rawMeta = await get<unknown>(keys.meta, store);
      if (rawMeta === undefined) {
        // No meta means a fresh install: nothing older than schema 1 was ever shipped.
        await set(keys.meta, { schemaVersion: targetVersion }, store);
        return { ok: true, from: targetVersion, to: targetVersion, applied: [] };
      }
      const meta = MetaSchema.safeParse(rawMeta);
      if (!meta.success) {
        return {
          ok: false,
          from: undefined,
          to: targetVersion,
          error: 'Storage metadata is unreadable.',
        };
      }
      const from = meta.data.schemaVersion;
      if (from > targetVersion) {
        return {
          ok: false,
          from,
          to: targetVersion,
          error: `Data was saved by a newer version of the app (schema ${from}). Update the app.`,
        };
      }
      const applied: string[] = [];
      for (let version = from; version < targetVersion; version += 1) {
        const step = migrations.find((m) => m.from === version);
        if (!step) {
          return {
            ok: false,
            from,
            to: targetVersion,
            error: `No storage migration from schema version ${version}.`,
          };
        }
        try {
          if (step.run) await step.run(ctx);
          for (const [key, raw] of await entriesWithPrefix('char:')) {
            if (isRecord(raw) && raw.schemaVersion === version) {
              await set(key, migrateCharacterRecord(raw, migrations, version + 1), store);
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { ok: false, from, to: targetVersion, error: `${step.description}: ${message}` };
        }
        // Saved after each step so an interrupted run resumes where it stopped.
        await set(keys.meta, { schemaVersion: version + 1 }, store);
        applied.push(step.description);
      }
      return { ok: true, from, to: targetVersion, applied };
    },

    async listCharacters() {
      const result = await list('char:', checkCharacter);
      result.items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return result;
    },

    async getCharacter(id) {
      return getOne(keys.character(checkId(id)), checkCharacter);
    },

    async saveCharacter(character) {
      const key = keys.character(checkId(character.id));
      return write(key, checkCharacter, { ...character, updatedAt: now().toISOString() });
    },

    async deleteCharacter(id) {
      checkId(id);
      const requestKeys = (await entriesWithPrefix('req:'))
        .filter(([, raw]) => isRecord(raw) && raw.characterId === id)
        .map(([key]) => key);
      await delMany([keys.character(id), keys.tracker(id), ...requestKeys], store);
    },

    async getTracker(characterId) {
      return getOne(keys.tracker(checkId(characterId)), (raw) => check(UseTrackerSchema, raw));
    },

    async saveTracker(tracker) {
      const key = keys.tracker(checkId(tracker.characterId));
      return write(key, (raw) => check(UseTrackerSchema, raw), {
        ...tracker,
        updatedAt: now().toISOString(),
      });
    },

    async listRequests(characterId) {
      const result = await list<Request>(
        'req:',
        (raw) => check(RequestSchema, raw),
        (r) => characterId === undefined || r.characterId === characterId,
      );
      result.items.sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      );
      return result;
    },

    async saveRequest(request) {
      return write(keys.request(checkId(request.id)), (raw) => check(RequestSchema, raw), request);
    },

    async deleteRequest(id) {
      await del(keys.request(checkId(id)), store);
    },

    async listEvents() {
      const result = await list<GameEvent>('event:', (raw) => check(GameEventSchema, raw));
      result.items.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
      return result;
    },

    async saveEvent(event) {
      const parsed = GameEventSchema.safeParse(event);
      if (!parsed.success) {
        throw new InvalidRecordError(
          `event:${String(event.key)}`,
          formatIssues(parsed.error.issues),
        );
      }
      return write(keys.event(parsed.data.key), (raw) => check(GameEventSchema, raw), parsed.data);
    },

    async getSettings(): Promise<Settings> {
      const raw = await get<unknown>(keys.settings, store);
      const result = SettingsSchema.safeParse(raw);
      return result.success ? result.data : { ...DEFAULT_SETTINGS };
    },

    async saveSettings(settings) {
      return write(keys.settings, (raw) => check(SettingsSchema, raw), settings);
    },
  };
}
