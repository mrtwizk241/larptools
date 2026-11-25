import { useId, type ReactNode } from 'react';
import { cx } from './cx.ts';
import { SectionHeading } from './SectionHeading.tsx';
import styles from './Card.module.css';

export interface CardProps {
  /** Optional section heading. With a title the card is a labelled section. */
  title?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}

export function Card({ title, headingLevel = 2, className, children }: CardProps) {
  const headingId = useId();
  if (title === undefined) {
    return <div className={cx(styles.card, className)}>{children}</div>;
  }
  return (
    <section aria-labelledby={headingId} className={cx(styles.card, className)}>
      <SectionHeading level={headingLevel} id={headingId}>
        {title}
      </SectionHeading>
      {children}
    </section>
  );
}
