// changeInfection: staff set the infection level (Connection Damage for Aware), with a reason
// ([INF-LEVEL], [INF-AWARE]). Both directions are allowed (Q-PLAY-6). Reaching the maximum is a
// notice: the character becomes a Risen (or Restless) and staff start an unplanned retirement.
// An optional `trauma` text records a trauma.added in the same plan ([PLAY-TRAUMA]).
import { z } from 'zod';
import { RefIdSchema } from '../actions/define.ts';
import { notice, ruleError } from '../errors.ts';
import { EventKeySchema } from '../model.ts';
import { defineCommand, evaluation } from './define.ts';
import { OptionalText } from './helpers.ts';
import { TRAUMA_MAX } from './notes.ts';

export const ChangeInfectionCommand = z.object({
  type: z.literal('changeInfection'),
  toLevel: z.int().min(0).max(100),
  reason: OptionalText,
  /** Gain id from infection.json: death-rise, gm-penalty, staff-adjustment. */
  cause: RefIdSchema.optional(),
  eventKey: EventKeySchema.optional(),
  /** Records a trauma ([PLAY-TRAUMA]) with this text in the same plan. */
  trauma: z.string().trim().max(TRAUMA_MAX).optional(),
  note: OptionalText,
});
export type ChangeInfectionCommand = z.input<typeof ChangeInfectionCommand>;

export const changeInfection = defineCommand<z.output<typeof ChangeInfectionCommand>>({
  type: 'changeInfection',
  schema: ChangeInfectionCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const inf = sheet.infection;
    if (!inf) {
      ev.errors.push(
        ruleError('NO_INFECTION_TRACK', 'This character has no infection track.', 'INF-LEVEL'),
      );
      return ev;
    }
    const track = ruleset.infection.tracks.find((t) => t.id === inf.track);
    const min = track?.min ?? 0;
    if (cmd.toLevel < min || cmd.toLevel > inf.max)
      ev.errors.push(
        ruleError(
          'INFECTION_RANGE',
          `${inf.label} goes from ${min} to ${inf.max}.`,
          inf.track === 'connection' ? 'INF-AWARE' : 'INF-LEVEL',
        ),
      );
    else if (cmd.toLevel === inf.current)
      ev.errors.push(
        ruleError('NOTHING_CHANGED', `${inf.label} is already ${inf.current}.`, 'INF-LEVEL'),
      );
    if (cmd.cause !== undefined && !ruleset.infection.gain.some((g) => g.id === cmd.cause))
      ev.errors.push(ruleError('UNKNOWN_CAUSE', `Unknown cause "${cmd.cause}".`, 'INF-LEVEL'));
    const reason = cmd.reason ?? '';
    if (reason === '')
      ev.errors.push(
        ruleError('REASON_REQUIRED', `A change to ${inf.label} needs a reason.`, 'INF-LEVEL'),
      );
    if (ev.errors.length > 0) return ev;
    if (cmd.toLevel >= inf.max)
      ev.notices.push(
        notice(
          'INFECTION_MAX',
          track
            ? `${inf.label} ${inf.max}: ${track.atMax.text} Start an unplanned retirement.`
            : `${inf.label} reached ${inf.max}.`,
          inf.track === 'connection' ? 'INF-AWARE' : 'INF-LEVEL',
        ),
      );
    const changed = builder.add(
      'infection.changed',
      {
        track: inf.track,
        toLevel: cmd.toLevel,
        fromLevel: inf.current,
        reason,
        ...(cmd.cause !== undefined ? { cause: cmd.cause } : {}),
      },
      { eventKey: cmd.eventKey, note: cmd.note },
    );
    if (cmd.trauma)
      builder.add(
        'trauma.added',
        { text: cmd.trauma },
        { eventKey: cmd.eventKey, causedBy: changed.id },
      );
    return ev;
  },
});
