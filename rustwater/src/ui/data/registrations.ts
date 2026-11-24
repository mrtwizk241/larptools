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
  /** "Bits", "Common Scrap", "random Common resources", "random draws". */
  label: string;
  qty: number;
}

const RARITY_ORDER = ['common', 'uncommon', 'rare'];

/** Adds up pull items by what they are, for the event's pull sheet. */
export function pullTotals(
  items: readonly PullItem[],
  names: { rarity: (id: string) => string; type: (id: string) => string },
): PullTotal[] {
  const totals = new Map<string, { label: string; qty: number; order: string }>();
  for (const item of items) {
    let key: string;
    let label: string;
    let order: string;
    if (item.what === 'bits') {
      key = 'bits';
      label = 'Bits';
      order = '0';
    } else if (item.what === 'random-draw') {
      key = 'draws';
      label = 'Random draws (resource or consumable)';
      order = '9';
    } else {
      const rarity = item.rarity ? names.rarity(item.rarity) : '';
      const r = String(item.rarity ? RARITY_ORDER.indexOf(item.rarity) : 3);
      if (item.type) {
        key = `res:${item.rarity ?? ''}:${item.type}`;
        label = `${rarity} ${names.type(item.type)}`.trim();
        order = `1${r}${item.type}`;
      } else {
        key = `res:${item.rarity ?? ''}:random`;
        label = `Random ${rarity ? `${rarity} ` : ''}resources`;
        order = `2${r}`;
      }
    }
    const current = totals.get(key);
    if (current) current.qty += item.qty;
    else totals.set(key, { label, qty: item.qty, order });
  }
  return [...totals.values()]
    .sort((a, b) => a.order.localeCompare(b.order))
    .map(({ label, qty }) => ({ label, qty }));
}

export const STATUS_TEXT: Record<RegistrationEntry['status'], string> = {
  registered: 'Pre-registered',
  started: 'Checking in',
  'checked-in': 'Checked in',
};
