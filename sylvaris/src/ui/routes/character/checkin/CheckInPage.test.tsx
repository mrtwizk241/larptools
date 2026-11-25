import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Settings } from '../../../../engine/model.ts';
import { App } from '../../../App.tsx';
import { createMemoryRepository } from '../../../data/memoryRepository.ts';
import { ash } from '../../../test/veteran.ts';
import { mira } from '../../../test/fixtures.ts';
import { TEST_STAFF, renderApp } from '../../../test/renderApp.tsx';

const STAFF: Settings = { mode: 'staff', theme: 'system' };
const FROST = { key: '2026-10-17-frost-court', name: 'Frost Court', date: '2026-10-17' };

describe('check-in', () => {
  it('players see the staff-only notice', async () => {
    renderApp(`/c/${mira().id}/checkin`, { characters: [mira()] });
    expect(await screen.findByText('This page is for staff.')).toBeInTheDocument();
  });

  it('an NPC with hours and extras: previews every award, checks in, shows a receipt', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(`/c/${mira().id}/checkin`, {
      characters: [mira()],
      settings: STAFF,
    });
    await user.click(await screen.findByRole('button', { name: 'Check in' }));
    expect(screen.getByText('Enter the event name.')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Event name/), 'Frost Court');
    const date = screen.getByLabelText(/Event date/);
    await user.clear(date);
    await user.type(date, '2026-10-17');
    await user.click(screen.getByRole('radio', { name: /Full event NPC \(unpaid\)/ }));
    await user.click(screen.getByRole('checkbox', { name: /Marshal or Medic/ }));
    const summary = screen.getByRole('region', { name: 'Summary' });
    const awards = within(summary).getByRole('list', { name: 'Awards' });
    expect(awards).toHaveTextContent('Event attendance+60 XP');
    expect(awards).toHaveTextContent('NPC time+5 CXP');
    expect(awards).toHaveTextContent('NPC time+500 Mist Tokens');
    expect(awards).toHaveTextContent(/Event extra.*\+50 Mist Tokens/);
    expect(summary).toHaveTextContent('No upkeep: first event.');

    await user.click(screen.getByRole('button', { name: 'Check in' }));
    const receipt = await screen.findByRole('region', { name: 'Checked in' });
    expect(receipt).toHaveTextContent('Frost Court');
    expect(receipt).toHaveTextContent('Full event NPC (unpaid)');
    expect(within(receipt).getByRole('link', { name: 'Print receipt' })).toHaveAttribute(
      'href',
      `#/c/${mira().id}/print?show=receipt&event=${FROST.key}`,
    );
    await waitFor(() =>
      expect(within(receipt).getByRole('heading', { name: 'Checked in' })).toHaveFocus(),
    );
    expect(repository.data.events.get(FROST.key)?.name).toBe('Frost Court');
    const last = repository.data.characters.get(mira().id)?.actions.at(-1);
    expect(last?.type).toBe('event.checkedIn');
    expect(last?.payload).toMatchObject({ attendance: 'npc-unpaid', extras: ['marshal-medic'] });
  });

  it('opens on the event from the link, shows upkeep, and the Human silver handed out', async () => {
    window.location.hash = `#/c/${ash().id}/checkin?event=${FROST.key}`;
    const repository = createMemoryRepository({ characters: [ash()], settings: STAFF });
    await repository.saveEvent(FROST);
    render(<App repository={repository} user={TEST_STAFF} />);
    const select = await screen.findByRole('combobox', { name: 'Event' });
    await waitFor(() => expect(select).toHaveValue(FROST.key));
    const upkeep = screen.getByRole('region', { name: 'Upkeep' });
    expect(upkeep).toHaveTextContent('Upkeep due: 1 Silver');
    expect(within(upkeep).getByRole('radio', { name: 'Paid at the desk' })).toBeChecked();
    const items = screen.getByRole('region', { name: 'Items handed out' });
    expect(items).toHaveTextContent(/Silver/);
  });

  // Acceptance AC-2.
  it('opens on the latest past event, not a future one, and follows a changed ?event=', async () => {
    const PAST = { key: '2020-05-02-old-market', name: 'Old Market', date: '2020-05-02' };
    const FUTURE = { key: '2099-01-09-far-feast', name: 'Far Feast', date: '2099-01-09' };
    window.location.hash = `#/c/${mira().id}/checkin`;
    const repository = createMemoryRepository({ characters: [mira()], settings: STAFF });
    await repository.saveEvent(PAST);
    await repository.saveEvent(FUTURE);
    render(<App repository={repository} user={TEST_STAFF} />);
    const select = await screen.findByRole('combobox', { name: 'Event' });
    await waitFor(() => expect(select).toHaveValue(PAST.key));
    expect(within(select).getByRole('option', { name: /Far Feast.*\(upcoming\)/ })).toBeTruthy();

    const user = userEvent.setup();
    await user.selectOptions(select, FUTURE.key);
    expect(screen.getByText('This event has not happened yet.')).toBeInTheDocument();
    // A new link with another event replaces the pick made on the open form.
    window.location.hash = `#/c/${mira().id}/checkin?event=${PAST.key}`;
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Event' })).toHaveValue(PAST.key),
    );
    window.location.hash = `#/c/${mira().id}/checkin?event=${FUTURE.key}`;
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Event' })).toHaveValue(FUTURE.key),
    );
  });

  it('a second check-in to the same event is blocked with the reason', async () => {
    window.location.hash = `#/c/${ash().id}/checkin?event=2026-09-19-harvest-moon`;
    const repository = createMemoryRepository({ characters: [ash()], settings: STAFF });
    await repository.saveEvent({
      key: '2026-09-19-harvest-moon',
      name: 'Harvest Moon',
      date: '2026-09-19',
    });
    render(<App repository={repository} user={TEST_STAFF} />);
    // Already attended: the form opens on a new event; choosing it shows why.
    const select = await screen.findByRole('combobox', { name: 'Event' });
    const user = userEvent.setup();
    await within(select).findByRole('option', { name: /Harvest Moon.*\(checked in\)/ });
    await user.selectOptions(select, '2026-09-19-harvest-moon');
    const summary = screen.getByRole('region', { name: 'Summary' });
    expect(within(summary).getByRole('alert')).toHaveTextContent('Already checked in');
  });
});
