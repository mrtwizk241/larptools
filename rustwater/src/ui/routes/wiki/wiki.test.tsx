import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { loadRuleset } from '../../../data/index.ts';
import { renderApp } from '../../test/renderApp.tsx';
import { ARTICLES, GROUPS } from './articles.ts';
import { parseBlocks, titleCase } from './wikiText.ts';

describe('wiki text', () => {
  it('parses headings, lists, tables, and tips', () => {
    const blocks = parseBlocks(
      [
        '## Title',
        'One line',
        'two lines.',
        '',
        '- a',
        '- b',
        '',
        '| A | B |',
        '|---|---|',
        '| 1 | 2 |',
        '',
        '> Tip text',
      ].join('\n'),
    );
    expect(blocks).toEqual([
      { kind: 'h2', text: 'Title' },
      { kind: 'p', text: 'One line two lines.' },
      { kind: 'ul', items: ['a', 'b'] },
      { kind: 'table', head: ['A', 'B'], rows: [['1', '2']] },
      { kind: 'tip', text: 'Tip text' },
    ]);
  });

  it('has no em dashes and links only to wiki pages that exist', () => {
    const ruleset = loadRuleset();
    const slugs = new Set(ARTICLES.map((a) => a.slug));
    for (const article of ARTICLES) {
      const body = article.body?.(ruleset) ?? '';
      expect(body, article.slug).not.toContain('—');
      for (const match of body.matchAll(/\]\(\/wiki\/([a-z-]+)/g))
        expect(slugs.has(match[1] ?? ''), `${article.slug} links to ${match[1]}`).toBe(true);
    }
  });
});

describe('rules wiki', () => {
  it('is open to signed-out visitors and searchable', async () => {
    const user = userEvent.setup();
    renderApp('/wiki', { user: null });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Rules Wiki' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Making a Character/ })).toHaveAttribute(
      'href',
      '#/wiki/making-a-character',
    );
    await user.type(screen.getByRole('searchbox', { name: 'Search the wiki' }), 'upkeep');
    expect(screen.getByText(/mention that\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Events, Check-In and Rewards/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Familiars/ })).not.toBeInTheDocument();
  });

  it('shows an article with numbers from the rules data', async () => {
    renderApp('/wiki/points', { user: null });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Points and Currencies' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Every new character starts with 250 CXP\./)).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'On this page' })).toBeInTheDocument();
    const table = screen.getAllByRole('table')[1];
    expect(table && within(table).getByText('Adept')).toBeInTheDocument();
  });

  it('lists every skill from the rules data, with search', async () => {
    const user = userEvent.setup();
    renderApp('/wiki/skills-list', { user: null });
    await screen.findByRole('heading', { level: 1, name: 'All Skills' });
    const count = loadRuleset().skills.length;
    expect(screen.getByText(`${count} skills`)).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Search skills' }), 'assault');
    expect(screen.getAllByText('Assault').length).toBeGreaterThan(0);
    expect(screen.queryByText('Toughness (Warrior)')).not.toBeInTheDocument();
  });

  it('says when a wiki page does not exist', async () => {
    renderApp('/wiki/nothing-here', { user: null });
    expect(await screen.findByText('There is no wiki page at this address.')).toBeInTheDocument();
  });
});

describe('title case', () => {
  it('capitalizes every word except short minor words in the middle', () => {
    expect(titleCase('Points and currencies')).toBe('Points and Currencies');
    expect(titleCase('Events, check-in and rewards')).toBe('Events, Check-In and Rewards');
    expect(titleCase('A weekend at Rustwater')).toBe('A Weekend at Rustwater');
    expect(titleCase('Ancestry levels (LXP)')).toBe('Ancestry Levels (LXP)');
    expect(titleCase('Things to look up')).toBe('Things to Look Up');
    expect(titleCase('Shared ability: the old ways')).toBe('Shared Ability: The Old Ways');
  });

  it('is used for every page and group title', () => {
    for (const article of ARTICLES) expect(titleCase(article.title)).toBe(article.title);
    for (const group of GROUPS) expect(titleCase(group.title)).toBe(group.title);
  });

  it('shows article headings in title case and keeps their anchors', async () => {
    renderApp('/wiki/points', { user: null });
    const heading = await screen.findByRole('heading', { level: 2, name: 'Skill Cost Chart' });
    expect(heading).toHaveAttribute('id', 'skill-cost-chart');
  });
});

/** The "N things" count line of a reference list. */
function countText(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

describe('reference list chips', () => {
  const ruleset = loadRuleset();

  it('narrows all skills by category, then by school', async () => {
    const user = userEvent.setup();
    renderApp('/wiki/skills-list', { user: null });
    const row = await screen.findByRole('group', { name: 'Filter skills by category' });
    await user.click(within(row).getByRole('button', { name: 'Magic' }));
    expect(within(row).getByRole('button', { name: 'Magic' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const magic = ruleset.skills.filter((s) => s.category === 'magic');
    expect(screen.getByText(countText(magic.length, 'skill', 'skills'))).toBeInTheDocument();
    const school = ruleset.ruleset.magicSchools.find((s) =>
      magic.some((k) => k.school === s.id && k.type !== 'mastery'),
    );
    if (!school) throw new Error('no school skill');
    const schoolRow = screen.getByRole('group', { name: 'Filter magic skills' });
    await user.click(within(schoolRow).getByRole('button', { name: school.name }));
    const inSchool = magic.filter((s) => s.school === school.id && s.type !== 'mastery');
    expect(screen.getByText(countText(inSchool.length, 'skill', 'skills'))).toBeInTheDocument();
    // Unpressing the category shows every skill again.
    await user.click(within(row).getByRole('button', { name: 'Magic' }));
    expect(
      screen.getByText(countText(ruleset.skills.length, 'skill', 'skills')),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Filter magic skills' })).not.toBeInTheDocument();
  });

  it('narrows all spells by school and rank', async () => {
    const user = userEvent.setup();
    renderApp('/wiki/spells-list', { user: null });
    await screen.findByRole('heading', { level: 1, name: 'All Spells' });
    expect(
      screen.getByText(countText(ruleset.spells.length, 'spell', 'spells')),
    ).toBeInTheDocument();
    const school = ruleset.ruleset.magicSchools[0];
    if (!school) throw new Error('no school');
    await user.click(
      within(screen.getByRole('group', { name: 'Filter spells by school' })).getByRole('button', {
        name: school.name,
      }),
    );
    const inSchool = ruleset.spells.filter((s) => !s.mastery && s.school === school.id);
    expect(screen.getByText(countText(inSchool.length, 'spell', 'spells'))).toBeInTheDocument();
    await user.click(
      within(screen.getByRole('group', { name: 'Filter spells by rank' })).getByRole('button', {
        name: 'Basic',
      }),
    );
    const basic = inSchool.filter((s) => s.rank === 'basic');
    expect(screen.getByText(countText(basic.length, 'spell', 'spells'))).toBeInTheDocument();
    // Mastery magic chips come from the data too.
    const mastery = ruleset.spells.find((s) => s.mastery);
    if (mastery?.mastery) {
      const name = ruleset.skillsById[mastery.masterySkill]?.name ?? '';
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('narrows all recipes by craft and rank', async () => {
    const user = userEvent.setup();
    renderApp('/wiki/recipes-list', { user: null });
    await screen.findByRole('heading', { level: 1, name: 'All Recipes' });
    const craft = ruleset.ruleset.craftingDisciplines[0];
    if (!craft) throw new Error('no craft');
    await user.click(
      within(screen.getByRole('group', { name: 'Filter recipes by craft' })).getByRole('button', {
        name: craft.name,
      }),
    );
    const inCraft = ruleset.recipes.filter((r) => !r.mastery && r.discipline === craft.id);
    expect(screen.getByText(countText(inCraft.length, 'recipe', 'recipes'))).toBeInTheDocument();
    await user.click(
      within(screen.getByRole('group', { name: 'Filter recipes by rank' })).getByRole('button', {
        name: 'Adept',
      }),
    );
    const adept = inCraft.filter((r) => r.rank === 'adept');
    expect(screen.getByText(countText(adept.length, 'recipe', 'recipes'))).toBeInTheDocument();
  });

  it('narrows performances by rank and rituals by how often they work', async () => {
    const user = userEvent.setup();
    renderApp('/wiki/performances-list', { user: null });
    await screen.findByRole('heading', { level: 1, name: 'Performances and Rituals' });
    const { performances, rituals } = ruleset.performances;
    await user.click(
      within(screen.getByRole('group', { name: 'Filter performances by rank' })).getByRole(
        'button',
        { name: 'Advanced' },
      ),
    );
    const advanced = performances.filter((p) => p.tier === 'advanced');
    expect(
      screen.getByText(countText(advanced.length, 'performance', 'performances')),
    ).toBeInTheDocument();
    await user.click(
      within(
        screen.getByRole('group', { name: 'Filter rituals by how often they work' }),
      ).getByRole('button', { name: 'Passive' }),
    );
    const passive = rituals.filter((r) => r.frequency === 'passive');
    expect(screen.getByText(countText(passive.length, 'ritual', 'rituals'))).toBeInTheDocument();
  });
});

describe('all ancestries', () => {
  it('starts with every ancestry closed and opens one on tap', async () => {
    const user = userEvent.setup();
    const ruleset = loadRuleset();
    renderApp('/wiki/ancestries-list', { user: null });
    await screen.findByRole('heading', { level: 1, name: 'All Ancestries' });
    const ancestry = ruleset.ancestries.ancestries[0];
    if (!ancestry) throw new Error('no ancestry');
    const main = screen.getByRole('main');
    const outer = Array.from(main.querySelectorAll('details')).filter(
      (d) => d.parentElement?.closest('details') === null,
    );
    expect(outer).toHaveLength(ruleset.ancestries.ancestries.length);
    for (const details of outer) expect(details).not.toHaveAttribute('open');
    const title = within(main).getByText(ancestry.name, { selector: 'summary span' });
    const details = title.closest('details') as HTMLElement;
    expect(within(details).getByText('Base infection')).not.toBeVisible();
    await user.click(title);
    expect(details).toHaveAttribute('open');
    expect(within(details).getByText('Base infection')).toBeVisible();
  });
});
