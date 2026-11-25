// What a skill does, shown when a skill row opens in the no-login builds (as on Rustwater's
// SkillPanel): per named ability, its uses and its description. The controls sit on the row.
import type { CharacterView } from '../view.ts';
import { abilityCards, abilityCostText, namedLabel, skillName, type Skill } from './skillInfo.ts';
import expand from '../expand.module.css';

export function SkillAbilities({ view, skill }: { view: CharacterView; skill: Skill }) {
  const name = skillName(view.ruleset, view.sheet, skill.id);
  return (
    <>
      {abilityCards(view.ruleset, view.sheet, skill).map((a) => (
        <section
          key={a.named}
          className={expand.part}
          aria-label={`${name} ${namedLabel(a.named)}`}
        >
          <div className={expand.partHead}>
            <h4 className={expand.partTitle}>{`${namedLabel(a.named)} (level ${a.level})`}</h4>
          </div>
          <dl className={expand.facts}>
            <div>
              <dt>Uses</dt>
              <dd>{a.uses === 0 ? 'None (passive)' : abilityCostText(a)}</dd>
            </div>
          </dl>
          <p className={expand.text}>{a.summary}</p>
        </section>
      ))}
    </>
  );
}
