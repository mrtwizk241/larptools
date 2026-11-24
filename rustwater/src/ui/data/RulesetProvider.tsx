import { useState, type ReactNode } from 'react';
import { loadRuleset, type Ruleset } from '../../engine/index.ts';
import { RULESET_ID } from '../version.ts';
import { RulesetContext } from './rulesetContext.ts';

type LoadState = { ruleset: Ruleset } | { error: string };

function load(id: string): LoadState {
  try {
    return { ruleset: loadRuleset(id) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export interface RulesetProviderProps {
  /** Defaults to the season this build ships. */
  rulesetId?: string;
  children: ReactNode;
}

/** Loads and validates the rules data once and shares it with every screen. */
export function RulesetProvider({ rulesetId = RULESET_ID, children }: RulesetProviderProps) {
  const [state] = useState(() => load(rulesetId));
  if ('error' in state) {
    return (
      <p role="alert">The rules data could not be loaded, so the app cannot start. {state.error}</p>
    );
  }
  return <RulesetContext.Provider value={state.ruleset}>{children}</RulesetContext.Provider>;
}
