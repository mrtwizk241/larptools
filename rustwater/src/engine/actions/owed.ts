// owed.added / owed.delivered ([PTS-OWED]). Item rewards handed out at check-in are listed from
// the check-in itself with ids `<check-in action id>#<index>`; owed.delivered marks either kind.
import { z } from 'zod';
import { warn, type Draft } from '../derive/draft.ts';
import { EventKeySchema } from '../model.ts';
import { defineAction } from './define.ts';

/** An owed.added action id, or `<check-in action id>#<index>`. */
export const OwedIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}(#\d{1,3})?$/, 'Must be an owed reward id.');

export const OwedAddedPayload = z.object({
  text: z.string().trim().min(1).max(500),
  eventKey: EventKeySchema.optional(),
});
export type OwedAddedPayload = z.infer<typeof OwedAddedPayload>;

export const OwedDeliveredPayload = z.object({ owedId: OwedIdSchema });
export type OwedDeliveredPayload = z.infer<typeof OwedDeliveredPayload>;

/** Id of the n-th item reward recorded on a check-in. */
export function checkInOwedId(checkInActionId: string, index: number): string {
  return `${checkInActionId}#${index}`;
}

/** True when `id` names an owed reward in the draft (manual or from a check-in). */
export function owedExists(draft: Draft, id: string): boolean {
  if (draft.owed.some((o) => o.id === id)) return true;
  if (draft.voidedOwed.some((o) => o.id === id)) return true;
  return draft.events.some((e) => e.owed.some((_, i) => checkInOwedId(e.actionId, i) === id));
}

export const owedAdded = defineAction({
  type: 'owed.added',
  payload: OwedAddedPayload,
  apply(draft, p, action) {
    draft.owed.push({
      id: action.id,
      text: p.text,
      eventKey: p.eventKey ?? action.eventKey ?? null,
    });
  },
});

export const owedDelivered = defineAction({
  type: 'owed.delivered',
  payload: OwedDeliveredPayload,
  apply(draft, p, action) {
    if (!owedExists(draft, p.owedId)) {
      warn(draft, action.id, 'OWED_NOT_FOUND', `No owed reward "${p.owedId}"; skipped.`);
      return;
    }
    if (draft.owedDelivered.has(p.owedId)) {
      warn(draft, action.id, 'OWED_ALREADY_DELIVERED', 'That reward was already delivered.');
      return;
    }
    draft.owedDelivered.set(p.owedId, action.at);
  },
  /** Staff can still hand out what a retired character was owed. */
  allowedWhenRetired: () => true,
});
