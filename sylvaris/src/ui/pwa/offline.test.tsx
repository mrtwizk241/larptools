import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OfflineStatusCard, OfflineStatusLine } from './OfflineStatus.tsx';
import { describeOffline, type OfflineEnv, type OfflineStatus } from './offline.ts';

/** A fake browser: the test decides when the service worker is ready and when signal drops. */
function fakeEnv(over: Partial<OfflineEnv> = {}) {
  let online = true;
  let markReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  const listeners = new Set<() => void>();
  const persist = vi.fn(() => Promise.resolve(true));
  const env: OfflineEnv = {
    enabled: true,
    secure: true,
    workerReady: () => ready,
    persisted: () => Promise.resolve(false),
    persist,
    online: () => online,
    installed: () => false,
    apple: true,
    watchOnline: (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    ...over,
  };
  return {
    env,
    persist,
    ready: () => act(async () => markReady()),
    setOnline: (value: boolean) =>
      act(() => {
        online = value;
        for (const listener of listeners) listener();
      }),
  };
}

const base: OfflineStatus = {
  save: 'ready',
  online: true,
  kept: true,
  installed: true,
  apple: false,
};

describe('describeOffline', () => {
  it('says nothing in builds without a service worker', () => {
    expect(describeOffline({ ...base, save: 'off' })).toBeNull();
  });

  it('explains a browser that cannot save the app', () => {
    expect(describeOffline({ ...base, save: 'unsupported' })?.title).toBe(
      'Not saved for use with no signal',
    );
  });

  it('tells a player with no saved copy and no signal to open it with signal first', () => {
    const text = describeOffline({ ...base, save: 'saving', online: false });
    expect(text?.title).toBe('Not saved yet');
    expect(text?.lines.join(' ')).toContain('Open the app once with signal before the event');
  });

  it('reports ready, and the saved copy when there is no signal', () => {
    expect(describeOffline(base)?.title).toBe('Ready with no signal');
    const offline = describeOffline({ ...base, online: false });
    expect(offline?.title).toBe('No signal: reading the saved copy');
    expect(offline?.lines[0]).toContain('The rules wiki works fully');
  });

  it('offers to keep the copy only when the browser has not promised to', () => {
    expect(describeOffline({ ...base, kept: false })?.canKeep).toBe(true);
    expect(describeOffline({ ...base, kept: true })?.canKeep).toBe(false);
    expect(describeOffline({ ...base, kept: null })?.canKeep).toBe(false);
  });

  it('gives the Home Screen tip in a browser tab, worded for iPhone or not', () => {
    expect(describeOffline(base)?.tip).toBeNull();
    expect(describeOffline({ ...base, installed: false, apple: true })?.tip).toContain(
      'Share, then Add to Home Screen',
    );
    expect(describeOffline({ ...base, installed: false, apple: false })?.tip).toContain(
      'Install app',
    );
  });
});

describe('Use with no signal card', () => {
  it('renders nothing when the build has no service worker', () => {
    const { env } = fakeEnv({ enabled: false });
    const { container } = render(<OfflineStatusCard env={env} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('goes from saving to ready, then keeps the copy on request', async () => {
    const user = userEvent.setup();
    const fake = fakeEnv();
    render(<OfflineStatusCard env={fake.env} />);
    expect(screen.getByRole('region', { name: 'Use with no signal' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Saving for use with no signal');

    await fake.ready();
    expect(screen.getByRole('status')).toHaveTextContent('Ready with no signal');
    expect(await screen.findByText(/may clear the saved copy/)).toBeInTheDocument();
    expect(screen.getByText(/add it to your Home Screen/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Keep the saved copy' }));
    expect(fake.persist).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('The browser will keep the saved copy.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep the saved copy' })).not.toBeInTheDocument();
  });

  it('follows the signal going away and coming back', async () => {
    const fake = fakeEnv();
    render(
      <>
        <OfflineStatusLine env={fake.env} />
        <OfflineStatusCard env={fake.env} />
      </>,
    );
    await fake.ready();
    fake.setOnline(false);
    expect(screen.getByRole('status')).toHaveTextContent('No signal: reading the saved copy');
    expect(screen.getByText(/No signal: reading the saved copy\. Details/)).toBeInTheDocument();
    fake.setOnline(true);
    expect(screen.getByRole('status')).toHaveTextContent('Ready with no signal');
  });

  it('says so when the page is not on https', () => {
    const { env } = fakeEnv({ secure: false });
    render(<OfflineStatusCard env={env} />);
    expect(screen.getByRole('status')).toHaveTextContent('Not saved for use with no signal');
  });
});
