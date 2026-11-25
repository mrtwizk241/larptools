// Event labels and the attended events staff pick from. Shared by the Magic, Calling, and Extras
// screens.
import type { Sheet, SheetEvent } from '../../../../engine/index.ts';

/** Attended events, newest first. */
export function eventsNewestFirst(sheet: Sheet): SheetEvent[] {
  return [...sheet.events].sort((a, b) =>
    a.date === b.date ? b.key.localeCompare(a.key) : b.date.localeCompare(a.date),
  );
}

/** "Harvest Moon (2026-09-19)", the key for an event the character has no check-in for, or null. */
export function eventLabel(sheet: Sheet, key: string | null): string | null {
  if (key === null) return null;
  const event = sheet.events.find((e) => e.key === key);
  return event ? `${event.name} (${event.date})` : key;
}

/** "Basic", "Grandmaster". */
export function levelName(level: string): string {
  return level.length === 0 ? level : `${level[0]?.toUpperCase() ?? ''}${level.slice(1)}`;
}

/** "1 use", "2 uses". */
export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}
