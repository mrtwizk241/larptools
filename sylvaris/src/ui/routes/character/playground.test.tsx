// The no-login builds as a build playground (LOCAL_MODE): points tiles "left / total", the test
// build banner (add or remove points with Undo, delete), the overspend pop-up and estimate line,
// skill levels and Techniques learned and taken back in one tap with Undo, and the menu.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { deriveSheet, loadRuleset, type Sheet } from '../../../engine/index.ts';
import type { Settings } from '../../../engine/model.ts';
import type { MemoryRepository } from '../../data/memoryRepository.ts';
import { renderApp } from '../../test/renderApp.tsx';
import { ash } from '../../test/veteran.ts';
import {
  eventsEstimateText,
  overspendText,
  parsePointsChange,
  pointsChangeText,
  removableStep,
} from './playground.ts';
import { controlGroups } from './skills/controlGroups.ts';

vi.mock('../../../localMode.ts', async (original) => ({
  ...(await original<typeof import('../../../localMode.ts')>()),
  LOCAL_MODE: true,
}));

const rs = loadRuleset();
const STAFF: Settings = { mode: 'staff', theme: 'system' };
const ASH = ash().id;

function sheetOf(repository: MemoryRepository) {
  const stored = repository.data.characters.get(ASH);
  return deriveSheet(rs, stored?.actions ?? []);
}

/** Ash's sheet with XP, CXP, and AXP left set to the given numbers. */
function withLeft(xp: number, cxp: number, axp: number): Sheet {
  const base = deriveSheet(rs, ash().actions);
  const p = base.points;
  return {
    ...base,
    points: {
      ...p,
      xp: { ...p.xp, available: xp },
      cxp: { ...p.cxp, available: cxp },
      axp: { ...p.axp, available: axp },
    },
  };
}

function toastWith(text: string): HTMLElement {
  const el = screen.getByText(text).closest('div');
  if (!el) throw new Error(`No toast: ${text}`);
  return el;
}

describe('build playground helpers', () => {
  it('takes back the top level before a Technique', () => {
    const sheet = deriveSheet(rs, ash().actions);
    // Ash: Toughness 3 with Expert. Level 3 holds the Expert Technique, so the Technique goes first.
    const toughness = sheet.skills.find((s) => s.skillId === 'toughness');
    expect(removableStep(toughness)).toEqual({ technique: 'expert' });
    const deflection = sheet.skills.find((s) => s.skillId === 'deflection');
    expect(removableStep(deflection)).toEqual({ level: 3 });
    expect(removableStep(undefined)).toBeNull();
  });

  it('reads a signed whole number of points to add or remove', () => {
    expect(parsePointsChange('50')).toBe(50);
    expect(parsePointsChange(' +50 ')).toBe(50);
    expect(parsePointsChange('-20')).toBe(-20);
    expect(parsePointsChange('1,000')).toBe(1000);
    for (const bad of ['', '0', '-0', '2.5', 'ten', '--1', '10000000'])
      expect(parsePointsChange(bad)).toBeNull();
    expect(pointsChangeText('xp', 50)).toBe('Added 50 XP.');
    expect(pointsChangeText('xp', -20)).toBe('Removed 20 XP.');
    expect(pointsChangeText('cxp', 1500)).toBe('Added 1,500 CXP.');
  });

  it('says how far over a balance is and how many events would earn it', () => {
    expect(overspendText(rs, 'xp', 25)).toBe(
      'You have spent 25 more XP than you have. Earning it takes 1 event (60 XP an event).',
    );
    // hand-derived: 130 at 60 an event is 3 events; 7 CXP at 5 is 2; 1,500 XP at 60 is 25
    expect(overspendText(rs, 'xp', 130)).toBe(
      'You have spent 130 more XP than you have. Earning it takes 3 events (60 XP an event).',
    );
    expect(overspendText(rs, 'cxp', 7)).toBe(
      'You have spent 7 more CXP than you have. Earning it takes 2 events (5 CXP an event).',
    );
    expect(overspendText(rs, 'axp', 1)).toBe(
      'You have spent 1 more AXP than you have. Earning it takes 1 event (1 AXP an event).',
    );
    expect(overspendText(rs, 'xp', 1500)).toBe(
      'You have spent 1,500 more XP than you have. Earning it takes 25 events (60 XP an event).',
    );
  });

  it('estimates the events for the currency that needs the most, naming only those over', () => {
    expect(eventsEstimateText(rs, withLeft(0, 0, 0))).toBeNull();
    // hand-derived: XP 130 over is 3 events, CXP 7 over is 2: 3
    expect(eventsEstimateText(rs, withLeft(-130, -7, 5))).toBe(
      'Over: about 3 more events would earn this build (60 XP and 5 CXP an event).',
    );
    expect(eventsEstimateText(rs, withLeft(-1, -1, -1))).toBe(
      'Over: about 1 more event would earn this build (60 XP, 5 CXP, and 1 AXP an event).',
    );
    // hand-derived: 3 AXP over at 1 an event
    expect(eventsEstimateText(rs, withLeft(5, 0, -3))).toBe(
      'Over: about 3 more events would earn this build (1 AXP an event).',
    );
  });

  it('lists Level and the Techniques the level allows, with costs and reasons', () => {
    const sheet = deriveSheet(rs, ash().actions);
    const toughness = rs.skillsById.toughness;
    if (!toughness) throw new Error('no toughness');
    // Ash: Toughness 3 with Expert. Master (level 6) is not shown yet.
    const groups = controlGroups(rs, sheet, toughness);
    expect(groups.map((g) => [g.title, g.value])).toEqual([
      ['Level', '3'],
      ['Expert', 'Yes'],
    ]);
    const [level, expert] = groups;
    // hand-derived: level 4 costs 5 x 4 = 20 XP
    expect(level?.raise).toMatchObject({ label: 'Raise Toughness (20 XP)', block: null });
    // Level 3 holds the Expert Technique.
    expect(level?.lower.label).toBe('Lower Toughness');
    expect(level?.lower.block).not.toBeNull();
    expect(expert?.lower).toMatchObject({ label: 'Take back Toughness Expert Technique' });
    expect(expert?.lower.block).toBeNull();
    expect(expert?.raise.block).toBe('Toughness Expert Technique is learned.');

    const evasion = rs.skillsById.evasion;
    if (!evasion) throw new Error('no evasion');
    const [none] = controlGroups(rs, sheet, evasion);
    expect(none?.value).toBe('0');
    expect(none?.lower.block).toBe('Evasion is not learned.');
  });
});

describe('build playground screens', () => {
  it('shows points left of earned; the banner adds and removes points, with Undo', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(`/c/${ASH}`, { characters: [ash()], settings: STAFF });
    const { available, earned } = sheetOf(repository).points.xp;
    const tiles = await screen.findByRole('list', { name: 'Points' }, { timeout: 5000 });
    expect(tiles).toHaveTextContent(`XP ${available} / ${earned} left`);
    expect(tiles).toHaveTextContent('MT');
    // The budget card is gone.
    expect(screen.queryByRole('heading', { name: 'Points budget' })).toBeNull();
    const banner = screen.getByRole('region', { name: /Test build\./ });
    expect(banner).toHaveTextContent(
      'Test build. Saved only in this browser. Back up in Settings to keep a copy.',
    );
    expect(within(banner).getByRole('radio', { name: 'XP' })).toBeChecked();
    const amount = within(banner).getByRole('textbox', { name: 'Amount to add or remove' });

    await user.type(amount, 'lots');
    await user.click(within(banner).getByRole('button', { name: 'Add or remove points' }));
    expect(
      screen.getByText('Enter a whole number other than 0, for example 50 or -20.'),
    ).toBeVisible();

    // Remove 25 more XP than Ash has left: the tile goes red, a pop-up, and the estimate line.
    await user.clear(amount);
    await user.type(amount, `-${available + 25}`);
    await user.click(within(banner).getByRole('button', { name: 'Add or remove points' }));
    await waitFor(() => expect(sheetOf(repository).points.xp.available).toBe(-25));
    expect(tiles).toHaveTextContent(`XP (overspent) -25 / ${earned - available - 25} left`);
    expect(
      await screen.findByText(
        'You have spent 25 more XP than you have. Earning it takes 1 event (60 XP an event).',
      ),
    ).toBeVisible();
    expect(screen.getByText(/^Over: about 1 more event would earn this build/)).toBeVisible();
    expect(amount).toHaveValue('');

    await user.click(
      within(toastWith(`Removed ${available + 25} XP.`)).getByRole('button', { name: 'Undo' }),
    );
    await waitFor(() => expect(sheetOf(repository).points.xp.available).toBe(available));
    expect(screen.queryByText(/^Over: about/)).toBeNull();

    // CXP: add 50.
    await user.click(within(banner).getByRole('radio', { name: 'CXP' }));
    const cxp = sheetOf(repository).points.cxp.earned;
    await user.type(amount, '50{Enter}');
    await waitFor(() => expect(sheetOf(repository).points.cxp.earned).toBe(cxp + 50));
    expect(await screen.findByText('Added 50 CXP.')).toBeVisible();
  });

  it('deletes the test build behind a confirm', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(`/c/${ASH}`, { characters: [ash()], settings: STAFF });
    const name = sheetOf(repository).profile.characterName;
    await user.click(
      await screen.findByRole('button', { name: 'Delete test build' }, { timeout: 5000 }),
    );
    const dialog = screen.getByRole('dialog', { name: `Delete ${name}?` });
    await user.click(within(dialog).getByRole('button', { name: 'Delete test build' }));
    await waitFor(() => expect(repository.data.characters.has(ASH)).toBe(false));
    expect(await screen.findByText(`Deleted ${name}.`)).toBeVisible();
  });

  it('skill rows raise, lower, learn, and take back in one tap, with Undo', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(`/c/${ASH}/skills?tab=defensive`, {
      characters: [ash()],
      settings: STAFF,
    });
    const skill = (id: string) => sheetOf(repository).skills.find((s) => s.skillId === id);
    await user.click(
      await screen.findByRole('button', { name: 'Raise Toughness (20 XP)' }, { timeout: 5000 }),
    );
    await waitFor(() => expect(skill('toughness')?.level).toBe(4));
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(
      within(toastWith('Learned Toughness level 4.')).getByRole('button', { name: 'Undo' }),
    );
    await waitFor(() => expect(skill('toughness')?.level).toBe(3));

    // A blocked button says why: level 3 holds the Expert Technique.
    const lower = screen.getByRole('button', { name: 'Lower Toughness' });
    expect(lower).toHaveAttribute('aria-disabled', 'true');
    expect(lower).toHaveAttribute('title');
    await user.click(lower);
    expect(skill('toughness')?.level).toBe(3);
    expect(screen.getByText(lower.getAttribute('title') ?? '')).toBeVisible();

    // Deflection 3: the Expert group shows No, and one tap learns it.
    const expert = screen.getByRole('group', { name: 'Deflection Expert Technique' });
    expect(expert).toHaveTextContent('ExpertNo');
    await user.click(
      within(expert).getByRole('button', { name: 'Learn Deflection Expert Technique (5 XP)' }),
    );
    await waitFor(() => expect(skill('deflection')?.techniques).toEqual(['expert']));
    expect(await screen.findByText('Learned Deflection Expert Technique.')).toBeVisible();
    await user.click(
      within(expert).getByRole('button', { name: 'Take back Deflection Expert Technique' }),
    );
    await waitFor(() => expect(skill('deflection')?.techniques).toEqual([]));
    await user.click(screen.getByRole('button', { name: 'Lower Deflection' }));
    await waitFor(() => expect(skill('deflection')?.level).toBe(2));
    // The Expert group goes once the level is below 3 and it is not learned.
    expect(screen.queryByRole('group', { name: 'Deflection Expert Technique' })).toBeNull();

    // A new skill: Basic needs no teacher here.
    await user.click(screen.getByRole('button', { name: /^Raise Evasion/ }));
    await waitFor(() => expect(skill('evasion')?.level).toBe(1));
    expect(screen.queryByRole('checkbox', { name: /Technique/ })).toBeNull();
  });

  it('a skill row opens to what each ability does, and nothing else', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${ASH}/skills?tab=defensive`, { characters: [ash()], settings: STAFF });
    const toggle = await screen.findByRole('button', { name: /^Deflection/ }, { timeout: 5000 });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    if (!panel) throw new Error('No panel');
    expect(within(panel).getByRole('heading', { name: 'Basic (level 1)' })).toBeVisible();
    expect(panel).toHaveTextContent('Uses');
    expect(panel).not.toHaveTextContent('Learned');
    expect(within(panel).queryByRole('link')).toBeNull();
  });

  it('the skill page uses the same controls and has no Log of Learning', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(`/c/${ASH}/skills/deflection`, {
      characters: [ash()],
      settings: STAFF,
    });
    await screen.findByRole('heading', { level: 2, name: 'Deflection' }, { timeout: 5000 });
    expect(screen.queryByRole('heading', { name: 'Log of Learning' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Raise Deflection/ }));
    await waitFor(() =>
      expect(sheetOf(repository).skills.find((s) => s.skillId === 'deflection')?.level).toBe(4),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("has Rustwater's menu with no More page, and no check-in", async () => {
    renderApp(`/c/${ASH}/more`, { characters: [ash()], settings: STAFF });
    const nav = await screen.findByRole('navigation', { name: 'Character' }, { timeout: 5000 });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.getAttribute('aria-label') ?? a.textContent),
    ).toEqual([
      'Sheet',
      'Play Tracker',
      'Skills',
      'Magic',
      'Calling',
      'Extras',
      'Log',
      'Share',
      'Print',
    ]);
    // More goes to the Sheet.
    expect(await screen.findByRole('link', { name: 'Sheet', current: 'page' })).toBeVisible();
  });

  it('has no check-in, retirement, or event fields', async () => {
    renderApp(`/c/${ASH}/checkin`, { characters: [ash()], settings: STAFF });
    expect(await screen.findByText(/The Character Playground has no events/)).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Points' })).toBeNull();
  });
});
