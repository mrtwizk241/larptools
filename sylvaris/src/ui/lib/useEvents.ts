// The repository's registry of known game events, for check-in and Mist Token purchase pickers.
import { useCallback, useEffect, useState } from 'react';
import type { GameEvent } from '../../engine/model.ts';
import { useRepository } from '../data/hooks.ts';

export interface EventsApi {
  /** Known events, newest first. Empty while loading or when reading failed. */
  events: GameEvent[];
  loading: boolean;
  error: string | undefined;
  /** Saves an event to the registry (same key replaces) and refreshes the list. */
  save: (event: GameEvent) => Promise<void>;
}

function newestFirst(events: GameEvent[]): GameEvent[] {
  return [...events].sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
}

export function useEvents(): EventsApi {
  const repository = useRepository();
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    repository.listEvents().then(
      (result) => {
        if (cancelled) return;
        setEvents(newestFirst(result.items));
        setLoading(false);
      },
      (e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const save = useCallback(
    async (event: GameEvent) => {
      const saved = await repository.saveEvent(event);
      setEvents((list) => newestFirst([...list.filter((e) => e.key !== saved.key), saved]));
    },
    [repository],
  );

  return { events, loading, error, save };
}

/** Event names by key: the character's check-ins first, then the registry. */
export function eventNames(
  ...sources: readonly (readonly { key: string; name: string }[])[]
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const list of sources) for (const e of list) if (!map.has(e.key)) map.set(e.key, e.name);
  return map;
}
