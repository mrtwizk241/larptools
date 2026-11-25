// event.checkedIn and event.checkInVoided ([EVT-CHECKIN], [PTS-XP-EVENT], [EVT-UPKEEP]).
// - A check-in credits the stored awards (computed at check-in, after caps) and records the
//   upkeep and what the desk handed over.
// - A void keeps the check-in in the log but stops counting it: its credits get reversing rows
//   (same kind, negative, with the reason) and the event is no longer attended.
import { z } from 'zod';
import { credit, warn } from '../derive/draft.ts';
import { GameEventSchema, IdSchema } from '../model.ts';
import { AwardSchema, defineAction, ItemTextSchema, ReasonSchema, RefIdSchema } from './define.ts';

export const AttendanceSchema = z.enum(['player', 'npc-unpaid', 'npc-paid', 'gm-staff']);

export const EventCheckedInPayload = z.object({
  event: GameEventSchema,
  /** Attendance bundle id from awards.json. */
  attendance: AttendanceSchema,
  npcHours: z.int().min(0).max(200).default(0),
  extras: z.array(RefIdSchema).max(20).default([]),
  /** Paid NPC: skill use or silver. */
  paidChoice: z.enum(['skills', 'silver']).optional(),
  /** Credited amounts, after the caps. */
  awards: z.array(AwardSchema).max(50),
  /** Amounts above the XP or CXP earned cap: recorded, not credited. */
  notCredited: z.array(AwardSchema).max(50).default([]),
  upkeep: z
    .object({
      dueSilver: z.int().min(0),
      /** `paid`, a ruleset upkeep modifier id, or null when nothing was due. */
      coveredBy: RefIdSchema.nullable(),
    })
    .default({ dueSilver: 0, coveredBy: null }),
  /** What the desk handed over, as text (silver, coins, components, purchases). */
  handedOut: z.array(ItemTextSchema).max(100).default([]),
});
export type EventCheckedInPayload = z.input<typeof EventCheckedInPayload>;

export const eventCheckedIn = defineAction({
  type: 'event.checkedIn',
  payload: EventCheckedInPayload,
  apply(draft, p, action) {
    if (draft.eventKeys.has(p.event.key)) {
      warn(
        draft,
        action.id,
        'DUPLICATE_CHECK_IN',
        `Already checked in to ${p.event.name} (${p.event.key}); skipped.`,
      );
      return;
    }
    draft.eventKeys.add(p.event.key);
    draft.events.push({
      key: p.event.key,
      name: p.event.name,
      date: p.event.date,
      attendance: p.attendance,
      actionId: action.id,
      npcHours: p.npcHours,
      extras: [...p.extras],
      awards: p.awards.map((a) => ({ ...a })),
      notCredited: p.notCredited.map((a) => ({ ...a })),
      upkeep: { ...p.upkeep },
      handedOut: [...p.handedOut],
    });
    for (const a of p.awards) credit(draft, action, a.currency, a.amount, a.kind, p.event.key);
  },
});

export const EventCheckInVoidedPayload = z.object({
  /** The event.checkedIn action being voided. */
  checkInActionId: IdSchema,
  reason: ReasonSchema,
});
export type EventCheckInVoidedPayload = z.infer<typeof EventCheckInVoidedPayload>;

/** Ledger note on the reversing rows. */
export function voidNote(reason: string): string {
  return `Voided check-in: ${reason}`;
}

export const eventCheckInVoided = defineAction({
  type: 'event.checkInVoided',
  payload: EventCheckInVoidedPayload,
  apply(draft, p, action) {
    const index = draft.events.findIndex((e) => e.actionId === p.checkInActionId);
    const checkIn = index >= 0 ? draft.events[index] : undefined;
    if (!checkIn) {
      if (draft.voidedCheckIns.some((v) => v.checkInActionId === p.checkInActionId))
        warn(
          draft,
          action.id,
          'CHECK_IN_ALREADY_VOIDED',
          'That check-in was already voided; skipped.',
        );
      else
        warn(
          draft,
          action.id,
          'CHECK_IN_NOT_FOUND',
          `No check-in "${p.checkInActionId}" to void; skipped.`,
        );
      return;
    }
    draft.events.splice(index, 1);
    draft.eventKeys.delete(checkIn.key);
    const note = voidNote(p.reason);
    for (const a of checkIn.awards)
      credit(draft, action, a.currency, -a.amount, a.kind, checkIn.key, note);
    draft.voidedCheckIns.push({
      checkInActionId: checkIn.actionId,
      actionId: action.id,
      key: checkIn.key,
      name: checkIn.name,
      date: checkIn.date,
      reason: p.reason,
    });
  },
});
