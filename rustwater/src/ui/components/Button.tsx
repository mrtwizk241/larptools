import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';
import { cx } from './cx.ts';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  /** Optional leading icon (decorative). */
  icon?: ReactNode;
  /**
   * Why the button is disabled. Shown as visible text next to it and linked with
   * aria-describedby. The style guide forbids silent disabled buttons.
   */
  disabledReason?: string;
}

export function Button({
  variant = 'secondary',
  icon,
  disabledReason,
  className,
  type = 'button',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const reasonId = useId();
  const showReason = Boolean(disabled && disabledReason);
  const describedBy = cx(rest['aria-describedby'], showReason && reasonId) || undefined;

  const button = (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      aria-describedby={describedBy}
      className={cx(styles.button, styles[variant], className)}
    >
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );

  if (!showReason) return button;
  return (
    <span className={styles.withReason}>
      {button}
      <span id={reasonId} className={styles.reason}>
        {disabledReason}
      </span>
    </span>
  );
}
