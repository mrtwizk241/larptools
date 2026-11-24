import { useId } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { Ruleset } from '../../../../engine/index.ts';
import { IconButton } from '../../../components/index.ts';
import { setCount, totalCount, type ItemCounts } from './startingItems.ts';
import shared from '../character.module.css';
import styles from '../profession/profession.module.css';

/**
 * Count picker for the starting equipment: one row per option with fewer and more buttons.
 * Repeats are allowed; the total stops at the ruleset limit (10). Used by the create wizard and
 * the edit dialog.
 */
export function StartingItemsPicker({
  ruleset,
  counts,
  onChange,
}: {
  ruleset: Ruleset;
  counts: ItemCounts;
  onChange: (next: ItemCounts) => void;
}) {
  const id = useId();
  const max = ruleset.startingItems.rules.picks;
  const total = totalCount(counts);
  const full = total >= max;
  const totalId = `${id}-total`;
  return (
    <div className={shared.stack}>
      <p id={totalId} className={styles.total} aria-live="polite">
        {total} of {max} chosen{full ? ', the maximum' : ''}
      </p>
      <ul className={styles.items} aria-label="Starting items">
        {ruleset.startingItems.options.map((option) => {
          const n = counts[option.id] ?? 0;
          return (
            <li key={option.id} className={styles.countRow}>
              <span className={styles.countName}>
                {option.name}
                {option.text ? <span className={shared.from}>{option.text}</span> : null}
              </span>
              <span className={styles.counter}>
                <IconButton
                  variant="ghost"
                  aria-label={`Fewer ${option.name}`}
                  aria-disabled={n > 0 ? undefined : true}
                  icon={<Minus />}
                  onClick={() => {
                    if (n > 0) onChange(setCount(counts, option.id, n - 1, max));
                  }}
                />
                <output className={styles.count} aria-label={`${option.name} count`}>
                  {n}
                </output>
                <IconButton
                  variant="ghost"
                  aria-label={`More ${option.name}`}
                  aria-disabled={full ? true : undefined}
                  aria-describedby={full ? totalId : undefined}
                  icon={<Plus />}
                  onClick={() => {
                    if (!full) onChange(setCount(counts, option.id, n + 1, max));
                  }}
                />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
