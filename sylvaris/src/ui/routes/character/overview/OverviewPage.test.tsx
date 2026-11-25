import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset, plan, type StatLine } from '../../../../engine/index.ts';
import type { Action, Settings, StoredCharacter } from '../../../../engine/model.ts';
import { lark, mira, tom } from '../../../test/fixtures.ts';
import { renderApp } from '../../../test/renderApp.tsx';
import { ash } from '../../../test/veteran.ts';
import {
  EMPTY_DRAFT,
  selectRace,
  setChoice,
  staffCommands,
  type WizardDraft,
} from '../../create/steps.ts';
import {
  capText,
  durationText,
  incomeLine,
  languagesText,
  raceChoiceRows,
} from './overviewModel.ts';

const STAFF: Settings = { mode: 'staff', theme: 'system' };
const rs = loadRuleset();
const region = (name: string) => screen.findByRole('region', { name });

/** Plans the create wizard's commands into an action log. */
function planActions(d: WizardDraft): Action[] {
  let actions: Action[] = [];
  let n = 0;
  for (const command of staffCommands(d, rs)) {
    const sheet = deriveSheet(rs, actions);
    const r = plan(rs, sheet, command, {
      actor: { role: 'staff' },
      now: () => '2026-01-01T00:00:00.000Z',
      newId: () => `ember-${++n}`,
      nextSeq: sheet.lastSeq + 1,
    });
    if (!r.ok) throw new Error(r.errors[0]?.message);
    actions = [...actions, ...r.actions];
  }
  return actions;
}

/** A new Dragonborn with a fire element and a bite, built through the engine. */
function dragon(): StoredCharacter {
  let d: WizardDraft = { ...EMPTY_DRAFT, characterName: 'Ember Vey', playerName: 'Jo Lake' };
  d = selectRace(d, 'dragonborn', rs);
  d = setChoice(setChoice(d, 'element', 'fire'), 'natural-weapon', 'bite');
  return {
    id: 'ember',
    schemaVersion: 1,
    rulesetId: rs.id,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    actions: planActions(d),
  };
}

describe('overview', () => {
  it('shows Life and Armor Points first with their sources and caps', async () => {
    renderApp(`/c/${ash().id}`, { characters: [ash()] });
    const body = await region('Life and armor');
    expect(body).toHaveTextContent(
      'Life Points30From: Base Life Points 10, Toughness (Expert) +20Cap 100',
    );
    expect(body).toHaveTextContent('Armor Points20');
    // AC-11: the app does not track worn armor; the card says so.
    expect(body).toHaveTextContent('Plus worn armor, from its tag.');
    const regions = within(screen.getByRole('main'))
      .getAllByRole('region')
      .map((r) => r.getAttribute('aria-labelledby') && r.querySelector('h2')?.textContent);
    expect(regions.slice(0, 4)).toEqual(['Life and armor', 'Skills', 'Profile', 'Race']);
  });

  it('shows the profile, Spirit Fragments, upkeep, income, and the Calling', async () => {
    renderApp(`/c/${ash().id}`, { characters: [ash()] });
    expect(await region('Profile')).toHaveTextContent('A caravan guard who stayed.');
    expect(screen.getByRole('region', { name: 'Spirit Fragments' })).toHaveTextContent('9of 10');
    const upkeep = screen.getByRole('region', { name: 'Upkeep and check-in income' });
    expect(upkeep).toHaveTextContent('1 Silver per event, the first event free');
    expect(upkeep).toHaveTextContent('Human innate: 1 Silver');
    const calling = screen.getByRole('region', { name: 'Calling' });
    expect(calling).toHaveTextContent('The Protector');
    expect(within(calling).getByRole('link', { name: 'Calling details' })).toHaveAttribute(
      'href',
      `#/c/${ash().id}/calling`,
    );
    expect(within(calling).getByRole('link', { name: 'Skills' })).toBeVisible();
    expect(within(calling).getByRole('link', { name: 'Magic and journals' })).toBeVisible();
    // Players see no edit controls.
    expect(screen.queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Spirit Fragment' })).not.toBeInTheDocument();
  });

  it('says how far a new character is from a Calling', async () => {
    renderApp(`/c/${mira().id}`, { characters: [mira()] });
    expect(await region('Calling')).toHaveTextContent(
      'No Calling yet. Full events: 0 of the 5 needed.',
    );
  });

  it('puts conditional race effects in words', async () => {
    renderApp(`/c/${tom().id}`, { characters: [tom()] });
    const race = await region('Race');
    expect(race).toHaveTextContent('Armor Points +10, only while wearing physical armor');
    expect(race).toHaveTextContent(
      'Innate active, 1 use per encounter, one use of Weapon Proficiency',
    );
  });

  it('shows the Gnome tool slot and Harvesting income', async () => {
    renderApp(`/c/${lark().id}`, { characters: [lark()] });
    expect(await region('Slots and languages')).toHaveTextContent('6, plus 1 for tools only');
    expect(screen.getByRole('region', { name: 'Upkeep and check-in income' })).toHaveTextContent(
      'Harvesting 2: 4 Basic Components',
    );
  });

  it('shows race choices and the natural weapon', async () => {
    const ember = dragon();
    renderApp(`/c/${ember.id}`, { characters: [ember] });
    const race = await region('Race');
    expect(race).toHaveTextContent('ElementFire');
    expect(race).toHaveTextContent('Natural weaponBite (Greatclaw), base 3 damage');
    // AC-12: the weapon shows once, with no generic "or" text.
    expect(within(race).getAllByText(/Bite/)).toHaveLength(1);
    expect(race).not.toHaveTextContent('chosen at creation');
    expect(screen.getByRole('region', { name: 'Passive damage' })).toHaveTextContent(
      'Bite (Greatclaw), base 3 damage',
    );
    expect(screen.getByRole('region', { name: 'Passive damage' })).toHaveTextContent(
      'No passive damage yet',
    );
  });

  it('lists the skills by category with level, Techniques, uses, and links (AC-4)', async () => {
    renderApp(`/c/${ash().id}`, { characters: [ash()] });
    const card = await region('Skills');
    const groups = within(card)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(groups[0]).toBe('Defensive');
    expect(groups).toContain('Calling');
    const toughness = within(card).getByRole('link', { name: 'Toughness' });
    expect(toughness).toHaveAttribute('href', `#/c/${ash().id}/skills/toughness`);
    expect(toughness.parentElement).toHaveTextContent(
      'Level 3. Expert Technique. 3 uses per re-pop',
    );
    expect(
      within(card).getByRole('link', { name: 'Guardianship' }).parentElement,
    ).toHaveTextContent(/Level 1\. \d+ uses? per re-pop/);
    expect(within(card).getByRole('link', { name: 'All skills' })).toBeVisible();
  });

  it('names the Dragonborn racial skill after the element (AC-8)', async () => {
    const ember = dragon();
    renderApp(`/c/${ember.id}`, { characters: [ember] });
    const race = await region('Race');
    expect(within(race).getByRole('link', { name: "Fire's Gift" })).toHaveAttribute(
      'href',
      '#/c/ember/skills/elements-gift',
    );
    expect(race).toHaveTextContent('one Basic Fire spell');
    expect(race).not.toHaveTextContent('<Element>');
  });

  it('lets staff edit the profile', async () => {
    const { repository } = renderApp(`/c/${ash().id}`, { characters: [ash()], settings: STAFF });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit profile' });
    fireEvent.change(within(dialog).getByLabelText('Backstory'), {
      target: { value: 'Guarded caravans for ten years.' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Age category/), { target: { value: '4' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save profile' }));
    expect(await region('Profile')).toHaveTextContent('Guarded caravans for ten years.');
    const stored = await repository.getCharacter(ash().id);
    const sheet = deriveSheet(rs, stored!.actions);
    expect(sheet.profile.ageCategory).toBe(4);
  });

  it('lets staff change Spirit Fragments with a reason', async () => {
    renderApp(`/c/${ash().id}`, { characters: [ash()], settings: STAFF });
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Spirit Fragment' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove Spirit Fragments' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove Spirit Fragments' }));
    expect(await within(dialog).findByText('Give a reason.')).toBeVisible();
    fireEvent.change(within(dialog).getByLabelText(/Reason/), {
      target: { value: 'Died at Ravenmoor' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove Spirit Fragments' }));
    const card = await region('Spirit Fragments');
    expect(await within(card).findByText('Last change: -1, Died at Ravenmoor')).toBeVisible();
    expect(card).toHaveTextContent('8of 10');
  });
});

describe('overview model', () => {
  it('words caps, durations, languages, income, and choices', () => {
    const line = { total: 24, value: 20, cap: 20, sources: [], conditional: [] } as StatLine;
    expect(capText(line)).toBe('Capped at 20 (before the cap: 24)');
    expect(capText({ ...line, total: 5, value: 5 })).toBe('Cap 20');
    expect(capText({ ...line, cap: null })).toBeNull();
    expect(durationText(60)).toBe('1 minute');
    expect(durationText(90)).toBe('1 minute 30 seconds');
    expect(durationText(45)).toBe('45 seconds');
    const m = deriveSheet(rs, mira().actions);
    expect(languagesText(m)).toBe('3: Elven, Common, plus 1 to name in play');
    expect(raceChoiceRows(rs, m)).toEqual([{ label: 'Extra language', value: 'Common' }]);
    const l = deriveSheet(rs, lark().actions);
    expect(l.stats.checkInIncome.map(incomeLine)).toEqual(['Harvesting 2: 4 Basic Components']);
  });
});
