// Retirement carry-over ([RET-TRANSFER], ruleset.retirement), with the Q-RET defaults:
// Q-RET-1 round down; Q-RET-2 the new PC starts with the share alone (warning below 150);
// Q-RET-3 "total XP" is total earned including the starting 150; Q-RET-5 25% of the goods
// value, then minus 50 Copper, never below 0; Q-RET-6 the goods value is entered by hand.
import type { SyRuleset } from '../../data/index.ts';
import type { RetirementCarry } from '../sheet.ts';

export interface EarnedTotals {
  readonly xp: number;
  readonly cxp: number;
  readonly axp: number;
}

function share(
  amount: number,
  s: { readonly fraction: number; readonly deduct?: number | undefined },
): number {
  return Math.floor(Math.max(0, amount - (s.deduct ?? 0)) * s.fraction);
}

/** What a retiring character passes on. */
export function retirementCarry(
  ruleset: SyRuleset,
  earned: EarnedTotals,
  goodsValueCopper: number,
): RetirementCarry {
  const r = ruleset.ruleset.retirement;
  return {
    xp: share(earned.xp, r.xp),
    cxp: share(earned.cxp, r.cxp),
    axp: share(earned.axp, r.axp),
    coinCopper: Math.max(
      r.goods.min,
      Math.floor(Math.max(0, goodsValueCopper) * r.goods.fraction) - r.goods.deductCopper,
    ),
  };
}

/** Starting XP of a character built from a retirement (Q-RET-2). */
export function retirementStartingXp(ruleset: SyRuleset, carriedXp: number): number {
  const r = ruleset.ruleset.retirement;
  return r.startingXpIsTransferOnly ? carriedXp : ruleset.ruleset.creation.startingXp + carriedXp;
}
