// Artifact actions ([ART-RULES]): awaken (opens the first slot), unlock slots, set and remove
// powers. AXP spent is the stored axpCost, so history keeps the price paid; a stored price that
// differs from ruleset.artifact adds a warning.
import { z } from 'zod';
import { warn, warnPriceDiffers } from '../derive/draft.ts';
import { IdSchema } from '../model.ts';
import { defineAction, NameSchema, ReasonSchema, RefIdSchema, ShortTextSchema } from './define.ts';

export const ArtifactAwakenedPayload = z.object({
  name: NameSchema,
  description: z.string().trim().max(2000).optional(),
  axpCost: z.int().min(0),
});
export type ArtifactAwakenedPayload = z.infer<typeof ArtifactAwakenedPayload>;

export const artifactAwakened = defineAction({
  type: 'artifact.awakened',
  payload: ArtifactAwakenedPayload,
  apply(draft, p, action) {
    if (draft.artifact) {
      warn(draft, action.id, 'ARTIFACT_EXISTS', 'The character already has an Artifact; skipped.');
      return;
    }
    draft.artifact = {
      name: p.name,
      description: p.description ?? '',
      awakenedAt: action.at,
      slotsUnlocked: 1,
      powers: [],
      removals: [],
    };
    draft.axpSpent += p.axpCost;
    const table = draft.ruleset.ruleset.artifact.awakenCostAxp;
    warnPriceDiffers(draft, action, 'awakening', p.axpCost, table, 'axp');
  },
});

export const ArtifactSlotUnlockedPayload = z.object({ axpCost: z.int().min(0) });
export type ArtifactSlotUnlockedPayload = z.infer<typeof ArtifactSlotUnlockedPayload>;

export const artifactSlotUnlocked = defineAction({
  type: 'artifact.slotUnlocked',
  payload: ArtifactSlotUnlockedPayload,
  apply(draft, p, action) {
    const a = draft.artifact;
    const rules = draft.ruleset.ruleset.artifact;
    if (!a) {
      warn(draft, action.id, 'NO_ARTIFACT', 'The character has no Artifact; skipped.');
      return;
    }
    if (a.slotsUnlocked >= rules.maxSlots) {
      warn(draft, action.id, 'ARTIFACT_SLOTS_MAX', 'Every Artifact slot is unlocked; skipped.');
      return;
    }
    a.slotsUnlocked += 1;
    draft.axpSpent += p.axpCost;
    warnPriceDiffers(draft, action, 'slot', p.axpCost, rules.slotCostAxp, 'axp');
  },
});

export const ArtifactPowerSetPayload = z.object({
  powerId: RefIdSchema,
  /** The skill, element, language, and so on named with the power. */
  choice: ShortTextSchema.optional(),
});
export type ArtifactPowerSetPayload = z.infer<typeof ArtifactPowerSetPayload>;

export const artifactPowerSet = defineAction({
  type: 'artifact.powerSet',
  payload: ArtifactPowerSetPayload,
  apply(draft, p, action) {
    const a = draft.artifact;
    const power = draft.ruleset.artifactPowersById[p.powerId];
    if (!a || !power) {
      warn(
        draft,
        action.id,
        a ? 'UNKNOWN_POWER' : 'NO_ARTIFACT',
        a ? `Unknown Artifact power "${p.powerId}"; skipped.` : 'No Artifact; skipped.',
      );
      return;
    }
    const used = a.powers.reduce((n, x) => n + x.tier, 0);
    if (used + power.tier > a.slotsUnlocked)
      warn(
        draft,
        action.id,
        'ARTIFACT_SLOTS_FULL',
        'The Artifact powers fill more slots than unlocked.',
      );
    a.powers.push({
      entryId: action.id,
      powerId: power.id,
      tier: power.tier,
      summary: power.summary,
      choice: p.choice ? p.choice : null,
      setAt: action.at,
    });
  },
});

export const ArtifactPowerRemovedPayload = z.object({
  /** artifact.powerSet action ids; any number at once (Q-PLAY-4). */
  entryIds: z.array(IdSchema).min(1).max(10),
  reason: ReasonSchema,
});
export type ArtifactPowerRemovedPayload = z.infer<typeof ArtifactPowerRemovedPayload>;

export const artifactPowerRemoved = defineAction({
  type: 'artifact.powerRemoved',
  payload: ArtifactPowerRemovedPayload,
  apply(draft, p, action) {
    const a = draft.artifact;
    if (!a) {
      warn(draft, action.id, 'NO_ARTIFACT', 'The character has no Artifact; skipped.');
      return;
    }
    const before = a.powers.length;
    a.powers = a.powers.filter((x) => !p.entryIds.includes(x.entryId));
    if (before - a.powers.length !== p.entryIds.length)
      warn(draft, action.id, 'POWER_NOT_FOUND', 'Some of those powers were not on the Artifact.');
    a.removals.push({
      actionId: action.id,
      at: action.at,
      entryIds: [...p.entryIds],
      reason: p.reason,
    });
  },
});
