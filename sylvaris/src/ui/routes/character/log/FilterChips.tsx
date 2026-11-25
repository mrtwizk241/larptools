import styles from './log.module.css';

export interface FilterOption {
  id: string;
  label: string;
}

/** Single-choice filter: a labelled group of toggle buttons, the chosen one pressed. */
export function FilterChips({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly FilterOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className={styles.chips}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === value}
          className={styles.chip}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
