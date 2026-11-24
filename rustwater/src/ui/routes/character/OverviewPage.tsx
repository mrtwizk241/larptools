import { TriangleAlert } from 'lucide-react';
import { Card } from '../../components/index.ts';
import { contributionSource, signed } from './format.ts';
import { InfectionCard } from './InfectionCard.tsx';
import { PassivesCard } from './PassivesCard.tsx';
import { ProfileCard } from './ProfileCard.tsx';
import { SkillsCard } from './SkillsCard.tsx';
import { StoryNotesCard } from './StoryNotesCard.tsx';
import type { CharacterView } from './view.ts';
import styles from './character.module.css';

/**
 * `#/c/:id`: the Sheet. Top to bottom: Profile, Infection, Stats, Skills, Passive Abilities,
 * Story Notes. From 900px two columns: Profile beside Infection and Stats, Skills across both,
 * then Passive Abilities beside Story Notes.
 */
export function OverviewPage({ view }: { view: CharacterView }) {
  const { sheet } = view;
  return (
    <div className={styles.overview}>
      {sheet.warnings.length > 0 ? <WarningsCard view={view} /> : null}
      <ProfileCard view={view} />
      <div className={styles.overviewColumn}>
        {sheet.infection ? <InfectionCard view={view} infection={sheet.infection} /> : null}
        <StatsCard view={view} />
      </div>
      <SkillsCard view={view} />
      <PassivesCard view={view} />
      <StoryNotesCard view={view} />
    </div>
  );
}

function WarningsCard({ view }: { view: CharacterView }) {
  const { warnings } = view.sheet;
  return (
    <Card
      title={
        <span className={styles.warnTitle}>
          <TriangleAlert aria-hidden="true" className={styles.warnIcon} />
          {warnings.length === 1 ? 'Warning' : `Warnings (${warnings.length})`}
        </span>
      }
      className={styles.warningCard ?? ''}
    >
      <p className={styles.muted}>Something in this character's log does not add up.</p>
      <ul className={styles.warningList}>
        {warnings.map((w, index) => (
          <li key={`${w.actionId ?? 'log'}-${w.code}-${index}`}>{w.message}</li>
        ))}
      </ul>
    </Card>
  );
}

const STATS = [
  { id: 'maxHealth', label: 'Max Health' },
  { id: 'armor', label: 'Armor' },
] as const;

function StatsCard({ view }: { view: CharacterView }) {
  const { ruleset, sheet } = view;
  return (
    <Card title="Stats" className={styles.card ?? ''}>
      <dl className={styles.facts}>
        {STATS.map((stat) => {
          const parts = sheet.stats.contributions.filter(
            (c) => c.stat === stat.id && c.condition === null,
          );
          const value = stat.id === 'maxHealth' ? sheet.stats.maxHealth : sheet.stats.armor;
          return (
            <div key={stat.id}>
              <dt>{stat.label}</dt>
              <dd>
                <span className={styles.statValue}>{value}</span>
                {parts.length > 0 ? (
                  <span className={styles.from}>
                    From:{' '}
                    {parts
                      .map(
                        (c, i) =>
                          `${contributionSource(ruleset, c)} ${i === 0 ? c.amount : signed(c.amount)}`,
                      )
                      .join(', ')}
                  </span>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
    </Card>
  );
}
