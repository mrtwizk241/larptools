import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from './cx.ts';
import styles from './IconButton.module.css';

export interface IconButtonProps extends Omit<
  ComponentPropsWithRef<'button'>,
  'aria-label' | 'children'
> {
  /** Required: an icon-only control always has an accessible name. */
  'aria-label': string;
  /** The icon (decorative; the label names the button). */
  icon: ReactNode;
  /** 'plain' is transparent; 'ghost' adds the strong border like the ghost button. */
  variant?: 'plain' | 'ghost';
}

export function IconButton({
  icon,
  variant = 'plain',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button {...rest} type={type} className={cx(styles.iconButton, styles[variant], className)}>
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}
