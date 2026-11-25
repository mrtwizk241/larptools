// The level controls on a skill row and the skill page in the no-login builds (as on Rustwater):
// each group's name above a round - and + with the value between. One tap learns or takes back,
// with Undo; a blocked button says why when tapped.
import { Minus, Plus } from 'lucide-react';
import { IconButton, useToast } from '../../../components/index.ts';
import { usePlaygroundSkill } from '../playground.ts';
import type { CharacterView } from '../view.ts';
import { controlGroups, type ControlButton } from './controlGroups.ts';
import { skillName, type Skill } from './skillInfo.ts';
import styles from './skills.module.css';

export function SkillControls({ view, skill }: { view: CharacterView; skill: Skill }) {
  const quick = usePlaygroundSkill(view.id);
  const toast = useToast();
  const { ruleset, sheet } = view;
  const name = skillName(ruleset, sheet, skill.id);
  const groups = controlGroups(ruleset, sheet, skill);
  const busy = quick.running;

  function button(b: ControlButton, kind: 'lower' | 'raise') {
    return (
      <IconButton
        variant="ghost"
        className={styles.circle}
        aria-label={b.label}
        aria-disabled={b.block || busy ? true : undefined}
        {...(b.block ? { title: b.block } : {})}
        icon={kind === 'lower' ? <Minus /> : <Plus />}
        onClick={() => {
          if (busy) return;
          if (b.block) {
            toast.show(b.block);
            return;
          }
          void (kind === 'lower'
            ? quick.takeBack(skill.id, name, b.step)
            : quick.learn(skill.id, name, b.step));
        }}
      />
    );
  }

  return (
    <div className={styles.controls}>
      {groups.map((g) => (
        <div
          key={g.id}
          className={styles.control}
          role="group"
          aria-label={g.id === 'level' ? `${name} level` : `${name} ${g.title} Technique`}
        >
          <span className={styles.controlLabel}>{g.title}</span>
          <span className={styles.stepper}>
            {button(g.lower, 'lower')}
            <span className={styles.controlValue}>{g.value}</span>
            {button(g.raise, 'raise')}
          </span>
        </div>
      ))}
    </div>
  );
}
