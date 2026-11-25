// Records on the sheet: starting items ([ITEM-START]), Spirit Fragments ([PTS-SPIRIT]), Boons
// ([PLAY-BOON-SLOTS]), familiarized locations ([PLAY-FAMILIARIZE]), the Familiar ([FAM-SHEET]),
// and items owed.
import { z } from 'zod';
import { warn } from '../derive/draft.ts';
import { EventKeySchema, IdSchema, IsoDateSchema } from '../model.ts';
import {
  defineAction,
  ItemTextSchema,
  NameSchema,
  ReasonSchema,
  RefIdSchema,
  ShortTextSchema,
} from './define.ts';

// ---- items.startingSet ----

export const StartingPickSchema = z.object({
  optionId: RefIdSchema,
  /** Weapon type, element, spell, recipe, craft, or performance chosen with the pick. */
  detail: ShortTextSchema.optional(),
});

export const ItemsStartingSetPayload = z.object({ picks: z.array(StartingPickSchema).max(100) });
export type ItemsStartingSetPayload = z.infer<typeof ItemsStartingSetPayload>;

export const itemsStartingSet = defineAction({
  type: 'items.startingSet',
  payload: ItemsStartingSetPayload,
  apply(draft, p, action) {
    const rs = draft.ruleset;
    const picks = [];
    for (const pick of p.picks) {
      const option = rs.startingOptionsById[pick.optionId];
      if (!option) {
        warn(
          draft,
          action.id,
          'UNKNOWN_STARTING_ITEM',
          `Unknown starting item "${pick.optionId}"; left out.`,
        );
        continue;
      }
      picks.push({
        optionId: option.id,
        detail: pick.detail ? pick.detail : null,
        name: option.name,
      });
    }
    if (picks.length > rs.startingEquipment.picks)
      warn(
        draft,
        action.id,
        'STARTING_ITEMS_OVER',
        `${picks.length} starting items picked; the limit is ${rs.startingEquipment.picks}.`,
      );
    draft.startingItems = picks;
  },
});

// ---- spirit.changed ----

export const SpiritChangedPayload = z.object({
  delta: z
    .int()
    .min(-100)
    .max(100)
    .refine((n) => n !== 0, 'A change cannot be 0.'),
  reason: ReasonSchema,
});
export type SpiritChangedPayload = z.infer<typeof SpiritChangedPayload>;

export const spiritChanged = defineAction({
  type: 'spirit.changed',
  payload: SpiritChangedPayload,
  apply(draft, p, action) {
    const max = draft.ruleset.ruleset.body.spiritFragmentsMax;
    const raw = draft.spirit + p.delta;
    const after = Math.max(0, Math.min(max, raw));
    if (after !== raw)
      warn(
        draft,
        action.id,
        'SPIRIT_RANGE',
        `Spirit Fragments stay between 0 and ${max}; ${raw} became ${after}.`,
      );
    draft.spirit = after;
    draft.spiritHistory.push({
      actionId: action.id,
      at: action.at,
      delta: p.delta,
      reason: p.reason,
      after,
    });
  },
});

// ---- boon.added / boon.removed ----

export const BoonAddedPayload = z.object({
  slot: z.enum(['greater', 'lesser']),
  name: NameSchema,
  /** A Flesh Crafting mutagen recipe id, when the boon is one. */
  recipeId: RefIdSchema.optional(),
});
export type BoonAddedPayload = z.infer<typeof BoonAddedPayload>;

export const boonAdded = defineAction({
  type: 'boon.added',
  payload: BoonAddedPayload,
  apply(draft, p, action) {
    draft.boons.push({
      actionId: action.id,
      slot: p.slot,
      name: p.name,
      recipeId: p.recipeId ?? null,
      addedAt: action.at,
    });
  },
});

export const BoonRemovedPayload = z.object({
  boonActionId: IdSchema,
  reason: ReasonSchema.optional(),
});
export type BoonRemovedPayload = z.infer<typeof BoonRemovedPayload>;

export const boonRemoved = defineAction({
  type: 'boon.removed',
  payload: BoonRemovedPayload,
  apply(draft, p, action) {
    const index = draft.boons.findIndex((b) => b.actionId === p.boonActionId);
    if (index < 0) {
      warn(draft, action.id, 'BOON_NOT_FOUND', 'That boon is not on the sheet; skipped.');
      return;
    }
    draft.boons.splice(index, 1);
  },
});

// ---- location.familiarized / location.removed ----

export const LocationFamiliarizedPayload = z.object({
  name: NameSchema,
  /** portal (Blink, Rifting, Air Magic) or tree (Elf Friend of the Forest). */
  kind: z.enum(['portal', 'tree']).default('portal'),
  date: IsoDateSchema,
});
export type LocationFamiliarizedPayload = z.input<typeof LocationFamiliarizedPayload>;

export const locationFamiliarized = defineAction({
  type: 'location.familiarized',
  payload: LocationFamiliarizedPayload,
  apply(draft, p, action) {
    draft.locations.push({ entryId: action.id, name: p.name, kind: p.kind, date: p.date });
  },
});

export const LocationRemovedPayload = z.object({ entryId: IdSchema, reason: ReasonSchema });
export type LocationRemovedPayload = z.infer<typeof LocationRemovedPayload>;

export const locationRemoved = defineAction({
  type: 'location.removed',
  payload: LocationRemovedPayload,
  apply(draft, p, action) {
    const index = draft.locations.findIndex((l) => l.entryId === p.entryId);
    if (index < 0) {
      warn(draft, action.id, 'LOCATION_NOT_FOUND', 'That location is not on the sheet; skipped.');
      return;
    }
    draft.locations.splice(index, 1);
  },
});

// ---- familiar.set / familiar.removed ----

export const FamiliarTrickSchema = z.object({
  /** A skill id (skill trick) or a special trick id from familiars.json. */
  id: RefIdSchema,
  slots: z.int().min(1).max(10).default(1),
  /** The chosen performance, element, and so on. */
  detail: ShortTextSchema.optional(),
});

export const FamiliarSetPayload = z.object({
  name: NameSchema,
  form: ShortTextSchema.optional(),
  quality: z.enum(['basic', 'expert', 'master', 'grandmaster']),
  stable: z.boolean().default(true),
  tricks: z.array(FamiliarTrickSchema).max(20).default([]),
});
export type FamiliarSetPayload = z.input<typeof FamiliarSetPayload>;

export const familiarSet = defineAction({
  type: 'familiar.set',
  payload: FamiliarSetPayload,
  apply(draft, p, action) {
    const rs = draft.ruleset;
    const levelBySlots = rs.familiars.rules.skillTricks.levelBySlots;
    const tricks = p.tricks.map((t) => {
      const skill = rs.skillsById[t.id];
      const special = rs.specialTricksById[t.id];
      if (!skill && !special)
        warn(draft, action.id, 'UNKNOWN_TRICK', `Unknown familiar trick "${t.id}".`);
      const level = skill
        ? ([...levelBySlots].reverse().find((l) => t.slots >= l.slots)?.level ?? null)
        : null;
      return {
        id: t.id,
        name: skill?.name ?? special?.summary ?? t.id,
        kind: skill ? ('skill' as const) : ('special' as const),
        slots: t.slots,
        level,
        uses:
          skill && rs.familiars.rules.skillTricks.usesPerRepopEqualsSlots
            ? t.slots
            : (special?.uses ?? null),
        detail: t.detail ? t.detail : null,
      };
    });
    draft.familiar = {
      actionId: action.id,
      name: p.name,
      form: p.form ? p.form : null,
      quality: p.quality,
      stable: p.stable,
      tricks,
      setAt: action.at,
    };
  },
});

export const FamiliarRemovedPayload = z.object({ reason: ReasonSchema });
export type FamiliarRemovedPayload = z.infer<typeof FamiliarRemovedPayload>;

export const familiarRemoved = defineAction({
  type: 'familiar.removed',
  payload: FamiliarRemovedPayload,
  apply(draft, _p, action) {
    if (!draft.familiar) {
      warn(draft, action.id, 'NO_FAMILIAR', 'The character has no Familiar; skipped.');
      return;
    }
    draft.familiar = null;
  },
});

// ---- owed.added / owed.delivered ----

export const OwedAddedPayload = z.object({
  text: ItemTextSchema,
  eventKey: EventKeySchema.optional(),
});
export type OwedAddedPayload = z.infer<typeof OwedAddedPayload>;

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

export const OwedDeliveredPayload = z.object({ owedId: IdSchema });
export type OwedDeliveredPayload = z.infer<typeof OwedDeliveredPayload>;

export const owedDelivered = defineAction({
  type: 'owed.delivered',
  payload: OwedDeliveredPayload,
  apply(draft, p, action) {
    if (!draft.owed.some((o) => o.id === p.owedId)) {
      warn(draft, action.id, 'OWED_NOT_FOUND', `No owed item "${p.owedId}"; skipped.`);
      return;
    }
    if (draft.owedDelivered.has(p.owedId)) {
      warn(draft, action.id, 'OWED_ALREADY_DELIVERED', 'That item was already delivered.');
      return;
    }
    draft.owedDelivered.set(p.owedId, action.at);
  },
  /** Staff can still hand out what a retired character was owed. */
  allowedWhenRetired: () => true,
});
