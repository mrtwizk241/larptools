// Which skill parts get level controls on a skill row, and test build helpers (SkillControls).
import type { SkillPart } from '../../../../engine/model.ts';
import type { CharacterView } from '../view.ts';
import { ownedPart, skillParts, type Skill } from './skillInfo.ts';

/** The reason recorded when a level is removed in a test build. */
export const TEST_BUILD_REFUND_REASON = 'Test build';

/** True for the owner's test build, including every character on the public site. */
export function isTestView(view: CharacterView): boolean {
  return view.meta?.kind === 'test';
}

/**
 * Parts with controls on the row. Mastery shows once the skill meets the levels it needs (for
 * example Basic 9), or when it is already learned.
 */
export function controlParts(view: CharacterView, skill: Skill): SkillPart[] {
  const owned = view.sheet.skills.find((s) => s.skillId === skill.id);
  const level = (part: SkillPart) => ownedPart(owned, part)?.level ?? 0;
  return skillParts(skill).filter((part) => {
    if (part !== 'mastery' || level(part) > 0) return true;
    const def = skill.parts[part];
    return (def?.prereqs ?? []).every(
      (p) => !('skill' in p) || p.skill !== skill.id || level(p.part) >= p.minLevel,
    );
  });
}
