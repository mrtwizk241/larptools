import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset } from '../../../../engine/index.ts';
import type { UseTracker } from '../../../../engine/model.ts';
import { ToastProvider } from '../../../components/index.ts';
import { createMemoryRepository } from '../../../data/memoryRepository.ts';
import { RepositoryProvider } from '../../../data/RepositoryProvider.tsx';
import { renderApp } from '../../../test/renderApp.tsx';
import { ash, ashAfter } from '../../../test/veteran.ts';
import { PlayPage } from './PlayPage.tsx';
import { backupKey } from './useTracker.ts';

const DEFLECTION = 'skill:deflection';
const INNATE = 'innate:human-innate-active';

/** Ash with the Deflection Expert Technique (Expert spends 2 uses). */
function fighter() {
  return ashAfter([
    { type: 'learnSkill', skillId: 'deflection', step: { technique: 'expert' }, teacher: 'Jory' },
  ]);
}

function tracker(perRepop: Record<string, number>, perEncounter: Record<string, number> = {}) {
  return (id: string): UseTracker => ({
    characterId: id,
    perEncounter,
    perRepop,
    updatedAt: '2026-09-19T21:00:00.000Z',
  });
}

async function openPlay(make?: (id: string) => UseTracker) {
  const character = fighter();
  const result = renderApp(`/c/${character.id}/play`, { characters: [character] });
  if (make) result.repository.data.trackers.set(character.id, make(character.id));
  await screen.findByRole('heading', { level: 2, name: 'Play' });
  await screen.findByRole('list', { name: 'Deflection uses' });
  return { ...result, id: character.id };
}

function row(name: string): HTMLElement {
  const item = screen.getByRole('list', { name: `${name} uses` }).closest('li');
  if (!item) throw new Error(`No row for ${name}`);
  return item;
}

async function undo(message: string) {
  const toast = (await screen.findByText(message)).closest('div');
  if (!toast) throw new Error('No toast');
  await userEvent.click(within(toast).getByRole('button', { name: 'Undo' }));
}

describe('play page', () => {
  afterEach(() => localStorage.clear());

  it('groups skills, Calling skills, the innate, and spells', async () => {
    await openPlay();
    const encounter = screen.getByRole('region', { name: 'Per encounter' });
    expect(within(encounter).getByRole('list', { name: 'Human innate uses' })).toBeVisible();
    const calling = screen.getByRole('region', { name: 'Calling skills' });
    expect(within(calling).getByRole('list', { name: 'Guardianship uses' })).toBeVisible();
    expect(row('Guardianship')).toHaveTextContent('Renews only at re-pop.');
    expect(row('Deflection')).toHaveTextContent('3 of 3 left');
    const pips = within(screen.getByRole('list', { name: 'Deflection uses' })).getAllByRole(
      'button',
    );
    expect(pips.map((p) => p.getAttribute('aria-label'))).toEqual([
      'Deflection use 1 of 3, available',
      'Deflection use 2 of 3, available',
      'Deflection use 3 of 3, available',
    ]);
    expect(screen.getByRole('button', { name: 'Spend 2 uses: Deflection Expert' })).toBeVisible();
    const spells = screen.getByRole('region', { name: 'Spells' });
    expect(
      within(spells).getByRole('button', { name: 'Cast Grant Life: 1 use of Life Magic' }),
    ).toBeVisible();
  });

  it('spends an ability, refuses when not enough uses are left, and Undo gives them back', async () => {
    const user = userEvent.setup();
    const { repository, id } = await openPlay();
    await user.click(screen.getByRole('button', { name: 'Spend 2 uses: Deflection Expert' }));
    expect(row('Deflection')).toHaveTextContent('1 of 3 left');
    await waitFor(() => expect(repository.data.trackers.get(id)?.perRepop[DEFLECTION]).toBe(2));

    await user.click(screen.getByRole('button', { name: 'Spend 2 uses: Deflection Expert' }));
    expect(
      await screen.findByText('Not enough uses for Deflection Expert: needs 2 uses, 1 left.'),
    ).toBeVisible();
    expect(row('Deflection')).toHaveTextContent('1 of 3 left');

    await undo('Spent 2 uses: Deflection Expert. 1 of 3 left.');
    expect(row('Deflection')).toHaveTextContent('3 of 3 left');
  });

  it('taps a pip to spend one and a spent pip to restore one; casting spends the magic skill', async () => {
    const user = userEvent.setup();
    await openPlay();
    await user.click(screen.getByRole('button', { name: 'Deflection use 1 of 3, available' }));
    expect(row('Deflection')).toHaveTextContent('2 of 3 left');
    await user.click(screen.getByRole('button', { name: 'Deflection use 3 of 3, spent' }));
    expect(row('Deflection')).toHaveTextContent('3 of 3 left');
    await user.click(screen.getByRole('button', { name: 'Cast Grant Life: 1 use of Life Magic' }));
    expect(row('Life Magic')).toHaveTextContent('2 of 3 left');
  });

  it('a new encounter renews the innate at once, with Undo', async () => {
    const user = userEvent.setup();
    await openPlay(tracker({ [DEFLECTION]: 2 }, { [INNATE]: 1 }));
    expect(row('Human innate')).toHaveTextContent('0 of 1 left');
    await user.click(screen.getByRole('button', { name: 'New encounter' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(row('Human innate')).toHaveTextContent('1 of 1 left');
    expect(row('Deflection')).toHaveTextContent('1 of 3 left');
    await undo('New encounter: innate uses renewed.');
    expect(row('Human innate')).toHaveTextContent('0 of 1 left');
  });

  it('a new re-pop asks first and renews every use, with Undo', async () => {
    const user = userEvent.setup();
    const { repository, id } = await openPlay(
      tracker({ [DEFLECTION]: 2, 'skill:guardianship': 1 }, { [INNATE]: 1 }),
    );
    await user.click(screen.getByRole('button', { name: 'New re-pop' }));
    let dialog = screen.getByRole('dialog', { name: 'Start a new re-pop?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(row('Deflection')).toHaveTextContent('1 of 3 left');

    await user.click(screen.getByRole('button', { name: 'New re-pop' }));
    dialog = screen.getByRole('dialog', { name: 'Start a new re-pop?' });
    await user.click(within(dialog).getByRole('button', { name: 'New re-pop' }));
    expect(row('Deflection')).toHaveTextContent('3 of 3 left');
    expect(row('Guardianship')).toHaveTextContent('1 of 1 left');
    expect(row('Human innate')).toHaveTextContent('1 of 1 left');
    await waitFor(() =>
      expect(repository.data.trackers.get(id)).toMatchObject({ perRepop: {}, perEncounter: {} }),
    );
    await undo('New re-pop: every use renewed.');
    expect(row('Deflection')).toHaveTextContent('1 of 3 left');
    expect(row('Guardianship')).toHaveTextContent('0 of 1 left');
  });

  it('keeps spent uses in a localStorage backup until the save lands', async () => {
    const user = userEvent.setup();
    const { repository, id } = await openPlay();
    const save = repository.saveTracker;
    repository.saveTracker = () => Promise.reject(new Error('Storage is full.'));
    await user.click(screen.getByRole('button', { name: 'Deflection use 1 of 3, available' }));
    expect(
      await screen.findByText('Spent uses could not be saved: Storage is full.'),
    ).toBeVisible();
    expect(localStorage.getItem(backupKey(id))).toContain('"skill:deflection":1');
    expect(backupKey(id)).toBe(`sy.tracker.${id}`);

    repository.saveTracker = save;
    const visibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    try {
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
        await Promise.resolve();
      });
    } finally {
      if (visibility) Object.defineProperty(document, 'visibilityState', visibility);
      else Reflect.deleteProperty(document, 'visibilityState');
    }
    expect(repository.data.trackers.get(id)?.perRepop[DEFLECTION]).toBe(1);
    await waitFor(() => expect(localStorage.getItem(backupKey(id))).toBeNull());
  });

  it('a backup left by a closed page wins over the stored tracker', async () => {
    const id = fighter().id;
    localStorage.setItem(backupKey(id), JSON.stringify(tracker({ [DEFLECTION]: 2 })(id)));
    const { repository } = await openPlay(tracker({ [DEFLECTION]: 1 }));
    expect(row('Deflection')).toHaveTextContent('1 of 3 left');
    await waitFor(() => expect(repository.data.trackers.get(id)?.perRepop[DEFLECTION]).toBe(2));
  });

  it('opens a skill row to show what each learned ability does', async () => {
    await openPlay();
    const toggle = screen.getByRole('button', { name: 'Toughness' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const panel = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    expect(panel).not.toBeVisible();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toBeVisible();
    expect(panel).toHaveTextContent('Basic: 1 use');
    expect(panel).toHaveTextContent('Expert: passive');
    expect(panel).toHaveTextContent('Not learned yet: Master, Grandmaster.');
    expect(
      within(panel as HTMLElement).getByRole('link', { name: 'Open Toughness' }),
    ).toBeVisible();
  });

  it('works out Life, Armor, and damage with buffs, and keeps the choices', async () => {
    const { id } = await openPlay();
    const combat = screen.getByRole('region', { name: 'Life, armor, and damage' });
    // Ash: 10 base + 20 Toughness Expert Life; 20 Wear Armor Expert Armor.
    const life = within(combat).getByRole('button', { name: /^Life 30/ });
    await userEvent.click(life);
    await userEvent.click(within(combat).getByRole('checkbox', { name: /^Grant Life \+20 Life/ }));
    await userEvent.selectOptions(
      within(combat).getByRole('combobox', { name: 'Toughness (+10 Life each)' }),
      '2',
    );
    // hand-derived: 30 + 20 Grant Life + 2 x 10 Toughness
    expect(within(combat).getByRole('button', { name: /^Life 70/ })).toBeVisible();

    await userEvent.click(within(combat).getByRole('button', { name: /^Armor 20/ }));
    await userEvent.click(within(combat).getByRole('checkbox', { name: 'Head' }));
    await userEvent.click(within(combat).getByRole('checkbox', { name: 'Chest front' }));
    // hand-derived: 20 + 2 locations x 5
    expect(within(combat).getByRole('button', { name: /^Armor 30/ })).toBeVisible();

    await userEvent.click(within(combat).getByRole('button', { name: /^Damage 2 Edge/ }));
    await userEvent.click(
      within(combat).getByRole('checkbox', { name: /^Grant Ogre Strength \+2 one-handed/ }),
    );
    await userEvent.click(within(combat).getByRole('checkbox', { name: /^From behind/ }));
    await userEvent.click(within(combat).getByRole('checkbox', { name: /^Pain Venom/ }));
    // hand-derived: Long weapon base 2 + Ogre 2 + Pain Venom 2 from behind
    expect(within(combat).getByText('"6 Edge"')).toBeVisible();
    expect(combat).toHaveTextContent('Enhancement Slots: 2 of 4 used by the ticked buffs.');

    const saved = JSON.parse(localStorage.getItem(`sy.combat.${id}`) ?? '{}') as {
      chosen: Record<string, number>;
    };
    expect(saved.chosen).toEqual({
      'grant-life': 1,
      toughness: 2,
      'grant-ogre-strength': 1,
      'pain-venom': 1,
    });
    await userEvent.click(within(combat).getByRole('button', { name: 'Clear buffs' }));
    expect(within(combat).getByRole('button', { name: /^Life 30/ })).toBeVisible();
  });

  it('shows one line of help when nothing has uses', () => {
    const ruleset = loadRuleset();
    const character = ash();
    const sheet = { ...deriveSheet(ruleset, character.actions), skills: [], race: null };
    render(
      <RepositoryProvider repository={createMemoryRepository({ characters: [character] })}>
        <ToastProvider>
          <PlayPage view={{ id: character.id, character, sheet, ruleset, isStaff: false }} />
        </ToastProvider>
      </RepositoryProvider>,
    );
    expect(
      screen.getByText('This character has no skills or innate abilities with uses yet.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'New re-pop' })).toBeNull();
  });
});
