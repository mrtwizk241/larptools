// profession.started / profession.leveled ([PRO-ONE], [PRO-START], [PRO-COST], [PRO-PACE]).
// Replay sets levels; PXP spent is recomputed from levels (10 x T(level) per skill), not from
// the stored cost.
import { z } from 'zod';
import { warn } from '../derive/draft.ts';
import { professionCumulativeCost, professionSkill } from '../rules/progression.ts';
import { defineAction, RefIdSchema } from './define.ts';

export const ProfessionStartedPayload = z.object({
  professionId: RefIdSchema,
  /** Events attended before the start event, as checked when it was recorded. */
  eventsPlayedBefore: z.int().min(0).max(10000).optional(),
});
export type ProfessionStartedPayload = z.infer<typeof ProfessionStartedPayload>;

export const ProfessionLeveledPayload = z.object({
  /** Profession skill id (skill 1 or skill 2). */
  abilityId: RefIdSchema,
  toLevel: z.int().min(1).max(100),
  cost: z.object({ currency: z.literal('pxp'), amount: z.int().min(0) }),
});
export type ProfessionLeveledPayload = z.infer<typeof ProfessionLeveledPayload>;

export const professionStarted = defineAction({
  type: 'profession.started',
  payload: ProfessionStartedPayload,
  apply(draft, p, action) {
    const rs = draft.ruleset;
    if (draft.profession !== null) {
      const current = rs.professionsById[draft.profession.professionId]?.name ?? 'a profession';
      warn(
        draft,
        action.id,
        'PROFESSION_ALREADY_STARTED',
        `The character already has ${current}; skipped.`,
      );
      return;
    }
    const profession = rs.professionsById[p.professionId];
    if (!profession) {
      warn(
        draft,
        action.id,
        'UNKNOWN_PROFESSION',
        `Unknown profession "${p.professionId}"; skipped.`,
      );
      return;
    }
    draft.profession = {
      professionId: profession.id,
      startedAt: action.at,
      startedEventKey: action.eventKey ?? null,
      levels: Object.fromEntries(profession.skills.map((s) => [s.id, 0])),
      history: [],
    };
  },
});

export const professionLeveled = defineAction({
  type: 'profession.leveled',
  payload: ProfessionLeveledPayload,
  apply(draft, p, action) {
    const rs = draft.ruleset;
    const prof = draft.profession;
    if (prof === null) {
      warn(draft, action.id, 'NO_PROFESSION', 'No profession has been started; skipped.');
      return;
    }
    const profession = rs.professionsById[prof.professionId];
    const skill = profession ? professionSkill(profession, p.abilityId) : undefined;
    if (!profession || !skill) {
      warn(
        draft,
        action.id,
        'UNKNOWN_PROFESSION_SKILL',
        `"${p.abilityId}" is not a skill of this profession; skipped.`,
      );
      return;
    }
    const max = rs.professions.rules.maxLevel;
    if (p.toLevel > max) {
      warn(
        draft,
        action.id,
        'MAX_LEVEL',
        `${skill.name} level ${p.toLevel} is above the maximum ${max}; skipped.`,
      );
      return;
    }
    const current = prof.levels[skill.id] ?? 0;
    if (p.toLevel <= current) {
      warn(
        draft,
        action.id,
        'LEVEL_ORDER',
        `${skill.name} is already level ${current}; level ${p.toLevel} skipped.`,
      );
      return;
    }
    if (p.toLevel > current + 1)
      warn(
        draft,
        action.id,
        'LEVEL_ORDER',
        `${skill.name} jumps from level ${current} to ${p.toLevel}; the levels between are counted too.`,
      );
    const eventKey = action.eventKey ?? null;
    if (eventKey === null)
      warn(draft, action.id, 'EVENT_REQUIRED', `${skill.name}: no event recorded for this level.`);
    else if (prof.history.some((h) => h.skillId === skill.id && h.eventKey === eventKey))
      warn(
        draft,
        action.id,
        'PROFESSION_PACE',
        `${skill.name} went up more than one level at ${eventKey}.`,
      );
    draft.pxpSpent +=
      professionCumulativeCost(rs, p.toLevel) - professionCumulativeCost(rs, current);
    prof.levels[skill.id] = p.toLevel;
    prof.history.push({ skillId: skill.id, toLevel: p.toLevel, eventKey, actionId: action.id });
  },
});
