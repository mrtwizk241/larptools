// Event labels and the event a staff purchase is recorded at.
import type { Sheet, SheetEvent } from '../../../../engine/index.ts';

/** Checked-in events, newest first. */
export function eventsNewestFirst(sheet: Sheet): SheetEvent[] {
  return [...sheet.events].sort((a, b) =>
    a.date === b.date ? b.key.localeCompare(a.key) : b.date.localeCompare(a.date),
  );
}

/** "Harvest Moon (2026-09-19)", or the key when the character has no check-in for it. */
export function eventLabel(sheet: Sheet, key: string | null): string | null {
  if (key === null) return null;
  const event = sheet.events.find((e) => e.key === key);
  return event ? `${event.name} (${event.date})` : key;
}
