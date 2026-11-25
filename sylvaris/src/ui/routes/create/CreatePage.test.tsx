import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../api/client.ts';
import type { CharacterEntry } from '../../../api/contract.ts';
import { deriveSheet, loadRuleset } from '../../../engine/index.ts';
import type { Settings } from '../../../engine/model.ts';
import { harness } from '../../../engine/testkit.ts';
import { renderApp } from '../../test/renderApp.tsx';
import { ash } from '../../test/veteran.ts';

const STAFF: Settings = { mode: 'staff', theme: 'system' };
const rs = loadRuleset();

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));
const heading = (name: string) => screen.findByRole('heading', { level: 2, name });

async function buildWren(staff: boolean) {
  await heading('Concept and profile');
  fireEvent.change(screen.getByLabelText(/Character name/), { target: { value: 'Wren Ashby' } });
  if (staff)
    fireEvent.change(screen.getByLabelText(/Player name/), { target: { value: 'Sam Reed' } });
  next();
  await heading('Race');
  // Next without a race shows the reason.
  next();
  expect(await screen.findByRole('alert')).toHaveTextContent('Choose a race.');
  fireEvent.click(screen.getByRole('radio', { name: 'Human' }));
  next();
  await heading('Skills');
  fireEvent.click(screen.getByRole('tab', { name: 'Defensive' }));
  const raise = screen.getByRole('button', { name: 'Raise Toughness' });
  fireEvent.click(raise);
  fireEvent.click(raise);
  fireEvent.click(raise);
  fireEvent.click(screen.getByRole('checkbox', { name: /Toughness Expert Technique/ }));
  expect(
    within(screen.getByRole('list', { name: 'Starting XP' })).getAllByRole('listitem')[0],
  ).toHaveTextContent('XP115left of 150');
  next();
  await heading('Starting items');
  fireEvent.click(screen.getByRole('button', { name: 'Raise Basic Spell in Spellbook' }));
  fireEvent.change(screen.getByLabelText(/Basic Spell in Spellbook spell/), {
    target: { value: 'grant-life' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Raise Basic Suit of Armor' }));
  next();
  await heading('Backstory');
  fireEvent.change(screen.getByLabelText(/Backstory/), {
    target: { value: 'Raised by river folk.' },
  });
  next();
  await heading('Review');
}

describe('create wizard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('lets staff build and create a character', async () => {
    const { repository } = renderApp('/new', { settings: STAFF });
    await buildWren(true);
    expect(screen.getByText('Toughness 3 with the Expert Technique')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Create character' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Wren Ashby' })).toBeVisible();
    const [stored] = (await repository.listCharacters()).items;
    expect(stored).toBeDefined();
    const sheet = deriveSheet(rs, stored!.actions);
    expect(sheet.profile.playerName).toBe('Sam Reed');
    expect(sheet.profile.backstory).toBe('Raised by river folk.');
    expect(sheet.points.xp.available).toBe(115);
    expect(sheet.journals.spellbook).toHaveLength(1);
    expect(sheet.startingItems).toHaveLength(2);
  });

  it('lets a player send the character to staff', async () => {
    const submit = vi.spyOn(api, 'submit').mockResolvedValue({} as unknown as CharacterEntry);
    renderApp('/new');
    await screen.findByText(/goes to staff for approval/);
    await buildWren(false);
    expect(screen.getByText('Test Player (player@test.invalid)')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Send to staff' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const body = submit.mock.calls[0]![0];
    expect(body.create).toMatchObject({
      type: 'createCharacter',
      characterName: 'Wren Ashby',
      playerName: 'Test Player',
      raceId: 'human',
      backstory: 'Raised by river folk.',
    });
    expect((body.draft as { backstory: string }).backstory).toBe('Raised by river folk.');
    expect(body.journals).toEqual([
      { type: 'addJournal', kind: 'spell', refId: 'grant-life', source: 'starting' },
    ]);
  });

  it('keeps the draft over a reload', async () => {
    const first = renderApp('/new', { settings: STAFF });
    await heading('Concept and profile');
    fireEvent.change(screen.getByLabelText(/Character name/), { target: { value: 'Kept' } });
    fireEvent.change(screen.getByLabelText(/Player name/), { target: { value: 'Pat' } });
    next();
    await heading('Race');
    first.unmount();
    renderApp('/new', { settings: STAFF });
    await heading('Race');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByLabelText(/Character name/)).toHaveValue('Kept');
  });

  it('lists advanced skills as not available at creation', async () => {
    localStorage.setItem(
      'sy.createDraft.user-staff',
      JSON.stringify({ step: 2, draft: { characterName: 'A', playerName: 'B', raceId: 'elf' } }),
    );
    renderApp('/new', { settings: STAFF });
    await heading('Skills');
    expect(
      screen.getByText(/Advanced skills \(\d+\), not available at creation/),
    ).toBeInTheDocument();
    expect(screen.getByText(/It needs Back Strike, and Nerve Pinch/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Racial' }));
    expect(screen.getByText('Only Elf characters can learn these.')).toBeVisible();
  });
});

// Acceptance AC-1: build the new character from a retirement carry-over.
describe('create wizard in retirement mode', () => {
  afterEach(() => {
    localStorage.clear();
  });

  function retiredAsh() {
    const h = harness(ash().actions);
    // Enough XP for a level 6 skill from the carry-over: (910 - 150) / 4 = 190.
    h.run({ type: 'adjustPoints', currency: 'xp', amount: 400, reason: 'Test setup' });
    h.run({ type: 'retireCharacter', reason: 'Settles in the hills', goodsValueCopper: 600 });
    return { ...ash(), actions: h.actions };
  }

  it('starts with the carry-over, lifts the limits, and records where the carry went', async () => {
    const old = retiredAsh();
    const carry = deriveSheet(rs, old.actions).retired?.carry;
    const { repository } = renderApp(`/new?retire=${old.id}`, {
      characters: [old],
      settings: STAFF,
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'New character from a retirement' }),
    ).toBeVisible();
    await heading('Concept and profile');
    expect(screen.getByLabelText(/Player name/)).toHaveValue('Robin Vale');
    expect(screen.getByText(/Built from the retirement of Ash Merrow/)).toBeVisible();
    fireEvent.change(screen.getByLabelText(/Character name/), { target: { value: 'Ember Vale' } });
    next();
    await heading('Race');
    fireEvent.click(screen.getByRole('radio', { name: 'Human' }));
    next();
    await heading('Skills');
    fireEvent.click(screen.getByRole('tab', { name: 'Defensive' }));
    const raise = screen.getByRole('button', { name: 'Raise Toughness' });
    for (let i = 0; i < 6; i++) fireEvent.click(raise);
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Toughness Expert Technique, 5 XP: +20 Life Points',
      }),
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /Toughness Master Technique, 10 XP/ }));
    next();
    await heading('Starting items');
    next();
    await heading('Backstory');
    next();
    await heading('Review');
    expect(screen.getByText('Toughness 6 with the Expert and Master Techniques')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Create character' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Ember Vale' })).toBeVisible();

    const created = (await repository.listCharacters()).items.find((c) => c.id !== old.id);
    const sheet = deriveSheet(rs, created!.actions);
    expect(sheet.profile.retirementFrom).toEqual({ fromName: 'Ash Merrow', ...carry });
    expect(sheet.points.xp.earned).toBe(carry!.xp);
    expect(sheet.ledger.filter((r) => r.kind === 'retirement').map((r) => r.currency)).toEqual(
      (['xp', 'cxp', 'axp'] as const).filter((c) => (carry?.[c] ?? 0) > 0),
    );
    await waitFor(async () => {
      const after = await repository.getCharacter(old.id);
      expect(deriveSheet(rs, after!.actions).retired?.assignedTo).toMatchObject({
        characterId: created!.id,
        characterName: 'Ember Vale',
        kind: 'new',
      });
    });
  });

  it('refuses a character that is not retired', async () => {
    renderApp(`/new?retire=${ash().id}`, { characters: [ash()], settings: STAFF });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ash Merrow is not retired. Retire it first.',
    );
  });
});

// Acceptance AC-8 in the wizard: the chosen element names the Dragonborn racial skill.
describe('create wizard, Dragonborn', () => {
  afterEach(() => localStorage.clear());

  it('names the racial skill after the chosen element', async () => {
    localStorage.setItem(
      'sy.createDraft.user-staff',
      JSON.stringify({
        step: 2,
        draft: {
          characterName: 'A',
          playerName: 'B',
          raceId: 'dragonborn',
          choices: { element: 'fire', 'natural-weapon': 'bite' },
        },
      }),
    );
    renderApp('/new', { settings: STAFF });
    await heading('Skills');
    fireEvent.click(screen.getByRole('tab', { name: 'Racial' }));
    expect(screen.getByRole('heading', { level: 3, name: "Fire's Gift" })).toBeVisible();
    expect(screen.getByRole('button', { name: "Raise Fire's Gift" })).toBeInTheDocument();
  });
});

// Acceptance AC-18: a skill the race replaces cannot be raised, and says why.
describe('create wizard, Clockwork', () => {
  afterEach(() => localStorage.clear());

  it('blocks Wear Armor with the reason on the card', async () => {
    localStorage.setItem(
      'sy.createDraft.user-staff',
      JSON.stringify({
        step: 2,
        draft: { characterName: 'A', playerName: 'B', raceId: 'clockwork' },
      }),
    );
    renderApp('/new', { settings: STAFF });
    await heading('Skills');
    fireEvent.click(screen.getByRole('tab', { name: 'Defensive' }));
    expect(
      screen.getByText('Clockwork uses Armor Plating instead of Wear Armor.'),
    ).toBeInTheDocument();
    const raise = screen.getByRole('button', { name: 'Raise Wear Armor' });
    fireEvent.click(raise);
    // Nothing was bought.
    expect(
      within(screen.getByRole('list', { name: 'Starting XP' })).getAllByRole('listitem')[0],
    ).toHaveTextContent('XP150left of 150');
  });
});
