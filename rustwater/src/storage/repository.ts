// The storage contract. The UI talks only to a Repository, so a server-backed implementation can
// replace the IndexedDB one later without touching screens.
import type { DecisionBody } from '../api/contract.ts';
import type { GameEvent, Request, Settings, StoredCharacter, UseTracker } from '../engine/model.ts';

/** A stored record that failed validation. It is reported, never thrown out of a list call. */
export type InvalidRecord = { key: string; errors: string[] };

/** Valid records plus the ones that could not be read. */
export type ListResult<T> = { items: T[]; invalid: InvalidRecord[] };

export type MigrationReport =
  | { ok: true; from: number; to: number; applied: string[] }
  | { ok: false; from: number | undefined; to: number; error: string };

/** Thrown by single-record reads and by writes when the data does not match the model. */
export class InvalidRecordError extends Error {
  readonly key: string;
  readonly errors: string[];

  constructor(key: string, errors: string[]) {
    super(`Invalid record "${key}": ${errors.join(' ')}`);
    this.name = 'InvalidRecordError';
    this.key = key;
    this.errors = errors;
  }
}

export interface SaveCharacterOptions {
  /** Server only: overwrite the stored log instead of appending (imports, restores). */
  replace?: boolean;
  /** Server only, new characters: the player account it belongs to (null: unassigned). */
  ownerId?: string | null;
}

export interface Repository {
  /** True for the server repository: accounts, owners, and approvals are available. */
  readonly server?: boolean;
  /** Upgrades stored data to the current schema version. Call once at startup. */
  runMigrations(): Promise<MigrationReport>;

  /** All characters, most recently updated first. */
  listCharacters(): Promise<ListResult<StoredCharacter>>;
  getCharacter(id: string): Promise<StoredCharacter | undefined>;
  /** Validates, sets `updatedAt` to now, stores, and returns the stored copy. */
  saveCharacter(
    character: StoredCharacter,
    options?: SaveCharacterOptions,
  ): Promise<StoredCharacter>;
  /** Deletes the character, its use tracker, and all of its requests. */
  deleteCharacter(id: string): Promise<void>;

  getTracker(characterId: string): Promise<UseTracker | undefined>;
  /** Validates, sets `updatedAt` to now, stores, and returns the stored copy. */
  saveTracker(tracker: UseTracker): Promise<UseTracker>;

  /** Requests for one character, or all requests when no id is given. Oldest first. */
  listRequests(characterId?: string): Promise<ListResult<Request>>;
  saveRequest(request: Request): Promise<Request>;
  deleteRequest(id: string): Promise<void>;
  /**
   * Server only: staff approve or reject a request in one step (the server runs the rules engine
   * and records the decision). Without it, the UI plans the decision itself and saves both.
   */
  decideRequest?(
    requestId: string,
    decision: DecisionBody,
  ): Promise<{ character: StoredCharacter; request: Request }>;

  /**
   * Server only: a player's own change that needs no staff approval (familiar naming and
   * spending), or any change to their own test build (ADR 0007). The server plans it again and
   * stores it. Without it, the UI saves the character.
   */
  runCommand?(characterId: string, command: unknown): Promise<StoredCharacter>;

  /** Known game events, by date then key. */
  listEvents(): Promise<ListResult<GameEvent>>;
  saveEvent(event: GameEvent): Promise<GameEvent>;

  /** Stored settings, or the defaults when none are stored or they are unreadable. */
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<Settings>;
}
