import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RegistrationEntry } from '../../../api/contract.ts';
import { api } from '../../../api/client.ts';
import { deriveSheet, loadRuleset, plan, type Command } from '../../../engine/index.ts';
import type { Action, Settings, StoredCharacter } from '../../../engine/model.ts';
import { App } from '../../App.tsx';
import { createMemoryRepository } from '../../data/memoryRepository.ts';
import { mira, tom } from '../../test/fixtures.ts';
import { TEST_STAFF, renderApp } from '../../test/renderApp.tsx';

const STAFF: Settings = { mode: 'staff', theme: 'system' };
const FROST = { key: '2026-10-17-frost-court', name: 'Frost Court', date: '2026-10-17' };

/** Matches the "Checked in N of 2" line, which wraps its numbers in spans. */
function count(n: number) {
  return (_: string, el: Element | null) =>
    el?.tagName === 'P' && el.textContent === `Checked in ${n} of 2`;
}

function row(name: string) {
  const list = screen.getByRole('list', { name: 'Characters' });
  const item = within(list)
    .getAllByRole('listitem')
    .find((li) => li.textContent?.includes(name));
  if (!item) throw new Error(`No row for ${name}`);
  return item;
}

describe('events', () => {
  it('staff create an event and land on its page', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp('/events', { characters: [mira(), tom()], settings: STAFF });
    const list = await screen.findByRole('list', { name: 'Known events' });
    expect(list).toHaveTextContent('Harvest Moon');
    expect(list).toHaveTextContent('1 character checked in');
    await user.type(screen.getByLabelText(/Event name/), 'Frost Court');
    const date = screen.getByLabelText(/Event date/);
    await user.clear(date);
    await user.type(date, '2026-10-17');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Frost Court' })).toBeVisible();
    expect(repository.data.events.get(FROST.key)?.name).toBe('Frost Court');
  });

  it('quick check-in as player, Undo voids it, search filters the list', async () => {
    const user = userEvent.setup();
    window.location.hash = `#/events/${FROST.key}`;
    const repository = createMemoryRepository({ characters: [mira(), tom()], settings: STAFF });
    await repository.saveEvent(FROST);
    render(<App repository={repository} user={TEST_STAFF} />);
    expect(await screen.findByText(count(0))).toBeInTheDocument();

    await user.click(within(row('Mira Voss')).getByRole('button', { name: /Check in as player/ }));
    expect(await screen.findByText('Checked in Mira Voss as Player.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(count(1))).toBeInTheDocument());
    const summary = screen.getByRole('region', { name: 'Staff summary' });
    expect(summary).toHaveTextContent('Player: 1');
    expect(summary).toHaveTextContent('Points credited at check-in: 60 XP, 5 CXP, 1 AXP.');

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Undid the check-in for Mira Voss.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(count(0))).toBeInTheDocument());
    expect(row('Mira Voss')).toHaveTextContent('Not checked in');
    expect(repository.data.characters.get(mira().id)?.actions.at(-1)?.type).toBe(
      'event.checkInVoided',
    );

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'tom');
    expect(
      within(screen.getByRole('list', { name: 'Characters' })).getAllByRole('listitem'),
    ).toHaveLength(1);
    expect(within(row('Old Tom')).getByRole('link', { name: 'Check in: Old Tom' })).toHaveAttribute(
      'href',
      `#/c/${tom().id}/checkin?event=${FROST.key}&back=%2Fevents%2F${FROST.key}`,
    );
  });

  it('players are sent to the events list from an event page', async () => {
    renderApp(`/events/${FROST.key}`, { characters: [mira()] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Upcoming events' })).toBeVisible();
  });
});

describe('staff check-in of a pre-registered character', () => {
  const SPRING = { key: '2099-04-18-spring-market', name: 'Spring Market', date: '2099-04-18' };

  const ruleset = loadRuleset();

  /** Plans the commands as staff on top of the actions. */
  function runAll(start: readonly Action[], commands: readonly Command[]): Action[] {
    let actions = [...start];
    let n = 0;
    for (const command of commands) {
      const sheet = deriveSheet(ruleset, actions);
      const result = plan(ruleset, sheet, command, {
        actor: { role: 'staff' },
        now: () => '2026-10-01T10:00:00.000Z',
        newId: () => `setup-${++n}`,
        nextSeq: sheet.lastSeq + 1,
      });
      if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' '));
      actions = [...actions, ...result.actions];
    }
    return actions;
  }

  /** Old Tom near the XP earned cap (1940 of 2000) with 500 Mist Tokens. */
  function tomNearCap(): StoredCharacter {
    const character = tom();
    const actions = runAll(character.actions, [
      { type: 'adjustPoints', currency: 'xp', amount: 1730, reason: 'test setup' },
      { type: 'adjustPoints', currency: 'mt', amount: 500, reason: 'test setup' },
    ]);
    expect(deriveSheet(ruleset, actions).points.xp.earned).toBe(1940);
    return { ...character, actions };
  }

  afterEach(() => vi.restoreAllMocks());

  it('previews the awards on the sheet after the pre-registered Mist Token purchases', async () => {
    const character = tomNearCap();
    const registration: RegistrationEntry = {
      eventKey: SPRING.key,
      characterId: character.id,
      characterName: 'Old Tom',
      ownerName: null,
      status: 'started',
      plan: {
        attendance: 'player',
        purchases: [{ purchaseId: 'xp', qty: 10 }],
        choices: { upkeep: 'paid' },
      } as RegistrationEntry['plan'],
      startedBy: 'Test Staff',
      startedAt: '2099-04-18T09:00:00.000Z',
      checkedInBy: null,
      checkedInAt: null,
      createdAt: '2099-04-01T09:00:00.000Z',
      updatedAt: '2099-04-18T09:00:00.000Z',
    };
    vi.spyOn(api, 'registrations').mockResolvedValue({ items: [registration] });
    const repository = {
      ...createMemoryRepository({ characters: [character], events: [SPRING], settings: STAFF }),
      server: true,
    };
    window.location.hash = `#/events/${SPRING.key}/check-in/${character.id}`;
    render(<App repository={repository} user={TEST_STAFF} />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Check in Old Tom' }),
    ).toBeVisible();
    const awards = screen.getByRole('region', { name: 'Points this check-in awards' });
    // hand-derived: 1940 + 10 bought = 1950 earned, so 50 of the event's 60 XP fit the 2000 cap.
    expect(awards).toHaveTextContent('+50 XP');
    expect(awards).toHaveTextContent('Not credited, earned cap reached: 10 XP');
    expect(awards).not.toHaveTextContent('+60 XP');

    // The server saves the purchases, then the check-in; the receipt links to the print view.
    const saved = {
      ...character,
      actions: runAll(character.actions, [
        { type: 'spendMt', purchaseId: 'xp', qty: 10, eventKey: SPRING.key },
        { type: 'checkIn', event: SPRING, attendance: 'player', upkeep: 'paid' },
      ]),
    };
    vi.spyOn(api, 'finishCheckIn').mockResolvedValue({
      character: { character: saved, meta: { id: saved.id } },
    } as unknown as Awaited<ReturnType<typeof api.finishCheckIn>>);
    fireEvent.click(screen.getByRole('button', { name: 'Finish check-in' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Checked in Old Tom' }),
    ).toBeVisible();
    const receipt = screen.getByRole('region', { name: 'Receipt' });
    expect(receipt).toHaveTextContent('+50 XP');
    expect(screen.getByRole('link', { name: 'Print receipt' })).toHaveAttribute(
      'href',
      `#/c/${saved.id}/print?show=receipt&event=${SPRING.key}`,
    );
  });
});

// Acceptance AC-6 and AC-17.
describe('player pre-registration', () => {
  afterEach(() => vi.restoreAllMocks());

  it('preselects the only way to pay upkeep, and says when a number is lowered', async () => {
    const SPRING = { key: '2099-04-18-spring-market', name: 'Spring Market', date: '2099-04-18' };
    vi.spyOn(api, 'registrations').mockResolvedValue({ items: [] });
    renderApp(`/events/${SPRING.key}/register/${tom().id}`, {
      characters: [tom()],
      events: [SPRING],
    });
    const radio = await screen.findByRole('radio', { name: 'Pay 1 Silver at the desk' });
    expect(radio).toBeChecked();
    expect(screen.queryByText(/Choose how upkeep is paid/)).toBeNull();
    const xp = screen.getByRole('spinbutton', { name: /^1 XP \(/ });
    fireEvent.change(xp, { target: { value: '11' } });
    expect(xp).toHaveValue(10);
    expect(screen.getByText('At most 10; lowered to 10.')).toBeInTheDocument();
  });

  it('is closed for an event that is over', async () => {
    const OLD = { key: '2020-04-18-old-fair', name: 'Old Fair', date: '2020-04-18' };
    vi.spyOn(api, 'registrations').mockResolvedValue({ items: [] });
    renderApp(`/events/${OLD.key}/register/${tom().id}`, { characters: [tom()], events: [OLD] });
    expect(
      await screen.findByText('This event is over. Pre-registration is closed.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pre-register|Save/ })).toBeNull();
  });
});
