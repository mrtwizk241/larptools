import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Card } from '../../../components/index.ts';
import type { CharacterView } from '../view.ts';
import { SkillPanel } from './SkillPanel.tsx';
import { skillTitle } from './skillInfo.ts';
import styles from './skills.module.css';

/**
 * `#/c/:id/skills/:skillId`: one skill on its own page (older links and the wiki). The same panel
 * the Skills list opens in place: rule text per part, + per level for players, steppers for staff.
 * With `?owned=1`, a player sees only the parts they have, with a button for the rest.
 */
export function SkillDetailPage({ view }: { view: CharacterView }) {
  const { skillId = '' } = useParams();
  const [search] = useSearchParams();
  const skill = view.ruleset.skillsById[skillId];
  const ownedView = !view.isStaff && search.get('owned') === '1';

  if (!skill) {
    return (
      <section aria-labelledby="skill-heading" className={styles.detail}>
        <BackToSkills view={view} owned={ownedView} />
        <h2 id="skill-heading">Skill not found</h2>
        <Card>
          <p>There is no skill with this link.</p>
        </Card>
      </section>
    );
  }

  return (
    <section aria-labelledby="skill-heading" className={styles.detail}>
      <BackToSkills view={view} category={skill.category} owned={ownedView} />
      <h2 id="skill-heading" className={styles.title}>
        {skillTitle(view.ruleset, skill)}
      </h2>
      <SkillPanel view={view} skill={skill} ownedView={ownedView} headingLevel={3} />
    </section>
  );
}

function BackToSkills({
  view,
  category,
  owned = false,
}: {
  view: CharacterView;
  category?: string;
  owned?: boolean;
}) {
  const params = new URLSearchParams();
  if (category) params.set('tab', category);
  if (owned) params.set('owned', '1');
  const query = params.toString();
  return (
    <Link to={`/c/${view.id}/skills${query ? `?${query}` : ''}`} className={styles.back}>
      <ArrowLeft aria-hidden="true" className={styles.backIcon} />
      All skills
    </Link>
  );
}
