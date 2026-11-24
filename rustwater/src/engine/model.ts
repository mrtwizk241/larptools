// Shared data envelopes: the stored character and its action log, plus the records kept outside
// the log (requests, events, use trackers, settings). See docs/SPEC.md "Character model" and
// "Outside the action log". Pure TS and Zod only: no React, DOM, or storage imports.
import { z } from 'zod';

/** Version of the stored data shape. Storage migrations upgrade older records to this. */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Ids are uuids in practice. The check is looser (letters, digits, `_`, `-`) so fixtures can use
 * readable ids, but tight enough that an id is always safe inside a storage key or a file name.
 */
export const IdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, 'Must be 1 to 64 letters, digits, "-" or "_".');

/** ISO 8601 date and time, for example `2026-05-16T14:03:00.000Z`. */
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

/** Calendar date `YYYY-MM-DD`. */
export const IsoDateSchema = z.iso.date();

/** Event key: `YYYY-MM-DD-slug`, as produced by {@link eventKey}. */
export const EventKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must look like 2026-05-16-spring-thaw.')
  .max(100);

export const ActorRoleSchema = z.enum(['staff', 'player', 'system']);
export type ActorRole = z.infer<typeof ActorRoleSchema>;

/** Every action type in the SPEC action catalogue. */
export const ACTION_TYPES = [
  'character.created',
  'profile.updated',
  'points.awarded',
  'points.adjusted',
  'event.checkedIn',
  'event.checkInVoided',
  'shinies.spent',
  'ancestry.leveled',
  'infection.changed',
  'skill.learned',
  'skill.refunded',
  'memorized.added',
  'memorized.removed',
  'profession.started',
  'profession.leveled',
  'familiar.bonded',
  'familiar.awakened',
  'familiar.leveled',
  'familiar.skillLearned',
  'familiar.skillForgotten',
  'familiar.slotUnlocked',
  'familiar.bondBroken',
  'familiar.renamed',
  'boon.added',
  'boon.removed',
  'items.startingSet',
  'owed.added',
  'owed.delivered',
  'request.approved',
  'request.rejected',
  'character.retired',
  'trauma.added',
  'trauma.edited',
  'trauma.removed',
  'storyNote.added',
  'storyNote.edited',
  'storyNote.removed',
] as const;
export const ActionTypeSchema = z.enum(ACTION_TYPES);
export type ActionType = z.infer<typeof ActionTypeSchema>;

export const ActionSchema = z.object({
  id: IdSchema,
  seq: z.number().int().min(1),
  at: IsoDateTimeSchema,
  actor: z.object({
    role: ActorRoleSchema,
    name: z.string().max(200).optional(),
  }),
  type: ActionTypeSchema,
  /** Validated per type by the engine, not here. */
  payload: z.unknown(),
  eventKey: EventKeySchema.optional(),
  causedBy: IdSchema.optional(),
  note: z.string().max(5000).optional(),
});
export type Action = z.infer<typeof ActionSchema>;

/**
 * Size caps for stored records and imported files (security audit S-02). Zod checks `.max()`
 * before it parses any item, so an oversized array fails at once with one issue.
 */
export const MAX_ACTIONS = 10_000;
export const MAX_REQUESTS = 500;
export const MAX_CHARACTERS = 1_000;
export const MAX_EVENTS = 1_000;

export const RulesetIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, 'Must be a ruleset id such as 2026-2.0.');

export const StoredCharacterSchema = z.object({
  id: IdSchema,
  schemaVersion: z.number().int().min(0),
  rulesetId: RulesetIdSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  actions: z.array(ActionSchema).max(MAX_ACTIONS, 'At most 10,000 actions per character.'),
});
export type StoredCharacter = z.infer<typeof StoredCharacterSchema>;

/**
 * Checks the log invariants Zod cannot express per item: `seq` runs 1..n in order and action ids
 * are unique. Returns readable errors; an empty array means the log is well formed.
 */
export function actionLogErrors(actions: readonly Action[], path = 'actions'): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  actions.forEach((action, index) => {
    if (action.seq !== index + 1) {
      errors.push(`${path}[${index}].seq: expected ${index + 1}, found ${action.seq}.`);
    }
    if (seen.has(action.id)) {
      errors.push(`${path}[${index}].id: duplicate action id "${action.id}".`);
    }
    seen.add(action.id);
  });
  return errors;
}

export const SkillPartSchema = z.enum(['basic', 'adept', 'advanced', 'mastery', 'main']);
export type SkillPart = z.infer<typeof SkillPartSchema>;

export const RequestStatusSchema = z.enum(['draft', 'sent', 'approved', 'rejected']);
export type RequestStatus = z.infer<typeof RequestStatusSchema>;

const RefIdText = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Must be an id such as "fire-bolt".')
  .max(100);

const requestBase = {
  id: IdSchema,
  characterId: IdSchema,
  createdAt: IsoDateTimeSchema,
  /** Who taught it (or, for a boon, who gave it). */
  teacher: z.string().max(200),
  note: z.string().max(5000),
  status: RequestStatusSchema,
};

/** A player's "I learned skill X from Y" request. */
export const LearnSkillRequestSchema = z.object({
  ...requestBase,
  kind: z.literal('learn-skill'),
  skillId: z.string().min(1).max(100),
  part: SkillPartSchema,
  toLevel: z.number().int().min(1).max(100),
  /**
   * Multi-archetype skills on first purchase: the archetype the player asks for, one of the
   * skill's archetypeOptions. Absent in older files and for every other skill.
   */
  archetype: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Must be an archetype id such as "magic".')
    .max(100)
    .optional(),
});
export type LearnSkillRequest = z.infer<typeof LearnSkillRequestSchema>;

/** What a player can ask to memorize (free-text knowledges stay with staff). */
export const RequestMemoryKindSchema = z.enum(['spell', 'recipe', 'performance', 'ritual']);
export type RequestMemoryKind = z.infer<typeof RequestMemoryKindSchema>;

/** "I learned this spell (recipe, performance, ritual) from Y." */
export const MemorizeRequestSchema = z.object({
  ...requestBase,
  kind: z.literal('memorize'),
  memoryKind: RequestMemoryKindSchema,
  refId: RefIdText,
});
export type MemorizeRequest = z.infer<typeof MemorizeRequestSchema>;

/** "Please put this standard boon on my sheet." */
export const BoonRequestSchema = z.object({
  ...requestBase,
  kind: z.literal('boon'),
  boonId: RefIdText,
});
export type BoonRequest = z.infer<typeof BoonRequestSchema>;

/** A player's request to staff: a skill level, something to memorize, or a boon. */
export const RequestSchema = z.discriminatedUnion('kind', [
  LearnSkillRequestSchema,
  MemorizeRequestSchema,
  BoonRequestSchema,
]);
export type Request = z.infer<typeof RequestSchema>;

export const GameEventSchema = z.object({
  key: EventKeySchema,
  name: z.string().min(1).max(200),
  date: IsoDateSchema,
  /** Closed out by staff: players no longer see it or pre-register for it. */
  closed: z.boolean().optional(),
});
export type GameEvent = z.infer<typeof GameEventSchema>;

const UseCountsSchema = z.record(z.string().min(1).max(200), z.number().int().min(0));

/** Uses spent per skill or ability part, kept outside the action log (ADR 0003). */
export const UseTrackerSchema = z.object({
  characterId: IdSchema,
  perEncounter: UseCountsSchema,
  perRepop: UseCountsSchema,
  updatedAt: IsoDateTimeSchema,
});
export type UseTracker = z.infer<typeof UseTrackerSchema>;

export const ModeSchema = z.enum(['player', 'staff']);
export type Mode = z.infer<typeof ModeSchema>;

export const ThemeSchema = z.enum(['system', 'light', 'dark']);
export type Theme = z.infer<typeof ThemeSchema>;

export const SettingsSchema = z.object({
  mode: ModeSchema,
  pinHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  pinSalt: z
    .string()
    .regex(/^[0-9a-f]{32}$/)
    .optional(),
  theme: ThemeSchema,
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = { mode: 'player', theme: 'system' };

/**
 * Turns Zod issues into short readable lines such as `character.actions[3].seq: Invalid input`.
 * At most `limit` lines; the rest are counted in a final line.
 */
export function formatIssues(
  issues: readonly z.core.$ZodIssue[],
  prefix = '',
  limit = 20,
): string[] {
  const lines = issues.slice(0, limit).map((issue) => {
    const path = issue.path.reduce<string>((acc, part) => {
      if (typeof part === 'number') return `${acc}[${part}]`;
      return acc === '' ? String(part) : `${acc}.${String(part)}`;
    }, prefix);
    return path === '' ? issue.message : `${path}: ${issue.message}`;
  });
  if (issues.length > limit) lines.push(`...and ${issues.length - limit} more problems.`);
  return lines;
}

/**
 * Lowercase ASCII slug: accents folded, every other run of non-alphanumerics becomes one `-`,
 * capped at 60 characters. Falls back to `event` when nothing is left.
 */
export function slug(text: string): string {
  const s = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return s === '' ? 'event' : s;
}

/** Deterministic event key, so two devices name the same event the same way. */
export function eventKey(date: string, name: string): string {
  return `${date}-${slug(name)}`;
}
