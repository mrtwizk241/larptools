// character.created, profile.updated, character.retired, retirement.assigned, race.changed.
// - Creation credits the starting XP (150, or the retirement share, [PTS-XP-START], Q-RET-2) and
//   the retirement CXP and AXP ([RET-TRANSFER]).
// - Race change refunds the old race's racial skills (Q-MAG-5), and any skill a racial skill of
//   the new race replaces (Clockwork Armor Plating replaces Wear Armor, Rulebook p.27): their
//   levels and Techniques go and the stored refund comes back.
import { z } from 'zod';
import { activeCalling, credit, setSkill, warn, warnPriceDiffers } from '../derive/draft.ts';
import { NOT_OWNED } from '../rules/skills.ts';
import { IdSchema } from '../model.ts';
import {
  ChoicesSchema,
  defineAction,
  NameSchema,
  ReasonSchema,
  RefIdSchema,
  ShortTextSchema,
} from './define.ts';

export const LiteracySchema = z.enum(['race-language', 'common']);

export const RetirementFromSchema = z.object({
  fromName: ShortTextSchema,
  xp: z.int().min(0),
  cxp: z.int().min(0),
  axp: z.int().min(0),
  coinCopper: z.int().min(0),
});

export const CharacterCreatedPayload = z.object({
  characterName: NameSchema,
  playerName: NameSchema,
  playerEmail: z.string().trim().max(320).optional(),
  raceId: RefIdSchema,
  choices: ChoicesSchema.default({}),
  literacy: LiteracySchema.default('race-language'),
  ageCategory: z.int().min(0).max(100),
  ageYears: z.int().min(0).max(100000).optional(),
  concept: z.string().trim().max(2000).optional(),
  backstory: z.string().trim().max(20000).optional(),
  /** 150, or the retirement amount. */
  startingXp: z.int().min(0),
  retirement: RetirementFromSchema.optional(),
});
export type CharacterCreatedPayload = z.input<typeof CharacterCreatedPayload>;

export const characterCreated = defineAction({
  type: 'character.created',
  payload: CharacterCreatedPayload,
  requiresCharacter: false,
  apply(draft, p, action) {
    if (draft.created) {
      warn(draft, action.id, 'DUPLICATE_CREATED', 'The character was already created; skipped.');
      return;
    }
    const rs = draft.ruleset;
    draft.created = true;
    draft.profile = {
      ...draft.profile,
      characterName: p.characterName,
      playerName: p.playerName,
      playerEmail: p.playerEmail ? p.playerEmail : null,
      concept: p.concept ?? '',
      backstory: p.backstory ?? '',
      ageCategory: p.ageCategory,
      ageYears: p.ageYears ?? null,
      startingXp: p.startingXp,
      createdAt: action.at,
      retirementFrom: p.retirement ? { ...p.retirement } : null,
    };
    if (!rs.racesById[p.raceId])
      warn(draft, action.id, 'UNKNOWN_RACE', `Unknown race "${p.raceId}".`);
    draft.raceId = p.raceId;
    draft.raceChoices = { ...p.choices };
    draft.literacy = p.literacy;
    const fromRetirement = p.retirement ? Math.min(p.retirement.xp, p.startingXp) : 0;
    credit(draft, action, 'xp', fromRetirement, 'retirement', null);
    credit(draft, action, 'xp', p.startingXp - fromRetirement, 'starting', null);
    credit(draft, action, 'cxp', rs.ruleset.cxp.start, 'starting', null);
    credit(draft, action, 'axp', rs.ruleset.axp.start, 'starting', null);
    if (p.retirement) {
      credit(draft, action, 'cxp', p.retirement.cxp, 'retirement', null);
      credit(draft, action, 'axp', p.retirement.axp, 'retirement', null);
    }
  },
});

export const ProfileUpdatedPayload = z
  .object({
    characterName: NameSchema.optional(),
    playerName: NameSchema.optional(),
    /** null clears the email. */
    playerEmail: z.string().trim().max(320).nullable().optional(),
    concept: z.string().max(2000).optional(),
    backstory: z.string().max(20000).optional(),
    notes: z.string().max(5000).optional(),
    ageCategory: z.int().min(0).max(100).optional(),
    /** null clears it. */
    ageYears: z.int().min(0).max(100000).nullable().optional(),
    /** Replaces the race choices. */
    choices: ChoicesSchema.optional(),
    literacy: LiteracySchema.optional(),
    /** Replaces the active Calling's choices (setCallingChoices). */
    callingChoices: ChoicesSchema.optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), 'Change at least one field.');
export type ProfileUpdatedPayload = z.infer<typeof ProfileUpdatedPayload>;

export const profileUpdated = defineAction({
  type: 'profile.updated',
  payload: ProfileUpdatedPayload,
  apply(draft, p, action) {
    const profile = draft.profile;
    if (p.characterName !== undefined) profile.characterName = p.characterName;
    if (p.playerName !== undefined) profile.playerName = p.playerName;
    if (p.playerEmail !== undefined) profile.playerEmail = p.playerEmail || null;
    if (p.concept !== undefined) profile.concept = p.concept;
    if (p.backstory !== undefined) profile.backstory = p.backstory;
    if (p.notes !== undefined) profile.notes = p.notes;
    if (p.ageCategory !== undefined) profile.ageCategory = p.ageCategory;
    if (p.ageYears !== undefined) profile.ageYears = p.ageYears;
    if (p.choices !== undefined) draft.raceChoices = { ...p.choices };
    if (p.literacy !== undefined) draft.literacy = p.literacy;
    if (p.callingChoices !== undefined) {
      const calling = activeCalling(draft);
      if (calling) calling.choices = { ...p.callingChoices };
      else
        warn(draft, action.id, 'NO_ACTIVE_CALLING', 'Calling choices without a Calling; ignored.');
    }
  },
  /** A retired character's notes can still be edited. */
  allowedWhenRetired: (p) =>
    Object.entries(p).every(([key, value]) => key === 'notes' || value === undefined),
});

export const RetirementCarrySchema = z.object({
  xp: z.int().min(0),
  cxp: z.int().min(0),
  axp: z.int().min(0),
  coinCopper: z.int().min(0),
});

export const CharacterRetiredPayload = z.object({
  reason: ReasonSchema,
  /** Market value of everything owned, entered by Logistics (Q-RET-6). */
  goodsValueCopper: z.int().min(0),
  carry: RetirementCarrySchema,
});
export type CharacterRetiredPayload = z.infer<typeof CharacterRetiredPayload>;

export const characterRetired = defineAction({
  type: 'character.retired',
  payload: CharacterRetiredPayload,
  apply(draft, p, action) {
    if (draft.retired !== null) {
      warn(draft, action.id, 'ALREADY_RETIRED', 'The character already retired; skipped.');
      return;
    }
    draft.retired = {
      reason: p.reason,
      at: action.at,
      goodsValueCopper: p.goodsValueCopper,
      carry: { ...p.carry },
      assignedTo: null,
    };
  },
});

export const RetirementAssignedPayload = z.object({
  /** The character that received the carry-over. */
  toCharacterId: IdSchema,
  toName: NameSchema,
  kind: z.enum(['new', 'existing']),
});
export type RetirementAssignedPayload = z.infer<typeof RetirementAssignedPayload>;

/** Records where the carry-over went, so it is assigned once ([RET-ASSIGN]). */
export const retirementAssigned = defineAction({
  type: 'retirement.assigned',
  payload: RetirementAssignedPayload,
  apply(draft, p, action) {
    if (draft.retired === null) {
      warn(
        draft,
        action.id,
        'NOT_RETIRED',
        'The carry-over of a character that is not retired; skipped.',
      );
      return;
    }
    if (draft.retired.assignedTo !== null) {
      warn(
        draft,
        action.id,
        'RETIREMENT_ALREADY_ASSIGNED',
        'The carry-over was already assigned; skipped.',
      );
      return;
    }
    draft.retired = {
      ...draft.retired,
      assignedTo: {
        characterId: p.toCharacterId,
        characterName: p.toName,
        kind: p.kind,
        at: action.at,
      },
    };
  },
  allowedWhenRetired: () => true,
});

export const RaceChangedPayload = z.object({
  fromRaceId: RefIdSchema,
  toRaceId: RefIdSchema,
  reason: ReasonSchema,
  /** The new race's choices. */
  choices: ChoicesSchema.default({}),
  /** XP returned per removed skill (old racial skills and skills the new race replaces). */
  refunds: z
    .array(z.object({ skillId: RefIdSchema, amount: z.int().min(0) }))
    .max(20)
    .default([]),
});
export type RaceChangedPayload = z.input<typeof RaceChangedPayload>;

export const raceChanged = defineAction({
  type: 'race.changed',
  payload: RaceChangedPayload,
  apply(draft, p, action) {
    const rs = draft.ruleset;
    if (!rs.racesById[p.toRaceId]) {
      warn(draft, action.id, 'UNKNOWN_RACE', `Unknown race "${p.toRaceId}"; skipped.`);
      return;
    }
    const from = draft.raceId;
    if (from !== p.fromRaceId)
      warn(
        draft,
        action.id,
        'RACE_MISMATCH',
        `The race change starts from ${p.fromRaceId}, but the character is ${from ?? 'no race'}.`,
      );
    const replaced = new Set(
      (rs.racesById[p.toRaceId]?.skills ?? []).flatMap((s) =>
        s.replacesSkill !== undefined ? [s.replacesSkill] : [],
      ),
    );
    for (const [skillId, entry] of [...draft.skills]) {
      const skill = rs.skillsById[skillId];
      const oldRacial = skill?.category === 'racial' && skill.raceId !== p.toRaceId;
      if (!oldRacial && !replaced.has(skillId)) continue;
      entry.teaching.clear();
      const stored = p.refunds.find((r) => r.skillId === skillId);
      const table = -setSkill(draft, skillId, NOT_OWNED, stored ? -stored.amount : undefined);
      const name = skill?.name ?? skillId;
      if (stored) warnPriceDiffers(draft, action, `${name} refund`, stored.amount, table, 'xp');
      else
        warn(
          draft,
          action.id,
          'STORED_PRICE_MISSING',
          `race.changed (${name}): no refund is logged; the current table gives ${table} XP back.`,
        );
    }
    draft.raceId = p.toRaceId;
    draft.raceChoices = { ...p.choices };
    draft.raceChanges.push({
      actionId: action.id,
      at: action.at,
      fromRaceId: from ?? p.fromRaceId,
      toRaceId: p.toRaceId,
      reason: p.reason,
      refunds: p.refunds.map((r) => ({ ...r })),
    });
  },
});
