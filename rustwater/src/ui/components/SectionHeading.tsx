import type { ReactNode } from 'react';
import { cx } from './cx.ts';
import styles from './SectionHeading.module.css';

export interface SectionHeadingProps {
  children: ReactNode;
  /** Heading level. Default 2. */
  level?: 2 | 3 | 4;
  id?: string;
  className?: string;
}

/** Mono uppercase section heading with a thin rule under it. */
export function SectionHeading({ children, level = 2, id, className }: SectionHeadingProps) {
  const Tag = `h${level}` as const;
  return (
    <Tag id={id} className={cx(styles.heading, styles[`level${level}`], className)}>
      {children}
    </Tag>
  );
}
