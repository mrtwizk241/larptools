import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfflineBar } from './OfflineBar.tsx';
import {
  makeAvailableOffline,
  OFFLINE_KEY,
  readOfflineChoice,
  type OfflineDeps,
} from './offlineSave.ts';

function deps(overrides: Partial<OfflineDeps> = {}): OfflineDeps {
  return {
    serviceWorker: { ready: Promise.resolve({}) },
    cacheMatch: vi.fn((url: string) =>
      Promise.resolve(url.endsWith('/sylvaris/index.html') ? {} : undefined),
    ),
    persist: vi.fn(() => Promise.resolve(true)),
    baseUrl: 'https://larptools.example/sylvaris/',
    timeoutMs: 50,
    ...overrides,
  };
}

describe('make available offline', () => {
  afterEach(() => localStorage.clear());

  it('is ready once the start page is saved, and asks the browser to keep it', async () => {
    const d = deps();
    expect(await makeAvailableOffline(d)).toBe('ready');
    expect(d.persist).toHaveBeenCalled();
    expect(d.cacheMatch).toHaveBeenCalledWith('https://larptools.example/sylvaris/index.html');
  });

  it('is unsupported with no service worker or cache', async () => {
    expect(await makeAvailableOffline(deps({ serviceWorker: undefined }))).toBe('unsupported');
    expect(await makeAvailableOffline(deps({ cacheMatch: undefined }))).toBe('unsupported');
  });

  it('fails when saving does not finish or the start page is not saved', async () => {
    const never = { ready: new Promise(() => undefined) };
    expect(await makeAvailableOffline(deps({ serviceWorker: never }))).toBe('failed');
    const empty = deps({ cacheMatch: () => Promise.resolve(undefined) });
    expect(await makeAvailableOffline(empty)).toBe('failed');
  });

  it('is still ready when the browser will not promise to keep it', async () => {
    const refused = deps({ persist: () => Promise.reject(new Error('no')) });
    expect(await makeAvailableOffline(refused)).toBe('ready');
  });
});

describe('offline bar', () => {
  afterEach(() => localStorage.clear());

  it('offers Make available offline, and closing it is remembered', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<OfflineBar />);
    expect(screen.getByRole('region', { name: 'Offline use' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make available offline' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close the offline bar' }));
    expect(screen.queryByRole('region', { name: 'Offline use' })).not.toBeInTheDocument();
    expect(readOfflineChoice()).toBe('hidden');
    unmount();
    render(<OfflineBar />);
    expect(screen.queryByRole('region', { name: 'Offline use' })).not.toBeInTheDocument();
  });

  it('says plainly when this browser cannot save the site', async () => {
    // jsdom has no service worker, like some private windows.
    const user = userEvent.setup();
    render(<OfflineBar />);
    await user.click(screen.getByRole('button', { name: 'Make available offline' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'This browser cannot save the site for offline use.',
    );
    expect(localStorage.getItem(OFFLINE_KEY)).toBeNull();
  });
});
