// Storage schema migrations. `meta.schemaVersion` records the version of the whole database;
// each stored character also carries its own `schemaVersion` and is upgraded on read as well.
import { CURRENT_SCHEMA_VERSION } from '../engine/model.ts';

/** Raw key-value access a migration step may use. */
export interface MigrationContext {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  /** All entries whose key starts with `prefix`. */
  entries(prefix: string): Promise<[string, unknown][]>;
}

export type Migration = {
  /** The version this step upgrades from. It produces `from + 1`. */
  from: number;
  description: string;
  /** Rewrites one raw character record. Runs at startup and when an older character is read. */
  character?: (raw: Record<string, unknown>) => Record<string, unknown>;
  /** Database-wide changes other than character records. Runs before `character`. */
  run?: (ctx: MigrationContext) => Promise<void>;
};

/** Migration steps, one per version bump. Empty for schema version 1. */
export const MIGRATIONS: readonly Migration[] = [];

export type MigrationOptions = {
  migrations?: readonly Migration[];
  targetVersion?: number;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Upgrades one raw character record to `targetVersion` step by step. Records that are not objects,
 * have no numeric `schemaVersion`, or are already current are returned unchanged; validation
 * reports them afterwards.
 */
export function migrateCharacterRecord(
  raw: unknown,
  migrations: readonly Migration[] = MIGRATIONS,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
): unknown {
  if (!isRecord(raw) || typeof raw.schemaVersion !== 'number') return raw;
  let record = raw;
  let version = raw.schemaVersion;
  while (version < targetVersion) {
    const step = migrations.find((m) => m.from === version);
    if (!step) throw new Error(`No storage migration from schema version ${version}.`);
    record = { ...(step.character ? step.character(record) : record), schemaVersion: version + 1 };
    version += 1;
  }
  return record;
}
