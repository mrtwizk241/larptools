// awards.json: check-in bundles, NPC time, extras, and the Shiny earn and spend tables.
import { z } from 'zod';
import {
  Id,
  ItemGrant,
  PointGrant,
  PositiveInt,
  Source,
  Text,
  assumptionFields,
  uniqueList,
} from './common.ts';

/** Special purchase rules the engine implements in code. */
export const PurchaseCondition = z.enum(['missed-event', 'alt-character']);

export const AttendanceBundle = z.strictObject({
  id: Id,
  name: Text,
  /** Credits ruleset.eventCxp with ledger kind "event". */
  eventCxp: z.boolean(),
  /** Also credits NPC time at its maximum (see npcTime). */
  npcTimeMax: z.boolean().optional(),
  grants: z.array(PointGrant),
  /** Owed items handed out at check-in. */
  items: z.array(ItemGrant).optional(),
  craftingAllowance: z
    .strictObject({
      fullEventOfCraftingSkills: z.boolean(),
      /** Given instead when the character has no crafting skills. */
      otherwiseItems: z.array(ItemGrant),
    })
    .optional(),
  ...assumptionFields,
  source: Source,
});
export type AttendanceBundle = z.infer<typeof AttendanceBundle>;

export const ShinyPurchase = z.strictObject({
  id: Id,
  name: Text,
  price: PositiveInt,
  grants: z.array(PointGrant).optional(),
  items: z.array(ItemGrant).optional(),
  /** Credits ruleset.eventCxp (for this or another character, see condition). */
  eventCxp: z.literal(true).optional(),
  /** Max quantity per character per event. */
  capPerEvent: PositiveInt.optional(),
  capScope: z.enum(['per-rarity', 'per-resource-type']).optional(),
  capPerCalendarYear: PositiveInt.optional(),
  condition: PurchaseCondition.optional(),
  ...assumptionFields,
  source: Source,
});
export type ShinyPurchase = z.infer<typeof ShinyPurchase>;

export const AwardsFile = z.strictObject({
  attendance: uniqueList(AttendanceBundle),
  /**
   * Credited hours = max(hours, preSignedShift.creditedHours) when a shift of shiftHours was
   * signed up before the event. CXP and PXP = min(hours, maxHours) times the per-hour rate.
   * Shinies = min(hours, maxHours) * shiniesPerHour + hours past maxHours *
   * shiniesPerHourAfterMax, capped at shiniesCap.
   */
  npcTime: z.strictObject({
    cxpPerHour: z.int().min(0),
    pxpPerHour: z.int().min(0),
    shiniesPerHour: z.int().min(0),
    maxHours: PositiveInt,
    shiniesPerHourAfterMax: z.int().min(0),
    shiniesCap: PositiveInt,
    preSignedShift: z.strictObject({ shiftHours: PositiveInt, creditedHours: PositiveInt }),
    ledgerKind: Id,
    ...assumptionFields,
    source: Source,
  }),
  extras: uniqueList(
    z.strictObject({
      id: Id,
      name: Text,
      grants: z.array(PointGrant).min(1),
      maxPerEvent: PositiveInt,
      ...assumptionFields,
      source: Source,
    }),
  ),
  betweenGamesRoles: uniqueList(
    z.strictObject({
      id: Id,
      name: Text,
      per: z.enum(['month', 'month-with-event']),
      grants: z.array(PointGrant).min(1),
      source: Source,
    }),
  ),
  otherShinySources: uniqueList(
    z.strictObject({
      id: Id,
      name: Text,
      per: z.enum(['plot-run', 'dollar', 'packet', 'hour', 'grade']),
      shiniesPerUnit: PositiveInt,
      cap: z
        .strictObject({
          amount: PositiveInt,
          scope: z.enum(['per-plot', 'per-donation']),
          waivable: z.literal(true).optional(),
        })
        .optional(),
      requiresReceipt: z.literal(true).optional(),
      requiresGmApproval: z.literal(true).optional(),
      reportCardMaxAgeYears: PositiveInt.optional(),
      /** Ledger kind id. */
      kind: Id,
      notes: Text.optional(),
      source: Source,
    }),
  ),
  shinyPurchases: uniqueList(ShinyPurchase),
  conditions: uniqueList(z.strictObject({ id: PurchaseCondition, text: Text, source: Source })),
});
export type AwardsFile = z.infer<typeof AwardsFile>;
