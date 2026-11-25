import { useId, type ReactNode } from 'react';
import styles from './create.module.css';

export interface ChoiceCardProps {
  /** Radio group name. */
  name: string;
  value: string;
  checked: boolean;
  onSelect: (value: string) => void;
  /** Short accessible name, for example "Elf". */
  title: string;
  /** Details shown in the card and read as the radio's description. */
  children?: ReactNode;
  describedBy?: string | undefined;
}

/** A radio button laid out as a card: the whole card selects it, details are its description. */
export function ChoiceCard({
  name,
  value,
  checked,
  onSelect,
  title,
  children,
  describedBy,
}: ChoiceCardProps) {
  const id = useId();
  const detailsId = `${id}-details`;
  const described = [children ? detailsId : null, describedBy ?? null].filter(Boolean).join(' ');
  return (
    <div className={styles.choice}>
      <div className={styles.choiceHead}>
        <input
          id={id}
          type="radio"
          name={name}
          value={value}
          checked={checked}
          onChange={() => onSelect(value)}
          className={styles.radio}
          {...(described ? { 'aria-describedby': described } : {})}
        />
        <label htmlFor={id} className={styles.choiceLabel}>
          {title}
        </label>
      </div>
      {children ? (
        <div id={detailsId} className={styles.choiceDetails}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
