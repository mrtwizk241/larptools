// awards.json: check-in attendance bundles, NPC time, extras, away-from-event roles, other
// Mist Token sources, and the Mist Token purchase table with its caps (Rulebook p.12, p.13).
import { z } from 'zod';
import { CurrencyId, Id, NonNegInt, PositiveInt, Source, Text, uniqueList } from './common.ts';

/** A point award written to a currency ledger with a ledger kind (ruleset.json). */
export const PointGrant = z.strictObject({ currency: CurrencyId, amount: PositiveInt, kind: Id });
export type PointGrant = z.infer<typeof PointGrant>;

export const AttendanceId = z.enum(['player', 'npc-unpaid', 'npc-paid', 'gm-staff']);
export type AttendanceId = z.infer<typeof AttendanceId>;

export const AttendanceBundle = z.strictObject({
  id: AttendanceId,
  name: Text,
  grants: z.array(PointGrant).min(1),
  /** Also credits NPC time at its maximum hours (see npcTime). */
  npcTimeMax: z.literal(true).optional(),
  /** Silver handed out (not a ledger currency). */
  silver: PositiveInt.optional(),
  /** Paid NPCs choose skill use or silver. */
  paidChoice: z
    .strictObject({
      options: z.array(z.enum(['skills', 'silver'])).length(2),
      /** 1 Silver per this many XP the character has, rounded down. */
      silverPerXp: PositiveInt,
      note: Text,
    })
    .optional(),
  note: Text.optional(),
  source: Source,
});
export type AttendanceBundle = z.infer<typeof AttendanceBundle>;

export const PurchaseCondition = z.enum(['missed-event', 'alt-character']);

/** Cost per named level of what is bought. */
const MtByNamedLevel = z.strictObject({
  basic: PositiveInt,
  expert: PositiveInt,
  master: PositiveInt,
  grandmaster: PositiveInt.optional(),
});

export const MtPurchase = z
  .strictObject({
    id: Id,
    name: Text,
    /** Flat price for one unit. */
    mtCost: PositiveInt.optional(),
    /** Price by named level of the item, enhancement, or teaching. */
    mtByNamedLevel: MtByNamedLevel.optional(),
    grants: z
      .array(z.strictObject({ currency: CurrencyId, amount: PositiveInt }))
      .min(1)
      .optional(),
    items: z
      .strictObject({
        basicComponents: PositiveInt.optional(),
        exoticComponents: PositiveInt.optional(),
        uncutGems: PositiveInt.optional(),
        copper: PositiveInt.optional(),
      })
      .optional(),
    capPerEvent: PositiveInt.optional(),
    capPerYear: PositiveInt.optional(),
    /** Purchases in one group share capPerEvent. */
    capGroup: Id.optional(),
    /** May be bought for past events of the current year or season. */
    backBuy: z.literal(true).optional(),
    condition: PurchaseCondition.optional(),
    note: Text.optional(),
    source: Source,
  })
  .refine((p) => (p.mtCost === undefined) !== (p.mtByNamedLevel === undefined), {
    message: 'set exactly one of mtCost and mtByNamedLevel',
  });
export type MtPurchase = z.infer<typeof MtPurchase>;

export const AwardsFile = z.strictObject({
  attendance: uniqueList(AttendanceBundle),
  /**
   * XP and CXP: per hour up to maxHours. MT: mtPerHourAfterMax for each hour past maxHours,
   * capped at mtCap.
   */
  npcTime: z.strictObject({
    xpPerHour: PositiveInt,
    cxpPerHour: PositiveInt,
    maxHours: PositiveInt,
    mtPerHourAfterMax: PositiveInt,
    mtCap: PositiveInt,
    ledgerKind: Id,
    source: Source,
  }),
  extras: uniqueList(
    z
      .strictObject({
        id: Id,
        name: Text,
        /** Counts as this many hours of NPC time. */
        npcHours: PositiveInt.optional(),
        grants: z.array(PointGrant).min(1).optional(),
        maxPerEvent: PositiveInt,
        source: Source,
      })
      .refine((x) => (x.npcHours === undefined) !== (x.grants === undefined), {
        message: 'set exactly one of npcHours and grants',
      }),
  ),
  awayRoles: uniqueList(
    z.strictObject({
      id: Id,
      name: Text,
      per: z.enum(['month', 'month-with-event']),
      grants: z.array(PointGrant).min(1),
      source: Source,
    }),
  ),
  otherMtSources: uniqueList(
    z.strictObject({
      id: Id,
      name: Text,
      per: z.enum(['plot', 'dollar', 'hour', 'grade']),
      mtPerUnit: PositiveInt.optional(),
      mtMin: PositiveInt.optional(),
      mtMax: PositiveInt.optional(),
      reportWithinYears: PositiveInt.optional(),
      kind: Id,
      source: Source,
    }),
  ),
  mtPurchases: uniqueList(MtPurchase),
  conditions: uniqueList(z.strictObject({ id: PurchaseCondition, text: Text, source: Source })),
  totalSpendCap: z.strictObject({
    /** null: no total cap per event (Q-PTS-1 default). */
    perEvent: NonNegInt.nullable(),
    /** Optional town building setting; null means no limit. */
    huntersLodge: z.strictObject({
      basic: PositiveInt,
      expert: PositiveInt,
      master: PositiveInt.nullable(),
    }),
    note: Text,
    source: Source,
  }),
});
export type AwardsFile = z.infer<typeof AwardsFile>;
