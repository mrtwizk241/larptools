// The character's skills at a glance (AC-4): grouped by category, each with level, Techniques,
// and uses, linking to the skill's page. The same groups as the printed sheet.
import { Link } from 'react-router';
import { Card } from '../../../components/index.ts';
import { skillGroups } from '../print/sheetModel.ts';
import type { CharacterView } from '../view.ts';
import { ownedSkillLine } from './overviewModel.ts';
import styles from '../character.module.css';
import own from './overview.module.css';

export function SkillsCard({ view }: { view: CharacterView }) {
  const groups = skillGroups(view.sheet);
  return (
    <Card title="Skills" className={`${styles.card ?? ''} ${own.wide ?? ''}`}>
      {groups.length === 0 ? (
        <p className={styles.muted}>No skills learned yet.</p>
      ) : (
        <div className={own.skillGroups}>
          {groups.map((group) => (
            <div key={group.id}>
              <h3 className={own.skillGroupName}>{group.name}</h3>
              <ul className={own.skillList}>
                {group.skills.map((skill) => (
                  <li key={skill.skillId} className={own.skillItem}>
                    <Link className={own.link} to={`/c/${view.id}/skills/${skill.skillId}`}>
                      {skill.displayName}
                    </Link>
                    <span className={styles.muted}>{ownedSkillLine(skill)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <p>
        <Link className={own.link} to={`/c/${view.id}/skills`}>
          All skills
        </Link>
      </p>
    </Card>
  );
}
