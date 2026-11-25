import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Settings } from '../../engine/model.ts';
import { renderApp } from '../test/renderApp.tsx';
import { fileFrom, mira, miraText, miraWithNote, tom } from '../test/fixtures.ts';

const STAFF: Settings = { mode: 'staff', theme: 'system' };

function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('No file input');
  return input;
}

function rowNames(): string[] {
  return screen
    .queryAllByRole('listitem')
    .map((item) => within(item).getByRole('link').textContent ?? '');
}

describe('Roster', () => {
  it('shows a player the empty state with Create a new character, and no upload', async () => {
    renderApp('/');
    expect(await screen.findByText(/No approved characters yet/)).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'My characters' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a new character' })).toHaveAttribute(
      'href',
      '#/new',
    );
    expect(screen.queryByRole('button', { name: 'Upload character sheet' })).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('lists characters as links and filters by character or player name', async () => {
    const user = userEvent.setup();
    renderApp('/', { characters: [mira(), tom()], settings: STAFF });

    const miraLink = await screen.findByRole('link', { name: /Mira Voss/ });
    expect(miraLink).toHaveAttribute('href', `#/c/${mira().id}`);
    expect(miraLink).toHaveTextContent('Player: Sam Hollis');
    expect(miraLink).toHaveTextContent('Elf');
    // The roster row: XP left to spend and events attended, from the engine's summarize().
    expect(miraLink).toHaveTextContent('XP 85 available, 0 events');
    expect(miraLink).not.toHaveTextContent('Calling:');
    const tomLink = screen.getByRole('link', { name: /Old Tom/ });
    expect(tomLink).toHaveTextContent('Dwarf');
    expect(tomLink).toHaveTextContent('XP 135 available, 1 event');
    expect(screen.getByRole('link', { name: 'New character' })).toHaveAttribute('href', '#/new');
    expect(screen.getByRole('button', { name: 'Upload character sheet' })).toBeInTheDocument();
    expect(fileInput()).toHaveAttribute('accept', expect.stringContaining('.json'));

    const search = screen.getByRole('searchbox', { name: 'Search' });
    await user.type(search, 'priya');
    expect(rowNames()).toHaveLength(1);
    expect(rowNames()[0]).toContain('Old Tom');

    await user.clear(search);
    await user.type(search, 'MIRA');
    expect(rowNames()).toHaveLength(1);
    expect(rowNames()[0]).toContain('Mira Voss');

    await user.clear(search);
    await user.type(search, 'nobody');
    expect(rowNames()).toHaveLength(0);
    expect(screen.getByText(/No characters match/)).toHaveTextContent('nobody');
  });

  it('hides delete in player mode', async () => {
    renderApp('/', { characters: [mira()] });
    await screen.findByRole('link', { name: /Mira Voss/ });
    expect(screen.queryByRole('button', { name: 'Delete Mira Voss' })).not.toBeInTheDocument();
  });

  it('deletes after confirmation and Undo restores the character, tracker, and requests', async () => {
    const user = userEvent.setup();
    const original = mira();
    const { repository } = renderApp('/', { characters: [original, tom()], settings: STAFF });
    const tracker = {
      characterId: original.id,
      perEncounter: { stun: 1 },
      perRepop: {},
      updatedAt: '2026-10-05T10:00:00.000Z',
    };
    const request = {
      id: 'req-1',
      characterId: original.id,
      createdAt: '2026-10-05T10:00:00.000Z',
      kind: 'learn-skill' as const,
      skillId: 'toughness',
      step: { level: 3 },
      teacher: 'Old Tom',
      note: '',
      status: 'draft' as const,
    };
    repository.data.trackers.set(original.id, tracker);
    repository.data.requests.set(request.id, request);

    await user.click(await screen.findByRole('button', { name: 'Delete Mira Voss' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete Mira Voss?' });
    expect(dialog).toHaveTextContent(
      'This removes the character and its log from this device. Export it first if unsure.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(rowNames()).toHaveLength(1));
    expect(repository.data.characters.has(original.id)).toBe(false);
    expect(repository.data.trackers.has(original.id)).toBe(false);
    expect(repository.data.requests.size).toBe(0);
    expect(screen.getByText('Deleted Mira Voss.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await screen.findByRole('link', { name: /Mira Voss/ });
    const restored = repository.data.characters.get(original.id);
    // Storage stamps updatedAt on every save; everything else comes back as it was.
    expect({ ...restored, updatedAt: original.updatedAt }).toEqual(original);
    expect(repository.data.trackers.get(original.id)?.perEncounter).toEqual(tracker.perEncounter);
    expect(repository.data.requests.get('req-1')).toEqual(request);
  });

  it('cancelling the delete dialog keeps the character', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp('/', { characters: [mira()], settings: STAFF });
    await user.click(await screen.findByRole('button', { name: 'Delete Mira Voss' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(repository.data.characters.size).toBe(1);
  });

  it('imports a new character from a file', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp('/', { settings: STAFF });
    await screen.findByRole('button', { name: 'Upload character sheet' });

    await user.upload(fileInput(), fileFrom(miraText, 'sample-mira.sychar.json'));

    expect(await screen.findByRole('link', { name: /Mira Voss/ })).toBeInTheDocument();
    expect(screen.getByText('Imported Mira Voss.')).toBeInTheDocument();
    expect(repository.data.characters.get(mira().id)?.actions).toEqual(mira().actions);
  });

  it('asks before replacing a newer local copy, and replaces on confirm', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp('/', { characters: [miraWithNote()], settings: STAFF });
    await screen.findByRole('link', { name: /Mira Voss/ });

    await user.upload(fileInput(), fileFrom(miraText, 'sample-mira.sychar.json'));
    const dialog = await screen.findByRole('dialog', { name: 'Replace Mira Voss?' });
    expect(dialog).toHaveTextContent('This device has a newer copy of Mira Voss');

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(repository.data.characters.get(mira().id)?.actions).toHaveLength(
      miraWithNote().actions.length,
    );

    await user.upload(fileInput(), fileFrom(miraText, 'sample-mira.sychar.json'));
    const again = await screen.findByRole('dialog', { name: 'Replace Mira Voss?' });
    await user.click(within(again).getByRole('button', { name: 'Replace' }));
    await waitFor(() =>
      expect(repository.data.characters.get(mira().id)?.actions).toHaveLength(
        mira().actions.length,
      ),
    );
  });

  it('says when the file is already up to date', async () => {
    const user = userEvent.setup();
    renderApp('/', { characters: [mira()], settings: STAFF });
    await screen.findByRole('link', { name: /Mira Voss/ });
    await user.upload(fileInput(), fileFrom(miraText, 'sample-mira.sychar.json'));
    expect(await screen.findByText('Mira Voss is already up to date.')).toBeInTheDocument();
  });

  it('shows parse errors in plain English', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp('/', { settings: STAFF });
    await screen.findByRole('button', { name: 'Upload character sheet' });

    await user.upload(fileInput(), fileFrom('not json', 'broken.json'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This file could not be imported.');
    expect(alert).toHaveTextContent('The file is not valid JSON.');
    expect(repository.data.characters.size).toBe(0);

    const backup = JSON.stringify({ format: 'sylvaris-backup', formatVersion: 1 });
    await user.upload(fileInput(), fileFrom(backup, 'backup.json'));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'This is a Sylvaris backup file, not a character file.',
      ),
    );
  });
});
