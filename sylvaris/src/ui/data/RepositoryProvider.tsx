import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '../../engine/model.ts';
import { repository as defaultRepository } from '../../storage/index.ts';
import type { MigrationReport, Repository } from '../../storage/repository.ts';
import { isStaffRole, useOptionalAuth } from '../auth/authContext.ts';
import { DataContext, type DataContextValue } from './context.ts';

// One migration run per repository, even when React mounts the provider twice (StrictMode).
const migrationRuns = new WeakMap<Repository, Promise<MigrationReport>>();

function runMigrationsOnce(repository: Repository): Promise<MigrationReport> {
  let run = migrationRuns.get(repository);
  if (!run) {
    run = repository.runMigrations().catch((error: unknown): MigrationReport => ({
      ok: false,
      from: undefined,
      to: 0,
      error: error instanceof Error ? error.message : String(error),
    }));
    migrationRuns.set(repository, run);
  }
  return run;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface RepositoryProviderProps {
  /** Defaults to the IndexedDB repository. Tests pass an in-memory one. */
  repository?: Repository;
  children: ReactNode;
}

/** Runs storage migrations once at startup and shares the repository and settings. */
export function RepositoryProvider({
  repository = defaultRepository,
  children,
}: RepositoryProviderProps) {
  const [ready, setReady] = useState(false);
  const [startupErrors, setStartupErrors] = useState<string[]>([]);
  const [settings, setSettings] = useState<Settings | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const errors: string[] = [];
      const report = await runMigrationsOnce(repository);
      if (!report.ok) errors.push(`Saved data could not be upgraded: ${report.error}`);
      let loaded: Settings;
      try {
        loaded = await repository.getSettings();
      } catch (error) {
        loaded = { ...DEFAULT_SETTINGS };
        errors.push(`Settings could not be read: ${message(error)}`);
      }
      if (cancelled) return;
      setSettings(loaded);
      setStartupErrors(errors);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const saveSettings = useCallback(
    async (next: Settings) => {
      const saved = await repository.saveSettings(next);
      setSettings(saved);
      return saved;
    },
    [repository],
  );

  const dismissStartupErrors = useCallback(() => setStartupErrors([]), []);

  // With accounts, the signed-in role decides staff or player mode (not the old device PIN).
  const role = useOptionalAuth()?.user?.role;
  const effective = useMemo<Settings | undefined>(() => {
    if (!settings || role === undefined) return settings;
    return { ...settings, mode: isStaffRole(role) ? 'staff' : 'player' };
  }, [settings, role]);

  const value = useMemo<DataContextValue>(
    () => ({
      repository,
      ready,
      startupErrors,
      dismissStartupErrors,
      settings: effective,
      saveSettings,
    }),
    [repository, ready, startupErrors, dismissStartupErrors, effective, saveSettings],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
