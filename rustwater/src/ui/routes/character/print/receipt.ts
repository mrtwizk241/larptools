// Check-in receipt data for one event the character checked in to. Pure, so it is unit tested.
// Mirrors the sheet's Check-In Receipt tab: event, attendance, awards (credited after caps), Shiny
// purchases with their total, item rewards owed, upkeep, and a staff signature line.
import type { LedgerCurrency, Ruleset, Sheet, SheetEvent } from '../../../../engine/index.ts';

export interface ReceiptAward {
  label: string;
  currency: LedgerCurrency;
  amount: number;
}

export interface ReceiptPurchase {
  name: string;
  qty: number;
  cost: number;
  /** Points the purchase credited, for example "+2 CXP". Empty for item purchases. */
  grants: ReceiptAward[];
  /** Items to hand over. */
  items: readonly string[];
}

export interface ReceiptOwed {
  text: string;
  delivered: boolean;
}

export interface ReceiptUpkeep {
  /** True when upkeep must be paid at this check-in (printed with an unticked "Paid" box). */
  due: boolean;
  /** True when a Shiny purchase covered the upkeep (printed with a ticked box). */
  covered?: boolean;
  text: string;
}

export interface ReceiptData {
  characterName: string;
  playerName: string;
  event: { key: string; name: string; date: string };
  attendance: string;
  npcHours: number;
  preSignedShift: boolean;
  extras: string[];
  /** Check-in awards as credited (caps already applied by the engine). */
  awards: ReceiptAward[];
  /** Other points credited at this event (staff awards, adjustments). */
  otherPoints: ReceiptAward[];
  purchases: ReceiptPurchase[];
  /** Shinies spent on purchases at this event. */
  shiniesSpent: number;
  /** Item rewards from this event. */
  owed: ReceiptOwed[];
  /** Undelivered item rewards from other events. */
  owedEarlier: { text: string; eventName: string }[];
  upkeep: ReceiptUpkeep;
  /** Check-in skill items handed over at the desk (pre-registration). */
  handedOut: string[];
  /** Start-of-event choices and how upkeep was paid. */
  picks: string[];
}

/** Checked-in events, newest first (by date, then log order). */
export function receiptEvents(sheet: Sheet): SheetEvent[] {
  return sheet.events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => b.event.date.localeCompare(a.event.date) || b.index - a.index)
    .map((e) => e.event);
}

/** Key of the latest checked-in event, or null when there is none. */
export function latestEventKey(sheet: Sheet): string | null {
  return receiptEvents(sheet)[0]?.key ?? null;
}

function kindName(ruleset: Ruleset, id: string): string {
  return ruleset.ruleset.ledgerKinds.find((k) => k.id === id)?.name ?? id;
}

function rarityName(ruleset: Ruleset, id: string): string {
  return ruleset.ruleset.rarities.find((r) => r.id === id)?.name ?? id;
}

function orList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1] ?? ''}`;
}

function upkeepFor(ruleset: Ruleset, sheet: Sheet, event: SheetEvent): ReceiptUpkeep {
  const rules = ruleset.ruleset.upkeep;
  const ancestryId = sheet.ancestry?.ancestryId;
  if (ancestryId !== undefined && rules.zeroForAncestries.includes(ancestryId))
    return {
      due: false,
      text: `No upkeep: ${sheet.ancestry?.ancestryName ?? ancestryId} pay none.`,
    };
  const first = receiptEvents(sheet).at(-1);
  if (rules.firstEventFree && first?.key === event.key)
    return { due: false, text: 'No upkeep: first event.' };
  const covered = sheet.shinyPurchases.find(
    (p) => p.purchaseId === rules.coveredByPurchase && p.eventKey === event.key,
  );
  if (covered)
    return {
      due: false,
      covered: true,
      text: `Upkeep covered (${covered.shiniesCost} Shinies)`,
    };
  const options = rules.options.map((o) =>
    o.kind === 'bits'
      ? `${o.qty} Bits`
      : `${o.qty} ${o.rarity ? `${rarityName(ruleset, o.rarity)} ` : ''}resource${o.qty === 1 ? '' : 's'}`,
  );
  return { due: true, text: `Upkeep due: ${orList(options)}` };
}

/** Receipt for one checked-in event; null when the character has no check-in with that key. */
export function buildReceipt(ruleset: Ruleset, sheet: Sheet, eventKey: string): ReceiptData | null {
  const event = sheet.events.find((e) => e.key === eventKey);
  if (!event) return null;
  const award = (a: { currency: LedgerCurrency; amount: number; kind: string }) => ({
    label: kindName(ruleset, a.kind),
    currency: a.currency,
    amount: a.amount,
  });

  const purchasesHere = sheet.shinyPurchases.filter((p) => p.eventKey === event.key);
  const purchaseIds = new Set(purchasesHere.map((p) => p.actionId));
  const purchases: ReceiptPurchase[] = purchasesHere.map((p) => ({
    name: ruleset.shinyPurchasesById[p.purchaseId]?.name ?? p.purchaseId,
    qty: p.qty,
    cost: p.shiniesCost,
    grants: sheet.ledger
      .filter((row) => row.actionId === p.actionId && row.currency !== 'shinies')
      .map(award),
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

  const eventNames = new Map(sheet.events.map((e) => [e.key, e.name]));
  return {
    characterName: sheet.profile.characterName,
    playerName: sheet.profile.playerName,
    event: { key: event.key, name: event.name, date: event.date },
    attendance: ruleset.attendanceById[event.attendance]?.name ?? event.attendance,
    npcHours: event.npcHours,
    preSignedShift: event.preSignedShift,
    extras: event.extras.map((id) => ruleset.awards.extras.find((x) => x.id === id)?.name ?? id),
    awards: event.awards.map(award),
    otherPoints,
    purchases,
    shiniesSpent: purchases.reduce((sum, p) => sum + p.cost, 0),
    owed: sheet.owed
      .filter((o) => o.eventKey === event.key)
      .map((o) => ({ text: o.text, delivered: o.delivered })),
    owedEarlier: sheet.owed
      .filter((o) => o.eventKey !== event.key && !o.delivered)
      .map((o) => ({
        text: o.text,
        eventName: o.eventKey ? (eventNames.get(o.eventKey) ?? o.eventKey) : 'No event',
      })),
    upkeep: upkeepFor(ruleset, sheet, event),
    handedOut: [...event.handedOut],
    picks: [...event.picks],
  };
}
