// points.awarded: one ledger credit. `amount` is what lands in the ledger (after caps);
// `requested` keeps what staff asked for when a cap clamped it ([PTS-CXP-CAP]).
import { z } from 'zod';
import { credit } from '../derive/draft.ts';
import { defineAction, LedgerCurrencySchema, RefIdSchema } from './define.ts';

export const PointsAwardedPayload = z.object({
  currency: LedgerCurrencySchema,
  /** Credited amount (after caps). */
  amount: z.int().min(1),
  /** Ledger kind id from ruleset.ledgerKinds. */
  kind: RefIdSchema,
  /** Amount asked for before caps. */
  requested: z.int().min(1).optional(),
  /** Same as amount; kept for the SPEC payload shape. */
  credited: z.int().min(0).optional(),
});
export type PointsAwardedPayload = z.infer<typeof PointsAwardedPayload>;

export const pointsAwarded = defineAction({
  type: 'points.awarded',
  payload: PointsAwardedPayload,
  apply(draft, p, action) {
    credit(
      draft,
      action,
      p.currency,
      p.amount,
      p.kind,
      action.eventKey ?? null,
      action.note ?? null,
    );
  },
});
