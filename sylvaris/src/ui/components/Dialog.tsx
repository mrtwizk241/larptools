import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { cx } from './cx.ts';
import styles from './Dialog.module.css';

export interface DialogProps {
  open: boolean;
  /** Called for Escape, the platform back gesture, and any close action. */
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  /** Buttons for the footer. They stack full width on phones. */
  actions?: ReactNode;
  /** Element to focus when the dialog opens. Default: the first focusable element. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal built on the native <dialog>: focus moves in on open, Escape closes, and focus
 * returns to the element that opened it.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  initialFocusRef,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();

    const target =
      initialFocusRef?.current ?? dialog.querySelector<HTMLElement>(FOCUSABLE) ?? dialog;
    target.focus();

    // Close requests the browser handles itself (Escape, Android back): keep React in charge.
    const onCancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };
    dialog.addEventListener('cancel', onCancel);

    return () => {
      dialog.removeEventListener('cancel', onCancel);
      if (dialog.open) dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [open, initialFocusRef]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // tabIndex lets the dialog itself take focus when it has nothing focusable.
      tabIndex={-1}
      className={cx(styles.dialog, className)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      {open ? (
        <div className={styles.inner}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {children ? <div className={styles.body}>{children}</div> : null}
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}
