import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset } from '../../../engine/index.ts';
import type { Settings } from '../../../engine/model.ts';
import { App } from '../../App.tsx';
import { createMemoryRepository } from '../../data/memoryRepository.ts';
import { TEST_PLAYER, TEST_STAFF, renderApp } from '../../test/renderApp.tsx';
import { mira, tom } from '../../test/fixtures.ts';
import { UNDO_REASON, undoCommands } from './eventRoster.ts';

const STAFF: Settings = { mode: 'staff', theme: 'system' };
const THAW = { key: '2026-04-18-spring-thaw', name: 'Spring Thaw', date: '2026-04-18' };
const MOON = { key: '2026-09-12-harvest-moon', name: 'Harvest Moon', date: '2026-09-12' };

async function renderWithEvents(route: string) {
  window.location.hash = `#${route}`;
  const repository = createMemoryRepository({ characters: [mira(), tom()], settings: STAFF });
  await repository.saveEvent(THAW);
  await repository.saveEvent(MOON);
  render(<App repository={repository} user={TEST_STAFF} />);
  return repository;
}

/** The 'Checked in N of M' line. */
function countLine(): HTMLElement {
  const line = [...document.querySelectorAll('p')].find((p) =>
    /^Checked in \d+ of \d+$/.test(p.textContent ?? ''),
  );
  if (!line) throw new Error('No count line');
  return line;
}

function rowFor(name: RegExp): HTMLElement {
  const list = screen.getByRole('list', { name: 'Characters' });
  const item = within(list)
    .getAllByRole('listitem')
    .find((li) => name.test(li.textContent ?? ''));
  if (!item) throw new Error(`No row for ${String(name)}`);
  return item;
}

describe('Events list', () => {
  it('shows players upcoming events to pre-register for, not the staff tools', async () => {
    const repository = createMemoryRepository({ characters: [mira()] });
    await repository.saveEvent({
      key: '2099-03-14-thaw-market',
      name: 'Thaw Market',
      date: '2099-03-14',
    });
    await repository.saveEvent({
      key: '2020-03-14-old-market',
      name: 'Old Market',
      date: '2020-03-14',
    });
    window.location.hash = '#/events';
    render(<App repository={repository} user={TEST_PLAYER} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Upcoming events' })).toBeVisible();
    const list = await screen.findByRole('list', { name: 'Upcoming events' });
    expect(within(list).getByRole('region', { name: 'Thaw Market' })).toBeVisible();
    expect(within(list).queryByText('Old Market')).not.toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Pre-register: Mira Voss' })).toHaveAttribute(
      'href',
      '#/events/2099-03-14-thaw-market/register/' + mira().id,
    );
    expect(screen.queryByRole('button', { name: 'Create event' })).not.toBeInTheDocument();
  });

  it('sends players from a staff event page back to the events list', async () => {
    renderApp('/events/2026-05-16-spring-thaw', { characters: [mira()] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Upcoming events' })).toBeVisible();
  });

  it('lists known events newest first and creates a new event', async () => {
    const user = userEvent.setup();
    const repository = await renderWithEvents('/events');
    const list = await screen.findByRole('list', { name: 'Known events' });
    const links = within(list).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining('Harvest Moon'),
      expect.stringContaining('Spring Thaw'),
    ]);
    expect(links[0]).toHaveTextContent('0 characters checked in');
    expect(links[0]).toHaveAttribute('href', `#/events/${MOON.key}`);

    await user.click(screen.getByRole('button', { name: 'Create event' }));
    expect(screen.getByText('Enter the event name.')).toBeVisible();

    await user.type(screen.getByLabelText(/Event name/), 'Winter Court');
    await user.clear(screen.getByLabelText(/Event date/));
    await user.type(screen.getByLabelText(/Event date/), '2026-12-05');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Winter Court' })).toBeVisible();
    expect(repository.data.events.has('2026-12-05-winter-court')).toBe(true);
  });

  it('is linked from the roster in staff mode only', async () => {
    renderApp('/', { characters: [mira()], settings: STAFF });
    expect(await screen.findByRole('link', { name: 'Events' })).toHaveAttribute('href', '#/events');
  });
});

describe('Event check-in roster', () => {
  it('quick check-in as player, counts, summary, and Undo', async () => {
    const user = userEvent.setup();
    const repository = await renderWithEvents(`/events/${THAW.key}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Spring Thaw' })).toBeVisible();
    expect(countLine()).toHaveTextContent('Checked in 0 of 2');

    const miraRow = rowFor(/Mira Voss/);
    expect(within(miraRow).getByText('Not checked in')).toBeVisible();
    const full = within(miraRow).getByRole('link', { name: 'Check in' });
    expect(full.getAttribute('href')).toBe(
      `#/c/${mira().id}/checkin?event=${THAW.key}&back=%2Fevents%2F${THAW.key}`,
    );

    await user.click(within(miraRow).getByRole('button', { name: 'Check in as player' }));
    expect(await screen.findByText('Checked in Mira Voss as Player.')).toBeVisible();
    await waitFor(() => expect(countLine()).toHaveTextContent('Checked in 1 of 2'));
    const checked = rowFor(/Mira Voss/);
    expect(within(checked).getByText('Checked in')).toBeVisible();
    expect(within(checked).getByText('Player')).toBeVisible();
    expect(within(checked).queryByRole('button')).not.toBeInTheDocument();
    expect(within(rowFor(/Old Tom/)).getByText('Not checked in')).toBeVisible();

    const summary = screen.getByRole('region', { name: 'Staff summary' });
    expect(summary).toHaveTextContent('Event CXP awarded: 75');

    const stored = repository.data.characters.get(mira().id);
    const checkIn = stored?.actions.find((a) => a.type === 'event.checkedIn');
    expect(checkIn?.eventKey).toBe(THAW.key);
    expect(checkIn?.payload).toMatchObject({ attendance: 'player', npcHours: 0, extras: [] });

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Undid the check-in for Mira Voss.')).toBeVisible();
    await waitFor(() => expect(summary).toHaveTextContent('Event CXP awarded: 0'));
    await waitFor(() => expect(countLine()).toHaveTextContent('Checked in 0 of 2'));
    const undone = rowFor(/Mira Voss/);
    expect(within(undone).getByText('Not checked in')).toBeVisible();
    const actions = repository.data.characters.get(mira().id)?.actions ?? [];
    expect(actions.filter((a) => a.type === 'points.adjusted')).toEqual([]);
    const voids = actions.filter((a) => a.type === 'event.checkInVoided');
    expect(voids.map((a) => [a.payload, a.eventKey])).toEqual([
      [{ checkInActionId: checkIn?.id, reason: UNDO_REASON }, THAW.key],
    ]);

    // The check-in can be made again.
    await user.click(within(undone).getByRole('button', { name: 'Check in as player' }));
    await waitFor(() => expect(countLine()).toHaveTextContent('Checked in 1 of 2'));
    expect(summary).toHaveTextContent('Event CXP awarded: 75');
  });

  it('shows why Undo is blocked when the check-in points are already spent', async () => {
    const user = userEvent.setup();
    const repository = await renderWithEvents(`/events/${THAW.key}`);
    await screen.findByRole('heading', { level: 1, name: 'Spring Thaw' });
    await user.click(
      within(rowFor(/Mira Voss/)).getByRole('button', { name: 'Check in as player' }),
    );
    await screen.findByText('Checked in Mira Voss as Player.');
    // Spend the FP elsewhere before Undo.
    const stored = repository.data.characters.get(mira().id);
    if (!stored) throw new Error('Mira missing');
    const fp = deriveSheet(loadRuleset(), stored.actions).points.fp.available;
    await repository.saveCharacter({
      ...stored,
      actions: [
        ...stored.actions,
        {
          id: 'spend-fp',
          seq: stored.actions.length + 1,
          at: '2026-04-18T12:00:00.000Z',
          actor: { role: 'staff' },
          type: 'points.adjusted',
          payload: { currency: 'fp', amount: -fp, reason: 'Spent' },
        },
      ],
    });
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(
      await within(rowFor(/Mira Voss/)).findByText(/Cannot void: it takes back 1 FP/),
    ).toBeVisible();
    expect(within(rowFor(/Mira Voss/)).getByText('Checked in')).toBeVisible();
  });

  it('filters by name and says when an event is unknown', async () => {
    const user = userEvent.setup();
    await renderWithEvents(`/events/${THAW.key}`);
    await user.type(await screen.findByRole('searchbox', { name: 'Search' }), 'priya');
    expect(
      within(screen.getByRole('list', { name: 'Characters' })).getAllByRole('listitem'),
    ).toHaveLength(1);
    expect(rowFor(/Old Tom/)).toBeInTheDocument();

    window.location.hash = '#/events/2020-01-01-nothing';
    expect(await screen.findByRole('heading', { name: 'Event not found' })).toBeVisible();
  });

  it('full check-in with the event preselected returns to the event', async () => {
    const user = userEvent.setup();
    const back = encodeURIComponent(`/events/${THAW.key}`);
    await renderWithEvents(`/c/${mira().id}/checkin?event=${THAW.key}&back=${back}`);
    const select = await screen.findByRole('combobox', { name: 'Event' });
    await waitFor(() => expect(select).toHaveValue(THAW.key));
    await user.click(screen.getByRole('radio', { name: 'Full Event NPC (Un-Paid)' }));
    await user.click(screen.getByRole('button', { name: 'Check in' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Spring Thaw' })).toBeVisible();
    expect(await screen.findByText('Checked in Mira Voss to Spring Thaw.')).toBeVisible();
    const row = rowFor(/Mira Voss/);
    expect(within(row).getByText('Full Event NPC (Un-Paid)')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Staff summary' })).toHaveTextContent(
      /Mira Voss: 3 Common resources/,
    );
  });
});

describe('undoCommands', () => {
  it('takes back only CXP and FP, summed per currency', () => {
    expect(
      undoCommands(
        [
          { currency: 'cxp', amount: 75, kind: 'event' },
          { currency: 'cxp', amount: 5, kind: 'npc' },
          { currency: 'shinies', amount: 100, kind: 'npc' },
          { currency: 'fp', amount: 1, kind: 'attendance' },
        ],
        THAW.key,
      ),
    ).toEqual([
      {
        type: 'adjustPoints',
        currency: 'cxp',
        amount: -80,
        reason: UNDO_REASON,
        kind: 'adjustment',
        eventKey: THAW.key,
      },
      {
        type: 'adjustPoints',
        currency: 'fp',
        amount: -1,
        reason: UNDO_REASON,
        kind: 'adjustment',
        eventKey: THAW.key,
      },
    ]);
  });
});
