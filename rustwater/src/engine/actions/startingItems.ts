// items.startingSet: the starting equipment picks ([ITEM-START]). Each action replaces the
// whole set. Up to 10 picks; repeats allowed (Q-PLAY-2).
import { z } from 'zod';
import { warn } from '../derive/draft.ts';
import { defineAction, RefIdSchema } from './define.ts';

export const StartingPickSchema = z.object({
  optionId: RefIdSchema,
  /** Weapon size, resource types, spell or recipe name, and so on. */
  detail: z.string().trim().max(200).optional(),
});

export const ItemsStartingSetPayload = z.object({
  picks: z.array(StartingPickSchema).max(100),
});
export type ItemsStartingSetPayload = z.infer<typeof ItemsStartingSetPayload>;

export const itemsStartingSet = defineAction({
  type: 'items.startingSet',
  payload: ItemsStartingSetPayload,
  apply(draft, p, action) {
    const rs = draft.ruleset;
    const max = rs.startingItems.rules.picks;
    const picks = [];
    for (const pick of p.picks) {
      const option = rs.startingItemsById[pick.optionId];
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
    if (picks.length > max)
      warn(
        draft,
        action.id,
        'STARTING_ITEMS_OVER',
        `${picks.length} starting items picked; the limit is ${max}.`,
      );
    draft.startingItems = picks;
  },
});
