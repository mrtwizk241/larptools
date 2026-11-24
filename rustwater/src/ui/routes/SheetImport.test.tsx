// Roster "Upload character sheet" with an .xlsx (stretch goal S-1): preview, warnings, create.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Settings } from '../../engine/model.ts';
import { buildXlsx, sheetTabs } from '../../xlsx-import/testWorkbook.ts';
import { renderApp } from '../test/renderApp.tsx';

const STAFF: Settings = { mode: 'staff', theme: 'system' };
const PLAYER: Settings = { mode: 'player', theme: 'system' };
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** An invented Wasteland Human: 250 starting CXP, one event, Bash 3 and a typo'd Assault. */
function workbook(): File {
  const bytes = buildXlsx(
    sheetTabs({
      'PlayerCharacter Info': {
        B1: 'Invented Player Q',
        B2: 'player.q@example.org',
        B3: 'Quill Ashdown',
        B4: 'Wasteland Human',
        D2: 3,
      },
      'Points EarnedSpent': {
        A6: 250,
        B6: 'Starting character',
        C6: 45360,
        A7: 75,
        B7: 'Event 1',
        C7: 45360,
      },
      'Standard Skills': { A6: 'Bash', F6: 3, A7: 'Asault', F7: 1 },
    }),
  );
  return new File([bytes], 'Quill Ashdown.xlsx', { type: XLSX_TYPE });
}

function xlsxInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"][accept*=".xlsx"]');
  if (!input) throw new Error('No .xlsx file input');
  return input;
}

describe('Import from Google Sheet', () => {
  it('is offered to staff only', async () => {
    renderApp('/', { settings: PLAYER });
    await screen.findByText(/No approved characters yet/);
    expect(screen.queryByRole('button', { name: 'Upload character sheet' })).toBeNull();
  });

  it('previews the character with its warnings, then creates it and opens the overview', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp('/', { settings: STAFF });
    await screen.findByRole('button', { name: 'Upload character sheet' });

    await user.upload(xlsxInput(), workbook());
    const dialog = await screen.findByRole('dialog', { name: 'Import from Google Sheet' });
    const facts = within(dialog);
    expect(facts.getByText('Quill Ashdown')).toBeInTheDocument();
    expect(facts.getByText('Invented Player Q')).toBeInTheDocument();
    expect(facts.getByText('player.q@example.org')).toBeInTheDocument();
    expect(facts.getByText('Human, Wastelander')).toBeInTheDocument();
    expect(facts.getByText('325')).toBeInTheDocument();
    expect(facts.getByText('2 skills')).toBeInTheDocument();
    expect(facts.getByText('0 spells')).toBeInTheDocument();
    expect(facts.getByRole('heading', { name: '1 warning' })).toBeInTheDocument();
    expect(
      facts.getByText('Standard Skills A7: "Asault" was read as "Assault".'),
    ).toBeInTheDocument();

    await user.click(facts.getByRole('button', { name: 'Create character' }));
    await screen.findByRole('heading', { level: 1, name: 'Quill Ashdown' });
    await waitFor(() => expect(repository.data.characters.size).toBe(1));
    const saved = [...repository.data.characters.values()][0];
    expect(saved?.actions[0]?.type).toBe('character.created');
    expect(saved?.actions[0]?.payload).toMatchObject({
      playerName: 'Invented Player Q',
      playerEmail: 'player.q@example.org',
    });
  });

  it('cancel saves nothing', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp('/', { settings: STAFF });
    await screen.findByRole('button', { name: 'Upload character sheet' });
    await user.upload(xlsxInput(), workbook());
    const dialog = await screen.findByRole('dialog', { name: 'Import from Google Sheet' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(repository.data.characters.size).toBe(0);
  });

  it('explains why a workbook cannot be imported', async () => {
    const user = userEvent.setup();
    renderApp('/', { settings: STAFF });
    await screen.findByRole('button', { name: 'Upload character sheet' });
    const other = new File([buildXlsx({ Budget: { A1: 'Rent' } })], 'budget.xlsx', {
      type: XLSX_TYPE,
    });
    await user.upload(xlsxInput(), other);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This file could not be imported.');
    expect(alert).toHaveTextContent(
      'This does not look like the Rustwater character sheet: the workbook has no',
    );
  });
});
