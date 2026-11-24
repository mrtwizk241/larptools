import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './cx.ts';
import styles from './Tabs.module.css';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  /** Accessible name of the tab list. */
  label: string;
  tabs: TabItem[];
  /** Controlled selection. */
  selectedId?: string;
  /** Uncontrolled starting tab. Defaults to the first. */
  defaultSelectedId?: string;
  onSelect?: (id: string) => void;
  className?: string;
}

/**
 * WAI-ARIA tabs with automatic activation: arrow keys move and select, Home and End jump to
 * the ends. Only the selected tab is in the tab order (roving tabindex).
 */
export function Tabs({
  label,
  tabs,
  selectedId,
  defaultSelectedId,
  onSelect,
  className,
}: TabsProps) {
  const baseId = useId();
  const [internalId, setInternalId] = useState(defaultSelectedId ?? tabs[0]?.id);
  const currentId = selectedId ?? internalId;
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const select = (id: string, focus: boolean) => {
    if (selectedId === undefined) setInternalId(id);
    onSelect?.(id);
    if (focus) tabRefs.current.get(id)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = tabs.findIndex((tab) => tab.id === currentId);
    let next: number | undefined;
    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        next = (index - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = tabs[next];
    if (target) select(target.id, true);
  };

  const tabId = (id: string) => `${baseId}-tab-${id}`;
  const panelId = (id: string) => `${baseId}-panel-${id}`;

  return (
    <div className={cx(styles.tabs, className)}>
      <div role="tablist" aria-label={label} className={styles.list}>
        {tabs.map((tab) => {
          const selected = tab.id === currentId;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                if (node) tabRefs.current.set(tab.id, node);
                else tabRefs.current.delete(tab.id);
              }}
              type="button"
              role="tab"
              id={tabId(tab.id)}
              aria-selected={selected}
              aria-controls={panelId(tab.id)}
              tabIndex={selected ? 0 : -1}
              className={styles.tab}
              data-label={tab.label}
              onClick={() => select(tab.id, false)}
              onKeyDown={onKeyDown}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={panelId(tab.id)}
          aria-labelledby={tabId(tab.id)}
          // The panel takes focus so keyboard users can reach content without focusables.
          tabIndex={0}
          hidden={tab.id !== currentId}
          className={styles.panel}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
