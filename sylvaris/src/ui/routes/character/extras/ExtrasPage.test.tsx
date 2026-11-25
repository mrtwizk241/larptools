import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Settings } from '../../../../engine/model.ts';
import { renderApp } from '../../../test/renderApp.tsx';
import { ash } from '../../../test/veteran.ts';

const STAFF: Settings = { mode: 'staff', theme: 'system' };

describe('Extras screen', () => {
  it('shows every record to players, read-only', async () => {
    const ASH = ash();
    renderApp(`/c/${ASH.id}/extras`, { characters: [ASH] });
    expect(await screen.findByRole('region', { name: 'Artifact' })).toHaveTextContent(
      'XP earned: 510 (needs 500).',
    );
    expect(screen.getByRole('region', { name: 'Familiarized places' })).toHaveTextContent(
      "Raven's Rest (local tavern)",
    );
    expect(screen.getByRole('region', { name: 'Starting items' })).toHaveTextContent(
      'Basic Weapon: Longsword',
    );
    expect(screen.getByRole('region', { name: 'Owed items' })).toHaveTextContent(
      'Basic Shield repair kit',
    );
    expect(screen.queryByRole('button', { name: /Awaken/ })).not.toBeInTheDocument();
  });

  it('lets staff awaken an Artifact and set a power', async () => {
    const user = userEvent.setup();
    const ASH = ash();
    renderApp(`/c/${ASH.id}/extras`, { characters: [ASH], settings: STAFF });
    await user.click(await screen.findByRole('button', { name: 'Awaken an Artifact (5 AXP)' }));
    const awaken = within(screen.getByRole('dialog', { name: 'Awaken an Artifact' }));
    await user.type(awaken.getByRole('textbox', { name: /Name/ }), 'Oath Ring');
    await user.click(awaken.getByRole('button', { name: 'Awaken' }));
    const card = await screen.findByRole('region', { name: 'Artifact' });
    await waitFor(() => expect(card).toHaveTextContent('Oath Ring'));
    await user.click(within(card).getByRole('button', { name: 'Set a power' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Set a power' }));
    const first = dialog.getAllByRole('radio')[0];
    if (!first) throw new Error('no powers');
    await user.click(first);
    const choice = dialog.queryByRole('combobox', { name: /Choose the/ });
    if (choice)
      await user.selectOptions(choice, (choice as HTMLSelectElement).options[1]?.value ?? '');
    const text = dialog.queryByRole('textbox', { name: /Name the/ });
    if (text) await user.type(text, 'Toughness');
    await user.click(dialog.getByRole('button', { name: 'Set power' }));
    await waitFor(() =>
      expect(within(card).getByRole('list', { name: 'Artifact powers' })).toBeVisible(),
    );
  });

  it('lets staff mark an owed item delivered', async () => {
    const user = userEvent.setup();
    const ASH = ash();
    renderApp(`/c/${ASH.id}/extras`, { characters: [ASH], settings: STAFF });
    await user.click(
      await screen.findByRole('button', { name: 'Mark delivered: Basic Shield repair kit' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Owed items' })).toHaveTextContent('Delivered'),
    );
  });
});
