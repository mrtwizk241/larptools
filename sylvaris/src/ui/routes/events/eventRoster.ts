// Pure helpers for the staff Events screens: known events with counts, one event's roster rows,
// the staff summary, and the quick check-in and its Undo (a check-in void).
import {
  deriveSheet,
  type CheckInCommand,
  type LedgerCurrency,
  type Sheet,
  type VoidCheckInCommand,
} from '../../../engine/index.ts';
import type { GameEvent, StoredCharacter } from '../../../engine/model.ts';
import { rulesetFor } from '../../data/rulesetContext.ts';
import { summarizeCharacter, type CharacterSummary } from '../../data/summary.ts';

/** Reason on the void the quick check-in Undo appends. */
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
  /** The check-in action, for Undo. */
  checkInActionId: string | null;
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
        checkInActionId: checkIn?.actionId ?? null,
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
  /** Characters checked in, by attendance bundle id. */
  byAttendance: Record<string, number>;
  /** Points credited by this event's check-ins (voids taken off), by currency. */
  credited: Record<LedgerCurrency, number>;
  /** Items owed for this event and not yet delivered, across all characters. */
  owed: OwedAtEvent[];
}

/** Ledger kinds a check-in credits. */
const CHECK_IN_KINDS = new Set(['event', 'npc-time', 'staff', 'extra']);

/** Read-only staff totals for one event, across every character (retired ones too). */
export function eventSummary(entries: readonly RosterEntry[], key: string): EventSummary {
  const byAttendance: Record<string, number> = {};
  const credited: Record<LedgerCurrency, number> = { xp: 0, cxp: 0, axp: 0, mt: 0 };
  const owed: OwedAtEvent[] = [];
  for (const entry of entries) {
    const sheet = entry.sheet;
    if (!sheet) continue;
    const checkIn = sheet.events.find((e) => e.key === key);
    if (checkIn) byAttendance[checkIn.attendance] = (byAttendance[checkIn.attendance] ?? 0) + 1;
    const checkInIds = new Set<string>();
    for (const e of sheet.events) if (e.key === key) checkInIds.add(e.actionId);
    for (const v of sheet.voidedCheckIns)
      if (v.key === key) {
        checkInIds.add(v.checkInActionId);
        checkInIds.add(v.actionId);
      }
    for (const row of sheet.ledger)
      if (row.eventKey === key && CHECK_IN_KINDS.has(row.kind) && checkInIds.has(row.actionId))
        credited[row.currency] += row.amount;
    for (const item of sheet.owed)
      if (item.eventKey === key && !item.delivered)
        owed.push({ id: item.id, characterName: entry.summary.characterName, text: item.text });
  }
  return { byAttendance, credited, owed };
}

/** The one-tap check-in: attendance player, no NPC time, no extras, default income. */
export function quickCheckIn(event: GameEvent): CheckInCommand {
  return {
    type: 'checkIn',
    event: { key: event.key, name: event.name, date: event.date },
    attendance: QUICK_ATTENDANCE,
    npcHours: 0,
    extras: [],
  };
}

/**
 * The quick check-in Undo: voids the check-in, so its points are taken back and the character
 * can be checked in to the event again. The check-in entry itself stays in the log.
 */
export function undoCheckIn(checkInActionId: string): VoidCheckInCommand {
  return { type: 'voidCheckIn', checkInActionId, reason: UNDO_REASON };
}

/** The full check-in screen for this character, preselecting the event and returning here. */
export function checkInLink(characterId: string, key: string): string {
  const params = new URLSearchParams({ event: key, back: `/events/${key}` });
  return `/c/${characterId}/checkin?${params.toString()}`;
}
