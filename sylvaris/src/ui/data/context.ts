// Context behind RepositoryProvider. Screens use the hooks in hooks.ts, not this directly.
import { createContext, useContext } from 'react';
import type { Settings } from '../../engine/model.ts';
import type { Repository } from '../../storage/repository.ts';

export interface DataContextValue {
  repository: Repository;
  /** True once startup migrations have finished (or failed). Reads wait for it. */
  ready: boolean;
  /** Startup problems (failed migration, unreadable settings), shown in a non-blocking banner. */
  startupErrors: string[];
  dismissStartupErrors: () => void;
  /** Undefined until loaded. */
  settings: Settings | undefined;
  saveSettings: (next: Settings) => Promise<Settings>;
}

export const DataContext = createContext<DataContextValue | null>(null);

export function useDataContext(): DataContextValue {
  const value = useContext(DataContext);
  if (!value) throw new Error('Data hooks must be used inside <RepositoryProvider>.');
  return value;
}
