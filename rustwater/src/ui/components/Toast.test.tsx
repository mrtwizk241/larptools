import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HashRouter, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from './Toast.tsx';
import {
  addToast,
  hashPath,
  TOAST_DURATION_MS,
  TOAST_ROUTE_GRACE_MS,
  toastsForRoute,
  useToast,
  type ToastEntry,
} from './toast-context.ts';

function entry(id: number, extra: Partial<ToastEntry> = {}): ToastEntry {
  return { id, message: `Toast ${id}`, path: '/a', shownAt: 0, ...extra };
}

describe('toast rules', () => {
  it('keeps at most two toasts, the newest replacing the oldest', () => {
    let list: ToastEntry[] = [];
    for (const id of [1, 2, 3]) list = addToast(list, entry(id));
    expect(list.map((t) => t.id)).toEqual([2, 3]);
  });

  it('clears toasts from another route, Undo toasts included', () => {
    const undo = () => undefined;
    const list = [entry(1), entry(2, { onUndo: undo }), entry(3, { path: '/b', onUndo: undo })];
    const kept = toastsForRoute(list, '/b', 10_000);
    expect(kept.map((t) => t.id)).toEqual([3]);
  });

  it('lets a plain toast shown just before the change go along, but not an Undo toast', () => {
    const now = 10_000;
    const recent = now - TOAST_ROUTE_GRACE_MS + 1;
    const list = [
      entry(1, { shownAt: recent }),
      entry(2, { shownAt: recent, onUndo: () => undefined }),
      entry(3, { shownAt: now - TOAST_ROUTE_GRACE_MS }),
    ];
    const kept = toastsForRoute(list, '/b', now);
    expect(kept.map((t) => [t.id, t.path])).toEqual([[1, '/b']]);
  });

  it('returns the same list when nothing changes', () => {
    const list = [entry(1, { path: '/b' })];
    expect(toastsForRoute(list, '/b', 0)).toBe(list);
  });

  it('reads the route from a hash URL', () => {
    expect(hashPath('#/c/1/play?x=1')).toBe('/c/1/play');
    expect(hashPath('')).toBe('/');
    expect(hashPath('#/')).toBe('/');
  });
});

describe('ToastProvider', () => {
  beforeEach(() => {
    window.location.hash = '#/a';
  });

  afterEach(() => {
    vi.useRealTimers();
    window.location.hash = '';
  });

  function Controls() {
    const toast = useToast();
    const navigate = useNavigate();
    return (
      <>
        <button type="button" onClick={() => toast.show('Saved.')}>
          Plain
        </button>
        <button
          type="button"
          onClick={() => toast.show('Spent Assault.', { onUndo: () => undefined })}
        >
          With undo
        </button>
        <button type="button" onClick={() => void navigate('/b')}>
          Go
        </button>
        <button type="button" onClick={() => void navigate('/a')}>
          Back
        </button>
      </>
    );
  }

  function setup() {
    return render(
      <HashRouter>
        <ToastProvider>
          <Controls />
        </ToastProvider>
      </HashRouter>,
    );
  }

  function click(name: string) {
    act(() => {
      screen.getByRole('button', { name }).click();
    });
  }

  it('keeps an Undo toast until Dismiss, with a 44px Dismiss button', async () => {
    vi.useFakeTimers();
    setup();
    click('With undo');
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS * 4);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Spent Assault.');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    const dismiss = screen.getByRole('button', { name: 'Dismiss' });
    // IconButton is the 44px (--tap) round button.
    expect(dismiss.className).toMatch(/iconButton/);
    vi.useRealTimers();
    await userEvent.setup().click(dismiss);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('hides a plain toast after 5 s and gives it no Dismiss button', () => {
    vi.useFakeTimers();
    setup();
    click('Plain');
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS);
    });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('shows at most two toasts', () => {
    setup();
    click('With undo');
    click('Plain');
    click('With undo');
    const status = screen.getByRole('status');
    expect(status.children).toHaveLength(2);
    expect(status.children[0]).toHaveTextContent('Saved.');
  });

  it('clears an Undo toast when the route changes', () => {
    setup();
    click('With undo');
    expect(screen.getByRole('status')).toHaveTextContent('Spent Assault.');
    click('Go');
    expect(window.location.hash).toBe('#/b');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('clears an older plain toast on a route change but keeps one shown just before it', () => {
    vi.useFakeTimers();
    setup();
    click('Plain');
    act(() => {
      vi.advanceTimersByTime(TOAST_ROUTE_GRACE_MS);
    });
    click('Go');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    click('Plain');
    click('Back');
    expect(window.location.hash).toBe('#/a');
    expect(screen.getByRole('status')).toHaveTextContent('Saved.');
  });
});
