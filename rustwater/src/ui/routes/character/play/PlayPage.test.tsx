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

const ASSAULT = 'skill:assault:basic';

/** Ash with Assault 3 (3 uses per repop) and Human Resilience (1 use per encounter). */
function fighter() {
  return ashAfter([
    { type: 'learnSkill', skillId: 'assault', part: 'basic', toLevel: 3, teacher: 'Old Jory' },
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
  await screen.findByRole('heading', { level: 2, name: 'Play Tracker' });
  await screen.findByRole('list', { name: 'Assault uses' });
  return { ...result, id: character.id };
}

function row(name: string): HTMLElement {
  const list = screen.getByRole('list', { name: `${name} uses` });
  const item = list.closest('li');
  if (!item) throw new Error(`No row for ${name}`);
  return item;
}

describe('play page', () => {
  afterEach(() => localStorage.clear());

  it('opens what a skill does from its name, with a link to the skill', async () => {
    const user = userEvent.setup();
    const { id } = await openPlay();
    const name = within(row('Assault')).getByRole('button', { name: 'Assault' });
    expect(name).toHaveAttribute('aria-expanded', 'false');
    expect(row('Assault')).not.toHaveTextContent('next 2 attacks');
    await user.click(name);
    expect(name).toHaveAttribute('aria-expanded', 'true');
    expect(row('Assault')).toHaveTextContent(
      'Expend a use of this skill to make your next 2 attacks do +10 damage.',
    );
    expect(within(row('Assault')).getByRole('link', { name: 'Open in Skills' })).toHaveAttribute(
      'href',
      `#/c/${id}/skills?open=assault`,
    );
    await user.click(name);
    expect(name).toHaveAttribute('aria-expanded', 'false');

    // Ancestry abilities open their text too.
    await user.click(
      within(row('Human Resilience')).getByRole('button', { name: 'Human Resilience' }),
    );
    expect(row('Human Resilience')).toHaveTextContent('during bleed out');
  });

  it('groups uses by period with a Reset button each and pips as a list', async () => {
    await openPlay();
    const encounter = screen.getByRole('region', { name: 'Per encounter' });
    expect(within(encounter).getByRole('button', { name: 'Reset encounter' })).toBeVisible();
    expect(within(encounter).getByRole('list', { name: 'Human Resilience uses' })).toBeVisible();
    const repop = screen.getByRole('region', { name: 'Per repop' });
    expect(within(repop).getByRole('button', { name: 'Reset repop' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Per event' })).toBeNull();
    expect(row('Assault')).toHaveTextContent('3 of 3 left');
    const pips = within(screen.getByRole('list', { name: 'Assault uses' })).getAllByRole('button');
    expect(pips.map((p) => p.getAttribute('aria-label'))).toEqual([
      'Assault use 1 of 3, available',
      'Assault use 2 of 3, available',
      'Assault use 3 of 3, available',
    ]);
    expect(screen.getByRole('button', { name: 'Reset everything' })).toBeVisible();
  });

  it('spends with one tap, saves, restores a spent pip, and Undo gives the use back', async () => {
    const user = userEvent.setup();
    const { repository, id } = await openPlay();
    await user.click(screen.getByRole('button', { name: 'Assault use 1 of 3, available' }));
    expect(row('Assault')).toHaveTextContent('2 of 3 left');
    expect(screen.getByRole('button', { name: 'Assault use 3 of 3, spent' })).toBeVisible();
    expect(await screen.findByText('Spent Assault. 2 of 3 left.')).toBeVisible();
    await waitFor(() => expect(repository.data.trackers.get(id)?.perRepop[ASSAULT]).toBe(1));

    await user.click(screen.getByRole('button', { name: 'Assault use 1 of 3, available' }));
    expect(row('Assault')).toHaveTextContent('1 of 3 left');
    await user.click(screen.getByRole('button', { name: 'Assault use 3 of 3, spent' }));
    expect(row('Assault')).toHaveTextContent('2 of 3 left');

    const toast = (await screen.findByText('Spent Assault. 1 of 3 left.')).closest('div');
    if (!toast) throw new Error('No toast');
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(row('Assault')).toHaveTextContent('3 of 3 left');
    await waitFor(() => expect(repository.data.trackers.get(id)?.perRepop).toEqual({}));
  });

  it('resets the encounter with one tap and Undo puts the spent uses back', async () => {
    const user = userEvent.setup();
    await openPlay(tracker({ [ASSAULT]: 2 }, { 'ancestry:human-resilience': 1 }));
    expect(row('Human Resilience')).toHaveTextContent('0 of 1 left');
    await user.click(screen.getByRole('button', { name: 'Reset encounter' }));
    expect(row('Human Resilience')).toHaveTextContent('1 of 1 left');
    expect(row('Assault')).toHaveTextContent('1 of 3 left');
    expect(screen.queryByRole('dialog')).toBeNull();
    const toast = (await screen.findByText('Encounter uses restored.')).closest('div');
    if (!toast) throw new Error('No toast');
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(row('Human Resilience')).toHaveTextContent('0 of 1 left');
  });

  it('asks before a repop reset, which restores repop and encounter uses', async () => {
    const user = userEvent.setup();
    const { repository, id } = await openPlay(
      tracker({ [ASSAULT]: 2 }, { 'ancestry:human-resilience': 1 }),
    );
    await user.click(screen.getByRole('button', { name: 'Reset repop' }));
    let dialog = screen.getByRole('dialog', { name: 'Reset repop?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(row('Assault')).toHaveTextContent('1 of 3 left');

    await user.click(screen.getByRole('button', { name: 'Reset repop' }));
    dialog = screen.getByRole('dialog', { name: 'Reset repop?' });
    await user.click(within(dialog).getByRole('button', { name: 'Reset repop' }));
    expect(row('Assault')).toHaveTextContent('3 of 3 left');
    expect(row('Human Resilience')).toHaveTextContent('1 of 1 left');
    await waitFor(() =>
      expect(repository.data.trackers.get(id)).toMatchObject({ perRepop: {}, perEncounter: {} }),
    );
  });

  it('resets everything after a confirm', async () => {
    const user = userEvent.setup();
    await openPlay(tracker({ [ASSAULT]: 3 }, { 'ancestry:human-resilience': 1 }));
    await user.click(screen.getByRole('button', { name: 'Reset everything' }));
    const dialog = screen.getByRole('dialog', { name: 'Reset everything?' });
    await user.click(within(dialog).getByRole('button', { name: 'Reset everything' }));
    expect(row('Assault')).toHaveTextContent('3 of 3 left');
    expect(row('Human Resilience')).toHaveTextContent('1 of 1 left');
  });

  it('clamps spent uses to a smaller count and saves the clamped value', async () => {
    const { repository, id } = await openPlay(tracker({ [ASSAULT]: 7, 'skill:gone:basic': 2 }));
    expect(row('Assault')).toHaveTextContent('0 of 3 left');
    await waitFor(() =>
      expect(repository.data.trackers.get(id)?.perRepop).toEqual({ [ASSAULT]: 3 }),
    );
  });

  it('saves each tap at once and keeps spent uses across visits', async () => {
    const user = userEvent.setup();
    const first = await openPlay();
    await user.click(screen.getByRole('button', { name: 'Assault use 1 of 3, available' }));
    expect(first.repository.data.trackers.get(first.id)?.perRepop[ASSAULT]).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Assault use 1 of 3, available' }));
    first.unmount();
    expect(first.repository.data.trackers.get(first.id)?.perRepop[ASSAULT]).toBe(2);

    // A new visit reads the stored tracker.
    const stored = first.repository.data.trackers.get(first.id);
    const character = fighter();
    renderApp(`/c/${character.id}/play`, { characters: [character] }).repository.data.trackers.set(
      character.id,
      structuredClone(stored as UseTracker),
    );
    await screen.findByRole('list', { name: 'Assault uses' });
    expect(row('Assault')).toHaveTextContent('1 of 3 left');
  });

  it('says when a save fails and saves again when the page is hidden', async () => {
    const user = userEvent.setup();
    const { repository, id } = await openPlay();
    const save = repository.saveTracker;
    repository.saveTracker = () => Promise.reject(new Error('Storage is full.'));
    await user.click(screen.getByRole('button', { name: 'Assault use 1 of 3, available' }));
    expect(
      await screen.findByText('Spent uses could not be saved: Storage is full.'),
    ).toBeVisible();
    expect(repository.data.trackers.get(id)).toBeUndefined();
    expect(localStorage.getItem(backupKey(id))).toContain('"skill:assault:basic":1');

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
    expect(repository.data.trackers.get(id)?.perRepop[ASSAULT]).toBe(1);
    await waitFor(() => expect(screen.queryByText(/could not be saved/)).toBeNull());
    expect(localStorage.getItem(backupKey(id))).toBeNull();
  });

  it('a backup left by a closed page wins over the stored tracker and is saved', async () => {
    const id = fighter().id;
    localStorage.setItem(backupKey(id), JSON.stringify(tracker({ [ASSAULT]: 2 })(id)));
    const { repository } = await openPlay(tracker({ [ASSAULT]: 1 }));
    expect(row('Assault')).toHaveTextContent('1 of 3 left');
    await waitFor(() => expect(repository.data.trackers.get(id)?.perRepop[ASSAULT]).toBe(2));
    expect(localStorage.getItem(backupKey(id))).toBeNull();
  });

  it('shows one line of help when nothing is trackable', async () => {
    const ruleset = loadRuleset();
    const character = ash();
    const sheet = { ...deriveSheet(ruleset, character.actions), ancestry: null };
    render(
      <RepositoryProvider repository={createMemoryRepository({ characters: [character] })}>
        <ToastProvider>
          <PlayPage view={{ id: character.id, character, sheet, ruleset, isStaff: false }} />
        </ToastProvider>
      </RepositoryProvider>,
    );
    expect(
      screen.getByText(
        'Skills and abilities with uses per encounter, repop, or event appear here.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reset everything' })).toBeNull();
  });
});
