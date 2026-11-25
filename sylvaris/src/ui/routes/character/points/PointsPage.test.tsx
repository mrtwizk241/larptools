import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Settings } from '../../../../engine/model.ts';
import { ASH_LATEST_EVENT, ash, ashAfter } from '../../../test/veteran.ts';
import { mira } from '../../../test/fixtures.ts';
import { renderApp } from '../../../test/renderApp.tsx';

const STAFF: Settings = { mode: 'staff', theme: 'system' };

describe('points', () => {
  it('players see the staff-only notice', async () => {
    renderApp(`/c/${mira().id}/points`, { characters: [mira()] });
    expect(await screen.findByText('This page is for staff.')).toBeInTheDocument();
  });

  it('award: previews what the cap allows, needs an amount, then awards', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(`/c/${mira().id}/points`, {
      characters: [mira()],
      settings: STAFF,
    });
    const card = await screen.findByRole('region', { name: 'Award points' });
    expect(card).toHaveTextContent('Earned XP: 150 of the 2000 cap; 1850 more can be credited.');
    await user.click(within(card).getByRole('button', { name: 'Award points' }));
    expect(within(card).getByText('Enter a whole number of 1 or more.')).toBeInTheDocument();
    await user.type(within(card).getByLabelText(/Amount/), '1900');
    expect(card).toHaveTextContent('Credits 1850 XP. Not credited, earned cap reached: 50 XP.');
    await user.click(within(card).getByRole('button', { name: 'Award points' }));
    expect(await screen.findByText('Awarded 1850 XP.')).toBeInTheDocument();
    const last = repository.data.characters.get(mira().id)?.actions.at(-1);
    expect(last?.payload).toMatchObject({ amount: 1850, requested: 1900, kind: 'gm-award' });
  });

  it('award: kinds follow the currency', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${mira().id}/points`, { characters: [mira()], settings: STAFF });
    const card = await screen.findByRole('region', { name: 'Award points' });
    const kinds = () =>
      within(within(card).getByLabelText('Kind'))
        .getAllByRole('option')
        .map((o) => o.textContent);
    expect(kinds()).not.toContain('Donation');
    await user.selectOptions(within(card).getByLabelText('Currency'), 'mt');
    expect(kinds()).toContain('Donation');
    expect(kinds()).not.toContain('Bought with Mist Tokens');
  });

  it('Mist Tokens: price and cap left, blocks over the per-event cap, then buys', async () => {
    const user = userEvent.setup();
    const rich = ashAfter([
      { type: 'awardPoints', currency: 'mt', amount: 1000, kind: 'donation' },
    ]);
    const { repository } = renderApp(`/c/${ash().id}/points`, {
      characters: [rich],
      settings: STAFF,
    });
    const card = await screen.findByRole('region', { name: 'Spend Mist Tokens' });
    await user.selectOptions(within(card).getByLabelText('Event bought at'), ASH_LATEST_EVENT);
    const qty = within(card).getByLabelText(/Quantity/);
    await user.clear(qty);
    await user.type(qty, '11');
    expect(card).toHaveTextContent('Price: 550 Mist Tokens. 10 per event; 10 left for this event.');
    const buy = within(card).getByRole('button', { name: 'Spend Mist Tokens' });
    expect(buy).toHaveAttribute('aria-disabled', 'true');
    expect(within(card).getByRole('alert')).toHaveTextContent('at most 10 per event');
    const before = repository.data.characters.get(ash().id)?.actions.length ?? 0;
    await user.click(buy);
    expect(repository.data.characters.get(ash().id)?.actions).toHaveLength(before);
    await user.clear(qty);
    await user.type(qty, '4');
    await user.click(buy);
    expect(await screen.findByText('Spent 200 Mist Tokens on 1 XP.')).toBeInTheDocument();
    await waitFor(() => expect(card).toHaveTextContent('6 left for this event.'));
    const last = repository.data.characters.get(ash().id)?.actions.at(-1);
    expect(last?.type).toBe('mt.spent');
    expect(last?.eventKey).toBe(ASH_LATEST_EVENT);
  });

  it('Mist Tokens: a back-buy sends both events, and missed event XP explains its condition', async () => {
    const user = userEvent.setup();
    const rich = ashAfter([
      { type: 'awardPoints', currency: 'mt', amount: 1000, kind: 'donation' },
    ]);
    const { repository } = renderApp(`/c/${ash().id}/points`, {
      characters: [rich],
      settings: STAFF,
    });
    const card = await screen.findByRole('region', { name: 'Spend Mist Tokens' });
    await user.selectOptions(within(card).getByLabelText('Event bought at'), ASH_LATEST_EVENT);
    await user.selectOptions(
      within(card).getByLabelText('For an earlier event'),
      '2026-08-15-ember-night',
    );
    await user.click(within(card).getByRole('button', { name: 'Spend Mist Tokens' }));
    await screen.findByText('Spent 50 Mist Tokens on 1 XP.');
    const last = repository.data.characters.get(ash().id)?.actions.at(-1);
    expect(last?.eventKey).toBe(ASH_LATEST_EVENT);
    expect(last?.payload).toMatchObject({ forEventKey: '2026-08-15-ember-night' });

    await user.selectOptions(within(card).getByLabelText('Buy'), 'missed-event-xp');
    expect(card).toHaveTextContent('the player attended another event that calendar year');
    expect(within(card).getByLabelText(/Events the player attended that year/)).toBeInTheDocument();
    expect(within(card).getByLabelText('Event missed')).toBeInTheDocument();
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
    await user.selectOptions(within(card).getByLabelText('Type'), 'penalty');
    await user.type(within(card).getByLabelText(/Reason/), 'Second strike');
    await user.click(within(card).getByRole('button', { name: 'Adjust points' }));
    expect(await screen.findByText('Adjusted XP by -20.')).toBeInTheDocument();
    const last = repository.data.characters.get(mira().id)?.actions.at(-1);
    expect(last?.payload).toMatchObject({ amount: -20, kind: 'penalty', reason: 'Second strike' });
  });
});
