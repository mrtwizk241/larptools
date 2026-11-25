// Test builds (ADR 0007): pure helpers for the roster sections, the copy picker, and the
// Add or remove points control (CXP or PXP). Tested in testBuilds.test.ts.
import type { CharacterEntry } from '../../../api/contract.ts';
import {
  deriveSheet,
  type AdjustPointsCommand,
  type Ruleset,
  type Sheet,
} from '../../../engine/index.ts';

/** The reason recorded for CXP or PXP added or removed in a test build. */
export const TEST_BUILD_REASON = 'Test build';

/** A player's characters from the server, split for the roster. */
export interface RosterSections {
  /** Approved live characters. */
  live: CharacterEntry[];
  /** The player's private test builds. */
  test: CharacterEntry[];
  /** New characters still with staff: waiting, or sent back. */
  waiting: CharacterEntry[];
}

/** Splits server entries into live characters, test builds, and characters waiting for staff. */
export function rosterSections(entries: readonly CharacterEntry[]): RosterSections {
  const sections: RosterSections = { live: [], test: [], waiting: [] };
  for (const entry of entries) {
    if (entry.meta.kind === 'test') sections.test.push(entry);
    else if (entry.meta.status === 'active') sections.live.push(entry);
    else sections.waiting.push(entry);
  }
  return sections;
}

/**
 * Live characters a player may copy into a test build: approved and not retired. `rulesetFor`
 * returns undefined for a season this app does not know; those are left out.
 */
export function copyableEntries(
  entries: readonly CharacterEntry[],
  rulesetFor: (id: string) => Ruleset | undefined,
): CharacterEntry[] {
  return rosterSections(entries).live.filter((entry) => {
    const ruleset = rulesetFor(entry.character.rulesetId);
    if (!ruleset) return false;
    return deriveSheet(ruleset, entry.character.actions).retired === null;
  });
}

/** The points a player can add or remove in a test build. */
export type TestBuildCurrency = 'cxp' | 'pxp';

/** The choices for the Points control, CXP first (the default). */
export const TEST_BUILD_CURRENCIES: readonly { id: TestBuildCurrency; label: string }[] = [
  { id: 'cxp', label: 'CXP' },
  { id: 'pxp', label: 'PXP' },
];

/** A signed whole number other than 0 ("50", "+50", "-20"), or null when it is not one. */
export function parsePointsChange(text: string): number | null {
  const value = text.trim().replace(/^\+/, '');
  if (!/^-?\d{1,7}$/.test(value)) return null;
  const amount = Number(value);
  return amount === 0 || Math.abs(amount) > 1_000_000 ? null : amount;
}

/** The points adjustment that adds (positive) or removes (negative) CXP or PXP in a test build. */
export function pointsChangeCommand(
  currency: TestBuildCurrency,
  amount: number,
): AdjustPointsCommand {
  return { type: 'adjustPoints', currency, amount, reason: TEST_BUILD_REASON };
}

/** Toast text after the change, for example "Added 50 PXP." or "Removed 20 CXP." */
export function pointsChangeText(currency: TestBuildCurrency, amount: number): string {
  const name = currency.toUpperCase();
  return amount > 0 ? `Added ${amount} ${name}.` : `Removed ${-amount} ${name}.`;
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

/**
 * The pop-up after a test build spends more CXP or PXP than it has: how far over it is, and
 * what it would take to earn the rest. `short` is how far below zero the balance is.
 * CXP: events, at the event CXP each. PXP: hours of NPC time, or Shinies spent on PXP.
 */
export function overspendText(
  ruleset: Ruleset,
  currency: TestBuildCurrency,
  short: number,
): string {
  if (currency === 'cxp') {
    const perEvent = ruleset.ruleset.eventCxp;
    const events = Math.ceil(short / perEvent);
    return (
      `You have spent ${short.toLocaleString('en-US')} more CXP than you have. ` +
      `Earning it takes ${plural(events, 'event', 'events')} (${perEvent} CXP an event).`
    );
  }
  const npc = ruleset.awards.npcTime;
  const hours = Math.ceil(short / npc.pxpPerHour);
  const buy = ruleset.awards.shinyPurchases.find((p) =>
    p.grants?.some((g) => g.currency === 'pxp'),
  );
  const perBuy = buy?.grants?.find((g) => g.currency === 'pxp')?.amount ?? 0;
  const shinies = buy && perBuy > 0 ? Math.ceil(short / perBuy) * buy.price : null;
  return (
    `You have spent ${short.toLocaleString('en-US')} more PXP than you have. ` +
    `Earning it takes ${plural(hours, 'hour', 'hours')} of NPCing (${npc.pxpPerHour} PXP an hour, ` +
    `up to ${npc.maxHours} hours an event)` +
    (shinies !== null && buy
      ? ` or ${plural(shinies, 'Shiny', 'Shinies')} spent on PXP (${buy.price} Shinies for ${perBuy} PXP, ` +
        `${plural(buy.capPerEvent ?? 1, 'purchase', 'purchases')} an event).`
      : '.')
  );
}

/** PXP the most one event can give a player: NPC time at its cap, plus Shinies bought as PXP. */
export function pxpPerEvent(ruleset: Ruleset): number {
  const npc = ruleset.awards.npcTime;
  const buy = ruleset.awards.shinyPurchases.find((p) =>
    p.grants?.some((g) => g.currency === 'pxp'),
  );
  const perBuy = buy?.grants?.find((g) => g.currency === 'pxp')?.amount ?? 0;
  return npc.maxHours * npc.pxpPerHour + perBuy * (buy?.capPerEvent ?? 0);
}

/**
 * The line under the points when a test build has spent past its CXP or PXP: about how many
 * more events would earn the rest, taking the currency that needs the most. null when not over.
 * "Over: about 2 more events would earn this build (75 CXP an event; up to 6 PXP an event from
 * NPCing and Shinies)."
 */
export function eventsEstimateText(ruleset: Ruleset, sheet: Sheet): string | null {
  const cxpOver = Math.max(0, -sheet.points.cxp.available);
  const pxpOver = Math.max(0, -sheet.points.pxp.available);
  if (cxpOver === 0 && pxpOver === 0) return null;
  const cxpEach = ruleset.ruleset.eventCxp;
  const pxpEach = pxpPerEvent(ruleset);
  const events = Math.max(
    cxpOver > 0 ? Math.ceil(cxpOver / cxpEach) : 0,
    pxpOver > 0 && pxpEach > 0 ? Math.ceil(pxpOver / pxpEach) : 0,
  );
  const rates = [
    cxpOver > 0 ? `${cxpEach} CXP an event` : null,
    pxpOver > 0 ? `up to ${pxpEach} PXP an event from NPCing and Shinies` : null,
  ].filter(Boolean);
  return `Over: about ${plural(events, 'more event', 'more events')} would earn this build (${rates.join('; ')}).`;
}
