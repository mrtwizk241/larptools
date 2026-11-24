// Which parts of a skill a player can request, and the target levels to offer.
import { maxLevelOf } from '../../../../engine/index.ts';
import type { SkillPart } from '../../../../engine/model.ts';
import type { CharacterView } from '../view.ts';
import { ownedPart, partLabel, skillParts, type Skill } from './skillInfo.ts';

/** Highest target offered above the current level when a part has no level cap. */
const UNCAPPED_STEPS = 5;

export interface RequestablePart {
  part: SkillPart;
  label: string;
  level: number;
  /** Target levels the player can ask for, lowest first. */
  targets: number[];
  /** The part has one level only, so there is no level to choose. */
  single: boolean;
}

/** Parts below their level cap, with the target levels to offer. */
export function requestableParts(view: CharacterView, skill: Skill): RequestablePart[] {
  const owned = view.sheet.skills.find((s) => s.skillId === skill.id);
  const list: RequestablePart[] = [];
  for (const part of skillParts(skill)) {
    const def = skill.parts[part];
    if (!def) continue;
    const level = ownedPart(owned, part)?.level ?? 0;
    const cap = maxLevelOf(view.ruleset, def.costKind);
    const max = cap ?? level + UNCAPPED_STEPS;
    if (level >= max) continue;
    const targets: number[] = [];
    for (let n = level + 1; n <= max; n += 1) targets.push(n);
    list.push({
      part,
      label: partLabel(view.ruleset, skill, part),
      level,
      targets,
      single: cap === 1,
    });
  }
  return list;
}

/** Players send learnings for an approved character that is not retired. Staff edit directly. */
export function canRequest(view: CharacterView): boolean {
  return (
    !view.isStaff && !view.sheet.retired && (view.status === undefined || view.status === 'active')
  );
}
