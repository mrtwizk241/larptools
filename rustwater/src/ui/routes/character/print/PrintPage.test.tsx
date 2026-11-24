import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '../../../../engine/model.ts';
import fixtureText from '../../../../../tests/e2e/fixtures/sample-ash-print.rwchar.json?raw';
import { renderApp } from '../../../test/renderApp.tsx';
import { ASH_LATEST_EVENT, ash, ashAfter } from '../../../test/veteran.ts';
import { combatKey } from '../play/combat.ts';
import { PRINT_COMMANDS, printAsh, printAshFileText } from './testCharacter.ts';

const STAFF: Settings = { mode: 'staff', theme: 'system' };
const PLAYER: Settings = { mode: 'player', theme: 'system' };

describe('print test character', () => {
  it('matches the e2e fixture', () => {
    expect(JSON.parse(fixtureText)).toEqual(JSON.parse(printAshFileText()));
  });
});

describe('print view', () => {
  afterEach(() => localStorage.clear());

  it('renders the redesigned sheet for the veteran', async () => {
    const character = ashAfter([...PRINT_COMMANDS, { type: 'updateProfile', age: 4 }]);
    renderApp(`/c/${character.id}/print`, { characters: [character], settings: PLAYER });
    const paper = await screen.findByRole('article', { name: 'Character sheet for Ash Merrow' });
    const inPaper = within(paper);
    const region = (name: string) => inPaper.getByRole('region', { name });

    // Header: player, ancestry, age step, infection, event and today's date.
    expect(paper).toHaveTextContent('Player: Robin Vale · Human, Wastelander · Age 4 of 10');
    expect(paper).toHaveTextContent('Infection Level 3 of 10');
    expect(paper).toHaveTextContent(/Event Date \w/);

    // Points: one compact line each.
    const left = inPaper.getByRole('list', { name: 'Points left' });
    expect(
      within(left)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['CXP 407', 'LXP 1', 'PXP 35', 'Shinies 1360', 'FP 16']);
    const ap = inPaper.getByRole('list', { name: 'AP left of earned' });
    expect(ap).toHaveTextContent('Warrior 0 of 6');
    expect(ap).toHaveTextContent('Utility 3 of 3');
    expect(ap).toHaveTextContent('Crafting 0 of 0');

    // Main focus: Health, Armor, and the default damage line plus blank lines to write in.
    const focus = region('Health, Armor, and Damage');
    expect(focus).toHaveTextContent('Max Health20');
    expect(focus).toHaveTextContent('Armor5');
    const damage = within(focus).getByRole('table', { name: 'Damage' });
    const rows = within(damage).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.textContent)).toEqual(['Short weapon1 Steel', '', '']);
    expect(within(focus).queryByRole('checkbox')).not.toBeInTheDocument();

    // Skills by type, in order, each with a cost mark and a box per use.
    const order = inPaper
      .getAllByRole('region')
      .map((r) => r.getAttribute('aria-label'))
      .filter((n) => n?.endsWith(' skills'));
    expect(order).toEqual([
      'Ancestry skills',
      'Warrior skills',
      'Defender skills',
      'Rogue skills',
      'Utility skills',
      'Magic skills',
    ]);
    const ancestry = region('Ancestry skills');
    expect(ancestry).toHaveTextContent('1 LXP left');
    expect(ancestry).toHaveTextContent('Make It Work 2 (LXP)Per repop');
    expect(within(ancestry).getByRole('img', { name: '2 empty boxes' })).toBeInTheDocument();
    // No ancestry effect text, and the ancestry passive is under Passive Effects.
    expect(paper).not.toHaveTextContent('Use this Skill to treat');
    const warrior = region('Warrior skills');
    expect(warrior).toHaveTextContent('Assault 3 (CP)Per repopAdept (AP), per encounter');
    expect(warrior).toHaveTextContent('Toughness (Warrior) 1 (AP) · Passive');
    const basicBoxes = within(warrior).getByRole('img', { name: '3 empty boxes' });
    expect(basicBoxes.children).toHaveLength(3);
    expect(within(warrior).getByRole('img', { name: '1 empty box' }).children).toHaveLength(1);
    expect(region('Magic skills')).toHaveTextContent('Life Magic 2 (CP)Per repop');

    const passives = region('Passive Effects');
    expect(passives).toHaveTextContent('Scavenger: Collect 2 random basic Resources at check-in.');
    expect(passives).toHaveTextContent(
      'Toughness (Warrior) 1: You gain +10 Max Health per Level. Counted in the totals.',
    );
    expect(region('Profession')).toHaveTextContent('35 PXP left');
    expect(region('Profession')).toHaveTextContent('Medic. Passive: Skilled Healer.');
    expect(region('Profession')).toHaveTextContent('Stitch em up 1Per repop');
    expect(region('Familiar')).toHaveTextContent('1 Essence, 16 FP left');
    expect(region('Familiar')).toHaveTextContent('Pip (raven), level 3, awakened: Push.');
    expect(region('Familiar')).toHaveTextContent('Grant Feint Per repop');
    expect(region('Boons').querySelectorAll('li')).toHaveLength(1);

    // Page 2: memory, compact.
    const memory = region('Spells, Recipes, and Performances');
    expect(memory).toHaveTextContent(
      'Spells (slots used: Life 2 of 2): Life Bolt (B), Health Spring (B).',
    );

    // Left off the paper: starting items, knowledges, story notes, owed rewards.
    expect(inPaper.queryByRole('region', { name: 'Starting items' })).not.toBeInTheDocument();
    expect(paper).not.toHaveTextContent('Basic Melee Weapon');
    expect(paper).not.toHaveTextContent('Knowledges');
    expect(paper).not.toHaveTextContent('Old river trade routes');
    expect(paper).not.toHaveTextContent('Owes the ferryman a favor.');
    expect(paper).not.toHaveTextContent('Spell Blueprint');

    expect(paper).toHaveTextContent('Ruleset 2026-2.0');
    expect(paper).toHaveTextContent('Unofficial fan tool, not affiliated with Rustwater LARP.');
  });

  it('prints the damage lines saved on this device', async () => {
    const character = printAsh();
    localStorage.setItem(
      combatKey(character.id),
      JSON.stringify({
        damage: ['sharpen-weapon'],
        lines: [
          { id: 'a', name: 'Old Faithful', attack: 'long', type: 'Wood' },
          { id: 'b', attack: 'packet-life' },
        ],
      }),
    );
    renderApp(`/c/${character.id}/print`, { characters: [character], settings: PLAYER });
    const paper = await screen.findByRole('article', { name: 'Character sheet for Ash Merrow' });
    const damage = within(paper).getByRole('table', { name: 'Damage' });
    // Permanent bonuses only: the chosen buff is not counted.
    expect(
      within(damage)
        .getAllByRole('row')
        .slice(1)
        .map((r) => r.textContent),
    ).toEqual(['Old Faithful2 Wood', 'Life packet1 Essence', '']);
  });

  it('says what is missing on a sparse sheet', async () => {
    renderApp(`/c/${ash().id}/print`, { characters: [ash()], settings: PLAYER });
    const paper = await screen.findByRole('article', { name: /Character sheet/ });
    // Only the ancestry abilities: no archetype skill groups.
    const groups = within(paper)
      .getAllByRole('region')
      .map((r) => r.getAttribute('aria-label'))
      .filter((n) => n?.endsWith(' skills'));
    expect(groups).toEqual(['Ancestry skills']);
    expect(
      within(paper).getByRole('region', { name: 'Spells, Recipes, and Performances' }),
    ).toHaveTextContent('Nothing memorized.');
    expect(within(paper).getByRole('region', { name: 'Profession' })).toHaveTextContent(
      'No profession.',
    );
    expect(within(paper).getByRole('region', { name: 'Familiar' })).toHaveTextContent(
      'No familiar.',
    );
  });

  it('prints with the Print button', async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderApp(`/c/${ash().id}/print`, { characters: [ash()], settings: STAFF });
    await user.click(await screen.findByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });

  it('shows the receipt for the latest check-in and switches events', async () => {
    const user = userEvent.setup();
    const character = printAsh();
    renderApp(`/c/${character.id}/print`, { characters: [character], settings: STAFF });
    await user.click(await screen.findByRole('tab', { name: 'Check-in receipt' }));
    let receipt = screen.getByRole('article', { name: 'Check-in receipt for Ash Merrow' });
    expect(receipt).toHaveTextContent('Harvest Moon');
    expect(within(receipt).getByRole('table', { name: 'Awards' })).toHaveTextContent(
      'Event CXP+75 CXP',
    );
    const shinies = within(receipt).getByRole('table', { name: 'Shiny purchases' });
    expect(shinies).toHaveTextContent('CXP x2 (+2 CXP)100');
    expect(shinies).toHaveTextContent('Cost140 Shinies');
    expect(within(receipt).getByRole('region', { name: 'Items owed' })).toHaveTextContent(
      '1 Spell Blueprint (Life Bolt)',
    );
    // Due upkeep: an unticked box labelled Paid, never "Paid." as a statement (acceptance D2).
    expect(receipt).toHaveTextContent('Upkeep due: 2 Common resources or 10 Bits Paid');
    expect(receipt).not.toHaveTextContent('Paid.');
    expect(within(receipt).getByRole('img', { name: 'Unticked box' })).toBeInTheDocument();
    expect(receipt).toHaveTextContent('Staff signature');

    await user.selectOptions(screen.getByLabelText('Event'), '2026-03-14-thaw-market');
    receipt = screen.getByRole('article', { name: 'Check-in receipt for Ash Merrow' });
    expect(receipt).toHaveTextContent('Thaw Market');
    expect(receipt).toHaveTextContent('Full Event NPC (Paid)');
    expect(receipt).toHaveTextContent('No upkeep: first event.');
  });

  it('prints covered upkeep with a ticked box', async () => {
    const user = userEvent.setup();
    const character = ashAfter([
      { type: 'spendShinies', purchaseId: 'buy-upkeep', eventKey: ASH_LATEST_EVENT },
    ]);
    renderApp(`/c/${character.id}/print`, { characters: [character], settings: STAFF });
    await user.click(await screen.findByRole('tab', { name: 'Check-in receipt' }));
    const receipt = screen.getByRole('article', { name: /Check-in receipt for/ });
    expect(receipt).toHaveTextContent('Upkeep covered (40 Shinies)');
    expect(within(receipt).getByRole('img', { name: 'Ticked box' })).toBeInTheDocument();
    expect(within(receipt).queryByRole('img', { name: 'Unticked box' })).not.toBeInTheDocument();
  });
});
