// Small helpers shared by command files.
import { z } from 'zod';
import type { SyRuleset } from '../../data/index.ts';
import { NOT_OWNED, type OwnedLookup, type OwnedSkill } from '../rules/skills.ts';
import type { LedgerCurrency, Sheet } from '../sheet.ts';

export const OptionalText = z.string().trim().max(5000).optional();
export const OptionalShortText = z.string().trim().max(200).optional();

/** What the sheet owns of each skill (former Calling skills included). */
export function ownedFromSheet(sheet: Sheet): OwnedLookup {
  const map = new Map<string, OwnedSkill>();
  for (const s of sheet.skills) map.set(s.skillId, { level: s.level, techniques: s.techniques });
  return (id) => map.get(id) ?? NOT_OWNED;
}

/** Points available to spend in a currency (the MT balance for mt). */
export function available(sheet: Sheet, currency: LedgerCurrency): number {
  switch (currency) {
    case 'xp':
      return sheet.points.xp.available;
    case 'cxp':
      return sheet.points.cxp.available;
    case 'axp':
      return sheet.points.axp.available;
    case 'mt':
      return sheet.points.mt.balance;
  }
}

/** Net ledger amount of one currency and kind for an event key (voided check-ins net to 0). */
export function netCredited(
  sheet: Sheet,
  currency: LedgerCurrency,
  kinds: readonly string[],
  eventKey: string,
): number {
  let total = 0;
  for (const r of sheet.ledger)
    if (r.currency === currency && kinds.includes(r.kind) && r.eventKey === eventKey)
      total += r.amount;
  return total;
}

/** Ledger kinds that count as "event XP" for an event (attendance, missed or alt purchases). */
export const EVENT_XP_KINDS = ['event', 'missed-event', 'alt-character'] as const;

/** True when the character already has event XP credited for this event key. */
export function hasEventXp(sheet: Sheet, eventKey: string): boolean {
  return netCredited(sheet, 'xp', EVENT_XP_KINDS, eventKey) > 0;
}

/** Events this character attended in a calendar year, optionally leaving one event out. */
export function eventsInYear(sheet: Sheet, year: string, exceptKey?: string): number {
  return sheet.events.filter((e) => e.date.startsWith(`${year}-`) && e.key !== exceptKey).length;
}

export function currencyName(ruleset: SyRuleset, id: string): string {
  return ruleset.ruleset.currencies.find((c) => c.id === id)?.abbr ?? id.toUpperCase();
}

export function skillName(ruleset: SyRuleset, id: string): string {
  return ruleset.skillsById[id]?.name ?? id;
}

/** "A", "A or B", "A, B or C". */
export function orList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1] ?? ''}`;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Ledger kinds that only the engine's own commands write. */
export const RESERVED_KINDS: ReadonlySet<string> = new Set([
  'starting',
  'mt-purchase',
  'missed-event',
  'alt-character',
  'adjustment',
  'penalty',
]);
