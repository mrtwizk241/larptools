import { StartingItemsPicker } from '../character/extras/StartingItemsPicker.tsx';
import type { StepViewProps } from './StepViews.tsx';
import styles from './create.module.css';

/** Wizard step: starting equipment, up to 10 picks with repeats. Saved right after creation. */
export function StartingItemsStep({ draft, update, ruleset }: StepViewProps) {
  const max = ruleset.startingItems.rules.picks;
  return (
    <div className={styles.fields}>
      <p className={styles.hint}>
        Choose up to {max} items. An option can be picked more than once. Fewer than {max} is
        allowed; the rest can be added later on the Familiars and Boons screen.
      </p>
      <StartingItemsPicker
        ruleset={ruleset}
        counts={draft.startingItems}
        onChange={(next) => update({ ...draft, startingItems: { ...next } })}
      />
    </div>
  );
}
