import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  deriveSheet,
  loadRuleset,
  plan,
  skillLevel,
  type CreateCharacterCommand,
} from '../../../../engine/index.ts';
import {
  CURRENT_SCHEMA_VERSION,
  type Settings,
  type StoredCharacter,
} from '../../../../engine/model.ts';
import { renderApp } from '../../../test/renderApp.tsx';
import { filterChips, filterSkills, ownedSummary } from './skillInfo.ts';

const rs = loadRuleset();
const STAFF: Settings = { mode: 'staff', theme: 'system' };
const ID = '5a0e8c1d-2b3f-4e6a-9c7d-1f2e3d4c5b6a';

/** An invented character with Assault 2, Assault Adept 1, and Aimed Strike 1. */
function wren(): StoredCharacter {
  const command: CreateCharacterCommand = {
    type: 'createCharacter',
    characterName: 'Wren Ashby',
    playerName: 'Jo Park',
    ancestryId: 'elf',
    subtypeId: 'elf-windwalker',
    startingLxpAbilityId: 'accuracy',
    startingSkills: [
      { skillId: 'assault', part: 'basic', level: 2 },
      { skillId: 'assault', part: 'adept', level: 1 },
      { skillId: 'aimed-strike', part: 'basic', level: 1 },
    ],
  };
  let n = 0;
  const result = plan(rs, deriveSheet(rs, []), command, {
    actor: { role: 'staff' },
    now: () => '2026-10-01T10:00:00.000Z',
    newId: () => `wren-${++n}`,
    nextSeq: 1,
  });
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' '));
  return {
    id: ID,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    rulesetId: rs.id,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    actions: result.actions,
  };
}

describe('skill helpers', () => {
  const sheet = deriveSheet(rs, wren().actions);
  const base = { category: 'standard' as const, chips: [], query: '', ownedOnly: false };

  it('filters by archetype chips, name search, and owned only', () => {
    expect(filterSkills(rs, sheet, base)).toHaveLength(56);
    expect(filterSkills(rs, sheet, { ...base, chips: ['warrior'] })).toHaveLength(13);
    expect(filterSkills(rs, sheet, { ...base, chips: ['warrior', 'rogue'] })).toHaveLength(26);
    expect(filterSkills(rs, sheet, { ...base, query: 'ASSA' }).map((s) => s.id)).toEqual([
      'assault',
    ]);
    expect(filterSkills(rs, sheet, { ...base, ownedOnly: true }).map((s) => s.id)).toEqual([
      'assault',
      'aimed-strike',
    ]);
    expect(filterSkills(rs, sheet, { ...base, category: 'magic', ownedOnly: true })).toEqual([]);
  });

  it('offers the same kind of chips on every tab', () => {
    const labels = (category: 'standard' | 'magic' | 'crafting' | 'multi') =>
      filterChips(rs, category).map((c) => c.label);
    expect(labels('standard')).toEqual(['Warrior', 'Defender', 'Rogue', 'Utility']);
    expect(labels('magic')).toEqual([
      'Elemental',
      'Life',
      'Death',
      'Tech',
      'Mastery magic',
      'General',
    ]);
    expect(labels('crafting')).toEqual([
      'Engineering',
      'Chemistry',
      'Medicine',
      'Gearcraft',
      'Mastery crafts',
      'General',
    ]);
    expect(labels('multi')).toEqual(
      expect.arrayContaining(['Warrior', 'Utility', 'Magic', 'Crafting']),
    );
  });

  it('filters magic by school, mastery magic, and general', () => {
    const magic = { ...base, category: 'magic' as const };
    const ids = (chips: string[]) => filterSkills(rs, sheet, { ...magic, chips }).map((s) => s.id);
    expect(ids(['life'])).toEqual(['life-magic']);
    expect(ids(['mastery'])).toEqual(
      expect.arrayContaining(['ruin-magic', 'nature-magic', 'blood-magic']),
    );
    expect(ids(['mastery']).every((id) => rs.skillsById[id]?.type === 'mastery')).toBe(true);
    const general = ids(['general']);
    expect(general).toEqual(expect.arrayContaining(['channeling', 'focus', 'spell-memorization']));
    expect(general).not.toContain('life-magic');
    expect(general).not.toContain('ruin-magic');
    expect(ids(['life', 'mastery'])).toHaveLength(1 + ids(['mastery']).length);
    expect(ids([])).toHaveLength(filterSkills(rs, sheet, magic).length);
  });

  it('filters crafting by base craft, mastery crafts, and general', () => {
    const crafting = { ...base, category: 'crafting' as const };
    const ids = (chips: string[]) =>
      filterSkills(rs, sheet, { ...crafting, chips }).map((s) => s.id);
    expect(ids(['medicine'])).toEqual(['medicine']);
    // Mastery crafts show only under Mastery crafts, not under their component crafts.
    expect(ids(['mastery'])).toContain('medcraft');
    expect(ids(['gearcraft'])).toEqual(['gearcraft']);
    expect(ids(['general'])).toEqual(
      expect.arrayContaining(['efficient-crafting', 'quick-crafting', 'recipe-memorization']),
    );
    expect(ids(['general'])).not.toContain('medcraft');
  });

  it('filters multi skills by any archetype they can belong to', () => {
    const multi = { ...base, category: 'multi' as const };
    const ids = (chips: string[]) => filterSkills(rs, sheet, { ...multi, chips }).map((s) => s.id);
    expect(ids(['utility'])).toContain('bardic-performance');
    expect(ids(['utility'])).not.toContain('ritualism');
    expect(ids(['crafting'])).toEqual(expect.arrayContaining(['ritualism', 'alchemy']));
    expect(ids(['warrior'])).toContain('meditation-skill-refresh');
  });

  it('summarizes owned levels compactly', () => {
    const assault = rs.skillsById['assault'];
    const bash = rs.skillsById['bash'];
    if (!assault || !bash) throw new Error('missing skills');
    const owned = sheet.skills.find((s) => s.skillId === 'assault');
    expect(ownedSummary(assault, owned)).toBe('Basic 2 · Adept 1');
    expect(ownedSummary(bash, undefined)).toBe('Not learned');
  });
});

describe('skills list', () => {
  it('staff: tabs, points, archetype chips, search, owned only', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${ID}/skills`, { characters: [wren()], settings: STAFF });
    expect(await screen.findByRole('heading', { level: 2, name: 'Skills' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Standard' })).toHaveAttribute('aria-selected', 'true');
    const points = screen.getByRole('list', { name: 'Standard points available' });
    // One compact line: "CXP 210 · W 0 · ..." on screen, full wording for screen readers.
    const pools = within(points).getAllByRole('listitem');
    expect(pools.map((li) => li.querySelector('[aria-hidden="true"]')?.textContent)).toEqual([
      'CXP 210',
      'W 0',
      'D 0',
      'R 1',
      'U 0',
    ]);
    expect(points).toHaveTextContent('CXP 210 available');
    expect(points).toHaveTextContent('Warrior AP 0 available');
    expect(points).toHaveTextContent('Rogue AP 1 available');
    expect(screen.getByText('56 skills')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Owned only' })).not.toBeChecked();

    const assault = screen.getByRole('button', { name: /^Assault/ });
    expect(assault).toHaveAttribute('aria-expanded', 'false');
    expect(assault).toHaveTextContent('Basic 2 · Adept 1');
    expect(screen.getByRole('button', { name: /^Bash/ })).toHaveTextContent('Not learned');
    expect(screen.getByRole('button', { name: /^Delay Effect \(R\)/ })).toBeInTheDocument();
    // Opens in place with every part.
    await user.click(assault);
    expect(assault).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Assault Mastery' })).toBeInTheDocument();
    await user.click(assault);

    await user.click(screen.getByRole('button', { name: 'Warrior' }));
    expect(screen.getByRole('button', { name: 'Warrior' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('13 skills')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Search standard skills' }), 'stun');
    expect(screen.getByText('1 skill')).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: 'Search standard skills' }));
    await user.click(screen.getByRole('checkbox', { name: 'Owned only' }));
    expect(screen.getByText('1 skill')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Magic' }));
    expect(screen.getByRole('list', { name: 'Magic points available' })).toHaveTextContent(
      'Magic AP 0 available',
    );
    expect(screen.getByText('No magic skills learned yet.')).toBeInTheDocument();

    // Magic has its own chips; chip choices are kept per tab.
    await user.click(screen.getByRole('checkbox', { name: 'Owned only' }));
    const magicChips = screen.getByRole('group', { name: 'Filter magic skills' });
    expect(
      within(magicChips)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Elemental', 'Life', 'Death', 'Tech', 'Mastery magic', 'General']);
    await user.click(within(magicChips).getByRole('button', { name: 'Life' }));
    expect(screen.getByText('1 skill')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Life Magic/ })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Crafting' }));
    const craftChips = screen.getByRole('group', { name: 'Filter crafting skills' });
    expect(within(craftChips).getByRole('button', { name: 'Mastery crafts' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await user.click(screen.getByRole('tab', { name: 'Standard' }));
    expect(screen.getByRole('button', { name: 'Warrior' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('player: owned only is on by default and shows only learned levels, each with a +', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${ID}/skills`, { characters: [wren()] });
    const owned = await screen.findByRole('checkbox', { name: 'Owned only' });
    expect(owned).toBeChecked();
    expect(screen.getByText('2 skills')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Assault/ }));
    expect(screen.getByRole('region', { name: 'Assault Basic' })).toHaveTextContent('Level 2');
    expect(screen.getByRole('region', { name: 'Assault Adept' })).toHaveTextContent('Level 1');
    expect(screen.queryByRole('region', { name: 'Assault Mastery' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I learned Assault Adept' })).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Show Advanced and Mastery (not learned yet)' }),
    );
    await user.click(screen.getByRole('button', { name: 'I learned Assault Advanced' }));
    const dialog = screen.getByRole('dialog', { name: 'I learned Assault Advanced' });
    expect(within(dialog).queryByLabelText('Part')).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('Target level')).toHaveValue('1');
  });

  it('?open= opens a skill on its tab', async () => {
    renderApp(`/c/${ID}/skills?open=assault`, { characters: [wren()] });
    expect(await screen.findByRole('button', { name: /^Assault/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('mastery magic lists its abilities and what each spends', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${ID}/skills?tab=magic`, { characters: [wren()], settings: STAFF });
    await user.click(await screen.findByRole('button', { name: /^Blood Magic/ }));
    const adept = screen.getByRole('region', { name: 'Blood Magic: Adept' });
    expect(adept).toHaveTextContent(
      'Spends 1 Life Magic Adept use, 1 Death Magic Adept use, 1 Life Magic use and 1 Death Magic use.',
    );
    expect(screen.queryByText(/spells\.json/)).not.toBeInTheDocument();
  });
});

describe('skill detail', () => {
  it('shows marks and parts in words; a mastery without its prerequisite says why', async () => {
    renderApp(`/c/${ID}/skills/assault`, { characters: [wren()], settings: STAFF });
    expect(await screen.findByRole('heading', { level: 2, name: 'Assault' })).toBeVisible();
    expect(screen.getByText('Warrior archetype')).toBeInTheDocument();
    const basic = screen.getByRole('region', { name: 'Assault Basic' });
    expect(basic).toHaveTextContent('per repop');
    expect(basic).toHaveTextContent('2 uses per repop');
    expect(within(basic).getByText('Next level: 30 CXP')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Assault Adept' })).getByText(
        'Not enough Warrior AP: needs 6, 0 left.',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Assault Mastery' })).getByText(
        /^Needs Assault level 9./,
      ),
    ).toBeInTheDocument();
  });

  it('explains resistance and avoidance marks', async () => {
    renderApp(`/c/${ID}/skills/delay-effect`, { characters: [wren()], settings: STAFF });
    const marks = await screen.findByRole('list', { name: 'Marks' });
    expect(marks).toHaveTextContent(/^Resistance \(R\)/);
  });

  it('buys a level of a known skill: teacher optional', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(`/c/${ID}/skills/assault`, {
      characters: [wren()],
      settings: STAFF,
    });
    await user.click(await screen.findByRole('button', { name: 'Raise Assault' }));
    const dialog = screen.getByRole('dialog', { name: 'Learn Assault level 3 for 30 CXP?' });
    expect(within(dialog).getByText('Optional: leave blank when self-taught.')).toBeVisible();
    expect(within(dialog).getByLabelText(/Teacher/)).not.toBeRequired();
    await user.click(within(dialog).getByRole('button', { name: 'Learn' }));
    expect(await screen.findByText('Learned Assault level 3.')).toBeInTheDocument();
    await waitFor(() => {
      const stored = repository.data.characters.get(ID);
      expect(stored && skillLevel(deriveSheet(rs, stored.actions), 'assault', 'basic')).toBe(3);
    });
    expect(screen.getByText('Next level: 40 CXP')).toBeInTheDocument();
  });

  it('buys a new skill: teacher required, and recorded', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(`/c/${ID}/skills/bash`, {
      characters: [wren()],
      settings: STAFF,
    });
    await user.click(await screen.findByRole('button', { name: 'Raise Bash' }));
    const dialog = screen.getByRole('dialog', { name: 'Learn Bash level 1 for 10 CXP?' });
    expect(within(dialog).getByLabelText(/Teacher/)).toBeRequired();
    await user.click(within(dialog).getByRole('button', { name: 'Learn' }));
    expect(within(dialog).getByText("Enter the teacher's name.")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Teacher/), 'Old Tom');
    await user.click(within(dialog).getByRole('button', { name: 'Learn' }));
    expect(await screen.findByText('Learned Bash level 1.')).toBeInTheDocument();
    const last = repository.data.characters.get(ID)?.actions.at(-1);
    expect(last?.payload).toMatchObject({ skillId: 'bash', toLevel: 1, teacher: 'Old Tom' });
    expect(screen.getByRole('region', { name: 'Bash Basic' })).toHaveTextContent('Old Tom');
  });

  it('refunds a level only with a reason; blocked refunds say why', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(`/c/${ID}/skills/assault`, {
      characters: [wren()],
      settings: STAFF,
    });
    // Assault level 2 earned Warrior AP that Assault Adept spent: blocked, with the reason.
    await user.click(await screen.findByRole('button', { name: 'Lower Assault' }));
    let dialog = screen.getByRole('dialog', { name: 'Refund Assault level 2?' });
    expect(within(dialog).getByText('Returns 20 CXP.')).toBeInTheDocument();
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/Refunding would leave Warrior AP/);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getByRole('button', { name: 'Lower Assault Adept' }));
    dialog = screen.getByRole('dialog', { name: 'Refund Assault Adept level 1?' });
    expect(within(dialog).getByText('Returns 3 Warrior AP.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Refund' }));
    expect(within(dialog).getByText('Enter a reason for the refund.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Reason/), 'Bought by mistake.');
    await user.click(within(dialog).getByRole('button', { name: 'Refund' }));
    expect(await screen.findByText('Refunded Assault Adept level 1.')).toBeInTheDocument();
    const last = repository.data.characters.get(ID)?.actions.at(-1);
    expect(last?.type).toBe('skill.refunded');
    expect(last?.payload).toMatchObject({ reason: 'Bought by mistake.', toLevel: 0 });
  });

  it('player mode: levels and text only', async () => {
    renderApp(`/c/${ID}/skills/assault`, { characters: [wren()] });
    expect(await screen.findByRole('heading', { level: 2, name: 'Assault' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^(Raise|Lower) / })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Assault Basic' })).toHaveTextContent('Level 2');
    expect(screen.getByRole('region', { name: 'Assault Mastery' })).toHaveTextContent(
      'Not learned',
    );
  });

  it('player with Owned only: just the parts they have, and a button for the rest', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${ID}/skills/assault?owned=1`, { characters: [wren()] });
    expect(await screen.findByRole('heading', { level: 2, name: 'Assault' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Assault Basic' })).toHaveTextContent('Level 2');
    expect(screen.getByRole('region', { name: 'Assault Adept' })).toHaveTextContent('Level 1');
    expect(screen.queryByRole('region', { name: 'Assault Advanced' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Assault Mastery' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All skills' })).toHaveAttribute(
      'href',
      `#/c/${ID}/skills?tab=standard&owned=1`,
    );
    await user.click(
      screen.getByRole('button', { name: 'Show Advanced and Mastery (not learned yet)' }),
    );
    expect(screen.getByRole('region', { name: 'Assault Mastery' })).toHaveTextContent(
      'Not learned',
    );
    expect(screen.queryByRole('button', { name: /^Show / })).not.toBeInTheDocument();
  });

  it('staff always see every part', async () => {
    renderApp(`/c/${ID}/skills/assault?owned=1`, { characters: [wren()], settings: STAFF });
    expect(await screen.findByRole('region', { name: 'Assault Mastery' })).toBeInTheDocument();
  });

  it('an unknown skill id says so', async () => {
    renderApp(`/c/${ID}/skills/nope`, { characters: [wren()] });
    expect(await screen.findByText('There is no skill with this link.')).toBeInTheDocument();
  });
});
