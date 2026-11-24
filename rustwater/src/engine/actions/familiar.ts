// familiar.* actions ([FAM-BOND], [FAM-AWAKEN], [FAM-LEVEL], [FAM-AE], [FAM-SLOTS],
// [FAM-SKILLS], DECISIONS Q-FAM-2 and Q-FAM-7). FP and Essence costs are recomputed from
// familiar.json on replay; the stored costs are for reading history. Spent FP is never
// refunded, and forgotten skills keep their Essence spent (Q-FAM-4).
import { z } from 'zod';
import type { Action } from '../model.ts';
import { warn, type Draft, type DraftFamiliar } from '../derive/draft.ts';
import { IdSchema } from '../model.ts';
import { essenceTotal, familiarLevelFp } from '../rules/progression.ts';
import { defineAction, NameSchema, RefIdSchema } from './define.ts';

export const FamiliarBondedPayload = z.object({
  name: NameSchema,
  creature: z.string().trim().max(200).optional(),
});
export const FamiliarAwakenedPayload = z.object({
  awakenedSkillId: RefIdSchema,
  fpCost: z.int().min(0),
});
export const FamiliarLeveledPayload = z.object({
  toLevel: z.int().min(2).max(100),
  fpCost: z.int().min(0),
});
export const FamiliarSkillLearnedPayload = z.object({
  skillId: RefIdSchema,
  /** Recipe, craft, or skill chosen when learned (skills with choiceOnLearn). */
  choice: z.string().trim().min(1).max(200).optional(),
  essenceCost: z.int().min(0),
});
export const FamiliarSkillForgottenPayload = z.object({
  /** The familiar.skillLearned action being forgotten. */
  learnedActionId: IdSchema,
  skillId: RefIdSchema,
  fpCost: z.int().min(0),
});
export const FamiliarSlotUnlockedPayload = z.object({ essenceCost: z.int().min(0) });
export const FamiliarRenamedPayload = z.object({ name: NameSchema });
export const FamiliarBondBrokenPayload = z.object({
  fpCost: z.int().min(0),
  reason: z.string().trim().max(2000).optional(),
});
export type FamiliarBondedPayload = z.infer<typeof FamiliarBondedPayload>;
export type FamiliarAwakenedPayload = z.infer<typeof FamiliarAwakenedPayload>;
export type FamiliarLeveledPayload = z.infer<typeof FamiliarLeveledPayload>;
export type FamiliarSkillLearnedPayload = z.infer<typeof FamiliarSkillLearnedPayload>;
export type FamiliarSkillForgottenPayload = z.infer<typeof FamiliarSkillForgottenPayload>;
export type FamiliarSlotUnlockedPayload = z.infer<typeof FamiliarSlotUnlockedPayload>;
export type FamiliarBondBrokenPayload = z.infer<typeof FamiliarBondBrokenPayload>;
export type FamiliarRenamedPayload = z.infer<typeof FamiliarRenamedPayload>;

function needFamiliar(draft: Draft, action: Action, awakened: boolean): DraftFamiliar | null {
  const fam = draft.familiar;
  if (fam === null) {
    warn(draft, action.id, 'NO_FAMILIAR', 'The character has no bonded familiar; skipped.');
    return null;
  }
  if (awakened && fam.awakenedSkillId === null) {
    warn(draft, action.id, 'FAMILIAR_NOT_AWAKENED', `${fam.name} is not awakened yet; skipped.`);
    return null;
  }
  return fam;
}

function checkEssence(draft: Draft, fam: DraftFamiliar, actionId: string): void {
  const available = essenceTotal(draft.ruleset, fam.level) - fam.essenceSpent;
  if (available < 0)
    warn(
      draft,
      actionId,
      'NEGATIVE_ESSENCE',
      `${fam.name}'s Essence available is ${available} after this action.`,
    );
}

export const familiarBonded = defineAction({
  type: 'familiar.bonded',
  payload: FamiliarBondedPayload,
  apply(draft, p, action) {
    if (draft.familiar !== null) {
      warn(
        draft,
        action.id,
        'FAMILIAR_ALREADY_BONDED',
        `Already bonded to ${draft.familiar.name}; break that bond first. Skipped.`,
      );
      return;
    }
    draft.familiar = {
      name: p.name,
      creature: p.creature ? p.creature : null,
      level: draft.ruleset.familiar.levels.min,
      awakenedSkillId: null,
      learned: [],
      extraSlots: 0,
      essenceSpent: 0,
      bondedAt: action.at,
    };
  },
});

export const familiarRenamed = defineAction({
  type: 'familiar.renamed',
  payload: FamiliarRenamedPayload,
  apply(draft, p, action) {
    const fam = needFamiliar(draft, action, false);
    if (fam) fam.name = p.name;
  },
});

export const familiarAwakened = defineAction({
  type: 'familiar.awakened',
  payload: FamiliarAwakenedPayload,
  apply(draft, p, action) {
    const fam = needFamiliar(draft, action, false);
    if (!fam) return;
    if (fam.awakenedSkillId !== null) {
      warn(draft, action.id, 'FAMILIAR_ALREADY_AWAKENED', `${fam.name} is already awakened.`);
      return;
    }
    if (!draft.ruleset.awakenedSkillsById[p.awakenedSkillId]) {
      warn(
        draft,
        action.id,
        'UNKNOWN_AWAKENED_SKILL',
        `Unknown awakened skill "${p.awakenedSkillId}"; skipped.`,
      );
      return;
    }
    const level = fam.level + 1;
    fam.awakenedSkillId = p.awakenedSkillId;
    fam.level = level;
    draft.fpSpent += familiarLevelFp(draft.ruleset, level);
  },
});

export const familiarLeveled = defineAction({
  type: 'familiar.leveled',
  payload: FamiliarLeveledPayload,
  apply(draft, p, action) {
    const fam = needFamiliar(draft, action, true);
    if (!fam) return;
    const max = draft.ruleset.familiar.levels.max;
    if (p.toLevel > max) {
      warn(
        draft,
        action.id,
        'MAX_LEVEL',
        `${fam.name} level ${p.toLevel} is above the maximum ${max}; skipped.`,
      );
      return;
    }
    if (p.toLevel <= fam.level) {
      warn(
        draft,
        action.id,
        'LEVEL_ORDER',
        `${fam.name} is already level ${fam.level}; level ${p.toLevel} skipped.`,
      );
      return;
    }
    if (p.toLevel > fam.level + 1)
      warn(
        draft,
        action.id,
        'LEVEL_ORDER',
        `${fam.name} jumps from level ${fam.level} to ${p.toLevel}; the levels between are counted too.`,
      );
    for (let n = fam.level + 1; n <= p.toLevel; n++)
      draft.fpSpent += familiarLevelFp(draft.ruleset, n);
    fam.level = p.toLevel;
  },
});

export const familiarSkillLearned = defineAction({
  type: 'familiar.skillLearned',
  payload: FamiliarSkillLearnedPayload,
  apply(draft, p, action) {
    const fam = needFamiliar(draft, action, true);
    if (!fam) return;
    const rs = draft.ruleset;
    const skill = rs.familiarSkillsById[p.skillId];
    if (!skill) {
      warn(
        draft,
        action.id,
        'UNKNOWN_FAMILIAR_SKILL',
        `Unknown familiar skill "${p.skillId}"; skipped.`,
      );
      return;
    }
    const slots = rs.familiar.essence.baseSkillSlots + fam.extraSlots;
    if (fam.learned.length >= slots)
      warn(
        draft,
        action.id,
        'FAMILIAR_SLOTS_FULL',
        `${fam.name} has ${slots} skill slots and they are all used.`,
      );
    fam.learned.push({
      skillId: skill.id,
      name: skill.name,
      tier: skill.tier,
      essence: skill.costEssence,
      frequency: skill.frequency,
      choice: p.choice ?? null,
      actionId: action.id,
    });
    fam.essenceSpent += skill.costEssence;
    checkEssence(draft, fam, action.id);
  },
});

export const familiarSkillForgotten = defineAction({
  type: 'familiar.skillForgotten',
  payload: FamiliarSkillForgottenPayload,
  apply(draft, p, action) {
    const fam = needFamiliar(draft, action, false);
    if (!fam) return;
    const index = fam.learned.findIndex((l) => l.actionId === p.learnedActionId);
    if (index < 0) {
      warn(
        draft,
        action.id,
        'FAMILIAR_SKILL_NOT_FOUND',
        `${fam.name} has no learned skill "${p.learnedActionId}"; skipped.`,
      );
      return;
    }
    fam.learned.splice(index, 1);
    draft.fpSpent += draft.ruleset.familiar.familiarPoints.spend.forgetSkill;
  },
});

export const familiarSlotUnlocked = defineAction({
  type: 'familiar.slotUnlocked',
  payload: FamiliarSlotUnlockedPayload,
  apply(draft, _p, action) {
    const fam = needFamiliar(draft, action, true);
    if (!fam) return;
    const ess = draft.ruleset.familiar.essence;
    if (fam.extraSlots >= ess.maxExtraSlots) {
      warn(
        draft,
        action.id,
        'FAMILIAR_SLOTS_MAX',
        `${fam.name} already has ${ess.maxExtraSlots} extra slots; skipped.`,
      );
      return;
    }
    fam.extraSlots += 1;
    fam.essenceSpent += ess.extraSlotCost;
    checkEssence(draft, fam, action.id);
  },
});

export const familiarBondBroken = defineAction({
  type: 'familiar.bondBroken',
  payload: FamiliarBondBrokenPayload,
  apply(draft, _p, action) {
    const fam = needFamiliar(draft, action, false);
    if (!fam) return;
    draft.fpSpent += draft.ruleset.familiar.familiarPoints.spend.breakBond;
    draft.familiar = null;
  },
});
