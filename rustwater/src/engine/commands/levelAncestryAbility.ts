// levelAncestryAbility: spend 1 LXP to raise the shared or subtype ability by one level
// ([PTS-LXP-SPEND], [ANC-LEVELS]). No level cap unless ruleset.lxp.maxAbilityLevel sets one.
import { z } from 'zod';
import { RefIdSchema } from '../actions/define.ts';
import { ruleError } from '../errors.ts';
import { EventKeySchema } from '../model.ts';
import { defineCommand, evaluation } from './define.ts';
import { OptionalText } from './helpers.ts';

export const LevelAncestryAbilityCommand = z.object({
  type: z.literal('levelAncestryAbility'),
  /** The slot's ability id from sheet.ancestry.abilities (a From Legends copy id also works). */
  abilityId: RefIdSchema,
  eventKey: EventKeySchema.optional(),
  note: OptionalText,
});
export type LevelAncestryAbilityCommand = z.input<typeof LevelAncestryAbilityCommand>;

export const levelAncestryAbility = defineCommand<z.output<typeof LevelAncestryAbilityCommand>>({
  type: 'levelAncestryAbility',
  schema: LevelAncestryAbilityCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const ability = sheet.ancestry?.abilities.find(
      (a) => a.id === cmd.abilityId || a.copied?.id === cmd.abilityId,
    );
    if (!ability) {
      ev.errors.push(
        ruleError(
          'UNKNOWN_ABILITY',
          `"${cmd.abilityId}" is not one of this character's ancestry abilities.`,
          'ANC-LEVELS',
        ),
      );
      return ev;
    }
    const lxp = ruleset.ruleset.lxp;
    const cost = lxp.costPerLevel;
    ev.cost = { currency: 'lxp', amount: cost };
    const name = ability.copied?.name ?? ability.name;
    if (lxp.maxAbilityLevel !== null && ability.level >= lxp.maxAbilityLevel)
      ev.errors.push(
        ruleError(
          'MAX_LEVEL',
          `${name} is at its maximum level ${lxp.maxAbilityLevel}.`,
          'ANC-LEVELS',
        ),
      );
    const available = sheet.points.lxp.available;
    if (available < cost)
      ev.errors.push(
        ruleError(
          'NOT_ENOUGH_LXP',
          `Not enough LXP: needs ${cost}, ${available} left.`,
          'PTS-LXP-SPEND',
        ),
      );
    if (ev.errors.length > 0) return ev;
    builder.add(
      'ancestry.leveled',
      { abilityId: ability.id, toLevel: ability.level + 1 },
      { eventKey: cmd.eventKey, note: cmd.note },
    );
    return ev;
  },
});
