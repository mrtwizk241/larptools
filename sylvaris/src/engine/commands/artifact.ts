// Artifact commands ([ART-RULES], Q-PLAY-2 to Q-PLAY-5).
// - Awaken: one Artifact, at least 500 XP earned (the starting 150 included), 5 AXP; it opens
//   the first slot. Each further slot costs 5 AXP, up to 10 (unlocking any time).
// - Powers fill slots equal to their tier; only one power of Tier 4 or higher at a time; a power
//   may repeat with a different choice unless the data limits it; filled between events.
// - Removal: once per calendar year, any number of powers at once.
import { z } from 'zod';
import { NameSchema, RefIdSchema } from '../actions/define.ts';
import { notice, ruleError } from '../errors.ts';
import { IdSchema } from '../model.ts';
import { defineCommand, evaluation } from './define.ts';
import { OptionalShortText, OptionalText, plural } from './helpers.ts';

const RULE = 'ART-RULES';
/** Powers of this tier or higher count toward artifacts.rules.maxPowersTier4Plus. */
const TIER_LIMITED = 4;

export const AwakenArtifactCommand = z.object({
  type: z.literal('awakenArtifact'),
  name: NameSchema,
  description: z.string().trim().max(2000).optional(),
  note: OptionalText,
});
export type AwakenArtifactCommand = z.input<typeof AwakenArtifactCommand>;

export const awakenArtifact = defineCommand<z.output<typeof AwakenArtifactCommand>>({
  type: 'awakenArtifact',
  schema: AwakenArtifactCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const rules = ruleset.ruleset.artifact;
    if (sheet.artifact)
      ev.errors.push(
        ruleError(
          'ARTIFACT_EXISTS',
          `One Artifact per character; ${sheet.artifact.name} is it.`,
          RULE,
        ),
      );
    // The build playground spends past its points budget and counts events needed instead.
    if (sheet.points.xp.earned < rules.minXpEarned && !builder.playground)
      ev.errors.push(
        ruleError(
          'XP_EARNED_TOO_LOW',
          `An Artifact needs ${rules.minXpEarned} XP earned; ${sheet.points.xp.earned} so far.`,
          RULE,
        ),
      );
    ev.cost = { currency: 'axp', amount: rules.awakenCostAxp };
    if (sheet.points.axp.available < rules.awakenCostAxp && !builder.playground)
      ev.errors.push(
        ruleError(
          'NOT_ENOUGH_AXP',
          `Not enough AXP: needs ${rules.awakenCostAxp}, ${sheet.points.axp.available} left.`,
          RULE,
        ),
      );
    if (ev.errors.length > 0) return ev;
    builder.add(
      'artifact.awakened',
      {
        name: cmd.name,
        ...(cmd.description ? { description: cmd.description } : {}),
        axpCost: rules.awakenCostAxp,
      },
      { note: cmd.note },
    );
    return ev;
  },
});

export const UnlockArtifactSlotCommand = z.object({
  type: z.literal('unlockArtifactSlot'),
  note: OptionalText,
});
export type UnlockArtifactSlotCommand = z.input<typeof UnlockArtifactSlotCommand>;

export const unlockArtifactSlot = defineCommand<z.output<typeof UnlockArtifactSlotCommand>>({
  type: 'unlockArtifactSlot',
  schema: UnlockArtifactSlotCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const rules = ruleset.ruleset.artifact;
    const a = sheet.artifact;
    if (!a) {
      ev.errors.push(ruleError('NO_ARTIFACT', 'Awaken an Artifact first.', RULE));
      return ev;
    }
    if (a.slotsUnlocked >= rules.maxSlots)
      ev.errors.push(
        ruleError('ARTIFACT_SLOTS_MAX', `All ${rules.maxSlots} Artifact slots are unlocked.`, RULE),
      );
    ev.cost = { currency: 'axp', amount: rules.slotCostAxp };
    if (sheet.points.axp.available < rules.slotCostAxp && !builder.playground)
      ev.errors.push(
        ruleError(
          'NOT_ENOUGH_AXP',
          `Not enough AXP: needs ${rules.slotCostAxp}, ${sheet.points.axp.available} left.`,
          RULE,
        ),
      );
    if (ev.errors.length > 0) return ev;
    builder.add('artifact.slotUnlocked', { axpCost: rules.slotCostAxp }, { note: cmd.note });
    return ev;
  },
});

export const SetArtifactPowerCommand = z.object({
  type: z.literal('setArtifactPower'),
  powerId: RefIdSchema,
  /** The skill, element, language, and so on named with the power. */
  choice: OptionalShortText,
  note: OptionalText,
});
export type SetArtifactPowerCommand = z.input<typeof SetArtifactPowerCommand>;

export const setArtifactPower = defineCommand<z.output<typeof SetArtifactPowerCommand>>({
  type: 'setArtifactPower',
  schema: SetArtifactPowerCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const a = sheet.artifact;
    const power = ruleset.artifactPowersById[cmd.powerId];
    if (!a) {
      ev.errors.push(ruleError('NO_ARTIFACT', 'Awaken an Artifact first.', RULE));
      return ev;
    }
    if (!power) {
      ev.errors.push(ruleError('UNKNOWN_POWER', `Unknown Artifact power "${cmd.powerId}".`, RULE));
      return ev;
    }
    if (power.tier > a.slotsFree)
      ev.errors.push(
        ruleError(
          'ARTIFACT_SLOTS_FULL',
          `A Tier ${power.tier} power fills ${plural(power.tier, 'slot')}; ${a.slotsFree} free.`,
          RULE,
        ),
      );
    // The tier the data's `maxPowersTier4Plus` names (Rulebook p.80).
    const max4 = ruleset.artifacts.rules.maxPowersTier4Plus;
    if (power.tier >= TIER_LIMITED && a.powers.filter((p) => p.tier >= TIER_LIMITED).length >= max4)
      ev.errors.push(
        ruleError(
          'ARTIFACT_TIER4_LIMIT',
          `Only ${max4} power of Tier 4 or higher at a time.`,
          RULE,
        ),
      );
    const same = a.powers.filter((p) => p.powerId === power.id);
    if (power.maxPerArtifact !== undefined && same.length >= power.maxPerArtifact)
      ev.errors.push(
        ruleError(
          'POWER_LIMIT',
          `This power can be taken ${plural(power.maxPerArtifact, 'time')}.`,
          RULE,
        ),
      );
    const choice = cmd.choice ?? '';
    if (power.choice && choice === '')
      ev.errors.push(
        ruleError('CHOICE_REQUIRED', `Name the ${power.choice} for this power.`, RULE),
      );
    if (power.choiceOptions && choice !== '' && !power.choiceOptions.includes(choice))
      ev.errors.push(
        ruleError('CHOICE_INVALID', `Choose one of ${power.choiceOptions.join(', ')}.`, RULE),
      );
    if (same.some((p) => (p.choice ?? '') === choice))
      ev.errors.push(
        ruleError(
          'POWER_DUPLICATE',
          'The Artifact already has this power with that choice (Q-PLAY-5).',
          RULE,
        ),
      );
    if (ev.errors.length > 0) return ev;
    // The build playground has no GMs and no events to tell.
    if (power.gmApproval && !builder.playground)
      ev.notices.push(notice('GM_APPROVAL', 'This power needs GM approval.', RULE));
    if (ruleset.artifacts.rules.fillOnlyBetweenEvents && !builder.playground)
      ev.notices.push(
        notice(
          'FILL_BETWEEN_EVENTS',
          `Slots are filled between events, with Logistics told ${ruleset.artifacts.rules.fillNoticeDaysBeforeEvent} days ahead.`,
          RULE,
        ),
      );
    builder.add(
      'artifact.powerSet',
      { powerId: power.id, ...(choice !== '' ? { choice } : {}) },
      { note: cmd.note },
    );
    return ev;
  },
});

export const RemoveArtifactPowersCommand = z.object({
  type: z.literal('removeArtifactPowers'),
  /** artifact.powerSet action ids from sheet.artifact.powers. */
  entryIds: z.array(IdSchema).min(1).max(10),
  reason: OptionalText,
  note: OptionalText,
});
export type RemoveArtifactPowersCommand = z.input<typeof RemoveArtifactPowersCommand>;

export const removeArtifactPowers = defineCommand<z.output<typeof RemoveArtifactPowersCommand>>({
  type: 'removeArtifactPowers',
  schema: RemoveArtifactPowersCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const a = sheet.artifact;
    if (!a) {
      ev.errors.push(ruleError('NO_ARTIFACT', 'The character has no Artifact.', RULE));
      return ev;
    }
    for (const id of cmd.entryIds)
      if (!a.powers.some((p) => p.entryId === id))
        ev.errors.push(ruleError('POWER_NOT_FOUND', `No power "${id}" on the Artifact.`, RULE));
    const year = builder.at.slice(0, 4);
    const perYear = ruleset.artifacts.rules.removePowersPerYear;
    const thisYear = a.removals.filter((r) => r.at.startsWith(year)).length;
    if (thisYear >= perYear && !builder.playground)
      ev.errors.push(
        ruleError(
          'ARTIFACT_REMOVAL_YEAR',
          `Powers can be removed ${plural(perYear, 'time')} per calendar year; already done in ${year}.`,
          RULE,
        ),
      );
    const reason = cmd.reason ?? '';
    if (reason === '')
      ev.errors.push(ruleError('REASON_REQUIRED', 'Removing powers needs a reason.', RULE));
    if (ev.errors.length > 0) return ev;
    builder.add('artifact.powerRemoved', { entryIds: cmd.entryIds, reason }, { note: cmd.note });
    return ev;
  },
});
