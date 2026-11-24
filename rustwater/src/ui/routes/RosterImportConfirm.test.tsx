// Audit S-01: a character file that appends actions to a staff copy is shown before saving.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset, plan, type Command } from '../../engine/index.ts';
import type { Settings, StoredCharacter } from '../../engine/model.ts';
import { buildCharacterFile, serializeFile } from '../../io/index.ts';
import { fileFrom, mira } from '../test/fixtures.ts';
import { renderApp } from '../test/renderApp.tsx';

const STAFF: Settings = { mode: 'staff', theme: 'system' };

/** Mira with actions appended by someone holding the file (here a "player" naming themselves staff). */
function miraWith(commands: readonly Command[]): StoredCharacter {
  const ruleset = loadRuleset();
  const character = mira();
  const actions = [...character.actions];
  let n = 0;
  for (const command of commands) {
    const result = plan(ruleset, deriveSheet(ruleset, actions), command, {
      actor: { role: 'staff', name: 'Totally Staff' },
      now: () => '2026-10-10T21:00:00.000Z',
      newId: () => `extra-${++n}`,
      nextSeq: actions.length + 1,
    });
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' '));
    actions.push(...result.actions);
  }
  return { ...character, actions };
}

function fileOf(character: StoredCharacter): File {
  const file = buildCharacterFile(character, { appVersion: '0.1.0' });
  return fileFrom(serializeFile(file), 'Mira-Voss.rwchar.json');
}

function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('No file input');
  return input;
}

const EXTRA: Command[] = [
  { type: 'awardPoints', currency: 'cxp', amount: 50, kind: 'staff', note: 'For being great.' },
  { type: 'learnSkill', skillId: 'assault', part: 'basic', teacher: 'Myself' },
];

describe('character import with added entries', () => {
  it('staff see every added entry and can cancel', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp('/', { characters: [mira()], settings: STAFF });
    await screen.findByRole('link', { name: /Mira Voss/ });

    await user.upload(fileInput(), fileOf(miraWith(EXTRA)));
    const dialog = await screen.findByRole('dialog', { name: 'Update Mira Voss?' });
    expect(dialog).toHaveTextContent('This file adds 2 entries:');
    const items = within(dialog).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Awarded 50 CXP');
    expect(items[0]).toHaveTextContent('Staff: Totally Staff');
    expect(items[0]).toHaveTextContent('Note: For being great.');
    expect(items[1]).toHaveTextContent('Learned Assault level 1 from Myself (10 CXP).');

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(repository.data.characters.get(mira().id)?.actions).toHaveLength(1);
  });

  it('staff import saves after confirming', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp('/', { characters: [mira()], settings: STAFF });
    await screen.findByRole('link', { name: /Mira Voss/ });
    await user.upload(fileInput(), fileOf(miraWith(EXTRA)));
    const dialog = await screen.findByRole('dialog', { name: 'Update Mira Voss?' });
    await user.click(within(dialog).getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(repository.data.characters.get(mira().id)?.actions).toHaveLength(3));
    expect(await screen.findByText('Updated Mira Voss with 2 new entries.')).toBeInTheDocument();
  });
});
