// `#/c/:id/extras`: Artifact, Familiar, Boons, familiarized places, starting items, and items
// owed. Players read; staff change them.
import { LOCAL_MODE } from '../../../../localMode.ts';
import type { CharacterScreenProps } from '../screen.tsx';
import { ArtifactCard } from './ArtifactCard.tsx';
import { FamiliarCard } from './FamiliarCard.tsx';
import { BoonsCard, LocationsCard, OwedCard } from './RecordCards.tsx';
import { StartingItemsCard } from './StartingItemsCard.tsx';
import shared from '../character.module.css';
import styles from '../journals/screens.module.css';

export function ExtrasPage({ view }: CharacterScreenProps) {
  return (
    <section aria-labelledby="extras-heading" className={shared.section}>
      <h2 id="extras-heading">Extras</h2>
      <div className={styles.cards}>
        <ArtifactCard view={view} />
        <FamiliarCard view={view} />
        <BoonsCard view={view} />
        <LocationsCard view={view} />
        <StartingItemsCard view={view} />
        {/* Items owed by staff: not part of the no-login build playground. */}
        {LOCAL_MODE ? null : <OwedCard view={view} />}
      </div>
    </section>
  );
}
