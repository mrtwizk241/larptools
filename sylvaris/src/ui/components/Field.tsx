import { useId, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { cx } from './cx.ts';
import styles from './Field.module.css';

/** Props to spread on the input, select, or textarea inside a Field. */
export interface FieldControlProps {
  id: string;
  className: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  required?: true;
}

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  /** Error text. When set, the control gets aria-invalid and points at it. */
  error?: ReactNode;
  required?: boolean;
  /** Use a specific id for the control (otherwise one is generated). */
  id?: string;
  className?: string;
  /** Render the control: `{(control) => <input {...control} />}`. */
  children: (control: FieldControlProps) => ReactNode;
}

export function Field({ label, hint, error, required, id, className, children }: FieldProps) {
  const generated = useId();
  const controlId = id ?? `${generated}-control`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const hasError = error !== undefined && error !== null && error !== false && error !== '';

  const control: FieldControlProps = { id: controlId, className: styles.control ?? '' };
  const describedBy = cx(hint ? hintId : null, hasError ? errorId : null);
  if (describedBy) control['aria-describedby'] = describedBy;
  if (hasError) control['aria-invalid'] = true;
  if (required) control.required = true;

  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={controlId} className={styles.label}>
        {label}
      </label>
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {children(control)}
      {hasError ? (
        <p id={errorId} className={styles.error}>
          <CircleAlert aria-hidden="true" className={styles.errorIcon} />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
