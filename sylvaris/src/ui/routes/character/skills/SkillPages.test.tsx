import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset, skillLevel, skillTechniques } from '../../../../engine/index.ts';
import type { Settings } from '../../../../engine/model.ts';
import { renderApp } from '../../../test/renderApp.tsx';
import { mira } from '../../../test/fixtures.ts';
import { ash, ashAfter } from '../../../test/veteran.ts';
import { callingTechniqueNote } from './requestParts.ts';
import { EMBER_ID, emberDragonborn } from './testDragonborn.ts';

const rs = loadRuleset();
const STAFF: Settings = { mode: 'staff', theme: 'system' };
const MIRA = mira().id;
const ASH = ash().id;

describe('skills list', () => {
  it('staff: tabs, points, search, owned only, rows with level and Techniques', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${MIRA}/skills?tab=magic`, { characters: [mira()], settings: STAFF });
    expect(await screen.findByRole('heading', { level: 2, name: 'Skills' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Magic' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Offensive',
      'Defensive',
      'Utility',
      'Magic',
      'Crafting',
      'Racial',
      'Calling',
    ]);
    expect(screen.getByRole('list', { name: 'Points available' })).toHaveTextContent(
      'XP 85 available',
    );
    const fire = screen.getByRole('link', { name: /^Fire Magic/ });
    expect(fire).toHaveTextContent('Level 3');
    expect(fire).toHaveTextContent('3 uses');
    expect(fire).toHaveTextContent('Expert');
    expect(screen.getByRole('link', { name: /^Air Magic/ })).toHaveTextContent('Not learned');
    expect(screen.getByRole('link', { name: /^Time Magic/ })).toHaveTextContent('Advanced');
    expect(screen.getByRole('link', { name: /^Time Magic/ })).toHaveTextContent(
      'Needs prerequisites',
    );

    await user.click(screen.getByRole('checkbox', { name: 'Owned only' }));
    expect(screen.getByText('1 skill')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Owned only' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search magic skills' }), 'water');
    expect(screen.getByText('1 skill')).toBeInTheDocument();
    // Staff do not send requests.
    expect(screen.queryByRole('button', { name: /^Request/ })).not.toBeInTheDocument();
  });

  it('Calling tab shows CXP and the Calling skills', async () => {
    renderApp(`/c/${ASH}/skills?tab=calling`, { characters: [ash()], settings: STAFF });
    const points = await screen.findByRole('list', { name: 'Points available' });
    expect(points).toHaveTextContent('Calling XP 20 available');
    expect(screen.getByRole('link', { name: /^Guardianship/ })).toHaveTextContent('Level 1');
  });

  it('player: Owned only starts on, + Request sends a learning with a teacher', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(`/c/${MIRA}/skills?tab=defensive`, {
      characters: [mira()],
    });
    expect(await screen.findByRole('checkbox', { name: 'Owned only' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Owned only' }));
    await user.click(screen.getByRole('button', { name: 'Request Evasion' }));
    const dialog = screen.getByRole('dialog', { name: 'Request Evasion' });
    expect(dialog).toHaveTextContent('Level 1');
    expect(dialog).toHaveTextContent('If approved: 5 XP.');
    await user.click(within(dialog).getByRole('button', { name: 'Send to staff' }));
    expect(dialog).toHaveTextContent('Enter who taught you.');
    await user.type(within(dialog).getByLabelText(/Who taught you/), 'Old Tom');
    await user.type(within(dialog).getByLabelText(/Note/), 'At the Harvest Moon.');
    await user.click(within(dialog).getByRole('button', { name: 'Send to staff' }));
    expect(await screen.findByText(/Sent Evasion level 1 to staff/)).toBeInTheDocument();
    const saved = [...repository.data.requests.values()];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      characterId: MIRA,
      skillId: 'evasion',
      step: { level: 1 },
      teacher: 'Old Tom',
      note: 'At the Harvest Moon.',
      status: 'sent',
    });
  });
});

describe('skill detail', () => {
  it('shows uses, ability unlock states, passives, and the Log of Learning', async () => {
    renderApp(`/c/${ASH}/skills/deflection`, { characters: [ash()] });
    expect(await screen.findByRole('heading', { level: 2, name: 'Deflection' })).toBeVisible();
    const level = screen.getByRole('region', { name: 'Level and uses' });
    expect(level).toHaveTextContent('3 of 10');
    expect(level).toHaveTextContent('Uses per re-pop3');
    const basic = screen.getByRole('region', { name: 'Basic (level 1)' });
    expect(basic).toHaveTextContent('Unlocked');
    expect(basic).toHaveTextContent('1 use');
    const expert = screen.getByRole('region', { name: 'Expert (level 3)' });
    expect(expert).toHaveTextContent('Locked. Needs the Expert Technique (level 3 reached).');
    const log = screen.getByRole('region', { name: 'Log of Learning' });
    expect(log).toHaveTextContent('At character creation');
    // A player can ask for the next level or the Expert Technique.
    expect(screen.getByRole('button', { name: 'Request Deflection' })).toBeInTheDocument();
  });

  it('staff learn a level and a Technique with a teacher and event, then refund it', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(`/c/${ASH}/skills/deflection`, {
      characters: [ash()],
      settings: STAFF,
    });
    await screen.findByRole('heading', { level: 2, name: 'Deflection' });
    expect(screen.getByText('Next level: 20 XP')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add Expert Technique: 5 XP' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Learn Deflection Expert Technique for 5 XP?',
    });
    await user.type(within(dialog).getByLabelText(/Teacher/), 'Captain Dorn');
    await user.selectOptions(within(dialog).getByLabelText(/Event/), '2026-09-19-harvest-moon');
    await user.click(within(dialog).getByRole('button', { name: 'Learn' }));
    expect(await screen.findByText('Learned Deflection Expert Technique.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Expert (level 3)' })).toHaveTextContent(
        'Unlocked',
      ),
    );
    const log = screen.getByRole('region', { name: 'Log of Learning' });
    expect(log).toHaveTextContent('Captain Dorn');
    expect(log).toHaveTextContent('Harvest Moon');

    await user.click(screen.getByRole('button', { name: 'Raise Deflection' }));
    const learn = screen.getByRole('dialog', { name: 'Learn Deflection level 4 for 20 XP?' });
    expect(learn).toHaveTextContent('Levels 2 to 10 are self-taught');
    await user.click(within(learn).getByRole('button', { name: 'Learn' }));
    await screen.findByText('Learned Deflection level 4.');

    await user.click(screen.getByRole('button', { name: 'Refund Expert Technique' }));
    const refund = screen.getByRole('dialog', { name: 'Refund Deflection Expert Technique?' });
    expect(refund).toHaveTextContent('Returns 5 XP.');
    await user.click(within(refund).getByRole('button', { name: 'Refund' }));
    expect(refund).toHaveTextContent('Enter a reason for the refund.');
    await user.type(within(refund).getByLabelText(/Reason/), 'Entered by mistake.');
    await user.click(within(refund).getByRole('button', { name: 'Refund' }));
    await screen.findByText('Refunded Deflection Expert Technique.');

    const stored = repository.data.characters.get(ASH);
    const sheet = deriveSheet(rs, stored?.actions ?? []);
    expect(skillLevel(sheet, 'deflection')).toBe(4);
    expect(skillTechniques(sheet, 'deflection')).toEqual([]);
  });

  it('a blocked advanced skill shows why', async () => {
    renderApp(`/c/${ASH}/skills/defensive-stance`, { characters: [ash()], settings: STAFF });
    const card = await screen.findByRole('region', { name: 'Prerequisites' });
    expect(card).toHaveTextContent('Cannot be learned yet: prerequisites missing.');
    expect(card).toHaveTextContent('Endurance, Master Technique: missing');
    expect(card).toHaveTextContent('Toughness, Master Technique: missing');
    expect(screen.getByText(/Defensive Stance needs Endurance \(Master Technique\)/)).toBeVisible();
  });

  it('Calling skill: CXP and the Calling Technique rules state', async () => {
    renderApp(`/c/${ASH}/skills/guardianship`, { characters: [ash()], settings: STAFF });
    const card = await screen.findByRole('region', { name: 'Calling Technique rules' });
    expect(card).toHaveTextContent('None at the event the Calling started (Harvest Moon).');
    expect(card).toHaveTextContent('Balance kept.');
    expect(card).toHaveTextContent('CXP available20');
    expect(screen.getByText('Next level: 10 CXP')).toBeInTheDocument();
  });
});

describe('opening tab and race choices in names (AC-5, AC-8)', () => {
  it('opens on the first category with an owned skill, never an empty Owned only tab', async () => {
    // Ember owns Defensive and Racial skills, no Offensive ones.
    renderApp(`/c/${EMBER_ID}/skills`, { characters: [emberDragonborn()] });
    expect(await screen.findByRole('tab', { name: 'Defensive' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('checkbox', { name: 'Owned only' })).toBeChecked();
    expect(screen.getByRole('link', { name: /^Toughness/ })).toBeVisible();
    expect(screen.queryByText(/No defensive skills learned yet/)).not.toBeInTheDocument();
  });

  it('a tab in the address still wins', async () => {
    renderApp(`/c/${ASH}/skills?tab=offensive`, { characters: [ash()], settings: STAFF });
    expect(await screen.findByRole('tab', { name: 'Offensive' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it("names the Dragonborn's Gift after the element on Skills and its page", async () => {
    renderApp(`/c/${EMBER_ID}/skills?tab=racial`, { characters: [emberDragonborn()] });
    expect(await screen.findByRole('link', { name: /^Fire's Gift/ })).toBeVisible();
    expect(screen.queryByText(/<Element>/)).not.toBeInTheDocument();
  });

  it('fills the element into Breath Weapon and keeps the skill id in the link', async () => {
    renderApp(`/c/${EMBER_ID}/skills/elements-gift`, { characters: [emberDragonborn()] });
    expect(await screen.findByRole('heading', { level: 2, name: "Fire's Gift" })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Basic (level 1)' })).toHaveTextContent(
      'Innate cast a Basic Fire spell.',
    );
  });

  it('Breath Weapon texts use the Fire numbers', async () => {
    renderApp(`/c/${EMBER_ID}/skills/breath-weapon`, { characters: [emberDragonborn()] });
    const basic = await screen.findByRole('region', { name: 'Basic (level 1)' });
    expect(basic).toHaveTextContent('Throw one breath packet for 10 Fire.');
    expect(screen.getByRole('region', { name: 'Expert (level 3)' })).toHaveTextContent(
      'Frontal Cone for 25 Fire.',
    );
  });
});

describe('Calling Technique request (player)', () => {
  it('says before sending when and how often staff can record it', async () => {
    const user = userEvent.setup();
    const character = ashAfter([
      { type: 'adjustPoints', currency: 'cxp', amount: 20, reason: 'test' },
      { type: 'learnSkill', skillId: 'guardianship', step: { level: 2 } },
      { type: 'learnSkill', skillId: 'guardianship', step: { level: 3 } },
    ]);
    renderApp(`/c/${ASH}/skills/guardianship`, { characters: [character] });
    await user.click(await screen.findByRole('button', { name: 'Request Guardianship' }));
    const dialog = screen.getByRole('dialog', { name: 'Request Guardianship' });
    const note = callingTechniqueNote(1);
    expect(note).toBe(
      'Staff record a Calling Technique at an event the character attended after the Calling started, and only one Calling Technique per event.',
    );
    await user.click(within(dialog).getByRole('radio', { name: 'Expert Technique' }));
    expect(dialog).toHaveTextContent(note);
    await user.click(within(dialog).getByRole('radio', { name: 'Level 4' }));
    expect(dialog).not.toHaveTextContent(note);
  });
});
