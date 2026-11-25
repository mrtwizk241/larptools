// The rules wiki as one HTML file people can share and open in any browser, with no signal and
// no access to the app. Built from the same components and rules data as the wiki screens, so
// the copy and the app never disagree. Links jump within the page and list entries open with
// plain <details>. One small inline script adds a search box; viewers that block scripts (some
// phone file previews) still get the contents and an A to Z index, which need no script.
/* eslint-disable react-refresh/only-export-components -- builds a file; never mounted in the app */
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { ARTICLES, GROUPS, type Article } from './articles.ts';
import { Markdown } from './Markdown.tsx';
import { ReferenceList } from './ReferenceLists.tsx';
import { referenceList } from './referenceData.ts';
import { anchorId, headings } from './wikiText.ts';
import { PLANNER_CSS } from '../../../planner/plannerCss.ts';
import type { WikiRuleset } from './wikiData.ts';
import styles from './wiki.module.css';

export interface WikiExportOptions {
  rs: WikiRuleset;
  /** The app's stylesheet text, so the copy looks like the app. May be empty. */
  css: string;
  /** The logo as a data: URL, or null to leave it out. */
  logoDataUrl: string | null;
  /** The day the copy was made, YYYY-MM-DD. */
  date: string;
  /** The test-build planner script (planner/planner.js), or null to leave the planner out. */
  plannerScript?: string | null;
}

export function wikiExportFileName(rs: WikiRuleset): string {
  return `Sylvaris-Rules-Wiki-${rs.ruleset.rulebookVersion}.html`;
}

const CONTENTS_ID = 'contents';
const INDEX_ID = 'index';
const TEST_BUILD_ID = 'test-build';

/** The planner's section. Its script fills `test-build-app` and hides the note. */
function TestBuildSection() {
  return (
    <section
      id={TEST_BUILD_ID}
      aria-labelledby={`${TEST_BUILD_ID}-title`}
      className="wx-section wx-test-build"
    >
      <h2 id={`${TEST_BUILD_ID}-title`}>Test build</h2>
      <p>
        Try a character before you play: add points and events, buy skills and Techniques, start a
        Calling, and set a familiar and an Artifact. It follows the same rules as the character
        sheet app. Your build stays in this browser.
      </p>
      <p id="test-build-note" className="wx-note">
        The test build needs a web browser that runs scripts, such as Chrome, Safari, Firefox, or
        Edge. Some phone file previews do not run them.
      </p>
      <div id="test-build-app"></div>
      <p className="wx-back">
        <a href={`#${CONTENTS_ID}`}>Back to contents</a>
      </p>
    </section>
  );
}

/**
 * Keeps script text from ending its <script> element early or late: "<!--", "<script", and
 * "</script" in the code confuse the HTML parser. JavaScript reads \x3C as "<" in strings,
 * templates, and regexes.
 */
export function scriptText(js: string): string {
  return js.replace(/<(!--|\/?script)/gi, '\\x3C$1');
}

export interface IndexItem {
  title: string;
  /** Where it is: the guide page, or the list and group. */
  where: string;
  href: string;
}

/** Every guide page, guide section, and list entry, A to Z. Links match the file's ids. */
export function indexItems(rs: WikiRuleset): IndexItem[] {
  const items: IndexItem[] = [];
  for (const article of ARTICLES) {
    items.push({
      title: article.title,
      where: article.list ? 'List' : 'Guide page',
      href: `#${article.slug}`,
    });
    if (article.body) {
      for (const heading of headings(article.body(rs)))
        items.push({
          title: heading,
          where: article.title,
          href: `#${article.slug}--${anchorId(heading)}`,
        });
    }
    if (article.list) {
      const data = referenceList(rs, article.list);
      const groups = new Map(data.groups.map((g) => [g.id, g.title]));
      for (const entry of data.entries) {
        const group = groups.get(entry.group);
        items.push({
          title: entry.title,
          where: group ? `${article.title}, ${group}` : article.title,
          href: `#${article.slug}--entry-${entry.id}`,
        });
      }
    }
  }
  return items.sort(
    (a, b) =>
      a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }) ||
      a.where.localeCompare(b.where),
  );
}

function letterOf(title: string): string {
  const first = title.charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
}

function IndexSection({ rs }: { rs: WikiRuleset }) {
  const byLetter = new Map<string, IndexItem[]>();
  for (const item of indexItems(rs)) {
    const letter = letterOf(item.title);
    byLetter.set(letter, [...(byLetter.get(letter) ?? []), item]);
  }
  const letters = [...byLetter.keys()];
  const letterId = (l: string) => `${INDEX_ID}-${l === '#' ? 'other' : l.toLowerCase()}`;
  return (
    <section id={INDEX_ID} aria-labelledby={`${INDEX_ID}-title`} className="wx-section wx-index">
      <h2 id={`${INDEX_ID}-title`}>Index A to Z</h2>
      <p>
        Every guide section and list entry by name. It works in any viewer, even with no search.
      </p>
      <nav aria-label="Index letters" className="wx-letters">
        {letters.map((l) => (
          <a key={l} href={`#${letterId(l)}`}>
            {l}
          </a>
        ))}
      </nav>
      {letters.map((l) => (
        <div key={l}>
          <h3 id={letterId(l)}>{l}</h3>
          <ul className="wx-index-list">
            {(byLetter.get(l) ?? []).map((item) => (
              <li key={item.href}>
                <a href={item.href}>{item.title}</a> <span>{item.where}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="wx-back">
        <a href={`#${CONTENTS_ID}`}>Back to contents</a>
      </p>
    </section>
  );
}

/** The search box. Hidden until the script shows it, so a viewer with no scripts never sees it. */
function SearchBox() {
  return (
    <div id="search" className="wx-search" hidden>
      <label htmlFor="wx-q">Search the wiki</label>
      <input
        id="wx-q"
        type="search"
        autoComplete="off"
        spellCheck={false}
        placeholder="For example: upkeep, Fireball, Toughness"
      />
      <p id="wx-count" className="wx-note" role="status"></p>
      <ol id="wx-results" className="wx-results"></ol>
    </div>
  );
}

// Shown unless the search script runs and hides it. Not a <noscript>: some viewers block scripts
// but still treat <noscript> as hidden.
const NO_SCRIPT = `<p id="wx-noscript" class="wx-note">This viewer does not run the search. Use the contents and the <a href="#${INDEX_ID}">Index A to Z</a>, or open the file in a web browser.</p>`;

/**
 * The search, as plain ES5 that reads the page itself (no data copied into the script). Results
 * are built with textContent only. Tapping a list entry's result opens it.
 */
export const SEARCH_SCRIPT = `(function () {
  var box = document.getElementById('search');
  var input = document.getElementById('wx-q');
  var count = document.getElementById('wx-count');
  var results = document.getElementById('wx-results');
  if (!box || !input || !count || !results) return;
  box.hidden = false;
  var note = document.getElementById('wx-noscript');
  if (note) note.hidden = true;
  var MAX = 40;
  var units = null;
  function clean(t) { return (t || '').replace(/\\s+/g, ' ').trim(); }
  // Text of an element with a space between separate elements ("1 use, active" + "Spend ...").
  function textOf(el) {
    if (!el) return '';
    var out = [];
    var last = null;
    var walker = document.createTreeWalker(el, 4);
    while (walker.nextNode()) {
      var node = walker.currentNode;
      if (last && node.parentNode !== last) out.push(' ');
      out.push(node.nodeValue);
      last = node.parentNode;
    }
    return clean(out.join(''));
  }
  function add(title, where, href, body, open) {
    units.push({ title: title, low: title.toLowerCase(), where: where, href: href,
      body: body, bodyLow: body.toLowerCase(), open: open || null });
  }
  function build() {
    units = [];
    var sections = document.querySelectorAll('section.wx-section[id]');
    for (var i = 0; i < sections.length; i++) {
      var section = sections[i];
      if (section.id === '${INDEX_ID}' || section.id === '${TEST_BUILD_ID}') continue;
      var page = textOf(section.querySelector('h2'));
      var entries = section.querySelectorAll('details[id]');
      if (entries.length) {
        for (var j = 0; j < entries.length; j++) {
          var d = entries[j];
          var summary = d.querySelector('summary');
          var name = summary && summary.firstElementChild ? summary.firstElementChild : summary;
          var meta = summary && summary.children.length > 1 ? textOf(summary.children[1]) : '';
          var group = d.parentElement && d.parentElement.querySelector('h3');
          add(textOf(name), page + (group ? ', ' + textOf(group) : '') + (meta ? ' (' + meta + ')' : ''),
            '#' + d.id, textOf(d), d);
        }
        continue;
      }
      var heads = section.querySelectorAll('h3[id]');
      var intro = [page, textOf(section.querySelector('h2 + p'))];
      var first = heads.length ? heads[0] : null;
      if (first && first.parentElement) {
        for (var n = first.parentElement.firstElementChild; n && n !== first; n = n.nextElementSibling)
          intro.push(textOf(n));
      }
      add(page, 'Guide page', '#' + section.id, intro.join(' '));
      for (var k = 0; k < heads.length; k++) {
        var h = heads[k];
        var parts = [textOf(h)];
        for (var s = h.nextElementSibling; s && s.tagName !== 'H3'; s = s.nextElementSibling)
          parts.push(textOf(s));
        add(textOf(h), page, '#' + h.id, parts.join(' '));
      }
    }
  }
  function find(words) {
    var phrase = words.join(' ');
    var hits = [];
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      var inTitle = true;
      var ok = true;
      for (var j = 0; j < words.length; j++) {
        if (u.low.indexOf(words[j]) < 0) inTitle = false;
        if (u.bodyLow.indexOf(words[j]) < 0 && u.low.indexOf(words[j]) < 0) { ok = false; break; }
      }
      if (!ok) continue;
      var rank = u.low === phrase ? 0 : u.low.indexOf(phrase) === 0 ? 1 :
        u.low.indexOf(phrase) >= 0 ? 2 : inTitle ? 3 : 4;
      hits.push({ u: u, rank: rank, i: i });
    }
    hits.sort(function (a, b) { return a.rank - b.rank || a.i - b.i; });
    return hits;
  }
  function snippet(u, words) {
    var at = u.bodyLow.indexOf(words[0], u.title.length);
    if (at < 0) return '';
    var start = Math.max(0, at - 50);
    var end = Math.min(u.body.length, at + 90);
    return (start > 0 ? '\\u2026' : '') + u.body.slice(start, end) + (end < u.body.length ? '\\u2026' : '');
  }
  function item(hit, words) {
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = hit.u.href;
    a.textContent = hit.u.title;
    if (hit.u.open) a.addEventListener('click', function () { hit.u.open.open = true; });
    li.appendChild(a);
    var where = document.createElement('span');
    where.className = 'wx-where';
    where.textContent = hit.u.where;
    li.appendChild(where);
    var text = snippet(hit.u, words);
    if (text) {
      var snip = document.createElement('span');
      snip.className = 'wx-snippet';
      snip.textContent = text;
      li.appendChild(snip);
    }
    return li;
  }
  function render() {
    var q = input.value.toLowerCase().replace(/\\s+/g, ' ').trim();
    while (results.firstChild) results.removeChild(results.firstChild);
    if (q.length < 2) { count.textContent = ''; return; }
    if (!units) build();
    var words = q.split(' ');
    var hits = find(words);
    count.textContent = hits.length === 0 ? 'No matches.' :
      hits.length > MAX ? 'Showing the first ' + MAX + ' of ' + hits.length + ' matches. Add a word to narrow it.' :
      hits.length + (hits.length === 1 ? ' match.' : ' matches.');
    for (var i = 0; i < hits.length && i < MAX; i++) results.appendChild(item(hits[i], words));
  }
  var timer = 0;
  input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(render, 120); });
  function openTarget() {
    var id = decodeURIComponent(location.hash.slice(1));
    var el = id ? document.getElementById(id) : null;
    if (el && el.tagName === 'DETAILS') el.open = true;
  }
  window.addEventListener('hashchange', openTarget);
  openTarget();
})();`;

function ArticleSection({ article, rs }: { article: Article; rs: WikiRuleset }) {
  const source = article.body ? article.body(rs) : '';
  const contents = article.body ? headings(source) : [];
  return (
    <>
      <h1 id="title">{article.title}</h1>
      <p className={styles.lede}>{article.summary}</p>
      {contents.length > 2 ? (
        <nav aria-label={`On this page: ${article.title}`} className={styles.contents}>
          <p className={styles.contentsTitle}>On this page</p>
          <ul>
            {contents.map((heading) => (
              <li key={heading}>
                <a href={`#${anchorId(heading)}`}>{heading}</a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      {article.body ? <Markdown source={source} /> : null}
      {article.list ? (
        <>
          <p>Tap an entry to open it.</p>
          <ReferenceList list={article.list} rs={rs} controls={false} />
        </>
      ) : null}
      <p className="wx-back">
        <a href={`#${CONTENTS_ID}`}>Back to contents</a>
      </p>
    </>
  );
}

/** Static markup inside a router, since the wiki components use router links. */
function render(node: ReactNode): string {
  return renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
}

/**
 * One article's markup made safe to sit beside the others: headings move down one level (the
 * file has one h1), every id and in-page link gets the article's slug in front, and landmark
 * names stay unique across the file (inner sections such as a list's "Grandmaster" group are
 * plain sections; table regions name their page).
 */
export function scopeArticle(slug: string, html: string, title = slug): string {
  const prefix = (id: string) => (id === CONTENTS_ID ? id : `${slug}--${id}`);
  return html
    .replace(/<section([^>]*?) aria-labelledby="[^"]*"/g, '<section$1')
    .replace(
      /( role="region"[^>]*? aria-label=")([^"]*)"/g,
      (_m, start: string, label: string) => `${start}${label}, ${escapeAttr(title)}"`,
    )
    .replace(/<(\/?)h3\b/g, '<$1h4')
    .replace(/<(\/?)h2\b/g, '<$1h3')
    .replace(/<(\/?)h1\b/g, '<$1h2')
    .replace(/ (id|for)="([^"]+)"/g, (_m, attr: string, id: string) => ` ${attr}="${prefix(id)}"`)
    .replace(
      / aria-labelledby="([^"]+)"/g,
      (_m, ids: string) => ` aria-labelledby="${ids.split(' ').map(prefix).join(' ')}"`,
    )
    .replace(/ href="#([^"]+)"/g, (_m, id: string) => ` href="#${prefix(id)}"`);
}

/** App links to wiki pages become jumps within the file. */
export function localLinks(html: string): string {
  return html
    .replace(/ href="\/wiki"/g, ` href="#${CONTENTS_ID}"`)
    .replace(/ href="\/wiki\/([a-z0-9-]+)#([^"]+)"/g, ' href="#$1--$2"')
    .replace(/ href="\/wiki\/([a-z0-9-]+)"/g, ' href="#$1"');
}

const EXPORT_CSS = `
body { margin: 0; }
.wx-skip { position: absolute; left: -9999px; }
.wx-skip:focus { left: 8px; top: 8px; z-index: 10; padding: 8px; background: var(--color-bg, #fff); }
.wx-header { display: flex; align-items: center; gap: 12px; padding: 16px; background: var(--color-header-bg, #17161a); color: var(--color-header-text, #f5f5f5); border-bottom: 2px solid var(--color-header-rule, #a3cc6e); }
.wx-header img { width: 48px; height: 48px; border-radius: 8px; flex: none; }
.wx-header h1 { margin: 0; font-size: 1.5rem; line-height: 1.2; color: inherit; }
.wx-header p { margin: 4px 0 0; color: var(--color-header-muted, #c0c0c0); }
.wx-main { box-sizing: border-box; max-width: 48rem; margin: 0 auto; padding: 16px; display: grid; gap: 2.5rem; }
.wx-main > * { min-width: 0; }
.wx-section { scroll-margin-top: 8px; padding-top: 1.5rem; border-top: 1px solid var(--color-border, #857e6e); }
.wx-toc ul { padding-left: 1.25rem; }
.wx-toc li { margin: 6px 0; }
.wx-toc li span { display: block; color: var(--color-text-muted, #4d4a52); }
.wx-note, .wx-footer { color: var(--color-text-muted, #4d4a52); }
.wx-footer { max-width: 48rem; margin: 0 auto; padding: 16px 16px 32px; }
.wx-back { margin-top: 1rem; }
.wx-search { display: grid; gap: 8px; margin: 8px 0 24px; }
.wx-search[hidden] { display: none; }
.wx-search label { font-weight: 600; }
.wx-search input { box-sizing: border-box; width: 100%; min-height: 48px; padding: 8px 12px; font: inherit; font-size: 1.0625rem; color: var(--color-text, inherit); background: var(--color-surface, transparent); border: 1px solid var(--color-border-strong, #4d4a52); border-radius: 8px; }
.wx-search .wx-note { margin: 0; }
.wx-results { margin: 0; padding-left: 1.5rem; display: grid; gap: 12px; }
.wx-results a { font-weight: 600; }
.wx-where, .wx-snippet { display: block; color: var(--color-text-muted, #4d4a52); }
.wx-letters { display: flex; flex-wrap: wrap; gap: 4px; }
.wx-letters a { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; min-height: 44px; font-weight: 600; }
.wx-index-list { padding-left: 1.25rem; }
.wx-index-list li { margin: 8px 0; }
.wx-index-list span { color: var(--color-text-muted, #4d4a52); }
`;

/** Keeps stylesheet text from closing the <style> element early. */
function styleText(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style');
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** The whole file, ready to save. */
export function wikiHtmlDocument({
  rs,
  css,
  logoDataUrl,
  date,
  plannerScript = null,
}: WikiExportOptions): string {
  const planner = plannerScript !== null && plannerScript.trim() !== '';
  const version = rs.ruleset.rulebookVersion;
  const callings = rs.ruleset.callingsVersion;
  const head = render(
    <>
      <header className="wx-header">
        {logoDataUrl ? <img src={logoDataUrl} alt="" /> : null}
        <div>
          <h1>Sylvaris Rules Wiki</h1>
          <p>
            Unofficial plain-English guide. Rulebook {version}, Callings Supplement {callings}.
          </p>
        </div>
      </header>
    </>,
  );
  const intro = render(
    <section aria-labelledby={CONTENTS_ID} className="wx-toc">
      <p>
        A copy of the rules wiki from the Sylvaris character sheet app, saved on {date}. It works
        with no signal. When this guide and the books disagree, the books win. Page numbers point at
        the rulebook.
      </p>
      <h2 id={CONTENTS_ID}>Contents</h2>
      <SearchBox />
      <div data-noscript-slot="" />
      <p>
        <a href={`#${INDEX_ID}`}>Index A to Z</a>: every guide section and list entry by name.
      </p>
      {planner ? (
        <p>
          <a href={`#${TEST_BUILD_ID}`}>Test build</a>: plan a character with points, skills, a
          Calling, a familiar, and an Artifact.
        </p>
      ) : null}
      {GROUPS.map((group) => (
        <div key={group.id}>
          <h3>{group.title}</h3>
          <ul>
            {ARTICLES.filter((a) => a.group === group.id).map((article) => (
              <li key={article.slug}>
                <a href={`#${article.slug}`}>{article.title}</a>
                <span>{article.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>,
  );
  const sections = ARTICLES.map(
    (article) =>
      `<section id="${escapeAttr(article.slug)}" aria-labelledby="${escapeAttr(article.slug)}--title" class="wx-section ${styles.page ?? ''}">` +
      scopeArticle(
        article.slug,
        render(<ArticleSection article={article} rs={rs} />),
        article.title,
      ) +
      `</section>`,
  ).join('\n');
  const footer = render(
    <footer className="wx-footer">
      <p>
        Unofficial fan tool, not affiliated with Sylvaris LARP or Sylvaris Games, LLC. Summaries are
        in our own words; the rulebook is the authority.
      </p>
      <p>
        <a href={`#${CONTENTS_ID}`}>Back to contents</a>
      </p>
    </footer>,
  );
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    `<title>Sylvaris Rules Wiki (unofficial, rulebook ${escapeAttr(version)})</title>`,
    `<style>\nbody { font-family: system-ui, sans-serif; line-height: 1.5; }\n${styleText(css)}\n${EXPORT_CSS}${planner ? PLANNER_CSS : ''}</style>`,
    '</head>',
    '<body>',
    `<a class="wx-skip" href="#${CONTENTS_ID}">Skip to contents</a>`,
    head,
    `<main class="wx-main">`,
    localLinks(intro).replace('<div data-noscript-slot=""></div>', NO_SCRIPT),
    planner ? render(<TestBuildSection />) : '',
    localLinks(sections),
    render(<IndexSection rs={rs} />),
    '</main>',
    localLinks(footer),
    `<script>\n${SEARCH_SCRIPT}\n</script>`,
    planner ? `<script>\n${scriptText(plannerScript ?? '')}\n</script>` : '',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
