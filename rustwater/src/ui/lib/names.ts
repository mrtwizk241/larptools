// Plain-English names for ruleset ids, shared by the log, check-in, and points screens.
import type { LedgerCurrency, Ruleset } from '../../engine/index.ts';
import type { SkillPart } from '../../engine/model.ts';

const PART_LABEL: Record<SkillPart, string> = {
  basic: '',
  adept: ' Adept',
  advanced: ' Advanced',
  mastery: ' Mastery',
  main: '',
};

/** "CXP", "Shinies", "AP", "Essence". Falls back to the id in capitals. */
export function currencyAbbr(ruleset: Ruleset, id: string): string {
  if (id === 'essence') return 'Essence';
  return ruleset.ruleset.currencies.find((c) => c.id === id)?.abbr ?? id.toUpperCase();
}

/** "NPC time" for the ledger kind `npc`. Falls back to the id. */
export function ledgerKindName(ruleset: Ruleset, id: string): string {
  return ruleset.ruleset.ledgerKinds.find((k) => k.id === id)?.name ?? id;
}

/** "Assault", "Assault Adept". */
export function skillPartName(ruleset: Ruleset, skillId: string, part: SkillPart): string {
  const name = ruleset.skillsById[skillId]?.name ?? skillId;
  return `${name}${PART_LABEL[part]}`;
}

/** "+75", "-5", "0". */
export function signed(amount: number): string {
  return amount > 0 ? `+${amount}` : String(amount);
}

/** "75 CXP", "1 Shinies" (abbreviations are used as written in the ruleset). */
export function amountText(ruleset: Ruleset, currency: string, amount: number): string {
  return `${amount} ${currencyAbbr(ruleset, currency)}`;
}

/** Ledger currencies in display order. */
export const CURRENCY_ORDER: readonly LedgerCurrency[] = ['cxp', 'pxp', 'fp', 'shinies'];

/** Sums amounts per currency, in display order, skipping zero totals. */
export function totalsByCurrency(
  items: readonly { currency: LedgerCurrency; amount: number }[],
): { currency: LedgerCurrency; amount: number }[] {
  return CURRENCY_ORDER.map((currency) => ({
    currency,
    amount: items.filter((i) => i.currency === currency).reduce((sum, i) => sum + i.amount, 0),
  })).filter((t) => t.amount !== 0);
}

/** "+75 CXP, +1 FP". Empty string when nothing is credited. */
export function signedTotals(
  ruleset: Ruleset,
  items: readonly { currency: LedgerCurrency; amount: number }[],
): string {
  return totalsByCurrency(items)
    .map((t) => `${signed(t.amount)} ${currencyAbbr(ruleset, t.currency)}`)
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
