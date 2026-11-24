// The Sheet screen redesign: Profile age, Infection traumas, Skills groups with points left,
// Passive Abilities, and Story Notes with staff-only hidden notes (I-7, I-8, I-9, I-14, I-15).
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../api/client.ts';
import type { CharacterMeta, HiddenNote, UserInfo } from '../../../api/contract.ts';
import { deriveSheet, loadRuleset } from '../../../engine/index.ts';
import type { Settings, StoredCharacter } from '../../../engine/model.ts';
import { characterMetaFor } from '../../../storage/remote.ts';
import { App } from '../../App.tsx';
import { createMemoryRepository } from '../../data/memoryRepository.ts';
import { mira } from '../../test/fixtures.ts';
import { TEST_PLAYER, TEST_STAFF, renderApp } from '../../test/renderApp.tsx';
import { ashAfter } from '../../test/veteran.ts';
import { printAsh } from './print/testCharacter.ts';
import { passiveAbilities, skillGroupViews } from './sheetSections.ts';

vi.mock('../../../api/client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/client.ts')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      hiddenNotes: vi.fn(),
      addHiddenNote: vi.fn(),
      editHiddenNote: vi.fn(),
      deleteHiddenNote: vi.fn(),
    },
  };
});

vi.mock('../../../storage/remote.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../storage/remote.ts')>();
  return { ...actual, characterMetaFor: vi.fn(actual.characterMetaFor) };
});

const rs = loadRuleset();
const STAFF: Settings = { mode: 'staff', theme: 'system' };

afterEach(() => {
  vi.mocked(api.hiddenNotes).mockReset();
  vi.mocked(api.addHiddenNote).mockReset();
  vi.mocked(api.editHiddenNote).mockReset();
  vi.mocked(api.deleteHiddenNote).mockReset();
  vi.mocked(characterMetaFor).mockReset();
});

/** Renders the app with a repository that says it has the server, as the real one does. */
function renderWithServer(route: string, character: StoredCharacter, user: UserInfo) {
  window.location.hash = `#${route}`;
  const repository = {
    ...createMemoryRepository({
      characters: [character],
      ...(user.role === 'player' ? {} : { settings: STAFF }),
    }),
    server: true,
  };
  render(<App repository={repository} user={user} />);
  return repository;
}

function hidden(characterId: string, id: string, text: string, createdAt: string): HiddenNote {
  return { id, characterId, text, author: 'Test Staff', createdAt, updatedAt: createdAt };
}

function region(name: string): HTMLElement {
  return screen.getByRole('region', { name });
}

/** The list item in `container` whose text contains `text`. */
function itemWith(container: HTMLElement, text: string): HTMLElement {
  const item = within(container)
    .getAllByRole('listitem')
    .find((li) => li.textContent?.includes(text));
  if (!item) throw new Error(`No list item with ${text}`);
  return item;
}

describe('Profile', () => {
  it('shows the age as a step of 10 with a hint, the ancestry, and no notes field', async () => {
    const user = userEvent.setup();
    const ash = ashAfter([{ type: 'updateProfile', age: 4 }]);
    renderApp(`/c/${ash.id}`, { characters: [ash], settings: STAFF });
    await screen.findByRole('heading', { level: 1, name: 'Ash Merrow' });
    const profile = region('Profile');
    expect(profile).toHaveTextContent('Age4 of 10');
    expect(within(profile).getByText('Each step is 10% of a full life.')).toBeVisible();
    const ancestry = deriveSheet(rs, ash.actions).ancestry;
    expect(profile).toHaveTextContent(`Ancestry${ancestry?.ancestryName ?? ''}`);
    expect(profile).not.toHaveTextContent('Notes');
    await user.click(within(profile).getByRole('button', { name: 'Edit profile' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit profile' });
    expect(within(dialog).getByLabelText(/Age/)).toHaveValue(4);
    expect(within(dialog).queryByLabelText('Notes')).not.toBeInTheDocument();
  });
});

describe('Infection and traumas', () => {
  it('staff add a trauma with an infection change, then edit and remove it', async () => {
    const user = userEvent.setup();
    const ash = printAsh();
    const { repository } = renderApp(`/c/${ash.id}`, { characters: [ash], settings: STAFF });
    await screen.findByRole('heading', { level: 1, name: 'Ash Merrow' });
    expect(region('Infection')).toHaveTextContent('Starting infection3');
    expect(region('Infection')).toHaveTextContent('No traumas.');

    await user.click(screen.getByRole('button', { name: 'Change Infection Level' }));
    const change = screen.getByRole('dialog', { name: 'Change Infection Level' });
    const level = within(change).getByLabelText(/New level/);
    await user.clear(level);
    await user.type(level, '4');
    await user.type(within(change).getByLabelText(/Reason/), 'Bitten at the swamp gate.');
    await user.type(within(change).getByLabelText(/Trauma/), 'Flinches at bells');
    await user.click(within(change).getByRole('button', { name: 'Save change' }));
    expect(await screen.findByText('Infection Level is now 4. Trauma added.')).toBeInTheDocument();
    await waitFor(() => expect(region('Infection')).toHaveTextContent('4 of 10'));
    expect(within(region('Infection')).getByRole('listitem')).toHaveTextContent(
      'Flinches at bells',
    );
    expect(
      repository.data.characters
        .get(ash.id)
        ?.actions.slice(-2)
        .map((a) => a.type),
    ).toEqual(['infection.changed', 'trauma.added']);

    await user.click(screen.getByRole('button', { name: 'Edit trauma: Flinches at bells' }));
    const edit = screen.getByRole('dialog', { name: 'Edit Trauma' });
    const text = within(edit).getByLabelText(/Trauma/);
    await user.clear(text);
    await user.type(text, 'Flinches at loud bells');
    await user.click(within(edit).getByRole('button', { name: 'Save trauma' }));
    await waitFor(() => expect(region('Infection')).toHaveTextContent('Flinches at loud bells'));

    await user.click(screen.getByRole('button', { name: 'Remove trauma: Flinches at loud bells' }));
    const remove = screen.getByRole('dialog', { name: 'Remove Trauma' });
    await user.click(within(remove).getByRole('button', { name: 'Remove trauma' }));
    expect(within(remove).getByText('Enter a reason for removing it.')).toBeInTheDocument();
    await user.type(within(remove).getByLabelText(/Reason/), 'Healed at the Home.');
    await user.click(within(remove).getByRole('button', { name: 'Remove trauma' }));
    await waitFor(() => expect(region('Infection')).toHaveTextContent('No traumas.'));
  });

  it('players read traumas with no controls', async () => {
    const ash = ashAfter([{ type: 'addTrauma', text: 'Hums when nervous' }]);
    renderApp(`/c/${ash.id}`, { characters: [ash] });
    await screen.findByRole('heading', { level: 1, name: 'Ash Merrow' });
    const infection = region('Infection');
    expect(within(infection).getByRole('heading', { level: 3, name: 'Traumas' })).toBeVisible();
    expect(within(infection).getByRole('listitem')).toHaveTextContent('Hums when nervous');
    expect(within(infection).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('Skills', () => {
  it('groups skills with what is left to spend, and links each to its Skills row', async () => {
    const user = userEvent.setup();
    const ash = printAsh();
    renderApp(`/c/${ash.id}`, { characters: [ash] });
    await screen.findByRole('heading', { level: 1, name: 'Ash Merrow' });
    const skills = region('Skills');
    const headings = within(skills)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      'Ancestry 1 LXP left',
      'Warrior 0 AP left',
      'Defender 0 AP left',
      'Rogue 1 AP left',
      'Utility 3 AP left',
      'Magic 3 AP left',
      'Profession 35 PXP left',
      'Familiar 1 Essence, 16 FP left',
    ]);
    expect(itemWith(skills, 'Assault')).toHaveTextContent(
      'Assault 3 · 3 per repop; Adept 1 per encounter',
    );
    expect(itemWith(skills, 'Toughness')).toHaveTextContent('Toughness (Warrior) 1 · Passive');
    expect(itemWith(skills, 'Stitch em up')).toHaveTextContent('Stitch em up 1 · 1 per repop');
    expect(within(skills).getByText('Medic')).toBeVisible();
    expect(within(skills).getByText('Pip, level 3')).toBeVisible();
    // Players see no stepper on ancestry abilities.
    expect(within(skills).queryAllByRole('button')).toHaveLength(0);

    await user.click(within(skills).getByRole('link', { name: 'Assault 3' }));
    expect(window.location.hash).toBe(`#/c/${ash.id}/skills?open=assault`);
    expect(await screen.findByRole('region', { name: 'Assault Basic' })).toBeVisible();
  });

  it('shows a group heading with points to spend even when nothing is owned there', () => {
    const sheet = deriveSheet(rs, mira().actions);
    expect(skillGroupViews(rs, sheet)).toEqual([]);
    const withAp = {
      ...sheet,
      points: {
        ...sheet.points,
        ap: { ...sheet.points.ap, crafting: { earned: 4, spent: 0, available: 4 } },
        fp: { total: 2, spent: 0, available: 2 },
      },
    };
    expect(
      skillGroupViews(rs, withAp).map((g) => ({ id: g.id, left: g.left, lines: g.lines })),
    ).toEqual([
      { id: 'crafting', left: '4 AP left', lines: [] },
      { id: 'familiar', left: '2 FP left', lines: [] },
    ]);
  });
});

describe('Passive Abilities', () => {
  it('lists every passive, and says which ones are counted in the totals', async () => {
    const ash = printAsh();
    renderApp(`/c/${ash.id}`, { characters: [ash] });
    await screen.findByRole('heading', { level: 1, name: 'Ash Merrow' });
    const passives = region('Passive Abilities');
    expect(
      within(passives)
        .getAllByRole('listitem')
        .map((li) => li.firstChild?.textContent),
    ).toEqual(['Scavenger', 'Toughness (Warrior) 1', 'Armor 1', 'Skilled Healer']);
    expect(itemWith(passives, 'Toughness')).toHaveTextContent(
      'You gain +10 Max Health per Level. Counted in the totals.',
    );
    expect(itemWith(passives, 'Armor 1')).toHaveTextContent('Counted in the totals.');
    expect(itemWith(passives, 'Scavenger')).not.toHaveTextContent('Counted in the totals.');
  });

  it('counts a damage passive from the ancestry', () => {
    const elf = passiveAbilities(rs, deriveSheet(rs, mira().actions));
    expect(elf).toEqual([expect.objectContaining({ name: 'Highly Trained', counted: true })]);
  });
});

describe('Story Notes', () => {
  it('players see visible notes newest first, knowledges tagged, and no controls', async () => {
    const ash = printAsh();
    renderApp(`/c/${ash.id}`, { characters: [ash] });
    await screen.findByRole('heading', { level: 1, name: 'Ash Merrow' });
    const notes = region('Story Notes');
    const items = within(notes).getAllByRole('listitem');
    expect(items.map((li) => li.firstChild?.textContent)).toEqual([
      'Owes the ferryman a favor.',
      'Old river trade routes',
    ]);
    expect(items[1]).toHaveTextContent('Knowledge');
    expect(within(notes).queryAllByRole('button')).toHaveLength(0);
    expect(api.hiddenNotes).not.toHaveBeenCalled();
  });

  it('staff add, edit, and remove a visible story note (no hidden option without the server)', async () => {
    const user = userEvent.setup();
    const ash = printAsh();
    const { repository } = renderApp(`/c/${ash.id}`, { characters: [ash], settings: STAFF });
    await screen.findByRole('heading', { level: 1, name: 'Ash Merrow' });
    await user.click(screen.getByRole('button', { name: 'Add a story note' }));
    const add = screen.getByRole('dialog', { name: 'Add a Story Note' });
    expect(within(add).queryByLabelText('Hidden from player')).not.toBeInTheDocument();
    await user.click(within(add).getByRole('button', { name: 'Add story note' }));
    expect(within(add).getByText('Type the story note.')).toBeInTheDocument();
    await user.type(within(add).getByLabelText(/Story note/), 'Swore an oath to the Ferry Guild');
    await user.click(within(add).getByRole('button', { name: 'Add story note' }));
    await waitFor(() =>
      expect(within(region('Story Notes')).getAllByRole('listitem')[0]).toHaveTextContent(
        'Swore an oath to the Ferry Guild',
      ),
    );

    await user.click(
      screen.getByRole('button', { name: 'Edit story note: Swore an oath to the Ferry Guild' }),
    );
    const edit = screen.getByRole('dialog', { name: 'Edit Story Note' });
    const text = within(edit).getByLabelText(/Story note/);
    await user.clear(text);
    await user.type(text, 'Broke an oath to the Ferry Guild');
    await user.click(within(edit).getByRole('button', { name: 'Save story note' }));
    await waitFor(() =>
      expect(region('Story Notes')).toHaveTextContent('Broke an oath to the Ferry Guild'),
    );

    await user.click(
      screen.getByRole('button', { name: 'Remove story note: Broke an oath to the Ferry Guild' }),
    );
    const remove = screen.getByRole('dialog', { name: 'Remove Story Note' });
    await user.click(within(remove).getByRole('button', { name: 'Remove story note' }));
    await waitFor(() => expect(region('Story Notes')).not.toHaveTextContent('Ferry Guild'));
    expect(
      repository.data.characters
        .get(ash.id)
        ?.actions.slice(-3)
        .map((a) => a.type),
    ).toEqual(['storyNote.added', 'storyNote.edited', 'storyNote.removed']);
  });

  it('staff see hidden notes with a badge and add one through the server, not the log', async () => {
    const user = userEvent.setup();
    const ash = printAsh();
    const secret = hidden(ash.id, 'hn-1', 'Secret twin in the north camp', '2026-10-01T10:00:00Z');
    const added = hidden(ash.id, 'hn-2', 'The lantern is cursed', '2026-10-02T10:00:00Z');
    vi.mocked(api.hiddenNotes)
      .mockResolvedValueOnce({ items: [secret] })
      .mockResolvedValueOnce({ items: [added, secret] });
    vi.mocked(api.addHiddenNote).mockResolvedValue({ note: added });
    const repository = renderWithServer(`/c/${ash.id}`, ash, TEST_STAFF);
    await screen.findByRole('heading', { level: 1, name: 'Ash Merrow' });

    const notes = region('Story Notes');
    await waitFor(() => expect(notes).toHaveTextContent('Secret twin in the north camp'));
    const item = itemWith(notes, 'Secret twin');
    expect(within(item).getByText('Hidden')).toBeVisible();
    // Newest first: the hidden note (October) comes before the September notes.
    expect(within(notes).getAllByRole('listitem')[0]).toBe(item);
    expect(api.hiddenNotes).toHaveBeenCalledWith(ash.id);

    const before = repository.data.characters.get(ash.id)?.actions.length;
    await user.click(screen.getByRole('button', { name: 'Add a story note' }));
    const add = screen.getByRole('dialog', { name: 'Add a Story Note' });
    await user.type(within(add).getByLabelText(/Story note/), 'The lantern is cursed');
    await user.click(within(add).getByLabelText('Hidden from player'));
    await user.click(within(add).getByRole('button', { name: 'Add story note' }));
    expect(api.addHiddenNote).toHaveBeenCalledWith(ash.id, 'The lantern is cursed');
    await waitFor(() =>
      expect(within(itemWith(notes, 'The lantern')).getByText('Hidden')).toBeVisible(),
    );
    expect(repository.data.characters.get(ash.id)?.actions.length).toBe(before);
  });

  it('players and test builds never ask for hidden notes', async () => {
    const ash = printAsh();
    renderWithServer(`/c/${ash.id}`, ash, TEST_PLAYER);
    await screen.findByRole('heading', { level: 1, name: 'Ash Merrow' });
    expect(region('Story Notes')).toHaveTextContent('Owes the ferryman a favor.');
    expect(api.hiddenNotes).not.toHaveBeenCalled();
  });
});

describe('test builds', () => {
  function testBuildMeta(id: string): CharacterMeta {
    return {
      id,
      kind: 'test',
      status: 'active',
      ownerId: TEST_PLAYER.id,
      ownerName: TEST_PLAYER.name,
      ownerEmail: TEST_PLAYER.email,
      submittedAt: null,
      reviewNote: null,
      reviewedBy: null,
      reviewedAt: null,
      draft: null,
    };
  }

  it('has no hidden notes option, and Learn prefills the teacher with "Test build"', async () => {
    const user = userEvent.setup();
    const ash = printAsh();
    vi.mocked(characterMetaFor).mockImplementation((id) =>
      id === ash.id ? testBuildMeta(id) : undefined,
    );
    renderWithServer(`/c/${ash.id}`, ash, TEST_PLAYER);
    await screen.findByRole('heading', { level: 1, name: 'Ash Merrow' });
    await user.click(screen.getByRole('button', { name: 'Add a story note' }));
    const add = screen.getByRole('dialog', { name: 'Add a Story Note' });
    expect(within(add).queryByLabelText('Hidden from player')).not.toBeInTheDocument();
    expect(api.hiddenNotes).not.toHaveBeenCalled();
    await user.click(within(add).getByRole('button', { name: 'Cancel' }));

    window.location.hash = `#/c/${ash.id}/skills/bash`;
    await user.click(await screen.findByRole('button', { name: 'Raise Bash' }));
    const learn = screen.getByRole('dialog', { name: /^Learn Bash level 1/ });
    expect(within(learn).getByLabelText(/Teacher/)).toHaveValue('Test build');
  });
});
