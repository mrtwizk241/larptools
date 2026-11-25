// Pure helpers for the staff check-in screens: what each extra gives, what the desk hands over
// with the player's choices, the upkeep line, and the safe return path ([EVT-CHECKIN],
// [EVT-UPKEEP], [EVT-CHECKIN-INCOME], [PTS-MT-EARN]).
import {
  attendanceSilver,
  checkInItems,
  type CheckInChoices,
  type PullItem,
  type Ruleset,
  type Sheet,
  type UpkeepInfo,
} from '../../../../engine/index.ts';
import { amountText } from '../../../lib/names.ts';

/** "+50 Mist Tokens", "counts as 2 hours of NPC time". */
export function extraText(ruleset: Ruleset, extraId: string): string {
  const extra = ruleset.extrasById[extraId];
  if (!extra) return '';
  const parts = (extra.grants ?? []).map((g) => `+${amountText(ruleset, g.currency, g.amount)}`);
  if (extra.npcHours) parts.push(`counts as ${extra.npcHours} hours of NPC time`);
  return parts.join(', ');
}

/**
 * "60 XP, 5 CXP, 1 AXP" for an attendance bundle, from the ruleset. A second grant of the same
 * currency joins the first: "60 XP + 10 XP staff bonus" (acceptance AC-16).
 */
export function attendanceText(ruleset: Ruleset, id: string): string {
  const bundle = ruleset.attendanceById[id];
  if (!bundle) return '';
  const parts: string[] = [];
  const at = new Map<string, number>();
  for (const g of bundle.grants) {
    const amount = amountText(ruleset, g.currency, g.amount);
    const index = at.get(g.currency);
    if (index === undefined) {
      at.set(g.currency, parts.length);
      parts.push(amount);
    } else parts[index] += ` + ${amount} ${g.kind === 'staff' ? 'staff bonus' : 'bonus'}`;
  }
  if (bundle.npcTimeMax) parts.push('NPC time at its maximum');
  if (bundle.silver) parts.push(`${bundle.silver} Silver`);
  return parts.join(', ');
}

export interface HandOut {
  /** What the desk hands over, in order: attendance silver, then check-in income. */
  items: PullItem[];
  /** Problems with the choices. */
  problems: string[];
}

/**
 * What the desk hands over at a check-in: the attendance silver (GM-level staff, or the paid NPC
 * silver choice) and the check-in income with the choices. Upkeep covered by a skill is a line
 * of its own (`what: 'upkeep'`), not an item.
 */
export function handOut(
  ruleset: Ruleset,
  sheet: Sheet,
  attendance: string,
  paidChoice: 'skills' | 'silver' | undefined,
  choices: CheckInChoices,
): HandOut {
  const items: PullItem[] = [];
  const bundle = ruleset.attendanceById[attendance];
  if (bundle) {
    const silver = attendanceSilver(bundle, paidChoice, sheet.points.xp.earned);
    if (silver > 0)
      items.push({
        from: 'attendance',
        source: bundle.name,
        what: 'silver',
        qty: silver,
        text: `${silver} Silver (${bundle.name})`,
      });
  }
  const income = checkInItems(ruleset, sheet.stats.checkInIncome, choices);
  items.push(...income.items);
  return { items, problems: income.problems };
}

/** The texts the check-in records as handed over (upkeep cover lines left out). */
export function handedOutTexts(items: readonly PullItem[]): string[] {
  return items.filter((i) => i.what !== 'upkeep').map((i) => i.text);
}

/** "Upkeep due: 1 Silver, paid." / "No upkeep: first event: no upkeep." */
export function upkeepLine(ruleset: Ruleset, upkeep: UpkeepInfo, coveredBy: string | null): string {
  if (!upkeep.due) return upkeepReasonText(upkeep.reason);
  const silver = `${upkeep.dueSilver} Silver`;
  if (coveredBy === null || coveredBy === 'paid') return `Upkeep due: ${silver}, paid at the desk.`;
  const cover = upkeep.covers.find((c) => c.id === coveredBy);
  const name = ruleset.skillsById[coveredBy]?.name ?? cover?.summary ?? coveredBy;
  return `Upkeep due: ${silver}, covered by ${name}.`;
}

/** "No upkeep: first event.", "No upkeep for this Calling." (acceptance AC-16). */
export function upkeepReasonText(reason: string | null | undefined): string {
  const r = (reason ?? '')
    .replace(/:?\s*no upkeep$/i, '')
    .replace(/^no upkeep\s*/i, '')
    .trim();
  if (r === '') return 'No upkeep due.';
  return r.startsWith('for ') ? `No upkeep ${r}.` : `No upkeep: ${r}.`;
}

/** The cover used when staff have not chosen one: an automatic cover, else paid. */
export function defaultCover(upkeep: UpkeepInfo): string {
  return upkeep.covers.find((c) => c.automatic)?.id ?? 'paid';
}

/** An in-app path to return to, or null when `value` is missing or not a plain app path. */
export function backPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return null;
  return value;
}

/** Today as YYYY-MM-DD in local time. */
export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The choices without the paid NPC choice (for attendance that has none). */
export function withoutPaidChoice(choices: CheckInChoices): CheckInChoices {
  const rest = { ...choices };
  delete rest.paidChoice;
  return rest;
}

/**
 * The event the check-in form opens on (acceptance AC-2): the newest event on or before
 * `todayIso` that the character is not checked in to (today's event first), never a future one.
 * Undefined when there is none, so the form offers a new event.
 */
export function defaultCheckInEvent(
  events: readonly { key: string; date: string }[],
  checkedIn: ReadonlySet<string>,
  todayIso: string,
  skip?: string,
): string | undefined {
  return [...events]
    .filter((e) => e.date <= todayIso && !checkedIn.has(e.key) && e.key !== skip)
    .sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key))[0]?.key;
}

/** True for an event dated after `todayIso`. */
export function isUpcoming(event: { date: string }, todayIso: string): boolean {
  return event.date > todayIso;
}
