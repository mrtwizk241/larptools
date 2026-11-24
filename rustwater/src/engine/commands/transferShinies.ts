// transferShinies: one side of a staff Shiny transfer between two characters. The server plans
// "out" on the giving character and "in" on the receiving one in one transaction. Each side is a
// points.adjusted row of kind "transfer" naming the other character.
import { z } from 'zod';
import { ruleError } from '../errors.ts';
import { IdSchema } from '../model.ts';
import { defineCommand, evaluation } from './define.ts';
import { OptionalText } from './helpers.ts';

export const TransferShiniesCommand = z.object({
  type: z.literal('transferShinies'),
  direction: z.enum(['out', 'in']),
  amount: z.int().min(1).max(1_000_000),
  /** The other character's id and name, for the ledger text. */
  otherCharacterId: IdSchema,
  otherName: z.string().trim().min(1).max(200),
  note: OptionalText,
});
export type TransferShiniesCommand = z.input<typeof TransferShiniesCommand>;

export const transferShinies = defineCommand<z.output<typeof TransferShiniesCommand>>({
  type: 'transferShinies',
  schema: TransferShiniesCommand,
  evaluate(_ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    if (cmd.direction === 'out' && sheet.points.shinies.balance < cmd.amount) {
      ev.errors.push(
        ruleError(
          'NOT_ENOUGH_SHINIES',
          `Only ${sheet.points.shinies.balance} Shinies to give; ${cmd.amount} asked.`,
          'PTS-SHINY-SPEND',
        ),
      );
      return ev;
    }
    ev.cost = { currency: 'shinies', amount: cmd.amount };
    builder.add(
      'points.adjusted',
      {
        currency: 'shinies',
        amount: cmd.direction === 'out' ? -cmd.amount : cmd.amount,
        reason:
          cmd.direction === 'out'
            ? `Transferred to ${cmd.otherName}`
            : `Transferred from ${cmd.otherName}`,
        kind: 'transfer',
      },
      { note: cmd.note },
    );
    return ev;
  },
});
