// The level controls on a skill row in the no-login builds (as on Rustwater's SkillControls): one
// group per part, the part name above a round - and + with the value between. "Level" (0 to 10)
// and the Techniques Expert, Master, and Grandmaster (Yes or No), each shown once the level
// allows it (3, 6, 10) or once learned. Pure, so it is unit tested; the engine checks every step
// as the build playground (prerequisites and step order apply, points may go below zero).
import { preview, type Ruleset, type Sheet, type TechniqueId } from '../../../../engine/index.ts';
import type { SkillStep } from '../../../../engine/model.ts';
import { costText } from '../../../lib/names.ts';
import { PLAYGROUND_REASON } from '../playground.ts';
import { namedLabel, ownedSkill, skillName, type Skill } from './skillInfo.ts';

export interface ControlButton {
  /** The step this button learns (+) or takes back (-). */
  readonly step: SkillStep;
  /** Accessible name: "Raise Toughness (20 XP)", "Take back Toughness Expert Technique". */
  readonly label: string;
  /** Why the button cannot act now, else null. */
  readonly block: string | null;
}

export interface ControlGroup {
  /** "level", or the Technique id. */
  readonly id: 'level' | TechniqueId;
  /** The part name shown above the buttons: "Level", "Expert". */
  readonly title: string;
  /** "3", or "Yes" and "No" for a Technique. */
  readonly value: string;
  readonly lower: ControlButton;
  readonly raise: ControlButton;
}

function check(ruleset: Ruleset, sheet: Sheet, skill: Skill, step: SkillStep, learn: boolean) {
  return preview(
    ruleset,
    sheet,
    learn
      ? { type: 'learnSkill', skillId: skill.id, step }
      : { type: 'refundSkill', skillId: skill.id, step, reason: PLAYGROUND_REASON },
    { playground: true },
  );
}

/** The groups on a skill row: Level, then each Technique the level allows or already learned. */
export function controlGroups(ruleset: Ruleset, sheet: Sheet, skill: Skill): ControlGroup[] {
  const owned = ownedSkill(sheet, skill.id);
  const level = owned?.level ?? 0;
  const techniques = owned?.techniques ?? [];
  const max = ruleset.ruleset.skills.maxLevel;
  const name = skillName(ruleset, sheet, skill.id);

  const up = level < max ? check(ruleset, sheet, skill, { level: level + 1 }, true) : null;
  const down = level > 0 ? check(ruleset, sheet, skill, { level }, false) : null;
  const groups: ControlGroup[] = [
    {
      id: 'level',
      title: 'Level',
      value: String(level),
      lower: {
        step: { level: Math.max(level, 1) },
        label: `Lower ${name}`,
        block: !down ? `${name} is not learned.` : down.allowed ? null : down.reasons.join(' '),
      },
      raise: {
        step: { level: level + 1 },
        label: up?.cost ? `Raise ${name} (${costText(ruleset, up.cost)})` : `Raise ${name}`,
        block: !up
          ? `${name} is at level ${max}, the highest.`
          : up.allowed
            ? null
            : up.reasons.join(' '),
      },
    },
  ];

  for (const t of ruleset.ruleset.skills.techniques) {
    const has = techniques.includes(t.id);
    if (!has && level < t.level) continue;
    const what = `${name} ${namedLabel(t.id)} Technique`;
    const step: SkillStep = { technique: t.id };
    const learn = has ? null : check(ruleset, sheet, skill, step, true);
    const back = has ? check(ruleset, sheet, skill, step, false) : null;
    groups.push({
      id: t.id,
      title: namedLabel(t.id),
      value: has ? 'Yes' : 'No',
      lower: {
        step,
        label: `Take back ${what}`,
        block: !back ? `${what} is not learned.` : back.allowed ? null : back.reasons.join(' '),
      },
      raise: {
        step,
        label: learn?.cost ? `Learn ${what} (${costText(ruleset, learn.cost)})` : `Learn ${what}`,
        block: !learn ? `${what} is learned.` : learn.allowed ? null : learn.reasons.join(' '),
      },
    });
  }
  return groups;
}
