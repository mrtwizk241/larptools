import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset } from '../../../../engine/index.ts';
import type { Settings } from '../../../../engine/model.ts';
import { renderApp } from '../../../test/renderApp.tsx';
import { filterRows, memoryRows } from './memoryList.ts';
import { lark } from './testCharacter.ts';

const rs = loadRuleset();
const STAFF: Settings = { mode: 'staff', theme: 'system' };
const SPELLS = `/c/${lark().id}/spells`;

/** Staff: open a spell's row, tap Memorize, confirm in the picker. */
async function memorize(user: UserEvent, name: string) {
  const row = await screen.findByRole('button', { name: new RegExp(`^${name}`) });
  if (row.getAttribute('aria-expanded') !== 'true') await user.click(row);
  await user.click(screen.getByRole('button', { name: `Memorize ${name}` }));
  const dialog = screen.getByRole('dialog', { name: 'Memorize a spell' });
  expect(within(dialog).getByRole('radio', { name })).toBeChecked();
  await user.click(within(dialog).getByRole('button', { name: 'Memorize' }));
  expect(await screen.findByText(`Memorized ${name}.`)).toBeInTheDocument();
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
}

describe('spell rows', () => {
  const sheet = deriveSheet(rs, lark().actions);

  it('lists every spell but mastery magic abilities, with what memorizing still needs', () => {
    const rows = memoryRows(rs, sheet, 'spell');
    expect(rows).toHaveLength(60);
    expect(rows.some((r) => r.name.startsWith('Blood Magic'))).toBe(false);
    const lifeBolt = rows.find((r) => r.name === 'Life Bolt');
    expect(lifeBolt).toMatchObject({ group: 'life', memorized: false, unmet: [] });
    expect(filterRows(rows, { groups: ['life'], query: '', ownedOnly: false })).toHaveLength(15);
    expect(filterRows(rows, { groups: [], query: 'bolt', ownedOnly: false }).length).toBe(
      rows.filter((r) => r.name.toLowerCase().includes('bolt')).length,
    );
  });
});

describe('Spells screen', () => {
  it('shows the slots, chips, and every spell for staff', async () => {
    renderApp(SPELLS, { characters: [lark()], settings: STAFF });
    expect(await screen.findByRole('heading', { level: 2, name: 'Spells' })).toBeVisible();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Spells',
      'Performances',
      'Rituals',
    ]);
    const slots = screen.getByRole('region', { name: 'Spell slots' });
    expect(slots).toHaveTextContent('Life: 0 of 2 used');
    expect(slots).toHaveTextContent('2 from basic levels');
    expect(screen.getByRole('checkbox', { name: 'Memorized only' })).not.toBeChecked();
    expect(screen.getByText('60 spells')).toBeInTheDocument();
  });

  it('memorizes from a row, then buys a memorization level with a teacher', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(SPELLS, { characters: [lark()], settings: STAFF });
    await memorize(user, 'Life Bolt');
    await memorize(user, 'Health Spring');
    expect(screen.getByRole('region', { name: 'Spell slots' })).toHaveTextContent(
      'Life: 2 of 2 used',
    );
    await user.click(screen.getByRole('button', { name: /^Amplify Healing/ }));
    await user.click(screen.getByRole('button', { name: 'Memorize Amplify Healing' }));
    const dialog = screen.getByRole('dialog', { name: 'Memorize a spell' });
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Also buy a memorization level (1 AP)' }),
    );
    await user.type(within(dialog).getByLabelText(/Teacher/), 'Sister Moss');
    await user.click(within(dialog).getByRole('button', { name: 'Memorize' }));
    expect(await screen.findByText('Memorized Amplify Healing.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Spell slots' })).toHaveTextContent(
      'Universal: 1 of 1 used',
    );
    const types = repository.data.characters.get(lark().id)?.actions.map((a) => a.type) ?? [];
    expect(types.slice(-2)).toEqual(['skill.learned', 'memorized.added']);
  });

  it('forgets with a confirm that says nothing is refunded', async () => {
    const user = userEvent.setup();
    renderApp(SPELLS, { characters: [lark()], settings: STAFF });
    await memorize(user, 'Life Bolt');
    expect(screen.getByRole('button', { name: /^Life Bolt/ })).toHaveTextContent('Memorized');
    await user.click(screen.getByRole('button', { name: 'Forget Life Bolt' }));
    const confirm = screen.getByRole('dialog', { name: 'Forget Life Bolt?' });
    expect(confirm).toHaveTextContent('This frees its Life slot. No AP is refunded');
    await user.click(within(confirm).getByRole('button', { name: 'Forget' }));
    expect(await screen.findByText('Forgot Life Bolt.')).toBeInTheDocument();
  });

  it('players see memorized only by default and send a spell to staff with +', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(SPELLS, { characters: [lark()] });
    const owned = await screen.findByRole('checkbox', { name: 'Memorized only' });
    expect(owned).toBeChecked();
    expect(screen.getByText('No spells memorized yet.')).toBeInTheDocument();
    await user.click(owned);
    await user.click(screen.getByRole('button', { name: 'I learned Life Bolt' }));
    const dialog = screen.getByRole('dialog', { name: 'I learned Life Bolt' });
    expect(dialog).toHaveTextContent('If approved: it uses a free slot.');
    await user.type(within(dialog).getByLabelText(/Who taught you/), 'Sister Moss');
    await user.click(within(dialog).getByRole('button', { name: 'Send to staff' }));
    expect(await screen.findByText(/Sent Life Bolt to staff/)).toBeInTheDocument();
    const sent = [...repository.data.requests.values()];
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      kind: 'memorize',
      memoryKind: 'spell',
      refId: 'life-bolt',
      teacher: 'Sister Moss',
    });
    expect(screen.queryByRole('button', { name: /^Memorize / })).not.toBeInTheDocument();
  });

  it('locked tabs explain how to unlock', async () => {
    const user = userEvent.setup();
    renderApp(SPELLS, { characters: [lark()], settings: STAFF });
    await user.click(await screen.findByRole('tab', { name: 'Performances' }));
    expect(screen.getByText('Learn Bardic Performance to memorize performances.')).toBeVisible();
  });
});

describe('Recipes screen', () => {
  it('has recipes with craft chips and no Knowledges tab', async () => {
    renderApp(`/c/${lark().id}/recipes`, { characters: [lark()], settings: STAFF });
    expect(await screen.findByRole('heading', { level: 2, name: 'Recipes' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Mastery' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByText(/knowledge/i)).not.toBeInTheDocument();
  });

  it('the old memory link opens Spells', async () => {
    renderApp(`/c/${lark().id}/memory`, { characters: [lark()] });
    expect(await screen.findByRole('heading', { level: 2, name: 'Spells' })).toBeVisible();
  });
});
