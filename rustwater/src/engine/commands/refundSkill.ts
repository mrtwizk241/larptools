// refundSkill: staff correction that lowers a skill part, with a reason. Blocked when another
// owned part still needs the level (for example a mastery needing basic 9) or when the AP it
// earned is already spent.
import { z } from 'zod';
import { RefIdSchema } from '../actions/define.ts';
import { ruleError } from '../errors.ts';
import { SkillPartSchema } from '../model.ts';
import { apEarnedByBasic, cumulativeCost, currencyOf } from '../rules/costs.ts';
import {
  archetypeOf,
  cloneTable,
  getLevel,
  PART_ORDER,
  setLevel,
  tableFromSheet,
} from '../rules/levels.ts';
import { checkPrereqs, partName } from '../rules/prereqs.ts';
import { defineCommand, evaluation } from './define.ts';
import { archetypeName, OptionalText } from './helpers.ts';

export const RefundSkillCommand = z.object({
  type: z.literal('refundSkill'),
  skillId: RefIdSchema,
  part: SkillPartSchema,
  /** Defaults to one level lower. 0 removes the part. */
  toLevel: z.int().min(0).max(1000).optional(),
  /** Required to record the refund. */
  reason: OptionalText,
  note: OptionalText,
});
export type RefundSkillCommand = z.input<typeof RefundSkillCommand>;

export const refundSkill = defineCommand<z.output<typeof RefundSkillCommand>>({
  type: 'refundSkill',
  schema: RefundSkillCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const skill = ruleset.skillsById[cmd.skillId];
    const def = skill?.parts[cmd.part];
    if (!skill || !def) {
      ev.errors.push(
        ruleError('UNKNOWN_SKILL', `Unknown skill part "${cmd.skillId}" ${cmd.part}.`, 'SKL-LIST'),
      );
      return ev;
    }
    const name = partName(ruleset, skill.id, cmd.part);
    const table = tableFromSheet(sheet);
    const current = getLevel(table, skill.id, cmd.part);
    if (current === 0) {
      ev.errors.push(ruleError('NOT_OWNED', `${name} is not owned.`, 'SKL-COST'));
      return ev;
    }
    const toLevel = cmd.toLevel ?? current - 1;
    if (toLevel >= current) {
      ev.errors.push(
        ruleError(
          'REFUND_LEVEL',
          `A refund must lower ${name} below level ${current}.`,
          'SKL-COST',
        ),
      );
      return ev;
    }
    const reason = cmd.reason ?? '';
    if (reason === '')
      ev.errors.push(ruleError('REASON_REQUIRED', 'A refund needs a reason.', 'PTS-PENALTY'));

    const archetype = archetypeOf(ruleset, table, skill.id);
    const currency = currencyOf(def.costKind);
    const amount =
      cumulativeCost(ruleset, def.costKind, current) -
      cumulativeCost(ruleset, def.costKind, toLevel);
    ev.refund =
      currency === 'ap' && archetype !== null
        ? { currency, amount, archetype }
        : { currency, amount };

    // Every other owned part that meets its prerequisites now must still meet them after.
    const after = cloneTable(table);
    setLevel(after, skill.id, cmd.part, toLevel, null);
    const fine = (t: typeof table, id: string, prereqs: Parameters<typeof checkPrereqs>[1]) => {
      const check = checkPrereqs(ruleset, prereqs, t);
      const own = archetypeOf(ruleset, t, id);
      const usableOk =
        ruleset.skillsById[id]?.archetypeRule?.kind !== 'one-of-prereq-archetypes' ||
        own === null ||
        check.usable.has(own);
      return { ok: check.ok && usableOk, unmet: check.unmet };
    };
    for (const [id, entry] of after) {
      const other = ruleset.skillsById[id];
      if (!other) continue;
      for (const part of PART_ORDER) {
        const otherDef = other.parts[part];
        if ((entry.levels[part] ?? 0) <= 0 || !otherDef) continue;
        if (!fine(table, id, otherDef.prereqs).ok) continue;
        const check = fine(after, id, otherDef.prereqs);
        if (!check.ok)
          ev.errors.push(
            ruleError(
              'REFUND_BLOCKED',
              `${partName(ruleset, id, part)} depends on it${
                check.unmet.length ? ` (needs ${check.unmet.join(', ')})` : ''
              }. Refund that first.`,
              'SKL-PREREQ',
            ),
          );
      }
    }

    // Refunding basic levels removes the AP they earned; spent AP must stay covered.
    if (def.costKind === 'basic' && archetype !== null) {
      const lost = apEarnedByBasic(ruleset, current) - apEarnedByBasic(ruleset, toLevel);
      const pool = sheet.points.ap[archetype];
      const availableAfter = (pool?.available ?? 0) - lost;
      if (availableAfter < 0)
        ev.errors.push(
          ruleError(
            'REFUND_BLOCKED_AP',
            `Refunding would leave ${archetypeName(ruleset, archetype)} AP at ${availableAfter}. Refund ${archetypeName(ruleset, archetype)} archetype skills first.`,
            'PTS-AP-SPEND',
          ),
        );
    }

    if (ev.errors.length > 0) return ev;
    builder.add(
      'skill.refunded',
      { skillId: skill.id, part: cmd.part, toLevel, reason, refund: { currency, amount } },
      { note: cmd.note },
    );
    return ev;
  },
});
