// The API between the app and its server: request bodies (Zod) and response shapes. Pure TS and
// Zod, shared by `server/` and `src/`. See docs/adr/0006-accounts-and-server.md.
import { z } from 'zod';
import { AttendanceSchema } from '../engine/actions/events.ts';
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

/** Server-side facts about a character that are not part of its action log. */
export interface CharacterMeta {
  id: string;
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

/**
 * A player's new character: the create wizard's Sylvaris commands, checked by the rules engine on
 * the server. `create` is a `createCharacter` command (with the optional `concept` and
 * `backstory`, saved in `character.created`); `skills` are `learnSkill` commands (folded
 * into the creation, so the creation limits apply); `items` is a `setStartingItems` command;
 * `journals` are `addJournal` commands for the spells, recipes, and performance notes that the
 * starting items name. The server sets the player name and email from the account and drops any
 * retirement carry-over (staff add that after approval).
 */
export const SubmissionBody = z.object({
  characterId: IdSchema,
  /** The wizard answers, kept so the player can edit after staff send it back. */
  draft: z.unknown(),
  create: z.unknown(),
  skills: z.array(z.unknown()).max(200).optional(),
  items: z.unknown().optional(),
  journals: z.array(z.unknown()).max(50).optional(),
});
export type SubmissionBody = z.infer<typeof SubmissionBody>;

export const ReviewBody = z.object({ note: z.string().trim().max(2000).optional() });

export const RequestBody = z.object({ request: RequestSchema });

export const DecisionBody = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('approve'),
    /** Overrides the teacher the player named. */
    teacher: z.string().trim().max(200).optional(),
    /** The event it was learned at (needed for Calling Techniques). */
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

/**
 * Staff finish a check-in: attendance as it happened (player, npc-unpaid, npc-paid, gm-staff),
 * NPC hours, extras (check-in help, marshal or medic, setup, clean up), the paid NPC choice, and
 * the plan if staff changed it.
 */
export const FinishCheckInBody = z.object({
  attendance: AttendanceSchema,
  npcHours: z.int().min(0).max(200).default(0),
  extras: z.array(z.string().min(1).max(100)).max(20).default([]),
  paidChoice: z.enum(['skills', 'silver']).optional(),
  note: z.string().trim().max(2000).optional(),
  plan: RegistrationPlanSchema.optional(),
});
export type FinishCheckInBody = z.input<typeof FinishCheckInBody>;

export interface ApiErrorBody {
  error: { code: string; message: string; details?: string[] };
}
