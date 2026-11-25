// Which events a character may still pre-register for (acceptance AC-6): events today or later
// that the character is not already checked in to.
import { deriveSheet, type Ruleset } from '../../../engine/index.ts';
import type { StoredCharacter } from '../../../engine/model.ts';

/** Event keys the character is checked in to (voided check-ins excluded). */
export function checkedInKeys(ruleset: Ruleset, character: StoredCharacter): ReadonlySet<string> {
  return new Set(deriveSheet(ruleset, character.actions).events.map((e) => e.key));
}

/** Why the character cannot pre-register for the event, or null when it can. */
export function preRegisterBlock(
  event: { key: string; date: string },
  checkedIn: ReadonlySet<string>,
  todayIso: string,
): string | null {
  if (checkedIn.has(event.key)) return 'Already checked in to this event.';
  if (event.date < todayIso) return 'This event is over.';
  return null;
}
