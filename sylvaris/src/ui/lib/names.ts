// Plain-English names for ruleset ids and amounts, shared by every screen that shows points,
// skills, or dates.
import type { Cost, LedgerCurrency, Ruleset } from '../../engine/index.ts';
import { stepLabel, type SkillStep } from '../../engine/model.ts';

/** "XP", "CXP", "AXP", "MT". Falls back to the id in capitals. */
export function currencyAbbr(ruleset: Ruleset, id: string): string {
  return ruleset.ruleset.currencies.find((c) => c.id === id)?.abbr ?? id.toUpperCase();
}

/** "Experience Points", "Mist Tokens". Falls back to the id in capitals. */
export function currencyName(ruleset: Ruleset, id: string): string {
  return ruleset.ruleset.currencies.find((c) => c.id === id)?.name ?? id.toUpperCase();
}

/** "Event attendance" for the ledger kind `event`. Falls back to the id. */
export function ledgerKindName(ruleset: Ruleset, id: string): string {
  if (id === 'adjustment') return 'Staff adjustment';
  if (id === 'penalty') return 'Penalty';
  return ruleset.ruleset.ledgerKinds.find((k) => k.id === id)?.name ?? id;
}

/** A skill's name, or its id when this ruleset does not have it. */
export function skillName(ruleset: Ruleset, skillId: string): string {
  return ruleset.skillsById[skillId]?.name ?? skillId;
}

/** "Toughness level 3", "Toughness Expert Technique". */
export function skillStepName(ruleset: Ruleset, skillId: string, step: SkillStep): string {
  return `${skillName(ruleset, skillId)} ${stepLabel(step)}`;
}

/** "+60", "-5", "0". */
export function signed(amount: number): string {
  return amount > 0 ? `+${amount}` : String(amount);
}

/** "60 XP", "5 CXP", "1 AXP", "3 Mist Tokens", "1 Mist Token". */
export function amountText(ruleset: Ruleset, currency: string, amount: number): string {
  if (currency === 'mt')
    return `${amount} ${Math.abs(amount) === 1 ? 'Mist Token' : 'Mist Tokens'}`;
  return `${amount} ${currencyAbbr(ruleset, currency)}`;
}

/** "15 XP", or "free" for a cost of 0. */
export function costText(ruleset: Ruleset, cost: Cost): string {
  return cost.amount === 0 ? 'free' : amountText(ruleset, cost.currency, cost.amount);
}

/** Ledger currencies in display order. */
export const CURRENCY_ORDER: readonly LedgerCurrency[] = ['xp', 'cxp', 'axp', 'mt'];

/** Sums amounts per currency, in display order, skipping zero totals. */
export function totalsByCurrency(
  items: readonly { currency: LedgerCurrency; amount: number }[],
): { currency: LedgerCurrency; amount: number }[] {
  return CURRENCY_ORDER.map((currency) => ({
    currency,
    amount: items.filter((i) => i.currency === currency).reduce((sum, i) => sum + i.amount, 0),
  })).filter((t) => t.amount !== 0);
}

/** "+60 XP, +5 CXP, +1 AXP, +2 Mist Tokens". Empty string when nothing is credited. */
export function signedTotals(
  ruleset: Ruleset,
  items: readonly { currency: LedgerCurrency; amount: number }[],
): string {
  return totalsByCurrency(items)
    .map((t) => `${t.amount > 0 ? '+' : ''}${amountText(ruleset, t.currency, t.amount)}`)
    .join(', ');
}

/** "January 5, 2026" style date for an ISO date or date-time, in the local time zone. */
export function dateText(iso: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Date and time, for the action log. */
export function dateTimeText(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
