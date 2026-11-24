import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Action, Settings, StoredCharacter } from '../../../../engine/model.ts';
import { mira } from '../../../test/fixtures.ts';
import { App } from '../../../App.tsx';
import { createMemoryRepository } from '../../../data/memoryRepository.ts';
import { TEST_STAFF, renderApp } from '../../../test/renderApp.tsx';

const STAFF: Settings = { mode: 'staff', theme: 'system' };
const SPRING = { key: '2026-04-18-spring-thaw', name: 'Spring Thaw', date: '2026-04-18' };

/** Mira plus extra actions, numbered after her creation. */
function miraWith(...extra: Omit<Action, 'id' | 'seq' | 'at' | 'actor'>[]): StoredCharacter {
  const base = mira();
  const actions = [...base.actions];
  extra.forEach((a, i) => {
    actions.push({
      id: `extra-${i + 1}`,
      seq: actions.length + 1,
      at: `2026-11-07T1${i}:00:00.000Z`,
      actor: { role: 'staff', name: 'Desk' },
      ...a,
    });
  });
  return { ...base, actions };
}

const AWARD = {
  type: 'points.awarded' as const,
  payload: { currency: 'cxp', amount: 10, kind: 'other-award' },
  note: 'Great costume',
};
const SHINIES = {
  type: 'points.awarded' as const,
  payload: { currency: 'shinies', amount: 1000, kind: 'donation' },
};
const CHECKIN = {
  type: 'event.checkedIn' as const,
  eventKey: SPRING.key,
  payload: {
    event: SPRING,
    attendance: 'player',
    npcHours: 0,
    preSignedShift: false,
    extras: [],
    awards: [
      { currency: 'cxp', amount: 50, kind: 'event' },
      { currency: 'fp', amount: 1, kind: 'attendance' },
    ],
    owed: [],
  },
};

function chips() {
  return screen.getByRole('list', { name: 'Points' });
}

describe('log', () => {
  it('shows the ledger newest first with running totals, and filters by currency', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${mira().id}/log`, { characters: [miraWith(CHECKIN, AWARD)] });
    const ledger = await screen.findByRole('list', { name: 'Points ledger' });
    const items = within(ledger)
      .getAllByRole('listitem')
      .filter((li) => li.parentElement === ledger);
    // Recorded Nov 7 with no event: the recorded date. The check-in, also recorded Nov 7, sorts
    // by its event's date (Apr 18), below the starting points.
    expect(items[0]).toHaveTextContent('Other award');
    expect(items[0]).toHaveTextContent('Great costume');
    expect(items[0]).toHaveTextContent('CXP+10total 310');
    expect(items[0]).not.toHaveTextContent('recorded');
    expect(items[1]).toHaveTextContent('Starting points');
    expect(items[2]).toHaveTextContent('Event attendance · Spring Thaw');
    expect(items[2]).toHaveTextContent(/Apr 18, 2026recorded Nov 7/);
    expect(items[3]).toHaveTextContent('Event CXP · Spring Thaw');
    expect(items[3]).toHaveTextContent('CXP+50total 50');
    await user.click(screen.getByRole('button', { name: 'FP' }));
    expect(screen.getByRole('button', { name: 'FP' })).toHaveAttribute('aria-pressed', 'true');
    const filtered = screen.getByRole('list', { name: 'Points ledger' });
    expect(
      within(filtered)
        .getAllByRole('listitem')
        .filter((li) => li.parentElement === filtered),
    ).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Shinies' }));
    expect(screen.getByText('No points recorded in Shinies yet.')).toBeInTheDocument();
  });

  it('lists all actions with groups; players get no correction buttons', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${mira().id}/log`, { characters: [miraWith(CHECKIN, AWARD)] });
    await user.click(await screen.findByRole('tab', { name: 'All actions' }));
    const list = screen.getByRole('list', { name: 'Actions, newest first' });
    expect(list).toHaveTextContent('Awarded 10 CXP for Other award.');
    expect(list).toHaveTextContent('Note: Great costume');
    expect(list).toHaveTextContent('Checked in to Spring Thaw (Player): +50 CXP, +1 FP.');
    expect(list).toHaveTextContent('Staff: Desk');
    expect(screen.queryByRole('button', { name: /Correct this/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Check-ins' }));
    expect(screen.getByRole('list', { name: 'Actions, newest first' })).not.toHaveTextContent(
      'Awarded',
    );
  });

  it('staff correct an award with a required reason', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(`/c/${mira().id}/log`, {
      characters: [miraWith(AWARD)],
      settings: STAFF,
    });
    await user.click(await screen.findByRole('tab', { name: 'All actions' }));
    await user.click(screen.getByRole('button', { name: /Correct this/ }));
    const dialog = screen.getByRole('dialog', { name: 'Correct an award' });
    expect(within(dialog).getByLabelText(/Adjust CXP by/)).toHaveValue('-10');
    await user.click(within(dialog).getByRole('button', { name: 'Save correction' }));
    expect(within(dialog).getByText('Enter a reason for the correction.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Reason/), 'Awarded twice');
    await user.click(within(dialog).getByRole('button', { name: 'Save correction' }));
    expect(await screen.findByText('Correction saved: -10 CXP.')).toBeInTheDocument();
    await waitFor(() => expect(chips()).toHaveTextContent('CXP 250 left'));
    const last = repository.data.characters.get(mira().id)?.actions.at(-1);
    expect(last?.type).toBe('points.adjusted');
    expect(last?.payload).toMatchObject({ currency: 'cxp', amount: -10, reason: 'Awarded twice' });
  });

  it('staff void a check-in with a required reason', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(`/c/${mira().id}/log`, {
      characters: [miraWith(CHECKIN)],
      settings: STAFF,
    });
    await user.click(await screen.findByRole('tab', { name: 'All actions' }));
    await waitFor(() => expect(chips()).toHaveTextContent('CXP 300 left'));
    await user.click(
      screen.getByRole('button', { name: /Correct this: Checked in to Spring Thaw/ }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Void this check-in' });
    expect(dialog).toHaveTextContent('Takes back the points and items from this check-in.');
    await user.click(within(dialog).getByRole('button', { name: 'Void check-in' }));
    expect(
      within(dialog).getByText('Enter a reason for voiding the check-in.'),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Reason/), 'Checked in the wrong character');
    await user.click(within(dialog).getByRole('button', { name: 'Void check-in' }));
    expect(await screen.findByText('Check-in to Spring Thaw voided.')).toBeInTheDocument();
    await waitFor(() => expect(chips()).toHaveTextContent('CXP 250 left'));
    const list = screen.getByRole('list', { name: 'Actions, newest first' });
    expect(list).toHaveTextContent(
      'Voided check-in to Spring Thaw: Checked in the wrong character.',
    );
    // A voided check-in cannot be corrected again.
    expect(
      screen.queryByRole('button', { name: /Correct this: Checked in to Spring Thaw/ }),
    ).not.toBeInTheDocument();
    const last = repository.data.characters.get(mira().id)?.actions.at(-1);
    expect(last?.type).toBe('event.checkInVoided');
    expect(last?.payload).toEqual({
      checkInActionId: 'extra-1',
      reason: 'Checked in the wrong character',
    });
  });

  it('shows why a check-in cannot be voided', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${mira().id}/log`, {
      characters: [
        miraWith(CHECKIN, {
          type: 'points.adjusted',
          payload: { currency: 'fp', amount: -1, reason: 'Spent elsewhere' },
        }),
      ],
      settings: STAFF,
    });
    await user.click(await screen.findByRole('tab', { name: 'All actions' }));
    await user.click(
      screen.getByRole('button', { name: /Correct this: Checked in to Spring Thaw/ }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Void this check-in' });
    expect(dialog).toHaveTextContent('Cannot void yet');
    expect(dialog).toHaveTextContent(/takes back 1 FP, but only 0 FP is unspent/);
    expect(within(dialog).getByRole('button', { name: 'Void check-in' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

describe('check-in', () => {
  it('opens on the newest event this character has not checked in to', async () => {
    const SUMMER = { key: '2026-07-18-long-summer', name: 'Long Summer', date: '2026-07-18' };
    const MOON = { key: '2026-09-19-harvest-moon', name: 'Harvest Moon', date: '2026-09-19' };
    window.location.hash = `#/c/${mira().id}/checkin`;
    // Checked in to Harvest Moon (the newest) already; Long Summer is next.
    const attended = miraWith({
      ...CHECKIN,
      eventKey: MOON.key,
      payload: { ...CHECKIN.payload, event: MOON },
    });
    const repository = createMemoryRepository({ characters: [attended], settings: STAFF });
    for (const e of [SPRING, SUMMER, MOON]) await repository.saveEvent(e);
    render(<App repository={repository} user={TEST_STAFF} />);
    const select = await screen.findByRole('combobox', { name: 'Event' });
    await waitFor(() => expect(select).toHaveValue(SUMMER.key));
    expect(screen.queryByText('Cannot check in')).not.toBeInTheDocument();
  });

  it('opens on a new event when every known event is attended', async () => {
    window.location.hash = `#/c/${mira().id}/checkin`;
    const repository = createMemoryRepository({ characters: [miraWith(CHECKIN)], settings: STAFF });
    await repository.saveEvent(SPRING);
    render(<App repository={repository} user={TEST_STAFF} />);
    expect(await screen.findByLabelText(/Event name/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Event' })).toHaveValue('__new__');
  });

  it('players see a message instead of the form', async () => {
    renderApp(`/c/${mira().id}/checkin`, { characters: [mira()] });
    expect(await screen.findByText(/Only staff can check a character in/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check in' })).not.toBeInTheDocument();
  });

  it('needs an event name, previews awards, checks in, and blocks a second check-in', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(`/c/${mira().id}/checkin`, {
      characters: [mira()],
      settings: STAFF,
    });
    await user.click(await screen.findByRole('button', { name: 'Check in' }));
    expect(screen.getByText('Enter the event name.')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Event name/), 'Spring Thaw');
    const date = screen.getByLabelText(/Event date/);
    await user.clear(date);
    await user.type(date, '2026-04-18');
    await user.click(screen.getByRole('button', { name: 'More NPC hours' }));
    await user.click(screen.getByRole('button', { name: 'More NPC hours' }));
    await user.click(screen.getByRole('button', { name: 'More NPC hours' }));
    await user.click(screen.getByRole('checkbox', { name: /Marshal/ }));
    const summary = screen.getByRole('region', { name: 'Summary' });
    const awards = within(summary).getByRole('list', { name: 'Awards' });
    expect(awards).toHaveTextContent('Event CXP+75 CXP');
    expect(awards).toHaveTextContent('NPC time+3 CXP');
    expect(awards).toHaveTextContent('NPC time+30 Shinies');
    expect(awards).toHaveTextContent('Volunteer help+50 Shinies');

    await user.click(screen.getByRole('button', { name: 'Check in' }));
    const receipt = await screen.findByRole('region', { name: 'Checked in' });
    expect(receipt).toHaveTextContent('Spring Thaw');
    expect(within(receipt).getByRole('link', { name: 'See the log' })).toHaveAttribute(
      'href',
      `#/c/${mira().id}/log`,
    );
    await waitFor(() => expect(chips()).toHaveTextContent('CXP 328 left'));
    expect(chips()).toHaveTextContent('FP 1');
    expect(chips()).toHaveTextContent('Shinies 80');
    expect(repository.data.events.get('2026-04-18-spring-thaw')?.name).toBe('Spring Thaw');

    // A-04: focus moves to the receipt heading, not the page.
    await waitFor(() =>
      expect(within(receipt).getByRole('heading', { name: 'Checked in' })).toHaveFocus(),
    );
    // Friction 3: the form moves on to a new event instead of the one just attended.
    const select = screen.getByRole('combobox', { name: 'Event' });
    expect(select).toHaveValue('__new__');
    expect(
      within(select).getByRole('option', { name: /Spring Thaw.*\(checked in\)/ }),
    ).toBeVisible();
    // Choosing it again says why a second check-in is blocked.
    await user.selectOptions(select, '2026-04-18-spring-thaw');
    expect(within(summary).getByRole('alert')).toHaveTextContent(
      'Already checked in to Spring Thaw.',
    );
    await user.click(screen.getByRole('button', { name: 'Check in' }));
    await waitFor(() => expect(repository.data.characters.get(mira().id)?.actions).toHaveLength(2));
  });
});

describe('points', () => {
  it('is staff only and in the character menu for staff', async () => {
    renderApp(`/c/${mira().id}`, { characters: [mira()], settings: STAFF });
    const nav = await screen.findByRole('navigation', { name: 'Character' });
    expect(within(nav).getByRole('link', { name: 'Points' })).toHaveAttribute(
      'href',
      `#/c/${mira().id}/points`,
    );
  });

  it('players see a message', async () => {
    renderApp(`/c/${mira().id}/points`, { characters: [mira()] });
    expect(await screen.findByText(/Only staff can award/)).toBeInTheDocument();
  });

  it('award: needs an amount, then awards and toasts', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${mira().id}/points`, { characters: [mira()], settings: STAFF });
    const card = await screen.findByRole('region', { name: 'Award points' });
    await user.click(within(card).getByRole('button', { name: 'Award points' }));
    expect(within(card).getByText('Enter a whole number of 1 or more.')).toBeInTheDocument();
    await user.type(within(card).getByLabelText(/Amount/), '5');
    await user.selectOptions(within(card).getByLabelText('Kind'), 'event');
    await user.click(within(card).getByRole('button', { name: 'Award points' }));
    expect(await within(card).findByRole('alert')).toHaveTextContent(
      'Event CXP needs the event it is for.',
    );
    await user.selectOptions(within(card).getByLabelText('Kind'), 'staff');
    await user.click(within(card).getByRole('button', { name: 'Award points' }));
    expect(await screen.findByText('Awarded 5 CXP.')).toBeInTheDocument();
    await waitFor(() => expect(chips()).toHaveTextContent('CXP 255 left'));
  });

  it('spend Shinies: shows price and cap left, and blocks going over the per-event cap', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(`/c/${mira().id}/points`, {
      characters: [miraWith(CHECKIN, SHINIES)],
      settings: STAFF,
    });
    const card = await screen.findByRole('region', { name: 'Spend Shinies' });
    await user.selectOptions(within(card).getByLabelText('Event bought at'), SPRING.key);
    const qty = within(card).getByLabelText(/Quantity/);
    await user.clear(qty);
    await user.type(qty, '6');
    expect(card).toHaveTextContent('Price: 300 Shinies. Left this event: 5 of 5.');
    expect(within(card).getByRole('alert')).toHaveTextContent(
      'CXP: at most 5 per event; 0 already bought for this event.',
    );
    // D4: the button is disabled with the reason, and pressing it shows the error only once.
    const spend = within(card).getByRole('button', { name: 'Spend Shinies' });
    expect(spend).toHaveAttribute('aria-disabled', 'true');
    expect(spend).toHaveAccessibleDescription(/CXP: at most 5 per event/);
    await user.click(spend);
    expect(within(card).getAllByText(/at most 5 per event;/)).toHaveLength(1);
    expect(repository.data.characters.get(mira().id)?.actions).toHaveLength(3);
    await user.clear(qty);
    await user.type(qty, '2');
    expect(spend).not.toHaveAttribute('aria-disabled');
    await user.click(spend);
    expect(await screen.findByText('Spent 100 Shinies on CXP.')).toBeInTheDocument();
    await waitFor(() => expect(card).toHaveTextContent('Left this event: 3 of 5.'));
    // Friction 5: the event stays chosen for the next purchase.
    expect(within(card).getByLabelText('Event bought at')).toHaveValue(SPRING.key);
    await user.selectOptions(within(card).getByLabelText('Buy'), 'buy-pxp');
    expect(within(card).getByLabelText('Event bought at')).toHaveValue(SPRING.key);
  });

  it('award: the Kind list only offers kinds that fit the currency', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${mira().id}/points`, { characters: [mira()], settings: STAFF });
    const card = await screen.findByRole('region', { name: 'Award points' });
    const kindNames = () =>
      within(within(card).getByLabelText('Kind'))
        .getAllByRole('option')
        .map((o) => o.textContent);
    expect(kindNames()).toContain('Event CXP');
    expect(kindNames()).not.toContain('Event attendance');
    await user.selectOptions(within(card).getByLabelText('Kind'), 'event');
    await user.selectOptions(within(card).getByLabelText('Currency'), 'fp');
    expect(kindNames()).toEqual(['Event attendance', 'Other award']);
    // The Event CXP choice does not fit FP, so the form falls back to Other award.
    expect(within(card).getByLabelText('Kind')).toHaveValue('other-award');
    await user.selectOptions(within(card).getByLabelText('Currency'), 'shinies');
    expect(kindNames()).not.toContain('Event CXP');
    expect(kindNames()).toContain('Donation');
  });

  it('adjust: needs a non-zero amount and a reason', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(`/c/${mira().id}/points`, {
      characters: [mira()],
      settings: STAFF,
    });
    const card = await screen.findByRole('region', { name: 'Adjust points' });
    await user.type(within(card).getByLabelText(/Amount/), '0');
    await user.click(within(card).getByRole('button', { name: 'Adjust points' }));
    expect(within(card).getByText(/Enter a whole number other than 0/)).toBeInTheDocument();
    expect(within(card).getByText('Enter a reason for the adjustment.')).toBeInTheDocument();
    await user.clear(within(card).getByLabelText(/Amount/));
    await user.type(within(card).getByLabelText(/Amount/), '-20');
    await user.type(within(card).getByLabelText(/Reason/), 'Late sign-out');
    await user.click(within(card).getByRole('button', { name: 'Adjust points' }));
    expect(await screen.findByText('Adjusted CXP by -20.')).toBeInTheDocument();
    expect(repository.data.characters.get(mira().id)?.actions.at(-1)?.type).toBe('points.adjusted');
  });
});
