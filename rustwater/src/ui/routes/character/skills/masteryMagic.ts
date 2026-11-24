// Mastery magic abilities ([MAG-MASTERY]): they are not spells to memorize. Each mastery magic has
// a passive and three abilities that spend uses of its two schools. Pure, so it is unit tested.
import type { Ruleset, Sheet } from '../../../../engine/index.ts';
import type { SkillPart } from '../../../../engine/model.ts';
import { skillPartName } from '../../../lib/names.ts';

export type MasteryAbility = Extract<Ruleset['spells'][number], { mastery: true }>;

/** The abilities of one mastery magic skill, passive first. */
export function masteryAbilities(ruleset: Ruleset, skillId: string): MasteryAbility[] {
  const order = ['passive', 'basic', 'adept', 'advanced'];
  return ruleset.spells
    .filter((s): s is MasteryAbility => s.mastery === true && s.masterySkill === skillId)
    .sort((a, b) => order.indexOf(a.rank) - order.indexOf(b.rank));
}

/** One use an ability spends: "Life Magic Adept". */
export interface Expend {
  readonly skillId: string;
  readonly part: SkillPart;
  readonly count: number;
}

/** What an ability spends, in words: "1 Life Magic Adept use and 1 Life Magic use". */
export function expendsText(ruleset: Ruleset, ability: MasteryAbility): string {
  if (ability.expends.length === 0) return 'Passive: always on.';
  const parts = ability.expends.map(
    (e) =>
      `${e.count} ${skillPartName(ruleset, e.skill, e.part as SkillPart)} ${e.count === 1 ? 'use' : 'uses'}`,
  );
  const list =
    parts.length <= 1
      ? parts.join('')
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] ?? ''}`;
  return `Spends ${list}.`;
}

/** Mastery magic skills the character owns. */
export function ownedMasteryMagic(ruleset: Ruleset, sheet: Sheet): string[] {
  return sheet.skills
    .filter((s) => s.parts.some((p) => p.level > 0))
    .map((s) => s.skillId)
    .filter((id) => masteryAbilities(ruleset, id).length > 0);
}
