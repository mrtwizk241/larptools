// Pure helpers for Mist Token purchases on the Points screen: price text, cap left for an event,
// the events a back-buy or missed or alternate character purchase may name, and the spendMt
// command the form sends ([PTS-MT-SPEND], [PTS-MT-MISSED], [PTS-MT-ALT]).
import {
  MT_TEACHING,
  type Ruleset,
  type Sheet,
  type SpendMtCommand,
  type SyRuleset,
} from '../../../../engine/index.ts';
import { NAMED_LEVELS, type GameEvent, type NamedLevelId } from '../../../../engine/model.ts';

type Purchase = SyRuleset['awards']['mtPurchases'][number];

/** "Basic", "Expert". */
export function levelName(level: NamedLevelId): string {
  return `${level.charAt(0).toUpperCase()}${level.slice(1)}`;
}

/** Named levels a purchase is sold at, in order (empty for a fixed price). */
export function soldLevels(purchase: Purchase): NamedLevelId[] {
  const by = purchase.mtByNamedLevel;
  if (!by) return [];
  return NAMED_LEVELS.filter((l) => by[l] !== undefined);
}

/** "50 Mist Tokens each", "500 Mist Tokens", "Basic 50, Expert 100, Master 150 Mist Tokens". */
export function priceText(purchase: Purchase): string {
  if (purchase.mtCost !== undefined)
    return `${purchase.mtCost} Mist Tokens${isSingle(purchase) ? '' : ' each'}`;
  const by: Partial<Record<NamedLevelId, number | undefined>> = purchase.mtByNamedLevel ?? {};
  return `${soldLevels(purchase)
    .map((l) => `${levelName(l)} ${by[l] ?? 0}`)
    .join(', ')} Mist Tokens`;
}

export function isTeaching(purchase: Purchase): boolean {
  return purchase.id === MT_TEACHING.normal || purchase.id === MT_TEACHING.advanced;
}

/** Bought one at a time: teaching, and the missed and alternate character event XP. */
export function isSingle(purchase: Purchase): boolean {
  return isTeaching(purchase) || purchase.condition !== undefined;
}

export interface CapLeft {
  perEvent: { cap: number; bought: number; left: number } | null;
  perYear: { cap: number; bought: number; left: number; year: string } | null;
}

/**
 * How much of a purchase's per-event and per-year caps is left for `capKey` (the event it counts
 * for: the back-buy or missed event, else the event it is bought at). Teaching shares one cap.
 */
export function capLeft(
  ruleset: Ruleset,
  sheet: Sheet,
  purchase: Purchase,
  capKey: string | null,
): CapLeft {
  const group = purchase.capGroup;
  const sameCap = (id: string) =>
    group !== undefined ? ruleset.mtPurchasesById[id]?.capGroup === group : id === purchase.id;
  let perEvent: CapLeft['perEvent'] = null;
  let perYear: CapLeft['perYear'] = null;
  if (purchase.capPerEvent !== undefined && capKey !== null) {
    const bought = sheet.mtPurchases
      .filter((p) => sameCap(p.purchaseId) && p.capKey === capKey)
      .reduce((n, p) => n + p.qty, 0);
    perEvent = {
      cap: purchase.capPerEvent,
      bought,
      left: Math.max(0, purchase.capPerEvent - bought),
    };
  }
  if (purchase.capPerYear !== undefined && capKey !== null) {
    const year = capKey.slice(0, 4);
    const bought = sheet.mtPurchases
      .filter((p) => p.purchaseId === purchase.id && p.capKey?.startsWith(`${year}-`))
      .reduce((n, p) => n + p.qty, 0);
    perYear = {
      cap: purchase.capPerYear,
      bought,
      left: Math.max(0, purchase.capPerYear - bought),
      year,
    };
  }
  return { perEvent, perYear };
}

/**
 * The cap in words: "10 per event; 7 left for this event." Without an event: "10 per event:
 * choose the event to see what is left." Empty when there is no cap.
 */
export function capText(purchase: Purchase, left: CapLeft): string {
  const parts: string[] = [];
  if (purchase.capPerEvent !== undefined)
    parts.push(
      left.perEvent
        ? `${purchase.capPerEvent} per event; ${left.perEvent.left} left for this event.`
        : `${purchase.capPerEvent} per event: choose the event to see what is left.`,
    );
  if (purchase.capPerYear !== undefined)
    parts.push(
      left.perYear
        ? `${purchase.capPerYear} per year; ${left.perYear.left} left in ${left.perYear.year}.`
        : `${purchase.capPerYear} per year: choose the event to see what is left.`,
    );
  return parts.join(' ');
}

/** Same calendar year: event keys and dates start with the year. */
export function sameYear(a: string, b: string): boolean {
  return a.slice(0, 4) === b.slice(0, 4);
}

/** True when the character has event XP credited for the event (check-in, missed, alternate). */
export function hasEventCredit(sheet: Sheet, key: string): boolean {
  if (sheet.events.some((e) => e.key === key)) return true;
  const net = sheet.ledger
    .filter(
      (r) =>
        r.currency === 'xp' &&
        r.eventKey === key &&
        (r.kind === 'event' || r.kind === 'missed-event' || r.kind === 'alt-character'),
    )
    .reduce((n, r) => n + r.amount, 0);
  return net > 0;
}

/**
 * Events the purchase may count for, given the event it is bought at:
 * - back-buy (XP, CXP): an event this character attended, the same year, not the purchase event;
 * - missed event XP: a known event of the same year this character has no credit for;
 * - alternate character XP: a known event of the same year this character did not attend.
 */
export function forEventOptions(
  purchase: Purchase,
  sheet: Sheet,
  known: readonly GameEvent[],
  purchaseEventKey: string,
): GameEvent[] {
  if (purchaseEventKey === '') return [];
  if (purchase.condition === 'missed-event' || purchase.condition === 'alt-character')
    return known.filter(
      (e) =>
        sameYear(e.key, purchaseEventKey) &&
        (purchase.condition === 'missed-event'
          ? !hasEventCredit(sheet, e.key)
          : !sheet.events.some((x) => x.key === e.key) && !hasEventCredit(sheet, e.key)),
    );
  if (purchase.backBuy)
    return sheet.events
      .filter((e) => sameYear(e.key, purchaseEventKey) && e.key !== purchaseEventKey)
      .map((e) => ({ key: e.key, name: e.name, date: e.date }));
  return [];
}

/** Events this character attended in the calendar year of `key`, other than `key`. */
export function attendedInYear(sheet: Sheet, key: string): number {
  return sheet.events.filter((e) => sameYear(e.key, key) && e.key !== key).length;
}

export interface SpendForm {
  purchaseId: string;
  qty: number;
  namedLevel: NamedLevelId | '';
  skillId: string;
  /** The event it is bought at. */
  eventKey: string;
  /** The earlier, missed, or other character's event; only sent with `eventKey`. */
  forEventKey: string;
  /** Events the player attended that year, across characters (missed and alternate). */
  attended: number | null;
  note: string;
}

/**
 * The spendMt command for the form. A purchase for another event always carries the event it is
 * bought at (both in the same year), and the missed and alternate character purchases always
 * carry the attendance count.
 */
export function spendCommand(purchase: Purchase, form: SpendForm): SpendMtCommand {
  const forEvent =
    form.eventKey !== '' &&
    form.forEventKey !== '' &&
    (purchase.backBuy === true || purchase.condition !== undefined);
  return {
    type: 'spendMt',
    purchaseId: purchase.id,
    qty: isSingle(purchase) ? 1 : form.qty,
    ...(purchase.mtByNamedLevel && form.namedLevel ? { namedLevel: form.namedLevel } : {}),
    ...(isTeaching(purchase) && form.skillId ? { skillId: form.skillId } : {}),
    ...(form.eventKey ? { eventKey: form.eventKey } : {}),
    ...(forEvent ? { forEventKey: form.forEventKey } : {}),
    ...(purchase.condition !== undefined && form.attended !== null
      ? { playerEventsAttendedInYear: form.attended }
      : {}),
    ...(form.note.trim() ? { note: form.note.trim() } : {}),
  };
}

/** Skills a teaching purchase may teach: not Calling skills, normal or advanced to match. */
export function teachableSkills(ruleset: Ruleset, purchase: Purchase) {
  const advanced = purchase.id === MT_TEACHING.advanced;
  return Object.values(ruleset.skillsById)
    .filter((s) => s.category !== 'calling' && s.advanced === advanced)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The award kinds that fit each currency; kinds not listed fit every currency. */
const KIND_CURRENCIES: Readonly<Record<string, readonly string[]>> = {
  event: ['xp', 'cxp', 'axp'],
  'npc-time': ['xp', 'cxp', 'mt'],
  staff: ['xp', 'cxp', 'mt'],
  extra: ['mt'],
  'away-role': ['cxp', 'mt'],
  'plot-writing': ['mt'],
  donation: ['mt'],
  volunteer: ['mt'],
  grades: ['mt'],
  retirement: ['xp', 'cxp', 'axp'],
};

/** Ledger kinds only the engine's own commands write; never offered as awards. */
export const RESERVED_KINDS: ReadonlySet<string> = new Set([
  'starting',
  'mt-purchase',
  'missed-event',
  'alt-character',
  'adjustment',
  'penalty',
]);

/** Award kinds from the ruleset that fit `currency`, in ruleset order. */
export function awardKinds(ruleset: Ruleset, currency: string): { id: string; name: string }[] {
  return ruleset.ruleset.ledgerKinds.filter(
    (k) => !RESERVED_KINDS.has(k.id) && (KIND_CURRENCIES[k.id]?.includes(currency) ?? true),
  );
}
