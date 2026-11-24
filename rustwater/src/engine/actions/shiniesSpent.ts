// shinies.spent: one Shiny purchase ([PTS-SHINY-SPEND]). Replay debits the stored cost and
// credits the stored grants.
import { z } from 'zod';
import { credit } from '../derive/draft.ts';
import { EventKeySchema, GameEventSchema } from '../model.ts';
import { defineAction, LedgerCurrencySchema, RefIdSchema } from './define.ts';

export const ShiniesSpentPayload = z.object({
  purchaseId: RefIdSchema,
  qty: z.int().min(1).max(1000),
  shiniesCost: z.int().min(0),
  grants: z
    .array(
      z.object({
        currency: LedgerCurrencySchema,
        amount: z.int().min(1),
        kind: RefIdSchema,
        /** Ledger event key when it differs from the action's (missed-event Event CXP). */
        eventKey: EventKeySchema.optional(),
      }),
    )
    .max(20),
  /** Items handed over, as text. */
  items: z.array(z.string().max(500)).max(20),
  /** Missed-event purchase: the event whose Event CXP is bought. */
  forEvent: GameEventSchema.optional(),
  /** Alt-character purchase: the character who receives the Event CXP. */
  altCharacter: z
    .object({ id: z.string().max(64).optional(), name: z.string().trim().min(1).max(200) })
    .optional(),
});
export type ShiniesSpentPayload = z.infer<typeof ShiniesSpentPayload>;

export const shiniesSpent = defineAction({
  type: 'shinies.spent',
  payload: ShiniesSpentPayload,
  apply(draft, p, action) {
    const eventKey = action.eventKey ?? null;
    credit(draft, action, 'shinies', -p.shiniesCost, 'shiny-spend', eventKey);
    for (const g of p.grants)
      credit(draft, action, g.currency, g.amount, g.kind, g.eventKey ?? eventKey);
    draft.shinyPurchases.push({
      actionId: action.id,
      purchaseId: p.purchaseId,
      qty: p.qty,
      shiniesCost: p.shiniesCost,
      eventKey,
      forEventKey: p.forEvent?.key ?? null,
      altCharacterName: p.altCharacter?.name ?? null,
      items: [...p.items],
    });
  },
});
