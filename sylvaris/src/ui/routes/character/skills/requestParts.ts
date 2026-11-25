// Building a player's learning request for one skill step. Pure, so it is unit tested.
import type { Request, SkillStep } from '../../../../engine/model.ts';

/** "level-4", "technique-expert": a stable key for a step (radio values, React keys). */
export function stepKey(step: SkillStep): string {
  return 'level' in step ? `level-${step.level}` : `technique-${step.technique}`;
}

/** An unsaved request, for checking it with the engine before it is sent. */
export function buildDraft(
  characterId: string,
  skillId: string,
  step: SkillStep,
  teacher: string,
): Request {
  return {
    id: 'draft',
    characterId,
    createdAt: new Date(0).toISOString(),
    kind: 'learn-skill',
    skillId,
    step,
    teacher: teacher.trim(),
    note: '',
    status: 'draft',
  };
}

/** Said before a player sends a Calling Technique request ([CALL-TECH]). */
export function callingTechniqueNote(perEvent: number): string {
  const limit =
    perEvent === 1 ? 'one Calling Technique per event' : `${perEvent} Calling Techniques per event`;
  return `Staff record a Calling Technique at an event the character attended after the Calling started, and only ${limit}.`;
}
