// Familiar commands ([FAM-BOND], [FAM-AWAKEN], [FAM-LEVEL], [FAM-AE], [FAM-SLOTS], [FAM-SKILLS]).
// - Bond (0 FP, level 1), awaken (5 FP, level 2, staff pick the awakened skill: Q-FAM-2), then
//   3 FP per level up to 10.
// - Skills cost 5, 10, or 15 Essence and need an awakened familiar (Q-FAM-6); 4 slots plus up
//   to 2 extra at 5 Essence each. Forgetting costs 1 FP and refunds no Essence (Q-FAM-4).
// - Breaking the bond costs 1 FP and resets level, Essence, and skills; spent FP stays spent
//   (Q-FAM-7).
import { z } from 'zod';
import { NameSchema, RefIdSchema } from '../actions/define.ts';
import { ruleError, type RuleError } from '../errors.ts';
import { EventKeySchema, IdSchema } from '../model.ts';
import { familiarLevelFp } from '../rules/progression.ts';
import type { FamiliarSection, Sheet } from '../sheet.ts';
import { defineCommand, evaluation, type Evaluation } from './define.ts';
import { OptionalShortText, OptionalText } from './helpers.ts';

const common = { eventKey: EventKeySchema.optional(), note: OptionalText };

export const BondFamiliarCommand = z.object({
  type: z.literal('bondFamiliar'),
  name: NameSchema,
  creature: OptionalShortText,
  ...common,
});
export const AwakenFamiliarCommand = z.object({
  type: z.literal('awakenFamiliar'),
  awakenedSkillId: RefIdSchema,
  ...common,
});
export const LevelFamiliarCommand = z.object({
  type: z.literal('levelFamiliar'),
  /** Defaults to the next level; higher targets buy every level in between. */
  toLevel: z.int().min(2).max(100).optional(),
  ...common,
});
export const LearnFamiliarSkillCommand = z.object({
  type: z.literal('learnFamiliarSkill'),
  skillId: RefIdSchema,
  /** Recipe, craft, or skill picked for skills that ask for one. */
  choice: OptionalShortText,
  ...common,
});
export const ForgetFamiliarSkillCommand = z.object({
  type: z.literal('forgetFamiliarSkill'),
  /** The learned skill's actionId from sheet.familiar.learned. */
  learnedActionId: IdSchema,
  ...common,
});
export const UnlockFamiliarSlotCommand = z.object({
  type: z.literal('unlockFamiliarSlot'),
  ...common,
});
export const RenameFamiliarCommand = z.object({
  type: z.literal('renameFamiliar'),
  name: NameSchema,
  ...common,
});
export const BreakFamiliarBondCommand = z.object({
  type: z.literal('breakFamiliarBond'),
  reason: OptionalText,
  ...common,
});
export type BondFamiliarCommand = z.input<typeof BondFamiliarCommand>;
export type AwakenFamiliarCommand = z.input<typeof AwakenFamiliarCommand>;
export type LevelFamiliarCommand = z.input<typeof LevelFamiliarCommand>;
export type LearnFamiliarSkillCommand = z.input<typeof LearnFamiliarSkillCommand>;
export type ForgetFamiliarSkillCommand = z.input<typeof ForgetFamiliarSkillCommand>;
export type UnlockFamiliarSlotCommand = z.input<typeof UnlockFamiliarSlotCommand>;
export type BreakFamiliarBondCommand = z.input<typeof BreakFamiliarBondCommand>;
export type RenameFamiliarCommand = z.input<typeof RenameFamiliarCommand>;

/** Renames the bonded familiar. Free. */
export const renameFamiliar = defineCommand<z.output<typeof RenameFamiliarCommand>>({
  type: 'renameFamiliar',
  schema: RenameFamiliarCommand,
  evaluate(_ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const fam = requireFamiliar(sheet, ev, false);
    if (!fam) return ev;
    if (fam.name === cmd.name) {
      ev.errors.push(
        ruleError('SAME_NAME', `The familiar is already called ${cmd.name}.`, 'FAM-BOND'),
      );
      return ev;
    }
    builder.add('familiar.renamed', { name: cmd.name }, { eventKey: cmd.eventKey, note: cmd.note });
    return ev;
  },
});

/** The familiar, or an error when there is none (or it is not awakened when `awakened`). */
function requireFamiliar(sheet: Sheet, ev: Evaluation, awakened: boolean): FamiliarSection | null {
  const fam = sheet.familiar;
  if (fam === null) {
    ev.errors.push(ruleError('NO_FAMILIAR', 'Bond a familiar first.', 'FAM-BOND'));
    return null;
  }
  if (awakened && !fam.awakened) {
    ev.errors.push(ruleError('FAMILIAR_NOT_AWAKENED', `Awaken ${fam.name} first.`, 'FAM-AWAKEN'));
    return null;
  }
  return fam;
}

function fpCheck(sheet: Sheet, cost: number): RuleError | null {
  const available = sheet.points.fp.available;
  return cost > available
    ? ruleError('NOT_ENOUGH_FP', `Not enough FP: needs ${cost}, ${available} left.`, 'FAM-FP')
    : null;
}

function essenceCheck(fam: FamiliarSection, cost: number): RuleError | null {
  const available = fam.essence.available;
  return cost > available
    ? ruleError(
        'NOT_ENOUGH_ESSENCE',
        `Not enough Essence: needs ${cost}, ${available} left.`,
        'FAM-AE',
      )
    : null;
}

const opts = (cmd: { eventKey?: string | undefined; note?: string | undefined }) => ({
  eventKey: cmd.eventKey,
  note: cmd.note,
});

export const bondFamiliar = defineCommand<z.output<typeof BondFamiliarCommand>>({
  type: 'bondFamiliar',
  schema: BondFamiliarCommand,
  evaluate(_ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    if (sheet.familiar !== null) {
      ev.errors.push(
        ruleError(
          'FAMILIAR_ALREADY_BONDED',
          `Already bonded to ${sheet.familiar.name}; break that bond first.`,
          'FAM-BOND',
        ),
      );
      return ev;
    }
    ev.cost = { currency: 'fp', amount: 0 };
    builder.add(
      'familiar.bonded',
      { name: cmd.name, ...(cmd.creature ? { creature: cmd.creature } : {}) },
      opts(cmd),
    );
    return ev;
  },
});

export const awakenFamiliar = defineCommand<z.output<typeof AwakenFamiliarCommand>>({
  type: 'awakenFamiliar',
  schema: AwakenFamiliarCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const fam = requireFamiliar(sheet, ev, false);
    if (!fam) return ev;
    if (fam.awakened) {
      ev.errors.push(
        ruleError('FAMILIAR_ALREADY_AWAKENED', `${fam.name} is already awakened.`, 'FAM-AWAKEN'),
      );
      return ev;
    }
    if (!ruleset.awakenedSkillsById[cmd.awakenedSkillId])
      ev.errors.push(
        ruleError(
          'UNKNOWN_AWAKENED_SKILL',
          `Unknown awakened skill "${cmd.awakenedSkillId}".`,
          'FAM-AWAKENED-SKILL',
        ),
      );
    const cost = familiarLevelFp(ruleset, fam.level + 1);
    ev.cost = { currency: 'fp', amount: cost };
    const fp = fpCheck(sheet, cost);
    if (fp) ev.errors.push(fp);
    if (ev.errors.length > 0) return ev;
    builder.add(
      'familiar.awakened',
      { awakenedSkillId: cmd.awakenedSkillId, fpCost: cost },
      opts(cmd),
    );
    return ev;
  },
});

export const levelFamiliar = defineCommand<z.output<typeof LevelFamiliarCommand>>({
  type: 'levelFamiliar',
  schema: LevelFamiliarCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const fam = requireFamiliar(sheet, ev, true);
    if (!fam) return ev;
    const max = ruleset.familiar.levels.max;
    const toLevel = cmd.toLevel ?? fam.level + 1;
    if (toLevel > max) {
      ev.errors.push(
        ruleError(
          'MAX_LEVEL',
          fam.level >= max
            ? `${fam.name} is at the maximum level ${max}.`
            : `A familiar only goes up to level ${max}.`,
          'FAM-LEVEL',
        ),
      );
      return ev;
    }
    if (toLevel <= fam.level) {
      ev.errors.push(
        ruleError('ALREADY_AT_LEVEL', `${fam.name} is already level ${fam.level}.`, 'FAM-LEVEL'),
      );
      return ev;
    }
    const steps: { level: number; cost: number }[] = [];
    for (let n = fam.level + 1; n <= toLevel; n++)
      steps.push({ level: n, cost: familiarLevelFp(ruleset, n) });
    const total = steps.reduce((sum, s) => sum + s.cost, 0);
    ev.cost = { currency: 'fp', amount: total };
    const fp = fpCheck(sheet, total);
    if (fp) ev.errors.push(fp);
    if (ev.errors.length > 0) return ev;
    for (const s of steps)
      builder.add('familiar.leveled', { toLevel: s.level, fpCost: s.cost }, opts(cmd));
    return ev;
  },
});

export const learnFamiliarSkill = defineCommand<z.output<typeof LearnFamiliarSkillCommand>>({
  type: 'learnFamiliarSkill',
  schema: LearnFamiliarSkillCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const fam = requireFamiliar(sheet, ev, true);
    if (!fam) return ev;
    const skill = ruleset.familiarSkillsById[cmd.skillId];
    if (!skill) {
      ev.errors.push(
        ruleError(
          'UNKNOWN_FAMILIAR_SKILL',
          `Unknown familiar skill "${cmd.skillId}".`,
          'FAM-SKILLS',
        ),
      );
      return ev;
    }
    ev.cost = { currency: 'essence', amount: skill.costEssence };
    if (fam.slots.free <= 0)
      ev.errors.push(
        ruleError(
          'FAMILIAR_SLOTS_FULL',
          `All ${fam.slots.total} of ${fam.name}'s skill slots are used.`,
          'FAM-SLOTS',
        ),
      );
    const owned = fam.learned.filter((l) => l.skillId === skill.id).length;
    if (skill.maxPurchases !== undefined && owned >= skill.maxPurchases)
      ev.errors.push(
        ruleError(
          'FAMILIAR_SKILL_LIMIT',
          `${skill.name} can be learned ${skill.maxPurchases === 1 ? 'once' : `${skill.maxPurchases} times`}.`,
          'FAM-SKILLS',
        ),
      );
    else if (skill.repeatable !== true && skill.maxPurchases === undefined && owned > 0)
      ev.errors.push(
        ruleError('FAMILIAR_SKILL_LIMIT', `${fam.name} already knows ${skill.name}.`, 'FAM-SKILLS'),
      );
    if (skill.choiceOnLearn !== undefined && !cmd.choice)
      ev.errors.push(
        ruleError(
          'CHOICE_REQUIRED',
          `Choose the ${skill.choiceOnLearn} for ${skill.name}.`,
          'FAM-SKILLS',
        ),
      );
    const essence = essenceCheck(fam, skill.costEssence);
    if (essence) ev.errors.push(essence);
    if (ev.errors.length > 0) return ev;
    builder.add(
      'familiar.skillLearned',
      {
        skillId: skill.id,
        ...(cmd.choice ? { choice: cmd.choice } : {}),
        essenceCost: skill.costEssence,
      },
      opts(cmd),
    );
    return ev;
  },
});

export const forgetFamiliarSkill = defineCommand<z.output<typeof ForgetFamiliarSkillCommand>>({
  type: 'forgetFamiliarSkill',
  schema: ForgetFamiliarSkillCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const fam = requireFamiliar(sheet, ev, false);
    if (!fam) return ev;
    const learned = fam.learned.find((l) => l.actionId === cmd.learnedActionId);
    if (!learned) {
      ev.errors.push(
        ruleError(
          'FAMILIAR_SKILL_NOT_FOUND',
          `${fam.name} does not know that skill.`,
          'FAM-SKILLS',
        ),
      );
      return ev;
    }
    const cost = ruleset.familiar.familiarPoints.spend.forgetSkill;
    ev.cost = { currency: 'fp', amount: cost };
    const fp = fpCheck(sheet, cost);
    if (fp) ev.errors.push(fp);
    if (ev.errors.length > 0) return ev;
    builder.add(
      'familiar.skillForgotten',
      { learnedActionId: learned.actionId, skillId: learned.skillId, fpCost: cost },
      opts(cmd),
    );
    return ev;
  },
});

export const unlockFamiliarSlot = defineCommand<z.output<typeof UnlockFamiliarSlotCommand>>({
  type: 'unlockFamiliarSlot',
  schema: UnlockFamiliarSlotCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const fam = requireFamiliar(sheet, ev, true);
    if (!fam) return ev;
    const ess = ruleset.familiar.essence;
    ev.cost = { currency: 'essence', amount: ess.extraSlotCost };
    if (fam.slots.extra >= ess.maxExtraSlots) {
      ev.errors.push(
        ruleError(
          'FAMILIAR_SLOTS_MAX',
          `${fam.name} already has the ${ess.maxExtraSlots} extra slots allowed.`,
          'FAM-SLOTS',
        ),
      );
      return ev;
    }
    const essence = essenceCheck(fam, ess.extraSlotCost);
    if (essence) ev.errors.push(essence);
    if (ev.errors.length > 0) return ev;
    builder.add('familiar.slotUnlocked', { essenceCost: ess.extraSlotCost }, opts(cmd));
    return ev;
  },
});

export const breakFamiliarBond = defineCommand<z.output<typeof BreakFamiliarBondCommand>>({
  type: 'breakFamiliarBond',
  schema: BreakFamiliarBondCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const fam = requireFamiliar(sheet, ev, false);
    if (!fam) return ev;
    const cost = ruleset.familiar.familiarPoints.spend.breakBond;
    ev.cost = { currency: 'fp', amount: cost };
    const fp = fpCheck(sheet, cost);
    if (fp) ev.errors.push(fp);
    if (ev.errors.length > 0) return ev;
    builder.add(
      'familiar.bondBroken',
      { fpCost: cost, ...(cmd.reason ? { reason: cmd.reason } : {}) },
      opts(cmd),
    );
    return ev;
  },
});
