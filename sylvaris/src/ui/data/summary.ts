// Roster summary for one stored character, from the engine's summarize().
import { deriveSheet, summarize, type Ruleset, type SheetSummary } from '../../engine/index.ts';
import type { StoredCharacter } from '../../engine/model.ts';
import { rulesetFor } from './rulesetContext.ts';
import { RULESET_ID } from '../version.ts';

export interface CharacterSummary extends SheetSummary {
  id: string;
}

export const UNNAMED_CHARACTER = 'Unnamed character';

/**
 * Names, race, Calling, XP available, events attended, and the retired flag for list rows and
 * messages. Uses the character's own season when this build has it, otherwise `fallback`.
 */
export function summarizeCharacter(
  stored: StoredCharacter,
  fallback: Ruleset | undefined = rulesetFor(RULESET_ID),
): CharacterSummary {
  const ruleset = rulesetFor(stored.rulesetId) ?? fallback;
  if (!ruleset) {
    return {
      id: stored.id,
      characterName: UNNAMED_CHARACTER,
      playerName: '',
      raceName: '',
      callingName: '',
      xpAvailable: 0,
      events: 0,
      retired: false,
    };
  }
  const summary = summarize(deriveSheet(ruleset, stored.actions));
  return {
    ...summary,
    id: stored.id,
    characterName: summary.characterName.trim() || UNNAMED_CHARACTER,
  };
}
