// Check-in receipt data for one event the character checked in to. Pure, so it is unit tested.
// Event, attendance, awards credited after caps (and what the caps held back), Mist Token
// purchases with their total, items handed out, items owed, and upkeep.
import type { LedgerCurrency, Ruleset, Sheet, SheetEvent } from '../../../../engine/index.ts';
import { ledgerKindName } from '../../../lib/names.ts';

export interface ReceiptAward {
  label: string;
  currency: LedgerCurrency;
  amount: number;
}

export interface ReceiptPurchase {
  name: string;
  qty: number;
  cost: number;
  /** Points the purchase credited (for example +5 XP). */
  grants: ReceiptAward[];
  items: readonly string[];
}

export interface ReceiptData {
  characterName: string;
  playerName: string;
  event: { key: string; name: string; date: string };
  attendance: string;
  npcHours: number;
  extras: string[];
  /** Check-in awards as credited (the engine already applied the caps). */
  awards: ReceiptAward[];
  /** Awards above the XP or CXP earned cap: recorded, not credited. */
  notCredited: ReceiptAward[];
  /** Other points credited at this event (staff awards, adjustments). */
  otherPoints: ReceiptAward[];
  purchases: ReceiptPurchase[];
  /** Mist Tokens spent on purchases for this event. */
  mtSpent: number;
  /** Items handed out at the desk: check-in income and purchased items. */
  handedOut: string[];
  /** Items owed from this event. */
  owed: { text: string; delivered: boolean }[];
  upkeep: { due: boolean; text: string };
}

/** Checked-in events, newest first (by date, then log order). */
export function receiptEvents(sheet: Sheet): SheetEvent[] {
  return sheet.events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => b.event.date.localeCompare(a.event.date) || b.index - a.index)
    .map((e) => e.event);
}

function upkeepText(sheet: Sheet, event: SheetEvent): { due: boolean; text: string } {
  const { dueSilver, coveredBy } = event.upkeep;
  if (dueSilver <= 0) return { due: false, text: 'No upkeep due.' };
  const silver = `${dueSilver} Silver`;
  if (coveredBy === null) return { due: true, text: `Upkeep due: ${silver}.` };
  if (coveredBy === 'paid') return { due: false, text: `Upkeep: ${silver}, paid.` };
  const cover = sheet.stats.upkeep.covers.find((c) => c.id === coveredBy);
  return { due: false, text: `Upkeep: ${silver}, covered by ${cover?.summary ?? coveredBy}.` };
}

/** Receipt for one checked-in event; null when the character has no check-in with that key. */
export function buildReceipt(ruleset: Ruleset, sheet: Sheet, eventKey: string): ReceiptData | null {
  const event = sheet.events.find((e) => e.key === eventKey);
  if (!event) return null;
  const award = (a: { currency: LedgerCurrency; amount: number; kind: string }) => ({
    label: ledgerKindName(ruleset, a.kind),
    currency: a.currency,
    amount: a.amount,
  });

  const purchasesHere = sheet.mtPurchases.filter((p) => (p.capKey ?? p.eventKey) === event.key);
  const purchaseIds = new Set(sheet.mtPurchases.map((p) => p.actionId));
  const purchases: ReceiptPurchase[] = purchasesHere.map((p) => ({
    name: p.name,
    qty: p.qty,
    cost: p.mtCost,
    grants: p.grants.map((g) => ({
      label: p.name,
      currency: g.currency,
      amount: g.amount,
    })),
    items: p.items,
  }));

  const otherPoints = sheet.ledger
    .filter(
      (row) =>
        row.eventKey === event.key &&
        row.actionId !== event.actionId &&
        !purchaseIds.has(row.actionId),
    )
    .map(award);

  return {
    characterName: sheet.profile.characterName,
    playerName: sheet.profile.playerName,
    event: { key: event.key, name: event.name, date: event.date },
    attendance: ruleset.attendanceById[event.attendance]?.name ?? event.attendance,
    npcHours: event.npcHours,
    extras: event.extras.map((id) => ruleset.extrasById[id]?.name ?? id),
    awards: event.awards.map(award),
    notCredited: event.notCredited.map(award),
    otherPoints,
    purchases,
    mtSpent: purchases.reduce((sum, p) => sum + p.cost, 0),
    handedOut: [...event.handedOut, ...purchasesHere.flatMap((p) => p.items)],
    owed: sheet.owed
      .filter((o) => o.eventKey === event.key)
      .map((o) => ({ text: o.text, delivered: o.delivered })),
    upkeep: upkeepText(sheet, event),
  };
}
