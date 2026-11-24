// skill.learned: one level of one skill part ([SKL-COST], [SKL-LEARN], [MULTI-RULE]).
// Replay sets the level; CXP and AP totals are recomputed from levels, not from `cost`.
import { z } from 'zod';
import type { Skill } from '../../data/index.ts';
import { setSkillLevel, warn, type Draft } from '../derive/draft.ts';
import { SkillPartSchema, type Action } from '../model.ts';
import { maxLevelOf } from '../rules/costs.ts';
import { getLevel } from '../rules/levels.ts';
import { partName } from '../rules/prereqs.ts';
import { defineAction, RefIdSchema } from './define.ts';

export const SkillLearnedPayload = z.object({
  skillId: RefIdSchema,
  part: SkillPartSchema,
  toLevel: z.int().min(1).max(1000),
  /** Price paid for this level, for reading history. */
  cost: z.object({ currency: z.enum(['cxp', 'ap']), amount: z.int().min(0) }),
  teacher: z.string().trim().max(200).optional(),
  atCreation: z.boolean(),
  /** Multi-archetype skills: the archetype pool chosen (kept for every later purchase). */
  archetype: RefIdSchema.optional(),
});
export type SkillLearnedPayload = z.infer<typeof SkillLearnedPayload>;

/** The AP pool for a skill during replay, or null when it cannot be decided. */
export function replayArchetype(
  draft: Draft,
  skill: Skill,
  requested: string | undefined,
  action: Action,
): string | null {
  if (skill.archetype !== undefined) return skill.archetype;
  const existing = draft.skills.get(skill.id)?.chosenArchetype ?? null;
  if (existing !== null) {
    if (requested !== undefined && requested !== existing)
      warn(
        draft,
        action.id,
        'ARCHETYPE_MISMATCH',
        `${skill.name} was bought in ${existing}; "${requested}" ignored.`,
      );
    return existing;
  }
  const rule = skill.archetypeRule;
  if (rule?.kind === 'same-as-skill') {
    const ref = draft.skills.get(rule.skill)?.chosenArchetype ?? null;
    if (ref !== null) return ref;
  }
  if (requested !== undefined && skill.archetypeOptions?.includes(requested)) return requested;
  return null;
}

export const skillLearned = defineAction({
  type: 'skill.learned',
  payload: SkillLearnedPayload,
  apply(draft, p, action) {
    const rs = draft.ruleset;
    const skill = rs.skillsById[p.skillId];
    const def = skill?.parts[p.part];
    if (!skill || !def) {
      warn(
        draft,
        action.id,
        'UNKNOWN_SKILL',
        `Unknown skill part "${p.skillId}" ${p.part}; skipped.`,
      );
      return;
    }
    const name = partName(rs, p.skillId, p.part);
    const archetype = replayArchetype(draft, skill, p.archetype, action);
    if (archetype === null) {
      warn(
        draft,
        action.id,
        'ARCHETYPE_MISSING',
        `${name}: no archetype recorded for a multi-archetype skill; skipped.`,
      );
      return;
    }
    const max = maxLevelOf(rs, def.costKind);
    if (max !== null && p.toLevel > max) {
      warn(
        draft,
        action.id,
        'MAX_LEVEL',
        `${name} level ${p.toLevel} is above the maximum ${max}; skipped.`,
      );
      return;
    }
    const current = getLevel(draft.skills, p.skillId, p.part);
    if (p.toLevel <= current) {
      warn(
        draft,
        action.id,
        'LEVEL_ORDER',
        `${name} is already level ${current}; level ${p.toLevel} skipped.`,
      );
      return;
    }
    if (p.toLevel > current + 1)
      warn(
        draft,
        action.id,
        'LEVEL_ORDER',
        `${name} jumps from level ${current} to ${p.toLevel}; the levels between are counted too.`,
      );
    setSkillLevel(draft, p.skillId, p.part, def.costKind, p.toLevel, archetype);
    const key = `${p.skillId}:${p.part}`;
    if (p.teacher) draft.teachers.set(key, p.teacher);
    else draft.teachers.delete(key);
  },
});
