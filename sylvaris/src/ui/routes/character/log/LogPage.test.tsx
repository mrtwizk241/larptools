import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Action, Settings, StoredCharacter } from '../../../../engine/model.ts';
import { mira } from '../../../test/fixtures.ts';
import { renderApp } from '../../../test/renderApp.tsx';
import { EMBER_ID, emberDragonborn } from '../skills/testDragonborn.ts';

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
  payload: { currency: 'xp', amount: 10, kind: 'gm-award', requested: 30, credited: 10 },
  note: 'Great costume',
};
const CHECKIN = {
  type: 'event.checkedIn' as const,
  eventKey: SPRING.key,
  payload: {
    event: SPRING,
    attendance: 'player',
    npcHours: 0,
    extras: [],
    awards: [
      { currency: 'xp', amount: 60, kind: 'event' },
      { currency: 'cxp', amount: 5, kind: 'event' },
      { currency: 'axp', amount: 1, kind: 'event' },
    ],
    notCredited: [],
    upkeep: { dueSilver: 0, coveredBy: null },
    handedOut: [],
  },
};

function chips() {
  return screen.getByRole('list', { name: 'Points' });
}

function topItems(list: HTMLElement) {
  return within(list)
    .getAllByRole('listitem')
    .filter((li) => li.parentElement === list);
}

describe('log', () => {
  it('shows the ledger newest first with running totals, what the cap kept back, and filters', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${mira().id}/log`, { characters: [miraWith(CHECKIN, AWARD)] });
    const ledger = await screen.findByRole('list', { name: 'Points ledger' });
    const items = topItems(ledger);
    expect(items[0]).toHaveTextContent('GM award');
    expect(items[0]).toHaveTextContent('Great costume');
    expect(items[0]).toHaveTextContent('XP+10total 220');
    expect(items[0]).toHaveTextContent('Not credited, earned cap reached: 20 XP.');
    expect(items[1]).toHaveTextContent('Starting points');
    expect(items[2]).toHaveTextContent('Event attendance · Spring Thaw');
    expect(items[2]).toHaveTextContent(/Apr 18, 2026recorded Nov 7/);
    expect(items[2]).toHaveTextContent('XP+60total 60');

    await user.click(screen.getByRole('button', { name: 'AXP' }));
    expect(screen.getByRole('button', { name: 'AXP' })).toHaveAttribute('aria-pressed', 'true');
    expect(topItems(screen.getByRole('list', { name: 'Points ledger' }))).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'MT' }));
    expect(screen.getByText('No points recorded in MT yet.')).toBeInTheDocument();
  });

  it('lists all actions with type, time, actor, and note; players get no correction buttons', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${mira().id}/log`, { characters: [miraWith(CHECKIN, AWARD)] });
    await user.click(await screen.findByRole('tab', { name: 'All actions' }));
    const list = screen.getByRole('list', { name: 'Actions, newest first' });
    expect(list).toHaveTextContent(
      'Awarded 10 XP for gm award (30 asked, the rest is over the cap).',
    );
    expect(list).toHaveTextContent('Note: Great costume');
    expect(list).toHaveTextContent('Checked in to Spring Thaw (Player)');
    expect(list).toHaveTextContent('Staff: Desk');
    expect(screen.queryByRole('button', { name: /Correct this/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Check-ins' }));
    expect(screen.getByRole('list', { name: 'Actions, newest first' })).not.toHaveTextContent(
      'Awarded',
    );
  });

  it("names the Dragonborn's Gift after the element (AC-8)", async () => {
    const user = userEvent.setup();
    renderApp(`/c/${EMBER_ID}/log`, { characters: [emberDragonborn()] });
    await user.click(await screen.findByRole('tab', { name: 'All actions' }));
    const list = screen.getByRole('list', { name: 'Actions, newest first' });
    expect(list).toHaveTextContent("Fire's Gift");
    expect(list).not.toHaveTextContent('<Element>');
  });

  it('staff correct an award with a required reason', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(`/c/${mira().id}/log`, {
      characters: [miraWith(AWARD)],
      settings: STAFF,
    });
    await user.click(await screen.findByRole('tab', { name: 'All actions' }));
    await user.click(screen.getByRole('button', { name: /Correct this: Awarded/ }));
    const dialog = screen.getByRole('dialog', { name: 'Correct an award' });
    expect(within(dialog).getByLabelText(/Adjust XP by/)).toHaveValue('-10');
    await user.click(within(dialog).getByRole('button', { name: 'Save correction' }));
    expect(within(dialog).getByText('Enter a reason for the correction.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Reason/), 'Awarded twice');
    await user.click(within(dialog).getByRole('button', { name: 'Save correction' }));
    expect(await screen.findByText('Correction saved: -10 XP.')).toBeInTheDocument();
    const last = repository.data.characters.get(mira().id)?.actions.at(-1);
    expect(last?.type).toBe('points.adjusted');
    expect(last?.payload).toMatchObject({ currency: 'xp', amount: -10, reason: 'Awarded twice' });
  });

  it('staff refund the top skill purchase with a reason', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(`/c/${mira().id}/log`, {
      characters: [mira()],
      settings: STAFF,
    });
    await user.click(await screen.findByRole('tab', { name: 'All actions' }));
    const buttons = screen.getAllByRole('button', { name: /Correct this:/ });
    expect(buttons.length).toBeGreaterThan(0);
    await user.click(buttons[0] as HTMLElement);
    const dialog = screen.getByRole('dialog', { name: 'Refund a skill purchase' });
    expect(dialog).toHaveTextContent(/Gives back \d+ XP/);
    await user.type(within(dialog).getByLabelText(/Reason/), 'Bought by mistake');
    await user.click(within(dialog).getByRole('button', { name: 'Save refund' }));
    await waitFor(() =>
      expect(repository.data.characters.get(mira().id)?.actions.at(-1)?.type).toBe(
        'skill.refunded',
      ),
    );
  });

  it('staff void a check-in with a required reason', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(`/c/${mira().id}/log`, {
      characters: [miraWith(CHECKIN)],
      settings: STAFF,
    });
    await user.click(await screen.findByRole('tab', { name: 'All actions' }));
    await user.click(
      screen.getByRole('button', { name: /Correct this: Checked in to Spring Thaw/ }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Void this check-in' });
    await user.click(within(dialog).getByRole('button', { name: 'Void check-in' }));
    expect(
      within(dialog).getByText('Enter a reason for voiding the check-in.'),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Reason/), 'Checked in the wrong character');
    await user.click(within(dialog).getByRole('button', { name: 'Void check-in' }));
    expect(await screen.findByText('Check-in to Spring Thaw voided.')).toBeInTheDocument();
    await waitFor(() => expect(chips()).toHaveTextContent(/AXP\s*0\s*left/));
    expect(
      screen.queryByRole('button', { name: /Correct this: Checked in to Spring Thaw/ }),
    ).not.toBeInTheDocument();
    const last = repository.data.characters.get(mira().id)?.actions.at(-1);
    expect(last?.type).toBe('event.checkInVoided');
  });
});
