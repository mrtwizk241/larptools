import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TEST_STAFF, renderApp } from './test/renderApp.tsx';

describe('App', () => {
  it('renders the roster inside the main landmark, with the disclaimer footer', async () => {
    renderApp('/', { user: TEST_STAFF });
    const heading = await screen.findByRole('heading', { level: 1, name: 'Characters' });
    expect(screen.getByRole('main')).toContainElement(heading);
    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      'Unofficial fan tool, not affiliated with Rustwater LARP.',
    );
  });

  it('links the logo and wordmark home and the gear to settings', async () => {
    renderApp('/settings');
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    expect(screen.getByRole('link', { name: 'Rustwater Character Sheet' })).toHaveAttribute(
      'href',
      '#/',
    );
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '#/settings');
  });

  it('shows a player their learning requests at /requests', async () => {
    renderApp('/requests');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'My learning requests' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('No requests yet.')).toBeInTheDocument();
  });

  it('lets a player build a new character to send to staff', async () => {
    renderApp('/new');
    expect(await screen.findByText(/it goes to staff for approval/)).toBeInTheDocument();
    expect(
      screen.getByText(/Player: Test Player \(player@test.invalid\), from your account/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Player name')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });

  it('shows the welcome page to a signed-out visitor, with the wiki open to all', async () => {
    renderApp('/', { user: null });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Rustwater character sheets' }),
    ).toBeInTheDocument();
    const main = within(screen.getByRole('main'));
    expect(main.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '#/login');
    expect(main.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '#/signup',
    );
    expect(main.getByRole('link', { name: 'Staff sign-in' })).toHaveAttribute(
      'href',
      '#/staff/login',
    );
    expect(screen.getByRole('link', { name: 'Rules Wiki' })).toHaveAttribute('href', '#/wiki');
  });

  it('sends a signed-out visitor from a private page to sign in', async () => {
    renderApp('/c/anything', { user: null });
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
  });

  it('keeps staff tools from players', async () => {
    renderApp('/staff');
    expect(await screen.findByText('This page is for staff.')).toBeInTheDocument();
  });

  it('shows not found for unknown routes with a way back', async () => {
    renderApp('/nowhere');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to characters' })).toHaveAttribute('href', '#/');
  });

  it('says when a character link points at nothing', async () => {
    renderApp('/c/missing-id');
    expect(await screen.findByText(/no character at this link/)).toBeInTheDocument();
  });
});
