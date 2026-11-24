// Small helpers shared by command files.
import { z } from 'zod';
import type { Ruleset } from '../../data/index.ts';
import { rarityName } from '../rules/effects.ts';
import type { Sheet } from '../sheet.ts';

export const OptionalText = z.string().trim().max(5000).optional();
export const OptionalShortText = z.string().trim().max(200).optional();

/** Room left under the earned-CXP cap ([PTS-CXP-CAP]). */
export function cxpCapRoom(sheet: Sheet): number {
  return sheet.points.cxp.capRemaining;
}

/** True when the CXP ledger kind counts toward the earned cap. */
export function countsAsEarned(ruleset: Ruleset, kind: string): boolean {
  return !ruleset.ruleset.earnedCxpCap.excludedKinds.includes(kind);
}

/** Net ledger amount of one currency and kind for an event key (voided check-ins net to 0). */
function netCredited(sheet: Sheet, currency: string, kind: string, eventKey: string): number {
  let total = 0;
  for (const r of sheet.ledger)
    if (r.currency === currency && r.kind === kind && r.eventKey === eventKey) total += r.amount;
  return total;
}

/** True when the character already has Event CXP for this event key ([PTS-CXP-EVENT]). */
export function hasEventCxp(sheet: Sheet, eventKey: string): boolean {
  return netCredited(sheet, 'cxp', 'event', eventKey) > 0;
}

/** True when the character already has attendance FP for this event key. */
export function hasAttendanceFp(sheet: Sheet, eventKey: string): boolean {
  return netCredited(sheet, 'fp', 'attendance', eventKey) > 0;
}

/** Events this character attended in a calendar year, optionally leaving one event out. */
export function eventsInYear(sheet: Sheet, year: string, exceptKey?: string): number {
  return sheet.events.filter((e) => e.date.startsWith(`${year}-`) && e.key !== exceptKey).length;
}

export function currencyName(ruleset: Ruleset, id: string): string {
  return ruleset.ruleset.currencies.find((c) => c.id === id)?.abbr ?? id.toUpperCase();
}

export function archetypeName(ruleset: Ruleset, id: string): string {
  return ruleset.archetypesById[id]?.name ?? id;
}

type ItemGrant = {
  readonly kind: string;
  readonly rarity?: string | undefined;
  readonly qty: number;
};

/** "3 Common resources", "10 Bits", "Upkeep covered". */
export function itemText(ruleset: Ruleset, item: ItemGrant, times = 1): string {
  const qty = item.qty * times;
  if (item.kind === 'bits') return `${qty} Bits`;
  if (item.kind === 'upkeep-covered') return 'Upkeep covered';
  const rarity = item.rarity ? `${rarityName(ruleset, item.rarity)} ` : '';
  return `${qty} ${rarity}resource${qty === 1 ? '' : 's'}`;
}

/** "A", "A or B", "A, B or C". */
export function orList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1] ?? ''}`;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
