// Accounts for staff screens: the list of player and staff accounts (server only).
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.ts';
import type { UserInfo } from '../../api/contract.ts';
import { useRepository } from './hooks.ts';

export type AccountsState =
  | { status: 'loading' }
  | { status: 'ready'; users: UserInfo[] }
  | { status: 'error'; message: string }
  /** No server (tests and the old device-only mode): there are no accounts. */
  | { status: 'none' };

export function useAccounts(): AccountsState & { reload: () => Promise<void> } {
  const repository = useRepository();
  const server = repository.server === true;
  const [state, setState] = useState<AccountsState>(
    server ? { status: 'loading' } : { status: 'none' },
  );
  const load = useCallback(async (): Promise<AccountsState> => {
    if (!server) return { status: 'none' };
    try {
      return { status: 'ready', users: (await api.users()).items };
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) };
    }
  }, [server]);
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

/** Accounts a character can belong to: players first, then staff (who may also play). */
export function ownerChoices(users: readonly UserInfo[]): UserInfo[] {
  const rank = (u: UserInfo) => (u.role === 'player' ? 0 : 1);
  return users
    .filter((u) => !u.disabled)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** The account whose email matches the sheet's player email, if any, as the starting choice. */
export function suggestedOwner(
  users: readonly UserInfo[],
  email: string | null | undefined,
): string {
  const wanted = email?.trim().toLowerCase();
  if (!wanted) return '';
  return users.find((u) => !u.disabled && u.email === wanted)?.id ?? '';
}
