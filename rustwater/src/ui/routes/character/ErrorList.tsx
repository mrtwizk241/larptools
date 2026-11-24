import { CircleAlert } from 'lucide-react';
import styles from './character.module.css';

/** Inline errors from a command or a form, announced when they appear. */
export function ErrorList({ messages, title }: { messages: readonly string[]; title?: string }) {
  if (messages.length === 0) return null;
  return (
    <div role="alert" className={styles.errors}>
      <CircleAlert aria-hidden="true" className={styles.errorsIcon} />
      <div className={styles.errorsText}>
        {title ? <p className={styles.errorsTitle}>{title}</p> : null}
        {messages.length === 1 ? (
          <p>{messages[0]}</p>
        ) : (
          <ul>
            {messages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
