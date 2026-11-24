import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Settings } from '../../../../engine/model.ts';
import { renderApp } from '../../../test/renderApp.tsx';
import { ash, ashAfter } from '../../../test/veteran.ts';

const STAFF: Settings = { mode: 'staff', theme: 'system' };

describe('familiar', () => {
  it('bonds, awakens, levels, learns, and forgets', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${ash().id}/extras`, { characters: [ash()], settings: STAFF });
    const card = await screen.findByRole('region', { name: 'Familiar' });
    expect(card).toHaveTextContent('No familiar bonded.');

    await user.click(within(card).getByRole('button', { name: 'Bond a familiar' }));
    let dialog = screen.getByRole('dialog', { name: 'Bond a familiar' });
    await user.click(within(dialog).getByRole('button', { name: 'Bond' }));
    expect(within(dialog).getByText("Enter the familiar's name.")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/^Name/), 'Pip');
    await user.type(within(dialog).getByLabelText(/^Creature/), 'raven');
    await user.click(within(dialog).getByRole('button', { name: 'Bond' }));
    expect(await screen.findByText('Bonded with Pip.')).toBeVisible();
    expect(card).toHaveTextContent('Pip, raven');

    await user.click(within(card).getByRole('button', { name: 'Awaken' }));
    dialog = screen.getByRole('dialog', { name: 'Awaken Pip' });
    await user.click(within(dialog).getByRole('button', { name: 'Awaken (5 FP)' }));
    expect(within(dialog).getByText('Choose the awakened skill.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: 'Vanish' }));
    await user.click(within(dialog).getByRole('button', { name: 'Awaken (5 FP)' }));
    expect(await screen.findByText('Pip is awakened.')).toBeVisible();
    expect(card).toHaveTextContent('Awakened skill: Vanish');

    expect(within(card).getByText('Next level: 3 FP')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Raise Pip' }));
    expect(await screen.findByText('Pip is now level 3.')).toBeVisible();
    // Level 3: 1 + 2 + 3 = 6 Essence.
    await waitFor(() => expect(card).toHaveTextContent('6 available of 6 (0 spent)'));

    await user.click(within(card).getByRole('button', { name: 'Learn a skill' }));
    dialog = screen.getByRole('dialog', { name: 'Learn a skill' });
    for (const tier of ['5 Essence', '10 Essence', '15 Essence'])
      expect(within(dialog).getByRole('group', { name: tier })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: 'Grant Feint' }));
    await user.click(within(dialog).getByRole('button', { name: 'Learn skill' }));
    expect(await screen.findByText('Pip learned Grant Feint.')).toBeVisible();
    await waitFor(() => expect(card).toHaveTextContent('1 available of 6 (5 spent)'));
    expect(card).toHaveTextContent('1 of 4 used');

    await user.click(within(card).getByRole('button', { name: 'Forget Grant Feint' }));
    dialog = screen.getByRole('dialog', { name: 'Forget Grant Feint?' });
    expect(dialog).toHaveTextContent('Forgetting costs 1 FP');
    await user.click(within(dialog).getByRole('button', { name: 'Forget skill' }));
    expect(await screen.findByText('Pip forgot Grant Feint.')).toBeVisible();
    expect(card).toHaveTextContent('No skills learned.');
  });

  it('asks for the choice on skills that need one, and refuses what costs too much', async () => {
    const user = userEvent.setup();
    const character = ashAfter([
      { type: 'bondFamiliar', name: 'Pip' },
      { type: 'awakenFamiliar', awakenedSkillId: 'push' },
    ]);
    renderApp(`/c/${character.id}/extras`, { characters: [character], settings: STAFF });
    const card = await screen.findByRole('region', { name: 'Familiar' });
    await user.click(within(card).getByRole('button', { name: 'Learn a skill' }));
    const dialog = screen.getByRole('dialog', { name: 'Learn a skill' });
    await user.click(within(dialog).getByRole('radio', { name: 'Craft Unstable Basic Item' }));
    await user.click(within(dialog).getByRole('button', { name: 'Learn skill' }));
    expect(
      within(dialog).getByText('Enter the recipe for Craft Unstable Basic Item.'),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/^Recipe for/), 'Fire Bomb');
    await user.click(within(dialog).getByRole('button', { name: 'Learn skill' }));
    expect(
      await within(dialog).findByText('Not enough Essence: needs 5, 3 left.'),
    ).toBeInTheDocument();
    // Unlocking a slot is blocked with the engine's reason in visible text.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(within(card).getByRole('button', { name: /Unlock a slot/ })).toBeDisabled();
    expect(card).toHaveTextContent('Not enough Essence: needs 5, 3 left.');
  });

  it('breaks the bond behind a confirm that explains the reset', async () => {
    const user = userEvent.setup();
    const character = ashAfter([{ type: 'bondFamiliar', name: 'Pip' }]);
    renderApp(`/c/${character.id}/extras`, { characters: [character], settings: STAFF });
    const card = await screen.findByRole('region', { name: 'Familiar' });
    await user.click(within(card).getByRole('button', { name: 'Break the bond' }));
    const dialog = screen.getByRole('dialog', { name: 'Break the bond with Pip?' });
    expect(dialog).toHaveTextContent('FP already spent on Pip is lost');
    await user.click(within(dialog).getByRole('button', { name: 'Break the bond' }));
    expect(await screen.findByText('The bond with Pip is broken.')).toBeVisible();
    expect(card).toHaveTextContent('No familiar bonded.');
  });
});

describe('boons', () => {
  it('adds boons up to 3, then blocks a fourth; removes one', async () => {
    const user = userEvent.setup();
    const character = ashAfter([
      { type: 'addBoon', boonId: 'bionic-ears' },
      { type: 'addBoon', boonId: 'bionic-eyes' },
    ]);
    renderApp(`/c/${character.id}/extras`, { characters: [character], settings: STAFF });
    const card = await screen.findByRole('region', { name: 'Boons' });
    expect(card).toHaveTextContent('2 of 3 boon slots used.');
    await user.click(within(card).getByRole('button', { name: 'Add a boon' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a boon' });
    await user.click(within(dialog).getByRole('button', { name: 'Add boon' }));
    expect(within(dialog).getByText('Choose a boon.')).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText(/^Boon/), 'Tougher Stuff');
    expect(dialog).toHaveTextContent('Lasts until the end of the Event if never used');
    await user.click(within(dialog).getByRole('button', { name: 'Add boon' }));
    expect(await screen.findByText('Added Tougher Stuff.')).toBeVisible();
    expect(card).toHaveTextContent('3 of 3 boon slots used.');
    expect(within(card).getByRole('button', { name: 'Add a boon' })).toBeDisabled();
    expect(card).toHaveTextContent('All 3 boon slots are used; remove a boon first.');

    await user.click(within(card).getByRole('button', { name: 'Remove Bionic Ears' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Remove Bionic Ears?' })).getByRole('button', {
        name: 'Remove boon',
      }),
    );
    expect(await screen.findByText('Removed Bionic Ears.')).toBeVisible();
    expect(card).toHaveTextContent('2 of 3 boon slots used.');
  });
});

describe('owed rewards', () => {
  it('lists check-in rewards, marks one delivered, and adds a new one', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${ash().id}/extras`, { characters: [ash()], settings: STAFF });
    const card = await screen.findByRole('region', { name: 'Owed rewards' });
    const first = within(card).getAllByRole('button', { name: /^Mark delivered/ });
    expect(first.length).toBeGreaterThan(0);
    const before = first.length;
    await user.click(first[0]!);
    await waitFor(() =>
      expect(within(card).getAllByRole('button', { name: /^Mark delivered/ })).toHaveLength(
        before - 1,
      ),
    );
    expect(within(card).getAllByText('Delivered').length).toBe(1);

    await user.click(within(card).getByRole('button', { name: 'Add an owed item' }));
    const dialog = screen.getByRole('dialog', { name: 'Add an owed item' });
    await user.click(within(dialog).getByRole('button', { name: 'Add owed item' }));
    expect(within(dialog).getByText('Enter what is owed.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/^What is owed/), '2 uncommon resources');
    await user.click(within(dialog).getByRole('button', { name: 'Add owed item' }));
    expect(await screen.findByText('Owed: 2 uncommon resources')).toBeVisible();
    expect(card).toHaveTextContent('2 uncommon resourcesOwedAdded by staff, Harvest Moon');
  });
});

describe('player mode', () => {
  it('players may name and spend on their familiar and ask for a boon; the rest is read only', async () => {
    const character = ashAfter([
      { type: 'bondFamiliar', name: 'Pip', creature: 'raven' },
      { type: 'addBoon', boonId: 'bionic-ears' },
      { type: 'setStartingItems', picks: [{ optionId: 'bits' }] },
    ]);
    renderApp(`/c/${character.id}/extras`, { characters: [character] });
    const card = await screen.findByRole('region', { name: 'Familiar' });
    expect(card).toHaveTextContent('Pip, raven');
    expect(screen.getByRole('region', { name: 'Boons' })).toHaveTextContent('Bionic Ears');
    // Starting items stay on the character but are not listed here (I-11).
    expect(screen.queryByRole('region', { name: 'Starting items' })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button').map((b) => b.textContent)).toEqual([
      'Rename',
      'Awaken',
      'Submit a boon for approval',
    ]);
  });
});
