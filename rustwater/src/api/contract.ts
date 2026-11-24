// The API between the app and its server: request bodies (Zod) and response shapes. Pure TS and
// Zod, shared by `server/` and `src/`. See docs/adr/0006-accounts-and-server.md.
import { z } from 'zod';
import { RegistrationPlanSchema, type RegistrationPlan } from '../engine/checkin/checkInPlan.ts';
import {
  EventKeySchema,
  GameEventSchema,
  IdSchema,
  RequestSchema,
  StoredCharacterSchema,
  type GameEvent,
  type Request,
  type StoredCharacter,
} from '../engine/model.ts';

export const RoleSchema = z.enum(['player', 'staff', 'admin']);
export type Role = z.infer<typeof RoleSchema>;

/** Which sign-in page a login came from. Players use one, staff and the admin the other. */
export const PortalSchema = z.enum(['player', 'staff']);
export type Portal = z.infer<typeof PortalSchema>;

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Use an email address of at most 254 characters.')
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address.');

export const NameSchema = z
  .string()
  .trim()
  .min(1, 'Enter your name.')
  .max(100, 'Use a name of at most 100 characters.');

const Password = z.string().max(200, 'Use at most 200 characters.');

export const SignupBody = z.object({ name: NameSchema, email: EmailSchema, password: Password });
export const LoginBody = z.object({
  email: EmailSchema,
  password: Password,
  portal: PortalSchema,
});
export const ResetBody = z.object({
  email: EmailSchema,
  code: z.string().trim().min(1, 'Enter the code.').max(40),
  password: Password,
});
export const ChangePasswordBody = z.object({ current: Password, next: Password });
export const AccountBody = z.object({ name: NameSchema });

export interface UserInfo {
  id: string;
  email: string;
  name: string;
  role: Role;
  disabled: boolean;
  createdAt: string;
}

export const CharacterStatusSchema = z.enum(['active', 'pending', 'rejected']);
export type CharacterStatus = z.infer<typeof CharacterStatusSchema>;

/**
 * live: a real character. test: a player's private test build for planning (ADR 0007), seen and
 * changed only by its owner, never by staff screens, events, or requests.
 */
export const CharacterKindSchema = z.enum(['live', 'test']);
export type CharacterKind = z.infer<typeof CharacterKindSchema>;

/** Most test builds one player account may keep. */
export const TEST_BUILD_LIMIT = 10;
/** Added to the name of a copied character. */
export const TEST_BUILD_SUFFIX = ' (test)';

/** Server-side facts about a character that are not part of its action log. */
export interface CharacterMeta {
  id: string;
  /** live, or the owner's private test build. */
  kind: CharacterKind;
  /** active: a live character. pending: a player's new character waiting for staff. rejected: sent back. */
  status: CharacterStatus;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  submittedAt: string | null;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  /** The wizard answers a player sent, so a sent-back character can be edited and sent again. */
  draft: unknown;
}

export interface CharacterEntry {
  character: StoredCharacter;
  meta: CharacterMeta;
}

export const SaveCharacterBody = z.object({
  character: StoredCharacterSchema,
  /** Staff only: overwrite the stored log instead of appending to it (imports and restores). */
  replace: z.boolean().optional(),
  /** On a new character only: the player account it belongs to (null for unassigned). */
  ownerId: IdSchema.nullable().optional(),
});

export const OwnerBody = z.object({ ownerId: IdSchema.nullable() });

/** A player's new character: the create wizard's commands, checked by the rules engine. */
export const SubmissionBody = z.object({
  characterId: IdSchema,
  /** The wizard answers, kept so the player can edit after staff send it back. */
  draft: z.unknown(),
  create: z.unknown(),
  items: z.unknown().optional(),
});

export const ReviewBody = z.object({ note: z.string().trim().max(2000).optional() });

/**
 * A new test build (ADR 0007): a copy of one of the player's own live characters, or the create
 * wizard's commands (checked by the rules engine, never sent to staff).
 */
export const TestBuildBody = z.discriminatedUnion('from', [
  z.object({ from: z.literal('copy'), sourceId: IdSchema }),
  z.object({ from: z.literal('scratch'), create: z.unknown(), items: z.unknown().optional() }),
]);
export type TestBuildBody = z.infer<typeof TestBuildBody>;

/** Longest hidden story note, the same as a visible one. */
export const HIDDEN_NOTE_MAX = 5000;

/**
 * A staff-only story note (I-14). It lives on the server beside the character, never in its
 * action log, so players and their device copies never receive it. Live characters only.
 */
export interface HiddenNote {
  id: string;
  characterId: string;
  text: string;
  /** The staff account name that wrote it. */
  author: string;
  createdAt: string;
  updatedAt: string;
}

export const HiddenNoteBody = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Type the story note.')
    .max(HIDDEN_NOTE_MAX, `Use at most ${HIDDEN_NOTE_MAX} characters.`),
});
export type HiddenNoteBody = z.infer<typeof HiddenNoteBody>;

export const RequestBody = z.object({ request: RequestSchema });

export const DecisionBody = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('approve'),
    teacher: z.string().trim().max(200).optional(),
    archetype: z.string().max(100).optional(),
    eventKey: EventKeySchema.optional(),
    note: z.string().trim().max(2000).optional(),
  }),
  z.object({
    decision: z.literal('reject'),
    reason: z.string().trim().min(1, 'Give a reason.').max(2000),
    note: z.string().trim().max(2000).optional(),
  }),
]);
export type DecisionBody = z.infer<typeof DecisionBody>;

export interface RequestMeta {
  /** The account that sent the request. */
  userName: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface RequestEntry {
  request: Request;
  meta: RequestMeta;
}

export const EventBody = z.object({ event: GameEventSchema });

/** Staff move Shinies from one character to another. */
export const TransferShiniesBody = z.object({
  fromId: IdSchema,
  toId: IdSchema,
  amount: z.int().min(1, 'Transfer at least 1 Shiny.').max(1_000_000),
  note: z.string().trim().max(2000).optional(),
});
export type TransferShiniesBody = z.infer<typeof TransferShiniesBody>;

/** A command a player runs on their own character (familiar naming and spending). */
export const PlayerCommandBody = z.object({ command: z.unknown() });
export type { GameEvent };

export const CreateUserBody = z.object({
  name: NameSchema,
  email: EmailSchema,
  role: z.enum(['player', 'staff']),
});
export const UpdateUserBody = z.object({
  name: NameSchema.optional(),
  role: z.enum(['player', 'staff']).optional(),
  disabled: z.boolean().optional(),
});

export interface ResetCodeInfo {
  code: string;
  expiresAt: string;
}

export interface AuditEntry {
  id: number;
  at: string;
  userName: string | null;
  action: string;
  target: string | null;
  detail: string | null;
}

export const RegistrationStatusSchema = z.enum(['registered', 'started', 'checked-in']);
export type RegistrationStatus = z.infer<typeof RegistrationStatusSchema>;

/** A character's pre-registration for one event. */
export interface RegistrationEntry {
  eventKey: string;
  characterId: string;
  characterName: string;
  /** The account that owns the character. */
  ownerName: string | null;
  status: RegistrationStatus;
  plan: RegistrationPlan;
  startedBy: string | null;
  startedAt: string | null;
  checkedInBy: string | null;
  checkedInAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const RegistrationBody = z.object({ plan: RegistrationPlanSchema });

/** Staff finish a check-in: attendance as it happened, and the plan if staff changed it. */
export const FinishCheckInBody = z.object({
  attendance: z.string().min(1).max(100),
  npcHours: z.int().min(0).max(200).default(0),
  preSignedShift: z.boolean().default(false),
  extras: z.array(z.string().min(1).max(100)).max(20).default([]),
  note: z.string().trim().max(2000).optional(),
  plan: RegistrationPlanSchema.optional(),
});

export interface ApiErrorBody {
  error: { code: string; message: string; details?: string[] };
}
