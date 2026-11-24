// boon.added / boon.removed ([PLAY-BOONS]): 3 slots, one instance per boon id, expiry text.
import { z } from 'zod';
import { warn } from '../derive/draft.ts';
import { IdSchema } from '../model.ts';
import { defineAction, NameSchema, RefIdSchema } from './define.ts';

/** A stat a custom boon changes, like the standard boons' `effects`. */
export const BoonEffectSchema = z.object({
  stat: z.enum(['maxHealth', 'armor', 'weaponDamage']),
  add: z.int().min(-1000).max(1000),
});
export type BoonEffect = z.infer<typeof BoonEffectSchema>;

export const BoonAddedPayload = z.object({
  /** Boon id from boons.json; leave out for a boon typed as free text. */
  boonId: RefIdSchema.optional(),
  name: NameSchema,
  /** Expiry text shown on the sheet. */
  expires: z.string().trim().max(500).optional(),
  /** What a custom boon does (standard boons take their text from boons.json). */
  text: z.string().trim().max(2000).optional(),
  /** Stats a custom boon changes. */
  effects: z.array(BoonEffectSchema).max(5).optional(),
});
export type BoonAddedPayload = z.infer<typeof BoonAddedPayload>;

export const BoonRemovedPayload = z.object({
  /** The boon.added action of the boon removed. */
  boonActionId: IdSchema,
  reason: z.string().trim().max(2000).optional(),
});
export type BoonRemovedPayload = z.infer<typeof BoonRemovedPayload>;

export const boonAdded = defineAction({
  type: 'boon.added',
  payload: BoonAddedPayload,
  apply(draft, p, action) {
    const rules = draft.ruleset.boons.rules;
    if (p.boonId !== undefined && !draft.ruleset.boonsById[p.boonId]) {
      warn(draft, action.id, 'UNKNOWN_BOON', `Unknown boon "${p.boonId}"; skipped.`);
      return;
    }
    if (draft.boons.length >= rules.slots) {
      warn(
        draft,
        action.id,
        'BOON_SLOTS_FULL',
        `All ${rules.slots} boon slots are used; ${p.name} skipped.`,
      );
      return;
    }
    if (
      rules.uniquePerBoonId &&
      p.boonId !== undefined &&
      draft.boons.some((b) => b.boonId === p.boonId)
    ) {
      warn(draft, action.id, 'BOON_DUPLICATE', `${p.name} is already active; skipped.`);
      return;
    }
    const data = p.boonId !== undefined ? draft.ruleset.boonsById[p.boonId] : undefined;
    draft.boons.push({
      boonId: p.boonId ?? null,
      name: p.name,
      expires: p.expires ? p.expires : null,
      text: p.text ? p.text : (data?.text ?? null),
      effects:
        p.effects ??
        (data?.effects ?? []).flatMap((e) =>
          e.add !== undefined ? [{ stat: e.stat, add: e.add }] : [],
        ),
      actionId: action.id,
    });
  },
});

export const boonRemoved = defineAction({
  type: 'boon.removed',
  payload: BoonRemovedPayload,
  apply(draft, p, action) {
    const index = draft.boons.findIndex((b) => b.actionId === p.boonActionId);
    if (index < 0) {
      warn(draft, action.id, 'BOON_NOT_FOUND', `No active boon "${p.boonActionId}"; skipped.`);
      return;
    }
    draft.boons.splice(index, 1);
  },
});
