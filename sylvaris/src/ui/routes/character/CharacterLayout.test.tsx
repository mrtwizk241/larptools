import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { loadRuleset } from '../../../engine/index.ts';
import type { Settings } from '../../../engine/model.ts';
import { mira, tom } from '../../test/fixtures.ts';
import { renderApp } from '../../test/renderApp.tsx';
import { ash } from '../../test/veteran.ts';
import { conditionalText, pointsRows, sourcesText } from './overview/overviewModel.ts';
import { deriveSheet } from '../../../engine/index.ts';

const STAFF: Settings = { mode: 'staff', theme: 'system' };
const ASH = ash();

describe('character layout', () => {
  it('shows the header with race, Calling, player, and XP, CXP, AXP, and MT', async () => {
    renderApp(`/c/${ASH.id}`, { characters: [ASH] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Ash Merrow' })).toBeVisible();
    expect(screen.getByText('Human. Calling: The Protector. Player: Robin Vale')).toBeVisible();
    const points = within(screen.getByRole('list', { name: 'Points' }));
    expect(points.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'XP 380 left',
      'CXP 20 left',
      'AXP 6 left',
      'MT 150',
    ]);
  });

  it('has the bottom navigation Sheet (the overview), Skills, Magic, Play, More', async () => {
    renderApp(`/c/${ASH.id}`, { characters: [ASH] });
    const nav = within(await screen.findByRole('navigation', { name: 'Character' }));
    const links = nav.getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['Sheet', 'Skills', 'Magic', 'Play', 'More']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      `#/c/${ASH.id}`,
      `#/c/${ASH.id}/skills`,
      `#/c/${ASH.id}/journals`,
      `#/c/${ASH.id}/play`,
      `#/c/${ASH.id}/more`,
    ]);
    expect(nav.getByRole('link', { name: 'Sheet' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows the overview: profile, race, points, Life and Armor Points', async () => {
    renderApp(`/c/${ASH.id}`, { characters: [ASH] });
    const profile = await screen.findByRole('region', { name: 'Profile' });
    expect(profile).toHaveTextContent('Robin Vale');
    expect(profile).toHaveTextContent('robin.vale@example.test');
    expect(profile).toHaveTextContent('A caravan guard who stayed.');
    expect(profile).toHaveTextContent('The Protector');
    expect(screen.getByRole('region', { name: 'Race' })).toHaveTextContent('Human');
    const table = within(screen.getByRole('region', { name: 'Points' })).getByRole('table');
    const rows = within(table)
      .getAllByRole('row')
      .map((r) => r.textContent);
    expect(rows).toEqual([
      'PointsEarnedSpentLeft',
      'XP510 of 2000130380',
      'CXP30 of 6101020',
      'AXP606',
      'MT20050150',
    ]);
    const body = screen.getByRole('region', { name: 'Life and armor' });
    expect(body).toHaveTextContent(
      'Life Points30From: Base Life Points 10, Toughness (Expert) +20',
    );
    expect(body).toHaveTextContent('Armor Points20');
    expect(screen.queryByRole('region', { name: /Warning/ })).not.toBeInTheDocument();
  });

  it('lists conditional armor separately', async () => {
    renderApp(`/c/${tom().id}`, { characters: [tom()] });
    const body = await screen.findByRole('region', { name: 'Life and armor' });
    expect(body).toHaveTextContent('Sometimes: Dwarf innate +10 (wearing physical armor)');
  });

  // Each screen is a lazy chunk that may render a loading state first, so wait for the heading.
  it.each([
    ['skills', 'Skills'],
    ['skills/toughness', 'Toughness'],
    ['journals', 'Magic'],
    ['calling', 'Calling'],
    ['extras', 'Extras'],
    ['log', 'Log'],
    ['points', 'Points'],
    ['checkin', 'Check-in'],
    ['play', 'Play'],
    ['print', 'Print'],
    ['more', 'More'],
  ] as const)('renders the real heading of the %s sub-screen (%s)', async (path, title) => {
    renderApp(`/c/${ASH.id}/${path}`, { characters: [ASH], settings: STAFF });
    await waitFor(
      () => expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument(),
      { timeout: 4000 },
    );
    expect(screen.queryByText('Coming next.')).not.toBeInTheDocument();
    expect(screen.queryByText('This page is for staff.')).not.toBeInTheDocument();
  });

  it('keeps points and check-in for staff', async () => {
    for (const [path, title] of [
      ['points', 'Points'],
      ['checkin', 'Check-in'],
    ] as const) {
      const view = renderApp(`/c/${ASH.id}/${path}`, { characters: [ASH] });
      expect(await screen.findByRole('heading', { level: 2, name: title })).toBeInTheDocument();
      expect(screen.getByText('This page is for staff.')).toBeVisible();
      view.unmount();
    }
  });

  it('More links the screens that are not in the bottom bar', async () => {
    const player = renderApp(`/c/${ASH.id}/more`, { characters: [ASH] });
    const list = await screen.findByRole('heading', { level: 2, name: 'More' });
    expect(list).toBeVisible();
    const links = () =>
      within(screen.getByRole('main'))
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links()).toEqual(
      expect.arrayContaining([
        ['Calling', `#/c/${ASH.id}/calling`],
        ['Artifact, familiar, and extras', `#/c/${ASH.id}/extras`],
        ['Log', `#/c/${ASH.id}/log`],
        ['Print', `#/c/${ASH.id}/print`],
        ['Learning requests', '#/requests'],
      ]),
    );
    expect(screen.queryByRole('link', { name: 'Points' })).not.toBeInTheDocument();
    player.unmount();
    renderApp(`/c/${ASH.id}/more`, { characters: [ASH], settings: STAFF });
    expect(await screen.findByRole('link', { name: 'Points' })).toHaveAttribute(
      'href',
      `#/c/${ASH.id}/points`,
    );
    expect(screen.getByRole('link', { name: 'Check-in' })).toHaveAttribute(
      'href',
      `#/c/${ASH.id}/checkin`,
    );
  });

  it('says when a sub-screen does not exist', async () => {
    renderApp(`/c/${mira().id}/nowhere`, { characters: [mira()] });
    expect(await screen.findByRole('heading', { level: 2, name: 'Page not found' })).toBeVisible();
    expect(screen.getByText('There is nothing at this address.')).toBeVisible();
  });
});

describe('overview model', () => {
  const rs = loadRuleset();

  it('lists points by currency with the earned caps', () => {
    expect(pointsRows(deriveSheet(rs, mira().actions))).toEqual([
      { currency: 'xp', earned: 150, spent: 65, available: 85, cap: 2000 },
      { currency: 'cxp', earned: 0, spent: 0, available: 0, cap: 610 },
      { currency: 'axp', earned: 0, spent: 0, available: 0, cap: null },
      { currency: 'mt', earned: 0, spent: 0, available: 0, cap: null },
    ]);
  });

  it('says where Life and Armor Points come from', () => {
    const sheet = deriveSheet(rs, tom().actions);
    expect(sourcesText(sheet.stats.lifePoints.sources)).toBe(
      'Base Life Points 10, Toughness (Expert) +20',
    );
    expect(conditionalText(sheet.stats.armorPoints.conditional)).toBe(
      'Dwarf innate +10 (wearing physical armor)',
    );
  });
});
