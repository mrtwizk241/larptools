import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Settings } from '../../../../engine/model.ts';
import { renderApp } from '../../../test/renderApp.tsx';
import { ash } from '../../../test/veteran.ts';

const STAFF: Settings = { mode: 'staff', theme: 'system' };
const ASH = ash();

describe('Magic screen', () => {
  it('shows the spellbook to players, read-only', async () => {
    renderApp(`/c/${ASH.id}/journals`, { characters: [ASH] });
    expect(await screen.findByRole('heading', { level: 2, name: 'Magic' })).toBeVisible();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Spellbook',
      'Crafting Journal',
      'Performance Record',
      'Rituals',
    ]);
    const group = screen.getByRole('region', { name: 'Life Magic (2)' });
    expect(group).toHaveTextContent('Grant Life');
    expect(group).toHaveTextContent('Tagged');
    expect(group).toHaveTextContent('Pending tag');
    expect(group).toHaveTextContent('Taught by Sister Wren at Midsummer Fair (2026-06-20)');
    expect(group).toHaveTextContent('Can use now');
    expect(screen.queryByRole('button', { name: /Mark tagged/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a spell' })).not.toBeInTheDocument();
  });

  it('lets staff add a spell and mark it tagged', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${ASH.id}/journals`, { characters: [ASH], settings: STAFF });
    await user.click(await screen.findByRole('button', { name: 'Add a spell' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Add a spell' }));
    await user.type(dialog.getByRole('searchbox', { name: 'Search' }), 'grant');
    const option = dialog.getAllByRole('radio')[0];
    if (!option) throw new Error('no options');
    await user.click(option);
    await user.type(dialog.getByRole('textbox', { name: /Teacher/ }), 'Sister Wren');
    await user.click(dialog.getByRole('button', { name: 'Add spell' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const tagButtons = screen.getAllByRole('button', { name: /^Mark tagged: / });
    expect(tagButtons).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Mark tagged: Life Dart' }));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^Mark tagged/ })).toHaveLength(1),
    );
  });

  it('asks for a reason before removing', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${ASH.id}/journals`, { characters: [ASH], settings: STAFF });
    await user.click(await screen.findByRole('button', { name: 'Remove: Life Dart' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Remove Life Dart?' }));
    await user.click(dialog.getByRole('button', { name: 'Remove' }));
    expect(dialog.getByText('Give a reason.')).toBeVisible();
    await user.type(dialog.getByRole('textbox', { name: /Reason/ }), 'Copied in error.');
    await user.click(dialog.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByText('Life Dart')).not.toBeInTheDocument());
  });
});
