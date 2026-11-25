import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset } from '../../../../engine/index.ts';
import type { Settings, StoredCharacter } from '../../../../engine/model.ts';
import { BASE_CHARACTER, harness } from '../../../../engine/testkit.ts';
import { renderApp } from '../../../test/renderApp.tsx';
import { ash } from '../../../test/veteran.ts';
import {
  carryRows,
  existingCharacterCommands,
  lowStartWarning,
  samePlayerCharacters,
} from './retireModel.ts';

const rs = loadRuleset();
const STAFF: Settings = { mode: 'staff', theme: 'system' };

/** A second character of Ash's player, Robin Vale. */
function fern(): StoredCharacter {
  const h = harness();
  h.run({ ...BASE_CHARACTER, characterName: 'Fern Vale', playerName: 'Robin Vale' });
  const at = '2026-05-16T12:00:00.000Z';
  return {
    id: 'char-fern',
    schemaVersion: 1,
    rulesetId: rs.id,
    createdAt: at,
    updatedAt: at,
    actions: h.actions,
  };
}

describe('retirement model', () => {
  it('shows the carry-over with its working and the Q-RET-2 warning', () => {
    const sheet = deriveSheet(rs, ash().actions);
    const carry = { xp: 10, cxp: 2, axp: 1, coinCopper: 0 };
    const rows = carryRows(rs, sheet, carry, 200);
    expect(rows.map((r) => r.label)).toEqual(['XP', 'CXP', 'AXP', 'Coin']);
    expect(rows[0]?.how).toBe(`25% of ${sheet.points.xp.earned} XP earned minus 150, rounded down`);
    expect(lowStartWarning(rs, carry)).toMatch(/starts with 10 XP, below the 150 XP/);
    expect(lowStartWarning(rs, { ...carry, xp: 150 })).toBeNull();
  });

  it('finds the same player characters and gives them awards of kind retirement', () => {
    const sheet = deriveSheet(rs, ash().actions);
    const found = samePlayerCharacters(rs, { id: ash().id, sheet }, [ash(), fern()]);
    expect(found.map((c) => c.name)).toEqual(['Fern Vale']);
    expect(existingCharacterCommands({ xp: 20, cxp: 0, axp: 1, coinCopper: 75 }, 'Ash')).toEqual([
      expect.objectContaining({
        type: 'awardPoints',
        currency: 'xp',
        amount: 20,
        kind: 'retirement',
      }),
      expect.objectContaining({
        type: 'awardPoints',
        currency: 'axp',
        amount: 1,
        kind: 'retirement',
      }),
      expect.objectContaining({
        type: 'addOwed',
        text: '75 Copper, retirement carry-over from Ash',
      }),
    ]);
  });
});

describe('retirement screen', () => {
  it('players see the staff-only notice', async () => {
    renderApp(`/c/${ash().id}/retire`, { characters: [ash()] });
    expect(await screen.findByText('This page is for staff.')).toBeInTheDocument();
  });

  it('staff retire with a reason, then give the carry-over to the same player character', async () => {
    const { repository } = renderApp(`/c/${ash().id}/more`, {
      characters: [ash(), fern()],
      settings: STAFF,
    });
    fireEvent.click(await screen.findByRole('link', { name: 'Retirement' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retire Ash Merrow' }));
    const dialog = await screen.findByRole('dialog', { name: 'Retire Ash Merrow?' });
    fireEvent.change(within(dialog).getByLabelText(/Market value/), { target: { value: '600' } });
    const sheet = deriveSheet(rs, ash().actions);
    // hand-derived: floor((earned - 150) x 0.25); coin floor(600 x 0.25) - 50 = 100
    const xp = Math.floor((sheet.points.xp.earned - 150) * 0.25);
    expect(dialog).toHaveTextContent(`${xp} XP.`);
    expect(dialog).toHaveTextContent('100 Copper.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retire Ash Merrow' }));
    expect(await within(dialog).findByText('Enter a reason for the retirement.')).toBeVisible();
    fireEvent.change(within(dialog).getByLabelText(/Reason/), {
      target: { value: 'Settles in the hills' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retire Ash Merrow' }));
    expect(await screen.findByRole('heading', { name: 'Carry-over' })).toBeInTheDocument();
    expect(screen.getAllByText('Retired').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Build from the carry-over' })).toHaveAttribute(
      'href',
      `#/new?retire=${ash().id}`,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Give to Fern Vale' }));
    const give = await screen.findByRole('dialog', { name: 'Give the carry-over to Fern Vale?' });
    fireEvent.click(within(give).getByRole('button', { name: 'Give to Fern Vale' }));
    expect(await screen.findByText(/Given to/)).toBeInTheDocument();
    await waitFor(() => {
      const after = repository.data.characters.get('char-fern');
      expect(
        after && deriveSheet(rs, after.actions).ledger.filter((r) => r.kind === 'retirement'),
      ).toHaveLength(3);
    });
    const fernSheet = deriveSheet(rs, repository.data.characters.get('char-fern')?.actions ?? []);
    expect(fernSheet.owed.map((o) => o.text)).toEqual([
      '100 Copper, retirement carry-over from Ash Merrow',
    ]);
    const ashAfter = deriveSheet(rs, repository.data.characters.get(ash().id)?.actions ?? []);
    expect(ashAfter.retired?.assignedTo).toMatchObject({
      characterName: 'Fern Vale',
      kind: 'existing',
    });
  });
});
