// retireCharacter ([PTS-RETIRE]): records character.retired with the carry-over computed by
// retirementCarry(). Afterwards plan() refuses every command except notes and owed delivery.
// The new character is made with createCharacter and its `retirement` field.
import { z } from 'zod';
import { ruleError } from '../errors.ts';
import { retirementCarry } from '../rules/progression.ts';
import { defineCommand, evaluation } from './define.ts';
import { OptionalText, orList } from './helpers.ts';

export const RetireCharacterCommand = z.object({
  type: z.literal('retireCharacter'),
  /** Required to record the retirement. */
  reason: OptionalText,
  /** planned or unplanned. */
  kind: z.string().trim().max(50).optional(),
  note: OptionalText,
});
export type RetireCharacterCommand = z.input<typeof RetireCharacterCommand>;

export const retireCharacter = defineCommand<z.output<typeof RetireCharacterCommand>>({
  type: 'retireCharacter',
  schema: RetireCharacterCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const kinds: readonly string[] = ruleset.ruleset.retirement.kinds;
    if (cmd.kind !== undefined && !kinds.includes(cmd.kind))
      ev.errors.push(
        ruleError(
          'RETIREMENT_KIND_INVALID',
          `Retirement is ${orList([...kinds])}, not "${cmd.kind}".`,
          'PTS-RETIRE',
        ),
      );
    const reason = cmd.reason ?? '';
    if (reason === '')
      ev.errors.push(
        ruleError('REASON_REQUIRED', 'Give a reason for the retirement.', 'PTS-RETIRE'),
      );
    const carry = retirementCarry(sheet, ruleset);
    ev.carry = carry;
    if (ev.errors.length > 0) return ev;
    builder.add(
      'character.retired',
      { reason, ...(cmd.kind ? { kind: cmd.kind } : {}), carry },
      { note: cmd.note },
    );
    return ev;
  },
});
