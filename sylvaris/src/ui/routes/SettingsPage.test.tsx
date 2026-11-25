import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TEST_PLAYER, TEST_STAFF, renderApp } from '../test/renderApp.tsx';

function header() {
  return screen.getByRole('banner');
}

describe('Settings', () => {
  it('shows the signed-in account and its role', async () => {
    renderApp('/settings', { user: TEST_STAFF });
    expect(await screen.findByText(TEST_STAFF.email)).toBeInTheDocument();
    expect(within(header()).getByText('Staff')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change password' })).toBeDisabled();
  });

  it('asks a signed-out visitor to sign in and hides the data card', async () => {
    renderApp('/settings', { user: null });
    expect(await screen.findByText(/You are not signed in/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Back up all characters' }),
    ).not.toBeInTheDocument();
  });

  it('shows a non-blocking banner when migrations fail', async () => {
    renderApp('/settings', {
      migration: { ok: false, from: 3, to: 1, error: 'Update the app.' },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Saved data could not be upgraded: Update the app.',
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });

  it('hides restore from players and shows the about facts', async () => {
    renderApp('/settings', { user: TEST_PLAYER });
    expect(await screen.findByText('Restoring a backup is for staff.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore from backup' })).not.toBeInTheDocument();
    expect(screen.getByText('sylvaris-1.3.1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sylvaris LARP website/ })).toHaveAttribute(
      'href',
      'https://sylvarislarp.com/',
    );
  });
});
