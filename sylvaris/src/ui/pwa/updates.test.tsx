import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RegisterSWOptions } from 'virtual:pwa-register';
import { UpdateBanner } from './UpdateBanner.tsx';
import { createUpdateStore, type RegisterFn } from './updates.ts';

/** A register mock that keeps the options, so a test can fire onNeedRefresh. */
function mockRegister() {
  const update = vi.fn<(reloadPage?: boolean) => Promise<void>>(() => Promise.resolve());
  let options: RegisterSWOptions | undefined;
  const register = vi.fn<RegisterFn>((opts) => {
    options = opts;
    return update;
  });
  return { register, update, needRefresh: () => options?.onNeedRefresh?.() };
}

describe('update banner', () => {
  it('registers once and starts with no banner', () => {
    const mock = mockRegister();
    const store = createUpdateStore(mock.register);
    store.start();
    store.start();
    expect(mock.register).toHaveBeenCalledTimes(1);
    render(<UpdateBanner store={store} />);
    expect(screen.queryByText('A new version is ready.')).not.toBeInTheDocument();
  });

  it('shows when a new version waits, and Reload activates it', async () => {
    const user = userEvent.setup();
    const mock = mockRegister();
    const store = createUpdateStore(mock.register);
    store.start();
    render(<UpdateBanner store={store} />);

    act(() => mock.needRefresh());
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('A new version is ready.');
    expect(mock.update).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(mock.update).toHaveBeenCalledWith(true);
  });

  it('Reload before registration does nothing', async () => {
    const mock = mockRegister();
    const store = createUpdateStore(mock.register);
    await store.reload();
    expect(mock.update).not.toHaveBeenCalled();
  });
});
