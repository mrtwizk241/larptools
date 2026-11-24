import { PointsChip } from '../../../components/index.ts';
import type { CharacterView } from '../view.ts';
import { BoonsCard } from './BoonsCard.tsx';
import { FamiliarCard } from './FamiliarCard.tsx';
import { OwedCard } from './OwedCard.tsx';
import shared from '../character.module.css';
import styles from '../profession/profession.module.css';

/**
 * `#/c/:id/extras`: familiar, boons, and owed rewards. Starting items are picked in the new
 * character wizard and are not listed here (backlog I-11).
 */
export function ExtrasPage({ view }: { view: CharacterView }) {
  const fp = view.sheet.points.fp;
  return (
    <section aria-labelledby="extras-heading" className={shared.section}>
      <h2 id="extras-heading">Familiars and Boons</h2>
      <ul className={styles.chips} aria-label="Familiar points">
        <li>
          <PointsChip
            label="FP"
            value={fp.available}
            suffix="left"
            {...(fp.available < 0 ? { warning: 'Overspent' } : {})}
          />
        </li>
      </ul>
      <div className={styles.cards}>
        <FamiliarCard view={view} />
        <BoonsCard view={view} />
        <OwedCard view={view} />
      </div>
    </section>
  );
}
