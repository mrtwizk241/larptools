import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Action, Settings, StoredCharacter } from '../../../engine/model.ts';
import { buildBackupFile, serializeFile } from '../../../io/index.ts';
import { fileFrom, mira, tom } from '../../test/fixtures.ts';
import { renderApp } from '../../test/renderApp.tsx';

const STAFF: Settings = { mode: 'staff', theme: 'system' };

/** `count` staff CXP awards appended to `character`, the first one with a note. */
function withAwards(character: StoredCharacter, count: number, from = 1): StoredCharacter {
  const actions: Action[] = [...character.actions];
  for (let i = 0; i < count; i++) {
    actions.push({
      id: `${character.id}-award-${from + i}`,
      seq: actions.length + 1,
      at: '2026-10-11T10:00:00.000Z',
      actor: { role: 'staff', name: 'Desk' },
      type: 'points.awarded',
      payload: { currency: 'cxp', amount: from + i, kind: 'staff' },
      ...(i === 0 ? { note: 'Backfill.' } : {}),
    });
  }
  return { ...character, actions };
}

async function pickBackup(characters: StoredCharacter[]): Promise<void> {
  const user = userEvent.setup();
  await screen.findByRole('button', { name: 'Restore from backup' });
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('No file input');
  const file = buildBackupFile({ characters, events: [] });
  await user.upload(input, fileFrom(serializeFile(file), 'backup.rwbak.json'));
}

describe('Restore from backup', () => {
  it('lists the actions the backup adds to each character it would replace, at most 20', async () => {
    // Mira: the backup extends the local log by 25 awards (updated without asking).
    // Tom: the logs diverge after the first action (replaced only when ticked).
    const localTom = withAwards(tom(), 1, 100);
    renderApp('/settings', { characters: [mira(), localTom], settings: STAFF });
    await pickBackup([withAwards(mira(), 25), withAwards(tom(), 2, 200)]);

    const dialog = await screen.findByRole('dialog', { name: 'Restore from backup?' });
    const updates = within(dialog).getByRole('region', { name: 'Updates' });
    expect(updates).toHaveTextContent('The backup adds to Mira Voss 25 entries:');
    const miraItems = within(updates).getAllByRole('listitem');
    expect(miraItems).toHaveLength(20);
    expect(miraItems[0]).toHaveTextContent('Award');
    expect(miraItems[0]).toHaveTextContent('1 CXP');
    expect(miraItems[0]).toHaveTextContent('Staff: Desk');
    expect(miraItems[0]).toHaveTextContent('Note: Backfill.');
    expect(updates).toHaveTextContent('and 5 more.');

    const conflicts = within(dialog).getByRole('group', { name: 'Conflicts' });
    expect(conflicts).toHaveTextContent('Replacing Old Tom adds 2 entries:');
    const tomItems = within(conflicts).getAllByRole('listitem');
    expect(tomItems).toHaveLength(2);
    expect(tomItems[0]).toHaveTextContent('200 CXP');
    expect(conflicts).not.toHaveTextContent('100 CXP');
    expect(conflicts).not.toHaveTextContent('more.');
  });

  it('lists nothing extra when no character would be replaced', async () => {
    renderApp('/settings', { characters: [mira()], settings: STAFF });
    await pickBackup([mira(), tom()]);
    const dialog = await screen.findByRole('dialog', { name: 'Restore from backup?' });
    expect(dialog).toHaveTextContent('New: 1');
    expect(within(dialog).queryByRole('region', { name: 'Updates' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('group', { name: 'Conflicts' })).not.toBeInTheDocument();
  });
});
