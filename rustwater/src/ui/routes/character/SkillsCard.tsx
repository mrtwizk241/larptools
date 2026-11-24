import { Link } from 'react-router';
import { Card } from '../../components/index.ts';
import { AncestryGroup } from './AncestryCard.tsx';
import { SkillGroupHeading } from './SkillGroupHeading.tsx';
import { skillGroupViews, type SkillGroupView } from './sheetSections.ts';
import type { CharacterView } from './view.ts';
import styles from './character.module.css';

/**
 * Skills (I-8): one group per source with what is left to spend, then the skills owned there with
 * level and uses. Skill names open their row on the Skills screen.
 */
export function SkillsCard({ view }: { view: CharacterView }) {
  const { ruleset, sheet } = view;
  const groups = skillGroupViews(ruleset, sheet);
  return (
    <Card title="Skills" className={`${styles.card ?? ''} ${styles.wide ?? ''}`}>
      <div className={styles.skillGroups}>
        {sheet.ancestry ? <AncestryGroup view={view} ancestry={sheet.ancestry} /> : null}
        {groups.map((group) => (
          <Group key={group.id} view={view} group={group} />
        ))}
      </div>
    </Card>
  );
}

function Group({ view, group }: { view: CharacterView; group: SkillGroupView }) {
  return (
    <div className={styles.skillGroup}>
      <SkillGroupHeading title={group.title} left={group.left} />
      {group.note ? <p className={styles.muted}>{group.note}</p> : null}
      {group.lines.length > 0 ? (
        <ul className={styles.skillLines}>
          {group.lines.map((line) => (
            <li key={line.key} className={styles.skillLine}>
              <span>
                {line.skillId ? (
                  <Link
                    className={styles.skillName}
                    to={`/c/${view.id}/skills?open=${encodeURIComponent(line.skillId)}`}
                  >
                    {line.name}
                  </Link>
                ) : (
                  <span className={styles.skillName}>{line.name}</span>
                )}
                {line.detail ? ` · ${line.detail}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
