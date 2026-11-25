// points.awarded, points.adjusted, mt.spent ([PTS-*], [PTS-MT-SPEND]).
// - points.awarded: `amount` is what lands in the ledger (after the XP and CXP caps);
//   `requested` keeps what staff asked for.
// - points.adjusted: a correction or penalty, positive or negative, with a reason.
// - mt.spent: debits the Mist Tokens (kind mt-purchase) and credits the stored grants.
import { z } from 'zod';
import { credit, warn } from '../derive/draft.ts';
import { EventKeySchema, NamedLevelSchema } from '../model.ts';
import {
  defineAction,
  ItemTextSchema,
  LedgerCurrencySchema,
  ReasonSchema,
  RefIdSchema,
} from './define.ts';

/** Ledger kinds the engine writes besides those in ruleset.ledgerKinds. */
export const ENGINE_LEDGER_KINDS = { adjustment: 'adjustment', penalty: 'penalty' } as const;

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

export const PointsAdjustedPayload = z.object({
  currency: LedgerCurrencySchema,
  amount: z.int().refine((n) => n !== 0, 'An adjustment cannot be 0.'),
  reason: ReasonSchema,
  kind: z.enum(['adjustment', 'penalty']).optional(),
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

export const MtSpentPayload = z.object({
  purchaseId: RefIdSchema,
  qty: z.int().min(1).max(1000),
  mtCost: z.int().min(0),
  grants: z
    .array(z.object({ currency: LedgerCurrencySchema, amount: z.int().min(1), kind: RefIdSchema }))
    .max(10)
    .default([]),
  /** Items handed over, as text. */
  items: z.array(ItemTextSchema).max(20).default([]),
  /** The event the purchase counts for (back-buys, missed or alternate character event XP). */
  forEventKey: EventKeySchema.optional(),
  /** Purchases priced by named level (teaching, Spell Enhancement, stable items). */
  namedLevel: NamedLevelSchema.optional(),
  /** Teaching purchases: the skill taught. */
  skillId: RefIdSchema.optional(),
});
export type MtSpentPayload = z.input<typeof MtSpentPayload>;

export const mtSpent = defineAction({
  type: 'mt.spent',
  payload: MtSpentPayload,
  apply(draft, p, action) {
    const rs = draft.ruleset;
    const purchase = rs.mtPurchasesById[p.purchaseId];
    if (!purchase)
      warn(draft, action.id, 'UNKNOWN_PURCHASE', `Unknown Mist Token purchase "${p.purchaseId}".`);
    const eventKey = action.eventKey ?? null;
    const capKey = p.forEventKey ?? eventKey;
    credit(draft, action, 'mt', -p.mtCost, 'mt-purchase', eventKey);
    for (const g of p.grants) credit(draft, action, g.currency, g.amount, g.kind, capKey);
    draft.mtSpent += p.mtCost;
    draft.mtPurchases.push({
      actionId: action.id,
      at: action.at,
      purchaseId: p.purchaseId,
      name: purchase?.name ?? p.purchaseId,
      qty: p.qty,
      mtCost: p.mtCost,
      capKey,
      eventKey,
      forEventKey: p.forEventKey ?? null,
      namedLevel: p.namedLevel ?? null,
      skillId: p.skillId ?? null,
      grants: p.grants.map((g) => ({ currency: g.currency, amount: g.amount })),
      items: [...p.items],
      usedBy: null,
    });
  },
});
