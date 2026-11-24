import type { ReactNode } from 'react';
import { cx } from './cx.ts';
import styles from './Badge.module.css';

export type BadgeKind = 'staff' | 'player' | 'pending' | 'approved' | 'rejected';

const DEFAULT_TEXT: Record<BadgeKind, string> = {
  staff: 'Staff',
  player: 'Player',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

export interface BadgeProps {
  kind: BadgeKind;
  /** Visible text. Defaults to the kind name. Always text, never color alone. */
  children?: ReactNode;
  className?: string;
}

export function Badge({ kind, children, className }: BadgeProps) {
  return (
    <span className={cx(styles.badge, styles[kind], className)}>
      {children ?? DEFAULT_TEXT[kind]}
    </span>
  );
}
