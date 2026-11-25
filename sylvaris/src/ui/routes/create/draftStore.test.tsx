import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SIGNED_OUT_EVENT, api } from '../../../api/client.ts';
import type { UserInfo } from '../../../api/contract.ts';
import { AuthProvider } from '../../auth/AuthProvider.tsx';
import { clearAllWizards, draftKey } from './draftKeys.ts';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// Security audit S-13: the wizard draft (concept, backstory) must not stay on a shared phone.
describe('wizard drafts on sign-out', () => {
  it('clearAllWizards removes every account draft and nothing else', () => {
    localStorage.setItem(draftKey('a1'), '{"step":1}');
    localStorage.setItem(draftKey('b2'), '{"step":2}');
    localStorage.setItem('sy.theme', 'dark');
    clearAllWizards();
    expect(localStorage.getItem(draftKey('a1'))).toBeNull();
    expect(localStorage.getItem(draftKey('b2'))).toBeNull();
    expect(localStorage.getItem('sy.theme')).toBe('dark');
  });

  it('are cleared when the app signs out', async () => {
    const user: UserInfo = {
      id: 'u1',
      name: 'Test Player',
      email: 'p@example.test',
      role: 'player',
      disabled: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    vi.spyOn(api, 'session').mockResolvedValue({ user });
    render(
      <AuthProvider>
        <p>app</p>
      </AuthProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    localStorage.setItem(draftKey('u1'), '{"step":3}');
    act(() => {
      window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
    });
    expect(localStorage.getItem(draftKey('u1'))).toBeNull();
  });
});
