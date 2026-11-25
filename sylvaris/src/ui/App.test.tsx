import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mira, tom } from './test/fixtures.ts';
import { TEST_PLAYER, TEST_STAFF, renderApp } from './test/renderApp.tsx';

describe('App', () => {
  it('renders the roster inside the main landmark, with the disclaimer footer', async () => {
    renderApp('/', { user: TEST_STAFF });
    const heading = await screen.findByRole('heading', { level: 1, name: 'Characters' });
    expect(screen.getByRole('main')).toContainElement(heading);
    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      'Unofficial fan tool, not affiliated with Sylvaris LARP or Sylvaris Games, LLC.',
    );
  });

  it('links the logo and wordmark home and the gear to settings', async () => {
    renderApp('/settings');
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    expect(screen.getByRole('link', { name: 'Sylvaris Character Sheet' })).toHaveAttribute(
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

  const HARVEST = '2026-09-19-harvest-moon';
  const SPRING = {
    key: '2027-05-01-spring-gathering',
    name: 'Spring Gathering',
    date: '2027-05-01',
  };
  // Each screen is a lazy chunk that may render a loading state first, so wait for the heading.
  it.each([
    ['/new', 'New character', TEST_PLAYER],
    ['/events', 'Upcoming events', TEST_PLAYER],
    ['/events', 'Events', TEST_STAFF],
    [`/events/${HARVEST}`, 'Harvest Moon', TEST_STAFF],
    [`/events/${SPRING.key}/register/${mira().id}`, 'Pre-register Mira Voss', TEST_PLAYER],
    [`/events/${HARVEST}/check-in/${mira().id}`, 'Check in', TEST_STAFF],
    ['/staff', 'Staff tools', TEST_STAFF],
    ['/admin', 'Admin', { ...TEST_STAFF, role: 'admin' as const }],
  ] as const)('renders the real heading at %s (%s)', async (route, title, user) => {
    const settings = {
      mode: user.role === 'player' ? 'player' : 'staff',
      theme: 'system',
    } as const;
    renderApp(route, { characters: [mira(), tom()], events: [SPRING], user, settings });
    await waitFor(
      () => expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument(),
      { timeout: 4000 },
    );
    expect(screen.queryByText('Coming next.')).not.toBeInTheDocument();
  });

  it('keeps the staff check-in of a pre-registered character from players', async () => {
    renderApp(`/events/${HARVEST}/check-in/${mira().id}`, { characters: [mira()] });
    expect(await screen.findByText('This page is for staff.')).toBeInTheDocument();
  });

  it('shows the welcome page to a signed-out visitor, with the wiki open to all', async () => {
    renderApp('/', { user: null });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sylvaris character sheets' }),
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
    expect(screen.getByRole('link', { name: 'Rules wiki' })).toHaveAttribute('href', '#/wiki');
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
