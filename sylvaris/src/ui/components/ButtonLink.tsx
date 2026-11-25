import type { ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import type { ButtonVariant } from './Button.tsx';
import { cx } from './cx.ts';
import styles from './Button.module.css';

export interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  /** Optional leading icon (decorative). */
  icon?: ReactNode;
}

/** A router link that looks like a Button, for actions that navigate. */
export function ButtonLink({
  variant = 'secondary',
  icon,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link {...rest} className={cx(styles.button, styles[variant], className)}>
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </Link>
  );
}
