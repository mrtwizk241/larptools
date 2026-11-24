import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Settings } from '../../../engine/model.ts';
import { parseCharacterFile } from '../../../io/index.ts';
import { saveTextFile } from '../../data/saveFile.ts';
import { mira } from '../../test/fixtures.ts';
import { renderApp } from '../../test/renderApp.tsx';

vi.mock('../../data/saveFile.ts', () => ({
  saveTextFile: vi.fn(() => Promise.resolve('downloaded')),
}));

const STAFF: Settings = { mode: 'staff', theme: 'system' };

describe('Share', () => {
  it('staff share the character file, with the note for the player', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${mira().id}/share`, { characters: [mira()], settings: STAFF });
    expect(
      await screen.findByText(
        'Give this file to the player. A newer file from you replaces their copy.',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Share character file' }));
    await waitFor(() => expect(saveTextFile).toHaveBeenCalledTimes(1));
    const [text, name, title] = vi.mocked(saveTextFile).mock.calls[0] ?? [];
    expect(name).toBe('Mira-Voss.rwchar.json');
    expect(title).toBe('Mira Voss');
    const parsed = parseCharacterFile(text ?? '');
    expect(parsed.ok && parsed.value.character.actions).toEqual(mira().actions);
    expect(await screen.findByText('Saved the character file for Mira Voss.')).toBeInTheDocument();
  });

  it('players can share too, without the staff note', async () => {
    renderApp(`/c/${mira().id}/share`, { characters: [mira()] });
    expect(await screen.findByRole('button', { name: 'Share character file' })).toBeVisible();
    expect(screen.queryByText(/Give this file to the player/)).not.toBeInTheDocument();
  });
});

describe('the old More address', () => {
  it('opens the Sheet', async () => {
    renderApp(`/c/${mira().id}/more`, { characters: [mira()] });
    expect(await screen.findByRole('region', { name: 'Infection' })).toBeInTheDocument();
    expect(window.location.hash).toBe(`#/c/${mira().id}`);
  });
});
