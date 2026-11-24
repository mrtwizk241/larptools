import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { cx } from './cx.ts';
import styles from './PointsChip.module.css';

export interface PointsChipProps {
  /** Short label, shown in mono caps, for example "CXP". */
  label: string;
  value: ReactNode;
  /** Text after the value, for example "left". */
  suffix?: string;
  /**
   * Warning text for negative or over-cap values, for example "Over cap". When set the chip
   * switches to danger text and shows a warning icon plus this text (never color alone).
   */
  warning?: string;
  className?: string;
}

export function PointsChip({ label, value, suffix, warning, className }: PointsChipProps) {
  return (
    <span className={cx(styles.chip, warning && styles.warning, className)}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
      {suffix ? <span className={styles.suffix}>{suffix}</span> : null}
      {warning ? (
        <span className={styles.warningText}>
          <TriangleAlert aria-hidden="true" className={styles.icon} />
          {warning}
        </span>
      ) : null}
    </span>
  );
}
