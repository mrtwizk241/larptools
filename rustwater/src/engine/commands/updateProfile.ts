// updateProfile: change names, email, age step, effects, or the old notes field. Records only
// fields that changed. Age is a step 1 to 10 ([ANC-AGE]). `notes` is kept for the old single notes
// field and edits the story note it became; new notes use addStoryNote.
import { z } from 'zod';
import { NameSchema } from '../actions/define.ts';
import type { ProfileUpdatedPayload } from '../actions/profileUpdated.ts';
import { ruleError } from '../errors.ts';
import { RULE_IDS } from '../errors.ts';
import { defineCommand, evaluation } from './define.ts';
import { OptionalText } from './helpers.ts';
import { AGE_STEP_MAX, AGE_STEP_MIN } from '../rules/age.ts';

export const UpdateProfileCommand = z.object({
  type: z.literal('updateProfile'),
  characterName: NameSchema.optional(),
  playerName: NameSchema.optional(),
  /** null or '' clears it. */
  playerEmail: z.string().trim().max(320).nullable().optional(),
  /** Age step 1 to 10; null clears it. */
  age: z.int().nullable().optional(),
  effects: z.string().max(5000).optional(),
  /** @deprecated Old single notes field; use addStoryNote, editStoryNote, removeStoryNote. */
  notes: z.string().max(5000).optional(),
  note: OptionalText,
});
export type UpdateProfileCommand = z.input<typeof UpdateProfileCommand>;

export const updateProfile = defineCommand<z.output<typeof UpdateProfileCommand>>({
  type: 'updateProfile',
  schema: UpdateProfileCommand,
  evaluate(_ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const p = sheet.profile;
    const changes: ProfileUpdatedPayload = {};
    if (cmd.characterName !== undefined && cmd.characterName !== p.characterName)
      changes.characterName = cmd.characterName;
    if (cmd.playerName !== undefined && cmd.playerName !== p.playerName)
      changes.playerName = cmd.playerName;
    if (cmd.playerEmail !== undefined) {
      const email = cmd.playerEmail === '' ? null : cmd.playerEmail;
      if (email !== p.playerEmail) changes.playerEmail = email;
    }
    if (
      cmd.age !== undefined &&
      cmd.age !== null &&
      (cmd.age < AGE_STEP_MIN || cmd.age > AGE_STEP_MAX)
    ) {
      ev.errors.push(
        ruleError('AGE_RANGE', `Age is a step from ${AGE_STEP_MIN} to ${AGE_STEP_MAX}.`, 'ANC-AGE'),
      );
      return ev;
    }
    if (cmd.age !== undefined && cmd.age !== p.age) changes.ageStep = cmd.age;
    if (cmd.effects !== undefined && cmd.effects !== p.effects) changes.effects = cmd.effects;
    if (cmd.notes !== undefined && cmd.notes !== p.notes) changes.notes = cmd.notes;
    if (Object.keys(changes).length === 0) {
      ev.errors.push(ruleError('NOTHING_CHANGED', 'Nothing changed.', RULE_IDS.command));
      return ev;
    }
    builder.add('profile.updated', changes, { note: cmd.note });
    return ev;
  },
  /** A retired character's notes can still be edited. */
  allowedWhenRetired: (cmd) =>
    cmd.characterName === undefined &&
    cmd.playerName === undefined &&
    cmd.playerEmail === undefined &&
    cmd.age === undefined &&
    cmd.effects === undefined,
});
