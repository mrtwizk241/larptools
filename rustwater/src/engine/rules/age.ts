// Age as a step from 1 to 10 ([ANC-AGE], [PLAY-AGE]). Each step is 10% of a full life, the same
// for every ancestry. New characters start at step 2 or higher. Old logs that stored age in years
// are converted with floor(scale * years / maxAge), clamped to 1..10.
import { z } from 'zod';
import type { Ruleset } from '../../data/index.ts';

export const AGE_STEP_MIN = 1;
export const AGE_STEP_MAX = 10;
/** Lowest age step a new character may start at. */
export const AGE_STEP_START_MIN = 2;

export const AgeStepSchema = z.int().min(AGE_STEP_MIN).max(AGE_STEP_MAX);

/** Old-style age in years, kept for replaying logs written before age steps. */
export const AgeYearsSchema = z.int().min(0).max(100000);

/**
 * The age step for an age in years, or null when the ancestry has no fixed maximum age (Aware,
 * Cryptid) or is unknown. Rounds down and clamps to 1..10.
 */
export function ageStepFromYears(
  ruleset: Ruleset,
  ancestryId: string | null,
  years: number,
): number | null {
  const maxAge = ancestryId ? (ruleset.ancestriesById[ancestryId]?.maxAge ?? null) : null;
  if (maxAge === null) return null;
  const step = Math.floor((ruleset.ancestries.rules.ageNumber.scale * years) / maxAge);
  return Math.min(AGE_STEP_MAX, Math.max(AGE_STEP_MIN, step));
}
