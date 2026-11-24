import { Card } from '../../components/index.ts';
import { passiveAbilities } from './sheetSections.ts';
import type { CharacterView } from './view.ts';
import styles from './character.module.css';

/** Passive Abilities (I-15): every always-on ability from skills, ancestry, and profession. */
export function PassivesCard({ view }: { view: CharacterView }) {
  const passives = passiveAbilities(view.ruleset, view.sheet);
  return (
    <Card title="Passive Abilities" className={styles.card ?? ''}>
      {passives.length === 0 ? (
        <p className={styles.muted}>No passive abilities.</p>
      ) : (
        <ul className={styles.skillLines}>
          {passives.map((p) => (
            <li key={p.key} className={styles.skillLine}>
              <span className={styles.skillName}>{p.name}</span>
              <span className={styles.lineText}>
                {p.text}
                {p.counted ? (
                  <>
                    {' '}
                    <span className={styles.counted}>Counted in the totals.</span>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
