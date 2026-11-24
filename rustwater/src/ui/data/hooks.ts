// Data hooks for screens. All reads and writes go through the Repository from RepositoryProvider.
import { useCallback, useEffect, useState } from 'react';
import type { Settings, StoredCharacter } from '../../engine/model.ts';
import type { InvalidRecord, Repository } from '../../storage/repository.ts';
import { useDataContext } from './context.ts';

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useRepository(): Repository {
  return useDataContext().repository;
}

/** Startup state: whether migrations finished, and any problems to show in a banner. */
export function useStartup(): { ready: boolean; errors: string[]; dismiss: () => void } {
  const { ready, startupErrors, dismissStartupErrors } = useDataContext();
  return { ready, errors: startupErrors, dismiss: dismissStartupErrors };
}

/** Shared settings. `settings` is undefined until loaded; `save` updates every screen. */
export function useSettings(): {
  settings: Settings | undefined;
  save: (next: Settings) => Promise<Settings>;
} {
  const { settings, saveSettings } = useDataContext();
  return { settings, save: saveSettings };
}

export type CharactersState =
  | { status: 'loading' }
  | { status: 'ready'; characters: StoredCharacter[]; invalid: InvalidRecord[] }
  | { status: 'error'; message: string };

/** All characters, most recently updated first. `reload` re-reads and resolves when done. */
export function useCharacters(): CharactersState & { reload: () => Promise<void> } {
  const { repository, ready } = useDataContext();
  const [state, setState] = useState<CharactersState>({ status: 'loading' });

  const read = useCallback(async (): Promise<CharactersState> => {
    try {
      const result = await repository.listCharacters();
      return { status: 'ready', characters: result.items, invalid: result.invalid };
    } catch (error) {
      return { status: 'error', message: message(error) };
    }
  }, [repository]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void read().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, read]);

  const reload = useCallback(async () => {
    setState(await read());
  }, [read]);

  return { ...state, reload };
}

export type CharacterState =
  | { status: 'loading' }
  | { status: 'ready'; character: StoredCharacter | undefined }
  | { status: 'error'; message: string };

/** One character by id. `character` is undefined when there is no such character. */
export function useCharacter(id: string): CharacterState & { reload: () => Promise<void> } {
  const { repository, ready } = useDataContext();
  const [state, setState] = useState<CharacterState & { id?: string }>({ status: 'loading' });

  const read = useCallback(async (): Promise<CharacterState> => {
    try {
      return { status: 'ready', character: await repository.getCharacter(id) };
    } catch (error) {
      return { status: 'error', message: message(error) };
    }
  }, [repository, id]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void read().then((next) => {
      if (!cancelled) setState({ ...next, id });
    });
    return () => {
      cancelled = true;
    };
  }, [ready, read, id]);

  const reload = useCallback(async () => {
    setState({ ...(await read()), id });
  }, [read, id]);

  // A stale result for another id reads as loading until the new one arrives.
  const current: CharacterState = state.id === id ? state : { status: 'loading' };
  return { ...current, reload };
}
