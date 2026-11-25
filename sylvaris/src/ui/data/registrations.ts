// Event pre-registrations (server only): loading them, and adding up pull lists for staff.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.ts';
import type { RegistrationEntry } from '../../api/contract.ts';
import type { PullItem } from '../../engine/index.ts';
import { useRepository } from './hooks.ts';

export type RegistrationsState =
  | { status: 'loading' }
  | { status: 'ready'; items: RegistrationEntry[] }
  | { status: 'error'; message: string }
  /** No server (tests): there are no registrations. */
  | { status: 'none' };

/** Registrations for one event (staff: everyone's; players: their own), or all of a player's. */
export function useRegistrations(
  eventKey?: string,
): RegistrationsState & { reload: () => Promise<void> } {
  const server = useRepository().server === true;
  const [state, setState] = useState<RegistrationsState>(
    server ? { status: 'loading' } : { status: 'none' },
  );
  const load = useCallback(async (): Promise<RegistrationsState> => {
    if (!server) return { status: 'none' };
    try {
      return { status: 'ready', items: (await api.registrations(eventKey)).items };
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) };
    }
  }, [server, eventKey]);
  useEffect(() => {
    let cancelled = false;
    void load().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);
  const reload = useCallback(async () => {
    setState(await load());
  }, [load]);
  return { ...state, reload };
}

export interface PullTotal {
  /** "Silver", "Copper", "Basic Components", or an item's own text. */
  label: string;
  qty: number;
}

/** Countable things staff hand over, in pull-sheet order, with their labels. */
const COUNTED: readonly [PullItem['what'], string][] = [
  ['silver', 'Silver'],
  ['copper', 'Copper'],
  ['basic-component', 'Basic Components'],
  ['exotic-component', 'Exotic Components'],
  ['master-building-material', 'Master Building Materials'],
];

/** "10 Copper (Merchanting)" -> "10 Copper": an item's text without its source. */
function withoutSource(text: string): string {
  return text.replace(/\s*\([^()]*\)$/, '');
}

/**
 * Adds up pull items for the event's pull sheet: coin and components by kind (silver first),
 * then every other item (trade items, mixes, Mist Token purchases) by its text. Upkeep covered
 * by a skill is not handed over, so it is left out.
 */
export function pullTotals(items: readonly PullItem[]): PullTotal[] {
  const counted = new Map<string, number>();
  const others = new Map<string, number>();
  for (const item of items) {
    if (item.what === 'upkeep') continue;
    if (COUNTED.some(([what]) => what === item.what))
      counted.set(item.what, (counted.get(item.what) ?? 0) + item.qty);
    else {
      const label = withoutSource(item.text);
      others.set(label, (others.get(label) ?? 0) + 1);
    }
  }
  return [
    ...COUNTED.filter(([what]) => counted.has(what)).map(([what, label]) => ({
      label,
      qty: counted.get(what) ?? 0,
    })),
    ...[...others.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, qty]) => ({ label, qty })),
  ];
}

export const STATUS_TEXT: Record<RegistrationEntry['status'], string> = {
  registered: 'Pre-registered',
  started: 'Checking in',
  'checked-in': 'Checked in',
};
