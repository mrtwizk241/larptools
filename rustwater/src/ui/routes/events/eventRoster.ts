// Pure helpers for the staff Events screens: known events with counts, one event's roster rows,
// the staff summary, and the quick check-in and its Undo (a check-in void).
import {
  deriveSheet,
  type AdjustPointsCommand,
  type Award,
  type CheckInCommand,
  type Sheet,
  type VoidCheckInCommand,
} from '../../../engine/index.ts';
import type { GameEvent, StoredCharacter } from '../../../engine/model.ts';
import { readPayload } from '../../lib/describeAction.ts';
import { rulesetFor } from '../../data/rulesetContext.ts';
import { summarizeCharacter, type CharacterSummary } from '../../data/summary.ts';

/** Reason on the void the quick check-in Undo appends (and on its older point adjustments). */
export const UNDO_REASON = 'Undo check-in';

/** The attendance a quick check-in records. */
export const QUICK_ATTENDANCE = 'player';

export interface RosterEntry {
  character: StoredCharacter;
  summary: CharacterSummary;
  /** Undefined when this build does not have the character's rules season. */
  sheet: Sheet | undefined;
}

export function rosterEntries(characters: readonly StoredCharacter[]): RosterEntry[] {
  return characters.map((character) => {
    const ruleset = rulesetFor(character.rulesetId);
    return {
      character,
      summary: summarizeCharacter(character),
      sheet: ruleset ? deriveSheet(ruleset, character.actions) : undefined,
    };
  });
}

function newestFirst<T extends GameEvent>(events: T[]): T[] {
  return events.sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
}

export interface EventListItem extends GameEvent {
  /** Non-retired characters checked in to this event. */
  checkedIn: number;
}

/** Registry events plus any event a character was checked in to, newest first. */
export function knownEvents(
  registry: readonly GameEvent[],
  entries: readonly RosterEntry[],
): EventListItem[] {
  const byKey = new Map<string, GameEvent>();
  for (const e of registry) byKey.set(e.key, e);
  for (const entry of entries)
    for (const e of entry.sheet?.events ?? [])
      if (!byKey.has(e.key)) byKey.set(e.key, { key: e.key, name: e.name, date: e.date });
  return newestFirst(
    [...byKey.values()].map((e) => ({
      key: e.key,
      name: e.name,
      date: e.date,
      checkedIn: entries.filter(
        (x) => !x.summary.retired && x.sheet?.events.some((s) => s.key === e.key),
      ).length,
    })),
  );
}

/** The event with this key from the registry or any character's check-ins. */
export function findEvent(
  key: string,
  registry: readonly GameEvent[],
  entries: readonly RosterEntry[],
): GameEvent | undefined {
  const known = registry.find((e) => e.key === key);
  if (known) return known;
  for (const entry of entries) {
    const e = entry.sheet?.events.find((s) => s.key === key);
    if (e) return { key: e.key, name: e.name, date: e.date };
  }
  return undefined;
}

export interface EventRow {
  entry: RosterEntry;
  /** Attendance bundle id, or null when not checked in. */
  attendance: string | null;
  /** True when an old-style quick check-in Undo reversed this check-in's points. */
  reversed: boolean;
}

/** Action ids of the Undo corrections appended for this event. */
function undoActionIds(character: StoredCharacter, key: string): Set<string> {
  const ids = new Set<string>();
  for (const action of character.actions) {
    if (action.type !== 'points.adjusted' || action.eventKey !== key) continue;
    const payload = readPayload(action) as { reason?: string } | null;
    if (payload?.reason === UNDO_REASON) ids.add(action.id);
  }
  return ids;
}

/** Every non-retired character with its status at this event, in roster order. */
export function eventRows(entries: readonly RosterEntry[], key: string): EventRow[] {
  return entries
    .filter((entry) => !entry.summary.retired)
    .map((entry) => {
      const checkIn = entry.sheet?.events.find((e) => e.key === key);
      return {
        entry,
        attendance: checkIn?.attendance ?? null,
        reversed: checkIn ? undoActionIds(entry.character, key).size > 0 : false,
      };
    });
}

export function matchesQuery(summary: CharacterSummary, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (q === '') return true;
  return (
    summary.characterName.toLocaleLowerCase().includes(q) ||
    summary.playerName.toLocaleLowerCase().includes(q)
  );
}

export interface OwedAtEvent {
  id: string;
  characterName: string;
  text: string;
}

export interface EventSummary {
  /** Event CXP credited at check-in, less any quick check-in Undo corrections. */
  eventCxp: number;
  /** Item rewards for this event not yet delivered, across all characters. */
  owed: OwedAtEvent[];
}

/** Read-only staff totals for one event, across every character (retired ones too). */
export function eventSummary(entries: readonly RosterEntry[], key: string): EventSummary {
  let eventCxp = 0;
  const owed: OwedAtEvent[] = [];
  for (const entry of entries) {
    const sheet = entry.sheet;
    if (!sheet) continue;
    const undo = undoActionIds(entry.character, key);
    for (const row of sheet.ledger) {
      if (row.currency !== 'cxp' || row.eventKey !== key) continue;
      if (row.kind === 'event' || undo.has(row.actionId)) eventCxp += row.amount;
    }
    for (const item of sheet.owed)
      if (item.eventKey === key && !item.delivered)
        owed.push({ id: item.id, characterName: entry.summary.characterName, text: item.text });
  }
  return { eventCxp, owed };
}

/** The one-tap check-in: attendance player, no NPC time, no extras. */
export function quickCheckIn(event: GameEvent): CheckInCommand {
  return {
    type: 'checkIn',
    event: { key: event.key, name: event.name, date: event.date },
    attendance: QUICK_ATTENDANCE,
    npcHours: 0,
    preSignedShift: false,
    extras: [],
  };
}

/**
 * The quick check-in Undo: voids the check-in, so its points and items are taken back and the
 * character can be checked in to the event again. The check-in entry itself stays in the log.
 */
export function undoCheckIn(checkInActionId: string): VoidCheckInCommand {
  return { type: 'voidCheckIn', checkInActionId, reason: UNDO_REASON };
}

/**
 * Corrections that take back the CXP and FP a check-in credited. The old quick check-in Undo,
 * before check-ins could be voided; `eventRows` still reports check-ins it reversed.
 */
export function undoCommands(
  awards: readonly Award[],
  eventKeyValue: string,
): AdjustPointsCommand[] {
  const totals = new Map<'cxp' | 'fp', number>();
  for (const a of awards)
    if (a.currency === 'cxp' || a.currency === 'fp')
      totals.set(a.currency, (totals.get(a.currency) ?? 0) + a.amount);
  return [...totals]
    .filter(([, amount]) => amount > 0)
    .map(([currency, amount]) => ({
      type: 'adjustPoints',
      currency,
      amount: -amount,
      reason: UNDO_REASON,
      kind: 'adjustment',
      eventKey: eventKeyValue,
    }));
}
