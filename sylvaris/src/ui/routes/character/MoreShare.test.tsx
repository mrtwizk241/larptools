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

describe('More: share and requests', () => {
  it('staff share the character file, with the note for the player', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${mira().id}/more`, { characters: [mira()], settings: STAFF });
    expect(
      await screen.findByText(
        'Give this file to the player. A newer file from you replaces their copy.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Learning requests' })).toHaveAttribute(
      'href',
      '#/requests',
    );

    await user.click(screen.getByRole('button', { name: 'Share character file' }));
    await waitFor(() => expect(saveTextFile).toHaveBeenCalledTimes(1));
    const [text, name, title] = vi.mocked(saveTextFile).mock.calls[0] ?? [];
    expect(name).toBe('Mira-Voss.sychar.json');
    expect(title).toBe('Mira Voss');
    const parsed = parseCharacterFile(text ?? '');
    expect(parsed.ok && parsed.value.character.actions).toEqual(mira().actions);
    expect(await screen.findByText('Saved the character file for Mira Voss.')).toBeInTheDocument();
  });

  it('players can share too, without the staff note', async () => {
    renderApp(`/c/${mira().id}/more`, { characters: [mira()] });
    expect(await screen.findByRole('button', { name: 'Share character file' })).toBeVisible();
    expect(screen.queryByText(/Give this file to the player/)).not.toBeInTheDocument();
  });
});
