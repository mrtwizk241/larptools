import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/index.ts';
import { MemoryRouter } from 'react-router';
import { ARTICLES } from './articles.ts';
import { DownloadWikiButton } from './DownloadWikiButton.tsx';
import {
  SEARCH_SCRIPT,
  indexItems,
  localLinks,
  scopeArticle,
  scriptText,
  wikiExportFileName,
  wikiHtmlDocument,
} from './exportWiki.tsx';
import { referenceList } from './referenceData.ts';
import { wikiRuleset } from './wikiData.ts';

const rs = wikiRuleset();
const html = wikiHtmlDocument({ rs, css: '', logoDataUrl: null, date: '2026-11-14' });

function all(pattern: RegExp): string[] {
  return [...html.matchAll(pattern)].map((m) => m[1] ?? '');
}

describe('the downloaded wiki file', () => {
  it('is one complete page with one main heading, one inline script, and only the search box', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(all(/<h1\b[^>]*>([^<]*)</g)).toEqual(['Sylvaris Rules Wiki']);
    expect(html.match(/<script\b/gi)).toHaveLength(1);
    expect(html).not.toMatch(/<script[^>]*\bsrc=/i);
    expect(html.match(/<input\b/gi)).toHaveLength(1);
    expect(html).not.toMatch(/<select|<button/i);
    expect(html).toContain('saved on 2026-11-14');
    expect(html).toContain('Unofficial fan tool, not affiliated with Sylvaris LARP');
  });

  it('hides the search box until the script runs, and says what to use without it', () => {
    expect(html).toMatch(/<div id="search" class="wx-search" hidden="">/);
    expect(html).toContain(
      '<p id="wx-noscript" class="wx-note">This viewer does not run the search.',
    );
  });

  it('has an A to Z index with every guide section and list entry', () => {
    const items = indexItems(rs);
    const entries = ARTICLES.flatMap((a) => (a.list ? referenceList(rs, a.list).entries : []));
    expect(items.length).toBeGreaterThan(entries.length + ARTICLES.length);
    const listed = html.slice(html.indexOf('<section id="index"'));
    expect([...listed.matchAll(/<li><a href="#/g)]).toHaveLength(items.length);
    const titles = items.map((i) => i.title.toLowerCase());
    expect([...titles].sort((a, b) => a.localeCompare(b))).toEqual(titles);
  });

  it('holds every guide page and list as its own section', () => {
    for (const article of ARTICLES) {
      expect(html).toContain(`<section id="${article.slug}"`);
      expect(html).toContain(`>${article.title}</h2>`);
    }
  });

  it('holds every reference list entry', () => {
    const entries = ARTICLES.flatMap((a) =>
      a.list ? referenceList(rs, a.list).entries : [],
    ).length;
    expect(all(/<(details)\b/g)).toHaveLength(entries);
    for (const name of ['Assassinate', 'Fireball', 'Cure Wounds Potion', 'Toughness'])
      expect(html).toContain(name);
  });

  it('has unique ids, and every link inside it lands on one', () => {
    const ids = all(/ id="([^"]+)"/g);
    expect(new Set(ids).size).toBe(ids.length);
    const targets = all(/ href="#([^"]+)"/g);
    expect(targets.length).toBeGreaterThan(ARTICLES.length);
    const missing = [...new Set(targets)].filter((t) => !ids.includes(t));
    expect(missing).toEqual([]);
    const labelled = all(/ aria-labelledby="([^"]+)"/g).flatMap((v) => v.split(' '));
    expect(labelled.filter((t) => !ids.includes(t))).toEqual([]);
  });

  it('keeps no links back into the app', () => {
    expect(html).not.toMatch(/ href="\/(?!\/)/);
  });

  it('keeps a stylesheet from closing the style element early', () => {
    const tricky = wikiHtmlDocument({
      rs,
      css: 'a::after { content: "</style><b>"; }',
      logoDataUrl: null,
      date: '2026-11-14',
    });
    expect(tricky).not.toContain('"</style><b>"');
    expect(tricky).toContain('<\\/style><b>');
  });

  it('adds the Test build section and its script only when the planner script is given', () => {
    expect(html).not.toContain('id="test-build"');
    const withPlanner = wikiHtmlDocument({
      rs,
      css: '',
      logoDataUrl: null,
      date: '2026-11-14',
      plannerScript: 'document.getElementById("test-build-app"); var s = "</script>";',
    });
    expect(withPlanner).toContain('<section id="test-build"');
    expect(withPlanner).toContain('<div id="test-build-app"></div>');
    expect(withPlanner).toContain('<a href="#test-build">Test build</a>');
    expect(withPlanner.match(/<script\b/gi)).toHaveLength(2);
    expect(withPlanner).toContain('var s = "\\x3C/script>";');
    // The escaped text still means the same to JavaScript.
    expect(new Function(`return ${scriptText('"<!-- <script> </script>"')}`)()).toBe(
      '<!-- <script> </script>',
    );
    expect(withPlanner).toContain('.tb-card');
  });

  it('names the file after the rulebook version', () => {
    expect(wikiExportFileName(rs)).toBe(`Sylvaris-Rules-Wiki-${rs.ruleset.rulebookVersion}.html`);
  });
});

describe('the search in the file', () => {
  it('finds list entries and guide sections, best match first, and opens an entry', () => {
    vi.useFakeTimers();
    document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script>'));
    new Function(SEARCH_SCRIPT)();
    const input = document.getElementById('wx-q') as HTMLInputElement;
    const search = (q: string) => {
      input.value = q;
      input.dispatchEvent(new Event('input'));
      vi.advanceTimersByTime(200);
      return [...document.querySelectorAll<HTMLAnchorElement>('#wx-results a')];
    };
    expect(document.getElementById('search')?.hidden).toBe(false);
    expect(document.getElementById('wx-noscript')?.hidden).toBe(true);

    const toughness = search('toughness');
    expect(toughness[0]?.textContent).toBe('Toughness');
    expect(toughness[0]?.getAttribute('href')).toBe('#skills-list--entry-toughness');
    expect(document.getElementById('wx-count')?.textContent).toMatch(/\d+ match/);

    const blade = search('fire blade');
    expect(blade[0]?.textContent).toBe('Fire Blade');
    const bladeItem = blade[0]?.closest('li');
    expect(bladeItem?.querySelector('.wx-where')?.textContent).toMatch(/\(Basic\)$/);
    const fire = search('fire magic')[0]?.closest('li');
    expect(fire?.querySelector('.wx-snippet')?.textContent).not.toMatch(/[a-z][A-Z]/);

    const upkeep = search('upkeep');
    expect(upkeep.some((a) => a.getAttribute('href')?.startsWith('#events--'))).toBe(true);
    expect(search('x')).toEqual([]);
    expect(document.getElementById('wx-count')?.textContent).toBe('');
    expect(search('zzqq nothing')).toEqual([]);
    expect(document.getElementById('wx-count')?.textContent).toBe('No matches.');

    search('toughness')[0]?.click();
    expect(
      (document.getElementById('skills-list--entry-toughness') as HTMLDetailsElement).open,
    ).toBe(true);
    vi.useRealTimers();
    document.body.innerHTML = '';
  });
});

describe('scoping one page inside the file', () => {
  it('moves headings down one level and prefixes ids and in-page links', () => {
    const out = scopeArticle(
      'events',
      '<h1 id="title">Events</h1><nav><a href="#upkeep">Upkeep</a></nav><h2 id="upkeep">Upkeep</h2><h3>Note</h3><section class="g" aria-labelledby="ref-a"><h2 id="ref-a">A</h2></section><div class="t" role="region" aria-label="Upkeep table" tabindex="0"></div><a href="#contents">Back</a>',
      'Events and check-in',
    );
    expect(out).toBe(
      '<h2 id="events--title">Events</h2><nav><a href="#events--upkeep">Upkeep</a></nav><h3 id="events--upkeep">Upkeep</h3><h4>Note</h4><section class="g"><h3 id="events--ref-a">A</h3></section><div class="t" role="region" aria-label="Upkeep table, Events and check-in" tabindex="0"></div><a href="#contents">Back</a>',
    );
  });

  it('turns wiki links into jumps within the file', () => {
    expect(
      localLinks(
        '<a href="/wiki">W</a><a href="/wiki/points">P</a><a href="/wiki/events#ibga">E</a>',
      ),
    ).toBe('<a href="#contents">W</a><a href="#points">P</a><a href="#events--ibga">E</a>');
  });
});

describe('Download wiki button', () => {
  it('makes the file and says so', async () => {
    const user = userEvent.setup();
    const download = vi.fn(() => Promise.resolve('Sylvaris-Rules-Wiki-1.3.1.html'));
    render(
      <MemoryRouter>
        <ToastProvider>
          <DownloadWikiButton download={download} />
        </ToastProvider>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Download wiki' }));
    expect(download).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Saved Sylvaris-Rules-Wiki-1.3.1.html.')).toBeInTheDocument();
  });

  it('says so when it fails', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ToastProvider>
          <DownloadWikiButton download={() => Promise.reject(new Error('no'))} />
        </ToastProvider>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Download wiki' }));
    expect(await screen.findByText('Could not make the file. Try again.')).toBeInTheDocument();
  });
});
