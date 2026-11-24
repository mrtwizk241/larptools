import { useId } from 'react';
import { Minus, Plus } from 'lucide-react';
import { IconButton } from './IconButton.tsx';
import { cx } from './cx.ts';
import styles from './LevelStepper.module.css';

export interface LevelStepperProps {
  /** What is being leveled, for example "Assault". Names the group and the buttons. */
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  /** Shown under the stepper, for example "Next level: 40 CXP". */
  nextCostLabel?: string;
  /** Why raising is blocked, for example "Needs 40 CXP, 25 left". Replaces nextCostLabel. */
  blockedReason?: string;
  /** Player mode: the level as plain text, no buttons. */
  readOnly?: boolean;
  className?: string;
}

/**
 * `[-] 3 [+]`. Buttons use aria-disabled (not disabled) so focus stays put when a limit is
 * reached and screen readers still hear the reason linked with aria-describedby.
 */
export function LevelStepper({
  label,
  value,
  min,
  max,
  onChange,
  nextCostLabel,
  blockedReason,
  readOnly = false,
  className,
}: LevelStepperProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const noteId = `${id}-note`;

  if (readOnly) {
    return (
      <span className={cx(styles.readOnly, className)}>
        <span className="visually-hidden">{label} level </span>
        {value}
      </span>
    );
  }

  const canLower = value > min;
  const atMax = value >= max;
  const canRaise = !atMax && !blockedReason;
  const note = blockedReason ?? (atMax ? `Maximum level ${max}` : nextCostLabel);
  const noteIsBlock = Boolean(blockedReason);

  return (
    <div role="group" aria-labelledby={labelId} className={cx(styles.stepper, className)}>
      <span id={labelId} className="visually-hidden">
        {label} level
      </span>
      <div className={styles.controls}>
        <IconButton
          variant="ghost"
          aria-label={`Lower ${label}`}
          aria-disabled={canLower ? undefined : true}
          icon={<Minus />}
          onClick={() => {
            if (canLower) onChange(value - 1);
          }}
        />
        <output className={styles.value} aria-live="polite" aria-atomic="true">
          {value}
        </output>
        <IconButton
          variant="ghost"
          aria-label={`Raise ${label}`}
          aria-disabled={canRaise ? undefined : true}
          aria-describedby={note ? noteId : undefined}
          icon={<Plus />}
          onClick={() => {
            if (canRaise) onChange(value + 1);
          }}
        />
      </div>
      {note ? (
        <p id={noteId} className={cx(styles.note, noteIsBlock && styles.blocked)}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
