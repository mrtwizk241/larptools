// Character, request, and backup files (docs/SPEC.md "Files", ADR 0003).
// Imports are untrusted: size limit first, JSON.parse only (never evaluated), Zod validation with
// unknown fields stripped, then log invariants (seq 1..n, unique ids) and every action payload
// (per-type engine schema, parse output kept) checked. Array lengths are capped (audit S-02).
import { z } from 'zod';
import {
  CURRENT_SCHEMA_VERSION,
  GameEventSchema,
  IdSchema,
  IsoDateTimeSchema,
  MAX_CHARACTERS,
  MAX_EVENTS,
  MAX_REQUESTS,
  RequestSchema,
  StoredCharacterSchema,
  actionLogErrors,
  formatIssues,
  type StoredCharacter,
} from '../engine/model.ts';
import { checkActionPayloads } from './payloads.ts';

/** Largest file accepted for import, in bytes. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export const FORMAT_VERSION = 1;

export const FILE_FORMATS = {
  character: 'rustwater-character',
  requests: 'rustwater-requests',
  backup: 'rustwater-backup',
} as const;
export type FileKind = keyof typeof FILE_FORMATS;

const FORMAT_LABELS: Record<string, string> = {
  'rustwater-character': 'character',
  'rustwater-requests': 'requests',
  'rustwater-backup': 'backup',
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export const CharacterFileSchema = z.object({
  format: z.literal(FILE_FORMATS.character),
  formatVersion: z.literal(FORMAT_VERSION),
  exportedAt: IsoDateTimeSchema,
  appVersion: z.string().max(50),
  character: StoredCharacterSchema,
});
export type CharacterFile = z.infer<typeof CharacterFileSchema>;

export const RequestsFileSchema = z.object({
  format: z.literal(FILE_FORMATS.requests),
  formatVersion: z.literal(FORMAT_VERSION),
  exportedAt: IsoDateTimeSchema,
  characterId: IdSchema,
  characterName: z.string().max(200),
  requests: z.array(RequestSchema).max(MAX_REQUESTS, 'At most 500 requests per file.'),
});
export type RequestsFile = z.infer<typeof RequestsFileSchema>;

/** Backups hold characters and events only. Settings and the PIN are never exported. */
export const BackupFileSchema = z.object({
  format: z.literal(FILE_FORMATS.backup),
  formatVersion: z.literal(FORMAT_VERSION),
  exportedAt: IsoDateTimeSchema,
  characters: z
    .array(StoredCharacterSchema)
    .max(MAX_CHARACTERS, 'At most 1,000 characters per backup.'),
  events: z.array(GameEventSchema).max(MAX_EVENTS, 'At most 1,000 events per backup.'),
});
export type BackupFile = z.infer<typeof BackupFileSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const v of values) (seen.has(v) ? dupes : seen).add(v);
  return [...dupes];
}

/** A value after the checks Zod cannot express, with the problems found. */
type Checked<T> = { value: T; errors: string[] };

/** Most problem lines shown for one file; the rest are counted in a final line. */
const MAX_ERROR_LINES = 20;

function capErrors(errors: string[]): string[] {
  if (errors.length <= MAX_ERROR_LINES) return errors;
  const shown = errors.slice(0, MAX_ERROR_LINES);
  shown.push(`...and ${errors.length - MAX_ERROR_LINES} more problems.`);
  return shown;
}

/** Schema version, log invariants, and payloads. Valid payloads are replaced by their parse output. */
function checkCharacter(character: StoredCharacter, path: string): Checked<StoredCharacter> {
  const errors: string[] = [];
  if (character.schemaVersion > CURRENT_SCHEMA_VERSION) {
    errors.push(
      `${path}.schemaVersion: made by a newer version of the app (${character.schemaVersion}). Update the app.`,
    );
  }
  errors.push(...actionLogErrors(character.actions, `${path}.actions`));
  const payloads = checkActionPayloads(character.actions, `${path}.actions`);
  errors.push(...payloads.errors);
  return { value: { ...character, actions: payloads.actions }, errors };
}

function checkCharacterFile(file: CharacterFile): Checked<CharacterFile> {
  const checked = checkCharacter(file.character, 'character');
  return { value: { ...file, character: checked.value }, errors: checked.errors };
}

function checkRequestsFile(file: RequestsFile): Checked<RequestsFile> {
  return { value: file, errors: requestsFileErrors(file) };
}

function requestsFileErrors(file: RequestsFile): string[] {
  const errors: string[] = [];
  file.requests.forEach((r, i) => {
    if (r.characterId !== file.characterId) {
      errors.push(`requests[${i}].characterId: does not match the file's character.`);
    }
  });
  for (const id of duplicates(file.requests.map((r) => r.id))) {
    errors.push(`requests: duplicate request id "${id}".`);
  }
  return errors;
}

function checkBackupFile(file: BackupFile): Checked<BackupFile> {
  const checked = file.characters.map((c, i) => checkCharacter(c, `characters[${i}]`));
  const errors = checked.flatMap((c) => c.errors);
  for (const id of duplicates(file.characters.map((c) => c.id))) {
    errors.push(`characters: duplicate character id "${id}".`);
  }
  for (const key of duplicates(file.events.map((e) => e.key))) {
    errors.push(`events: duplicate event key "${key}".`);
  }
  return { value: { ...file, characters: checked.map((c) => c.value) }, errors };
}

function byteLength(text: string): number {
  // Each UTF-16 code unit is at least one UTF-8 byte and at most three.
  if (text.length > MAX_IMPORT_BYTES) return text.length;
  if (text.length * 3 <= MAX_IMPORT_BYTES) return text.length;
  return new TextEncoder().encode(text).length;
}

function tooBig(bytes: number): string {
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  return `The file is too large (${mb} MB). The limit is 5 MB.`;
}

/** Size check, JSON.parse, and object check shared by every parser. */
function parseJsonObject(text: string): ParseResult<Record<string, unknown>> {
  const bytes = byteLength(text);
  if (bytes > MAX_IMPORT_BYTES) return { ok: false, errors: [tooBig(bytes)] };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['The file is not valid JSON.'] };
  }
  if (!isRecord(data)) {
    return { ok: false, errors: ['The file does not contain a Rustwater data object.'] };
  }
  return { ok: true, value: data };
}

function checkEnvelope(data: Record<string, unknown>, kind: FileKind): string[] {
  const expected = FILE_FORMATS[kind];
  const format = data.format;
  if (format !== expected) {
    const found = typeof format === 'string' ? FORMAT_LABELS[format] : undefined;
    return [
      found
        ? `This is a Rustwater ${found} file, not a ${kind} file.`
        : `This is not a Rustwater ${kind} file.`,
    ];
  }
  const version = data.formatVersion;
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return ['The file has no valid formatVersion.'];
  }
  if (version > FORMAT_VERSION) {
    return [
      `The file uses format version ${version}, made by a newer version of the app. Update the app.`,
    ];
  }
  if (version !== FORMAT_VERSION) return [`Format version ${version} is not supported.`];
  return [];
}

function parseFile<T>(
  text: string,
  kind: FileKind,
  schema: z.ZodType<T>,
  extraChecks: (value: T) => Checked<T>,
): ParseResult<T> {
  const json = parseJsonObject(text);
  if (!json.ok) return json;
  return validateFile(json.value, kind, schema, extraChecks);
}

function validateFile<T>(
  data: Record<string, unknown>,
  kind: FileKind,
  schema: z.ZodType<T>,
  extraChecks: (value: T) => Checked<T>,
): ParseResult<T> {
  const envelopeErrors = checkEnvelope(data, kind);
  if (envelopeErrors.length > 0) return { ok: false, errors: envelopeErrors };
  const result = schema.safeParse(data);
  if (!result.success) return { ok: false, errors: formatIssues(result.error.issues) };
  const checked = extraChecks(result.data);
  return checked.errors.length > 0
    ? { ok: false, errors: capErrors(checked.errors) }
    : { ok: true, value: checked.value };
}

export function parseCharacterFile(text: string): ParseResult<CharacterFile> {
  return parseFile(text, 'character', CharacterFileSchema, checkCharacterFile);
}

export function parseRequestsFile(text: string): ParseResult<RequestsFile> {
  return parseFile(text, 'requests', RequestsFileSchema, checkRequestsFile);
}

export function parseBackupFile(text: string): ParseResult<BackupFile> {
  return parseFile(text, 'backup', BackupFileSchema, checkBackupFile);
}

export type AnyFile =
  | { kind: 'character'; file: CharacterFile }
  | { kind: 'requests'; file: RequestsFile }
  | { kind: 'backup'; file: BackupFile };

/** Parses any of the three formats, chosen by the file's `format` field. */
export function parseAnyFile(text: string): ParseResult<AnyFile> {
  const json = parseJsonObject(text);
  if (!json.ok) return json;
  const data = json.value;
  switch (data.format) {
    case FILE_FORMATS.character: {
      const r = validateFile(data, 'character', CharacterFileSchema, checkCharacterFile);
      return r.ok ? { ok: true, value: { kind: 'character', file: r.value } } : r;
    }
    case FILE_FORMATS.requests: {
      const r = validateFile(data, 'requests', RequestsFileSchema, checkRequestsFile);
      return r.ok ? { ok: true, value: { kind: 'requests', file: r.value } } : r;
    }
    case FILE_FORMATS.backup: {
      const r = validateFile(data, 'backup', BackupFileSchema, checkBackupFile);
      return r.ok ? { ok: true, value: { kind: 'backup', file: r.value } } : r;
    }
    default:
      return { ok: false, errors: ['This is not a Rustwater file.'] };
  }
}

/** Reads a picked file as text, refusing anything over the size limit before reading it. */
export async function readImportFile(file: Blob): Promise<ParseResult<string>> {
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, errors: [tooBig(file.size)] };
  try {
    return { ok: true, value: await file.text() };
  } catch {
    return { ok: false, errors: ['The file could not be read.'] };
  }
}

type BuildOptions = { now?: () => Date };

function buildChecked<T>(schema: z.ZodType<T>, data: unknown, extra: (v: T) => Checked<T>): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`Cannot export invalid data: ${formatIssues(result.error.issues).join(' ')}`);
  }
  const checked = extra(result.data);
  if (checked.errors.length > 0) {
    throw new Error(`Cannot export invalid data: ${capErrors(checked.errors).join(' ')}`);
  }
  return checked.value;
}

/** Builds a character file. Throws if the character would not pass import validation. */
export function buildCharacterFile(
  character: StoredCharacter,
  options: BuildOptions & { appVersion: string },
): CharacterFile {
  const now = options.now ?? (() => new Date());
  return buildChecked(
    CharacterFileSchema,
    {
      format: FILE_FORMATS.character,
      formatVersion: FORMAT_VERSION,
      exportedAt: now().toISOString(),
      appVersion: options.appVersion,
      character,
    },
    checkCharacterFile,
  );
}

/** Builds a requests file for one character. Throws on invalid or mismatched requests. */
export function buildRequestsFile(
  data: Pick<RequestsFile, 'characterId' | 'characterName' | 'requests'>,
  options: BuildOptions = {},
): RequestsFile {
  const now = options.now ?? (() => new Date());
  return buildChecked(
    RequestsFileSchema,
    {
      format: FILE_FORMATS.requests,
      formatVersion: FORMAT_VERSION,
      exportedAt: now().toISOString(),
      characterId: data.characterId,
      characterName: data.characterName,
      requests: data.requests,
    },
    checkRequestsFile,
  );
}

/** Builds a backup of characters and events. Anything else passed in is dropped. */
export function buildBackupFile(
  data: Pick<BackupFile, 'characters' | 'events'>,
  options: BuildOptions = {},
): BackupFile {
  const now = options.now ?? (() => new Date());
  return buildChecked(
    BackupFileSchema,
    {
      format: FILE_FORMATS.backup,
      formatVersion: FORMAT_VERSION,
      exportedAt: now().toISOString(),
      characters: data.characters,
      events: data.events,
    },
    checkBackupFile,
  );
}

/** Pretty JSON text for download or sharing. */
export function serializeFile(file: CharacterFile | RequestsFile | BackupFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

export const FILE_MIME_TYPE = 'application/json';
