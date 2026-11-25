import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton.tsx';
import { cx } from './cx.ts';
import styles from './Alert.module.css';

export interface AlertProps {
  /** `problem` (red edge, role alert) or `info` (neutral edge, role status). */
  kind?: 'problem' | 'info';
  title?: ReactNode;
  children?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

/** A message box: a problem to fix, or a short piece of information such as a one-time code. */
export function Alert({ kind = 'problem', title, children, onDismiss, className }: AlertProps) {
  return (
    <div
      role={kind === 'problem' ? 'alert' : 'status'}
      className={cx(styles.alert, kind === 'info' ? styles.info : null, className)}
    >
      <div className={styles.text}>
        {title ? <p className={styles.title}>{title}</p> : null}
        {children}
      </div>
      {onDismiss ? (
        <IconButton aria-label="Dismiss message" icon={<X />} onClick={onDismiss} />
      ) : null}
    </div>
  );
}
