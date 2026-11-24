import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Settings } from '../../../engine/model.ts';
import { mira } from '../../test/fixtures.ts';
import { lark } from './memory/testCharacter.ts';
import { App } from '../../App.tsx';
import { createMemoryRepository } from '../../data/memoryRepository.ts';
import { TEST_PLAYER, renderApp } from '../../test/renderApp.tsx';
import { WIZARD_STEPS } from '../create/steps.ts';

const STAFF: Settings = { mode: 'staff', theme: 'system' };

describe('character overview', () => {
  it('marks a negative points value with the word "over", not color alone', async () => {
    const base = mira();
    const character = {
      ...base,
      actions: [
        ...base.actions,
        {
          id: 'over-1',
          seq: base.actions.length + 1,
          at: '2026-11-07T10:00:00.000Z',
          actor: { role: 'staff' as const, name: 'Desk' },
          type: 'points.adjusted' as const,
          payload: { currency: 'shinies', amount: -20, reason: 'Test' },
        },
      ],
    };
    renderApp(`/c/${base.id}`, { characters: [character], settings: STAFF });
    const chips = await screen.findByRole('list', { name: 'Points' });
    const shinies = within(chips)
      .getAllByRole('listitem')
      .find((li) => li.textContent?.startsWith('Shinies'));
    expect(shinies).toHaveTextContent('Shinies -20 over');
  });

  it('adds an AP chip per archetype with AP earned, after the other points', async () => {
    // Lark has basic levels in Magic (3 AP) and Crafting (1 AP) only.
    renderApp(`/c/${lark().id}`, { characters: [lark()] });
    const chips = await screen.findByRole('list', { name: 'Points' });
    const items = within(chips)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items.slice(0, 5).map((t) => t?.split(' ')[0])).toEqual([
      'CXP',
      'LXP',
      'PXP',
      'FP',
      'Shinies',
    ]);
    expect(items.slice(5)).toEqual(['Magic AP 3', 'Crafting AP 1']);
  });

  it('shows the header, chips, cards, and staff controls', async () => {
    renderApp(`/c/${mira().id}`, { characters: [mira()], settings: STAFF });
    expect(await screen.findByRole('heading', { level: 1, name: 'Mira Voss' })).toBeVisible();
    expect(screen.getByText('Elf, Windwalker. Player: Sam Hollis')).toBeInTheDocument();
    const chips = screen.getByRole('list', { name: 'Points' });
    expect(chips).toHaveTextContent('CXP 250 left');
    expect(chips).toHaveTextContent('LXP 1 left');
    // Five stat tiles, each read out in full; no AP chips while no AP is earned.
    expect(
      within(chips)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['CXP 250 left', 'LXP 1 left', 'PXP 0 left', 'FP 0', 'Shinies 0']);
    for (const title of [
      'Profile',
      'Infection',
      'Stats',
      'Skills',
      'Passive Abilities',
      'Story Notes',
    ])
      expect(screen.getByRole('region', { name: title })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Archetype points' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a story note' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit profile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Raise Quick Reflexes' })).toBeInTheDocument();
    expect(screen.getAllByText('Next level: 1 LXP')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Change Infection Level' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Character' });
    expect(within(nav).getByRole('link', { name: 'Sheet' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('levels an ability, then labels the stepper with the blocking reason', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(`/c/${mira().id}`, {
      characters: [mira()],
      settings: STAFF,
    });
    await user.click(await screen.findByRole('button', { name: 'Raise Accuracy' }));
    expect(await screen.findByText('Accuracy is now level 2.')).toBeInTheDocument();
    expect(screen.getAllByText('Not enough LXP: needs 1, 0 left.')).toHaveLength(2);
    expect(repository.data.characters.get(mira().id)?.actions).toHaveLength(2);
  });

  it('changes infection only with a reason', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${mira().id}`, { characters: [mira()], settings: STAFF });
    await user.click(await screen.findByRole('button', { name: 'Change Infection Level' }));
    const dialog = screen.getByRole('dialog', { name: 'Change Infection Level' });
    const level = within(dialog).getByLabelText(/New level/);
    await user.clear(level);
    await user.type(level, '3');
    await user.click(within(dialog).getByRole('button', { name: 'Save change' }));
    expect(within(dialog).getByText('Enter a reason for the change.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Reason/), 'Rose at the swamp gate.');
    await user.click(within(dialog).getByRole('button', { name: 'Save change' }));
    expect(await screen.findByText('Infection Level is now 3.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Infection' })).toHaveTextContent('3 of 10'),
    );
  });

  it('player mode shows text only', async () => {
    renderApp(`/c/${mira().id}`, { characters: [mira()] });
    await screen.findByRole('heading', { level: 1, name: 'Mira Voss' });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    const skills = screen.getByRole('region', { name: 'Skills' });
    expect(skills).toHaveTextContent('Quick Reflexes 1 · 1 per encounter');
    expect(skills).toHaveTextContent('Accuracy 1 · 1 per repop');
  });

  it('players get the character menu in order, with Print last and no staff screens', async () => {
    renderApp(`/c/${mira().id}`, { characters: [mira()] });
    const nav = await screen.findByRole('navigation', { name: 'Character' });
    expect(menuNames(nav)).toEqual([
      'Sheet',
      'Play Tracker',
      'Skills',
      'Spells',
      'Recipes',
      'Professions',
      'Familiars and Boons',
      'Log',
      'Requests',
      'Share',
      'Print',
    ]);
    expect(within(nav).queryByRole('link', { name: 'More' })).not.toBeInTheDocument();
  });

  it('staff also get Check-in and Points, before Print', async () => {
    renderApp(`/c/${mira().id}`, { characters: [mira()], settings: STAFF });
    const nav = await screen.findByRole('navigation', { name: 'Character' });
    expect(menuNames(nav).slice(-5)).toEqual(['Requests', 'Share', 'Check-in', 'Points', 'Print']);
  });

  it.each([
    ['Requests', 'requests', 'Requests'],
    ['Share', 'share', 'Share'],
    ['Check-in', 'checkin', 'Check-in'],
    ['Points', 'points', 'Points'],
    ['Print', 'print', null],
  ])('the %s menu item opens its screen', async (name, path, heading) => {
    const user = userEvent.setup();
    renderApp(`/c/${mira().id}`, { characters: [mira()], settings: STAFF });
    const nav = await screen.findByRole('navigation', { name: 'Character' });
    await user.click(within(nav).getByRole('link', { name }));
    expect(window.location.hash).toBe(`#/c/${mira().id}/${path}`);
    await waitFor(() =>
      expect(within(nav).getByRole('link', { name })).toHaveAttribute('aria-current', 'page'),
    );
    if (heading)
      expect(await screen.findByRole('heading', { level: 2, name: heading })).toBeVisible();
    else expect(await screen.findByRole('main')).toBeInTheDocument();
  });

  it('Requests lists only the requests for this character', async () => {
    const other = { ...mira(), id: 'other-character' };
    window.location.hash = `#/c/${mira().id}/requests`;
    const repository = createMemoryRepository({ characters: [mira(), other] });
    for (const [id, characterId, skillId] of [
      ['req-mine', mira().id, 'assault'],
      ['req-other', other.id, 'bash'],
    ] as const)
      repository.data.requests.set(id, {
        id,
        characterId,
        createdAt: '2026-10-05T10:00:00.000Z',
        kind: 'learn-skill',
        skillId,
        part: 'basic',
        toLevel: 1,
        teacher: 'Old Tom',
        note: '',
        status: 'sent',
      });
    render(<App repository={repository} user={TEST_PLAYER} />);
    expect(await screen.findByRole('region', { name: 'Assault level 1' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Bash level 1' })).not.toBeInTheDocument();
  });
});

/** The character menu items by full name (short phone labels keep the full name as aria-label). */
function menuNames(nav: HTMLElement): (string | null)[] {
  return within(nav)
    .getAllByRole('link')
    .map((a) => a.getAttribute('aria-label') ?? a.textContent);
}

/** "Step 3 of 6" for a wizard step id, whatever steps exist. */
function stepText(id: (typeof WIZARD_STEPS)[number]['id']): string {
  return `Step ${WIZARD_STEPS.findIndex((s) => s.id === id) + 1} of ${WIZARD_STEPS.length}`;
}

/** Presses Next until the Review step shows (steps after starting skills accept no input). */
async function nextToReview(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  for (let i = 0; i < WIZARD_STEPS.length && !screen.queryByText(stepText('review')); i++)
    await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText(stepText('review'))).toBeInTheDocument();
}

describe('create wizard', () => {
  it('blocks Next with reasons, then creates the character', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp('/new', { settings: STAFF });
    expect(await screen.findByText(stepText('names'))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the character name.');
    await user.type(screen.getByLabelText(/Character name/), 'Wren Ashby');
    await user.type(screen.getByLabelText(/Player name/), 'Jo Park');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText(stepText('ancestry'))).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Elf' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a subtype for Elf.');
    await user.click(screen.getByRole('radio', { name: 'Stonewalker' }));
    await user.click(screen.getByRole('radio', { name: '1 level, +10 CXP' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText(stepText('lxp'))).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Shrug It Off' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText(stepText('skills'))).toBeInTheDocument();
    const chips = screen.getByRole('list', { name: 'Starting points' });
    expect(chips).toHaveTextContent('CXP260left of 260');
    await user.click(screen.getByRole('button', { name: 'Raise Assault' }));
    await user.click(screen.getByRole('button', { name: 'Raise Assault' }));
    expect(chips).toHaveTextContent('CXP230left of 260');
    expect(chips).toHaveTextContent('Warrior AP3earned, 3 left');
    await user.click(screen.getByRole('button', { name: 'Raise Assault Adept' }));
    expect(chips).toHaveTextContent('Warrior AP3earned, 0 left');
    expect(screen.getAllByText('Not enough Warrior AP: needs 6, 0 left.').length).toBeGreaterThan(
      0,
    );
    // Lowering the basic level that paid for the adept level shows the engine's reason.
    await user.click(screen.getByRole('button', { name: 'Lower Assault' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Not enough Warrior AP: needs 3, 1 left.');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(stepText('skills'))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Raise Assault' }));
    await nextToReview(user);

    expect(screen.getByText('Elf, Stonewalker')).toBeInTheDocument();
    expect(screen.getByText('Assault 2, Assault Adept 1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create character' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Wren Ashby' })).toBeVisible();
    const [stored] = repository.data.characters.values();
    expect(stored?.actions.map((a) => a.type)).toEqual([
      'character.created',
      'ancestry.leveled',
      'skill.learned',
      'skill.learned',
      'skill.learned',
    ]);
    expect(screen.getByRole('list', { name: 'Points' })).toHaveTextContent('CXP 230 left');
  });

  it('allows zero starting skills with a warning on Review', async () => {
    const user = userEvent.setup();
    renderApp('/new', { settings: STAFF });
    await user.type(await screen.findByLabelText(/Character name/), 'Wren Ashby');
    await user.type(screen.getByLabelText(/Player name/), 'Jo Park');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('radio', { name: 'Elf' }));
    await user.click(screen.getByRole('radio', { name: 'Stonewalker' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('radio', { name: 'Shrug It Off' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(stepText('skills'))).toBeInTheDocument();
    await nextToReview(user);
    expect(screen.getByText(/^No starting skills picked\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create character' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Wren Ashby' })).toBeVisible();
  });
});
