// event.checkInVoided: staff take back a whole check-in, with a reason. The check-in stays in the
// log, but replay stops counting it: its ledger credits get reversing rows (same kind, negative,
// with the reason), the event is no longer attended (so it can be checked in again), and its item
// rewards go away unless they were already handed over (those stay, with a warning).
import { z } from 'zod';
import { credit, warn } from '../derive/draft.ts';
import { IdSchema } from '../model.ts';
import { defineAction, ReasonSchema } from './define.ts';
import { checkInOwedId } from './owed.ts';

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
    checkIn.owed.forEach((text, i) => {
      const id = checkInOwedId(checkIn.actionId, i);
      if (!draft.owedDelivered.has(id)) return;
      draft.voidedOwed.push({ id, text, eventKey: checkIn.key });
      warn(
        draft,
        action.id,
        'VOIDED_OWED_DELIVERED',
        `${text} from the voided check-in to ${checkIn.name} was already handed over; it stays on the sheet.`,
      );
    });
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
