// One row of an expandable list (Skills, Spells, Recipes): a heading with a toggle button that
// opens the details under it, like the Play screen. An optional action (a +) sits beside the
// toggle.
import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import styles from './expand.module.css';

export function ExpandItem({
  title,
  meta,
  action,
  defaultOpen = false,
  headingLevel = 3,
  children,
}: {
  title: string;
  /** Short line under the title: type badge, owned levels, rank. */
  meta?: ReactNode;
  /** A button beside the toggle, for example "I learned this spell". */
  action?: ReactNode;
  defaultOpen?: boolean;
  headingLevel?: 3 | 4;
  /** The details; rendered only while open. */
  children: () => ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const Heading = headingLevel === 3 ? 'h3' : 'h4';
  return (
    <div className={styles.item}>
      <div className={styles.head}>
        <Heading className={styles.heading}>
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
          >
            <span className={styles.main}>
              <span className={styles.name}>{title}</span>
              {meta ? <span className={styles.meta}>{meta}</span> : null}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={open ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron}
            />
          </button>
        </Heading>
        {action}
      </div>
      {open ? (
        <div id={panelId} className={styles.panel}>
          {children()}
        </div>
      ) : null}
    </div>
  );
}
