// Starting item picks as counts per option, and back. Pure, so it is unit tested.
import type { StartingItemPick } from '../../../../engine/index.ts';

export type ItemCounts = Readonly<Record<string, number>>;

export interface PickInput {
  optionId: string;
  detail?: string;
}

/** How many times each option is picked. */
export function countPicks(picks: readonly { optionId: string }[]): ItemCounts {
  const counts: Record<string, number> = {};
  for (const p of picks) counts[p.optionId] = (counts[p.optionId] ?? 0) + 1;
  return counts;
}

export function totalCount(counts: ItemCounts): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

/**
 * Picks for the command, in option order. Existing picks (with their details) are kept up to the
 * new count; extra picks have no detail.
 */
export function picksFromCounts(
  counts: ItemCounts,
  optionOrder: readonly string[],
  existing: readonly StartingItemPick[] = [],
): PickInput[] {
  const picks: PickInput[] = [];
  for (const optionId of optionOrder) {
    const n = counts[optionId] ?? 0;
    const kept = existing.filter((p) => p.optionId === optionId);
    for (let i = 0; i < n; i++) {
      const detail = kept[i]?.detail;
      picks.push(detail ? { optionId, detail } : { optionId });
    }
  }
  return picks;
}

/** Sets one option's count, kept between 0 and what the total limit leaves. */
export function setCount(
  counts: ItemCounts,
  optionId: string,
  next: number,
  max: number,
): ItemCounts {
  const others = totalCount(counts) - (counts[optionId] ?? 0);
  const value = Math.max(0, Math.min(next, max - others));
  const result: Record<string, number> = { ...counts };
  if (value === 0) delete result[optionId];
  else result[optionId] = value;
  return result;
}
