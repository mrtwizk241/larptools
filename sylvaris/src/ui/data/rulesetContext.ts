// Context behind RulesetProvider, plus ruleset lookups for stored characters.
import { createContext, useContext } from 'react';
import { loadRuleset, type Ruleset } from '../../engine/index.ts';

export const RulesetContext = createContext<Ruleset | null>(null);

/** The season this build ships, loaded once by RulesetProvider. */
export function useRuleset(): Ruleset {
  const value = useContext(RulesetContext);
  if (!value) throw new Error('useRuleset must be used inside <RulesetProvider>.');
  return value;
}

/** The ruleset a stored character was made with, or undefined when this build does not ship it. */
export function rulesetFor(id: string): Ruleset | undefined {
  try {
    return loadRuleset(id);
  } catch {
    return undefined;
  }
}
