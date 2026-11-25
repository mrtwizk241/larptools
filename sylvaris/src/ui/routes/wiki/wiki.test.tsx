import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/renderApp.tsx';
import { ARTICLES, ARTICLES_BY_SLUG } from './articles.ts';
import { referenceList } from './referenceData.ts';
import { allTechniquesCost, costToLevel, wikiRuleset } from './wikiData.ts';
import { anchorId, parseBlocks } from './wikiText.ts';

const rs = wikiRuleset();

function bodyOf(slug: string): string {
  return ARTICLES_BY_SLUG.get(slug)?.body?.(rs) ?? '';
}

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

  it('links only to wiki pages and sections that exist', () => {
    for (const article of ARTICLES) {
      const body = article.body?.(rs) ?? '';
      for (const match of body.matchAll(/\]\(\/wiki(?:\/([a-z-]+))?(?:#([a-z0-9-]+))?\)/g)) {
        const slug = match[1];
        if (slug === undefined) continue;
        const target = ARTICLES_BY_SLUG.get(slug);
        expect(target, `${article.slug} links to ${slug}`).toBeDefined();
        const anchor = match[2];
        if (anchor) {
          const ids = parseBlocks(target?.body?.(rs) ?? '').flatMap((b) =>
            b.kind === 'h2' || b.kind === 'h3' ? [anchorId(b.text)] : [],
          );
          expect(ids, `${article.slug} links to ${slug}#${anchor}`).toContain(anchor);
        }
      }
    }
  });

  it('has no em dashes, no unfilled values, and no words from the old game', () => {
    const old =
      /Rustwater|Shinies|Risen|Ancestr|Archetype|Professions?\b|\bLXP\b|\bPXP\b|\bFP\b|undefined|NaN|\[object/;
    for (const article of ARTICLES) {
      const text = `${article.title} ${article.summary} ${article.body?.(rs) ?? ''}`;
      expect(text, article.slug).not.toContain(String.fromCharCode(0x2014));
      expect(text, article.slug).not.toMatch(old);
    }
  });

  it('pulls its numbers from the rules data', () => {
    const points = bodyOf('points');
    expect(rs.ruleset.xp.start).toBe(150);
    expect(points).toContain(`Every new character starts with ${rs.ruleset.xp.start} XP`);
    expect(points).toContain(`Each full event gives ${rs.ruleset.xp.perEvent} XP`);
    expect(points).toContain(`**${rs.ruleset.xp.earnedCap} XP**`);
    expect(points).toContain(`**${rs.ruleset.cxp.earnedCap} CXP**`);
    expect(rs.ruleset.cxp.earnedCap).toBe(2 * (costToLevel(rs, 10) + allTechniquesCost(rs)));
    const skills = bodyOf('skills');
    for (const t of rs.ruleset.skills.techniques) expect(skills).toContain(`| ${t.cost} XP |`);
  });
});

describe('rules wiki', () => {
  it('is open to signed-out visitors and searchable', async () => {
    const user = userEvent.setup();
    renderApp('/wiki', { user: null });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Rules wiki' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Making a character/ })).toHaveAttribute(
      'href',
      '#/wiki/making-a-character',
    );
    const search = screen.getByRole('searchbox', { name: 'Search the wiki' });
    await user.type(search, 'upkeep');
    expect(screen.getByRole('link', { name: /Events and check-in/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Artifacts/ })).not.toBeInTheDocument();
  });

  it('finds a skill, a spell, and a recipe from the home search', async () => {
    const user = userEvent.setup();
    renderApp('/wiki', { user: null });
    const search = await screen.findByRole('searchbox', { name: 'Search the wiki' });
    const found = async (text: string, name: RegExp, slug: string) => {
      await user.clear(search);
      await user.type(search, text);
      const region = screen.getByRole('region', { name: 'In the reference lists' });
      const link = within(region).getAllByRole('link', { name })[0];
      expect(link).toHaveAttribute('href', expect.stringContaining(`#/wiki/${slug}?q=`));
    };
    await found('assassinate', /Assassinate/, 'skills-list');
    await found('chain lightning', /Chain Lightning/, 'spells-list');
    await found('cure wounds potion', /Cure Wounds Potion.*All recipes/, 'recipes-list');
  });

  it('shows a guide page with numbers from the rules data', async () => {
    renderApp('/wiki/points', { user: null });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Points and tokens' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Every new character starts with 150 XP/)).toBeInTheDocument();
    expect(screen.getByText(/Each full event gives 60 XP/)).toBeInTheDocument();
    expect(screen.getAllByText('610 CXP').length).toBeGreaterThan(0);
    expect(screen.getByRole('navigation', { name: 'On this page' })).toBeInTheDocument();
  });

  it('shows the Technique costs on the skills page', async () => {
    renderApp('/wiki/skills', { user: null });
    await screen.findByRole('heading', { level: 1, name: 'Skills, levels, and Techniques' });
    const table = screen
      .getAllByRole('table')
      .find((t) => within(t).queryByRole('columnheader', { name: 'Needs first' }));
    expect(table).toBeDefined();
    for (const cost of ['5 XP', '10 XP', '15 XP'])
      expect(within(table as HTMLElement).getByText(cost)).toBeInTheDocument();
  });

  it.each(ARTICLES.filter((a) => a.list).map((a) => [a.slug, a] as const))(
    'list %s shows every entry from the rules data',
    async (_slug, article) => {
      renderApp(`/wiki/${article.slug}`, { user: null });
      await screen.findByRole('heading', { level: 1, name: article.title });
      const data = referenceList(rs, article.list ?? 'skills');
      expect(screen.getByText(`${data.entries.length} ${data.noun[1]}`)).toBeInTheDocument();
    },
  );

  it('matches the data counts', () => {
    expect(referenceList(rs, 'skills').entries).toHaveLength(rs.skills.length);
    expect(referenceList(rs, 'spells').entries).toHaveLength(rs.spells.length);
    expect(referenceList(rs, 'recipes').entries).toHaveLength(rs.recipes.length);
    expect(referenceList(rs, 'races').entries).toHaveLength(rs.races.length);
    expect(referenceList(rs, 'callings').entries).toHaveLength(rs.callings.length);
    expect(referenceList(rs, 'artifact-powers').entries).toHaveLength(rs.artifacts.powers.length);
  });

  it('searches a list and opens an entry with its page reference', async () => {
    const user = userEvent.setup();
    renderApp('/wiki/skills-list?q=assassinate', { user: null });
    await screen.findByRole('heading', { level: 1, name: 'All skills' });
    expect(screen.getByRole('searchbox', { name: 'Search skills' })).toHaveValue('assassinate');
    expect(screen.getByText(/^[1-9] skills?$/)).toBeInTheDocument();
    await user.click(screen.getByText('Assassinate', { selector: 'summary span' }));
    expect(screen.getByText(/The Master Technique in Back Strike and Nerve Pinch/)).toBeVisible();
    expect(screen.getByText('Source: Rulebook p.94')).toBeInTheDocument();
  });

  it('says when a wiki page does not exist', async () => {
    renderApp('/wiki/nothing-here', { user: null });
    expect(await screen.findByText('There is no wiki page at this address.')).toBeInTheDocument();
  });
});
