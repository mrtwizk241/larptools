import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client.ts';
import type { Role, UserInfo } from '../../api/contract.ts';
import type { Repository } from '../../storage/repository.ts';
import { AuthProvider } from '../auth/AuthProvider.tsx';
import { useAccounts } from './accounts.ts';
import { DataContext, type DataContextValue } from './context.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

function wrapperFor(role: Role) {
  const user: UserInfo = {
    id: 'u1',
    name: 'Test Person',
    email: 'person@example.test',
    role,
    disabled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const data = {
    repository: { server: true } as unknown as Repository,
    ready: true,
    startupErrors: [],
    dismissStartupErrors: () => undefined,
    settings: undefined,
    saveSettings: (s) => Promise.resolve(s),
  } satisfies DataContextValue;
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthProvider fixedUser={user}>
        <DataContext.Provider value={data}>{children}</DataContext.Provider>
      </AuthProvider>
    );
  };
}

// Acceptance AC-14: a player's home screen must not ask for the account list (403 in the console).
describe('useAccounts', () => {
  it('never asks the server for accounts as a player', () => {
    const users = vi.spyOn(api, 'users');
    const { result } = renderHook(() => useAccounts(), { wrapper: wrapperFor('player') });
    expect(result.current.status).toBe('none');
    expect(users).not.toHaveBeenCalled();
  });

  it('loads the accounts for staff', async () => {
    const users = vi.spyOn(api, 'users').mockResolvedValue({ items: [] });
    const { result } = renderHook(() => useAccounts(), { wrapper: wrapperFor('staff') });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(users).toHaveBeenCalledTimes(1);
  });
});
