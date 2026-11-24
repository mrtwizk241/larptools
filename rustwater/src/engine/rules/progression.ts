// Profession, familiar, and retirement math ([PRO-COST], [PRO-USES], [PRO-START], [FAM-LEVEL],
// [FAM-AE], [FAM-SLOTS], [PTS-RETIRE]). Constants come from professions.json, familiar.json and
// ruleset.json.
import { loadRuleset, type Profession, type Ruleset } from '../../data/index.ts';
import type { Sheet } from '../sheet.ts';
import { triangular } from './costs.ts';

// ---- Professions ----

/** PXP for level n of a profession skill: 10 x n. */
export function professionLevelCost(ruleset: Ruleset, n: number): number {
  return n <= 0 ? 0 : ruleset.professions.rules.costPerLevel * n;
}

/** PXP for levels 1..L: 10 x T(L) (0, 10, 30, 60, 100, 150). */
export function professionCumulativeCost(ruleset: Ruleset, level: number): number {
  return ruleset.professions.rules.costPerLevel * triangular(level);
}

export interface ProfessionUses {
  basic: number;
  adeptUpgrades: number;
  advancedUpgrades: number;
}

/** Uses at `level` from the data table; upgrades only for the tiered (per-repop) skill. */
export function professionUses(
  ruleset: Ruleset,
  slot: 'skill-1' | 'skill-2',
  level: number,
): ProfessionUses {
  const rules = ruleset.professions.rules;
  const row = rules.usesByLevel.find((r) => r.level === level);
  const tiered = rules.slots.find((s) => s.id === slot)?.tiered === true;
  return {
    basic: row?.basic ?? 0,
    adeptUpgrades: tiered ? (row?.adeptUpgrades ?? 0) : 0,
    advancedUpgrades: tiered ? (row?.advancedUpgrades ?? 0) : 0,
  };
}

/** The date part of an event key `YYYY-MM-DD-slug`. */
export function eventDate(eventKey: string): string {
  return eventKey.slice(0, 10);
}

/**
 * Events this character checked in to before the event `eventKey` (earlier date). Bought
 * missed-event credits are not check-ins, so they never count ([PRO-START], Q-PRO-2).
 */
export function eventsPlayedBefore(sheet: Sheet, eventKey: string): number {
  const date = eventDate(eventKey);
  return sheet.events.filter((e) => e.key !== eventKey && e.date < date).length;
}

export function professionSkill(profession: Profession, skillId: string) {
  return profession.skills.find((s) => s.id === skillId);
}

// ---- Familiars ----

/** FP to go from level - 1 to `level` (awakening is level 2). */
export function familiarLevelFp(ruleset: Ruleset, level: number): number {
  return ruleset.familiar.levels.table.find((r) => r.level === level)?.fpCost ?? 0;
}

/** Essence total at `level`: the sum of essenceGained, L(L+1)/2. */
export function essenceTotal(ruleset: Ruleset, level: number): number {
  return ruleset.familiar.levels.table
    .filter((r) => r.level <= level)
    .reduce((sum, r) => sum + r.essenceGained, 0);
}

// ---- Retirement ----

export interface RetirementCarryAmounts {
  readonly cxp: number;
  readonly fp: number;
  readonly shinies: number;
}

/**
 * What a retiring character carries to the next one ([PTS-RETIRE]):
 * CXP = floor(max(0, CXP spent - 250) / 3) + CXP available; FP = floor(FP spent / 3) + FP
 * available; every Shiny. Negative balances carry 0.
 */
export function retirementCarry(
  sheet: Sheet,
  ruleset: Ruleset = loadRuleset(sheet.rulesetId),
): RetirementCarryAmounts {
  const r = ruleset.ruleset.retirement;
  const round = (n: number): number => (r.rounding === 'floor' ? Math.floor(n) : Math.round(n));
  const p = sheet.points;
  const cxp =
    round(Math.max(0, p.cxp.spent - r.subtractCxp) / r.divisor) + Math.max(0, p.cxp.available);
  const fp =
    round(Math.max(0, p.fp.spent - r.subtractFp) / r.divisor) + Math.max(0, p.fp.available);
  return { cxp, fp, shinies: Math.max(0, p.shinies.balance) };
}
