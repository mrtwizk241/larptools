// event.checkedIn: attendance at one game event plus the awards computed at check-in
// ([PTS-CHECKIN], [PTS-CXP-EVENT], [PTS-SHINY-EARN]). Replay credits the stored awards.
import { z } from 'zod';
import { credit, warn } from '../derive/draft.ts';
import { GameEventSchema } from '../model.ts';
import { defineAction, LedgerCurrencySchema, RefIdSchema } from './define.ts';

export const AwardSchema = z.object({
  currency: LedgerCurrencySchema,
  amount: z.int().min(1),
  kind: RefIdSchema,
});

export const EventCheckedInPayload = z.object({
  event: GameEventSchema,
  /** Attendance bundle id from awards.json (player, npc-unpaid, npc-paid, gm-staff). */
  attendance: RefIdSchema,
  npcHours: z.int().min(0).max(200),
  preSignedShift: z.boolean(),
  extras: z.array(RefIdSchema).max(50),
  /** Credited amounts, after caps. */
  awards: z.array(AwardSchema).max(50),
  /** Item rewards handed out at check-in, as text. */
  owed: z.array(z.string().max(500)).max(50),
  /** Check-in skill items handed over at the desk, as text (pre-registration). */
  handedOut: z.array(z.string().max(300)).max(100).optional(),
  /** Start-of-event choices and how upkeep was paid, as text. */
  picks: z.array(z.string().max(300)).max(50).optional(),
});
export type EventCheckedInPayload = z.infer<typeof EventCheckedInPayload>;

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
      preSignedShift: p.preSignedShift,
      extras: [...p.extras],
      awards: p.awards.map((a) => ({ ...a })),
      owed: [...p.owed],
      handedOut: [...(p.handedOut ?? [])],
      picks: [...(p.picks ?? [])],
    });
    for (const a of p.awards) credit(draft, action, a.currency, a.amount, a.kind, p.event.key);
  },
});
