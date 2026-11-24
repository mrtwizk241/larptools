// points.adjusted: a staff correction or penalty, positive or negative, with a reason ([PTS-PENALTY]).
import { z } from 'zod';
import { credit } from '../derive/draft.ts';
import { defineAction, LedgerCurrencySchema, ReasonSchema } from './define.ts';

export const PointsAdjustedPayload = z.object({
  currency: LedgerCurrencySchema,
  amount: z.int().refine((n) => n !== 0, 'An adjustment cannot be 0.'),
  reason: ReasonSchema,
  kind: z.enum(['adjustment', 'penalty', 'transfer']).optional(),
});
export type PointsAdjustedPayload = z.infer<typeof PointsAdjustedPayload>;

export const pointsAdjusted = defineAction({
  type: 'points.adjusted',
  payload: PointsAdjustedPayload,
  apply(draft, p, action) {
    credit(
      draft,
      action,
      p.currency,
      p.amount,
      p.kind ?? 'adjustment',
      action.eventKey ?? null,
      p.reason,
    );
  },
});
