// ancestry.leveled: one LXP raises the shared or subtype ability by one level ([PTS-LXP-SPEND],
// [ANC-LEVELS]). The starting LXP pick at creation is also an ancestry.leveled with atCreation.
import { z } from 'zod';
import { warn } from '../derive/draft.ts';
import { defineAction, RefIdSchema } from './define.ts';

export const AncestryLeveledPayload = z.object({
  /** The slot's ability id (for Cryptids the shared slot is "from-legends"). */
  abilityId: RefIdSchema,
  toLevel: z.int().min(2).max(100),
  atCreation: z.boolean().optional(),
});
export type AncestryLeveledPayload = z.infer<typeof AncestryLeveledPayload>;

export const ancestryLeveled = defineAction({
  type: 'ancestry.leveled',
  payload: AncestryLeveledPayload,
  apply(draft, p, action) {
    const ancestry = draft.ancestryId ? draft.ruleset.ancestriesById[draft.ancestryId] : undefined;
    const subtype = draft.subtypeId ? draft.ruleset.subtypesById[draft.subtypeId] : undefined;
    let slot: 'shared' | 'subtype' | null = null;
    if (ancestry && p.abilityId === ancestry.sharedAbility.id) slot = 'shared';
    else if (subtype && p.abilityId === subtype.subtype.ability.id) slot = 'subtype';
    if (slot === null) {
      warn(
        draft,
        action.id,
        'UNKNOWN_ABILITY',
        `"${p.abilityId}" is not one of this character's ancestry abilities; skipped.`,
      );
      return;
    }
    const current = draft.abilityLevels[slot];
    if (p.toLevel <= current) {
      warn(
        draft,
        action.id,
        'LEVEL_ORDER',
        `Ability is already level ${current}; level ${p.toLevel} skipped.`,
      );
      return;
    }
    if (p.toLevel > current + 1)
      warn(
        draft,
        action.id,
        'LEVEL_ORDER',
        `Ability jumps from level ${current} to ${p.toLevel}; the levels between are counted too.`,
      );
    draft.lxpSpent += (p.toLevel - current) * draft.ruleset.ruleset.lxp.costPerLevel;
    draft.abilityLevels[slot] = p.toLevel;
  },
});
