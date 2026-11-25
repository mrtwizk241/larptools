// `#/wiki` and `#/wiki/:slug`: the public rules wiki. Visitors read it without signing in.
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Field } from '../../components/index.ts';
import { OfflineStatusCard, OfflineStatusLine } from '../../pwa/OfflineStatus.tsx';
import { LOCAL_MODE } from '../../../localMode.ts';
import { Screen } from '../../Screen.tsx';
import { ARTICLES, ARTICLES_BY_SLUG, GROUPS, type Article } from './articles.ts';
import { DownloadWikiButton } from './DownloadWikiButton.tsx';
import { Markdown } from './Markdown.tsx';
import { anchorId, headings } from './wikiText.ts';
import { ReferenceList } from './ReferenceLists.tsx';
import { filterEntries, referenceList } from './referenceData.ts';
import { wikiRuleset } from './wikiData.ts';
import styles from './wiki.module.css';

export function WikiPage() {
  const { slug } = useParams();
  if (slug === undefined) return <WikiIndex />;
  const article = ARTICLES_BY_SLUG.get(slug);
  if (!article)
    return (
      <Screen title={['Page not found', 'Rules wiki']}>
        <div className={styles.page}>
          <h1>Page not found</h1>
          <p>There is no wiki page at this address.</p>
          <Link to="/wiki">All wiki pages</Link>
        </div>
      </Screen>
    );
  return <ArticleView article={article} />;
}

const MAX_MATCHES = 20;

function matchCount(n: number): string {
  if (n === 0) return 'Nothing in the reference lists matches.';
  return `${n} ${n === 1 ? 'entry' : 'entries'} in the reference lists ${n === 1 ? 'matches' : 'match'}.`;
}

function WikiIndex() {
  const ruleset = wikiRuleset();
  const [query, setQuery] = useState('');
  const texts = useMemo(
    () =>
      new Map(
        ARTICLES.map((a) => [
          a.slug,
          `${a.title} ${a.summary} ${a.body ? a.body(ruleset) : ''}`.toLowerCase(),
        ]),
      ),
    [ruleset],
  );
  const q = query.trim().toLowerCase();
  const found = q === '' ? ARTICLES : ARTICLES.filter((a) => texts.get(a.slug)?.includes(q));
  const entries = useMemo(
    () =>
      ARTICLES.flatMap((a) =>
        a.list
          ? referenceList(ruleset, a.list).entries.map((entry) => ({ article: a, entry }))
          : [],
      ),
    [ruleset],
  );
  const matches =
    q === '' ? [] : entries.filter(({ entry }) => filterEntries([entry], q).length > 0);
  const shownMatches = matches.slice(0, MAX_MATCHES);
  return (
    <Screen title="Rules wiki">
      <div className={styles.page}>
        <h1>Rules wiki</h1>
        <p>
          A plain-English guide to the Sylvaris Rulebook (version {ruleset.ruleset.rulebookVersion})
          and the Callings Supplement (version {ruleset.ruleset.callingsVersion}). Unofficial: when
          this guide and the books disagree, the books win.
        </p>
        {LOCAL_MODE ? null : <OfflineStatusLine />}
        <DownloadWikiButton />
        <Field label="Search the wiki">
          {(control) => (
            <input
              {...control}
              type="search"
              placeholder="For example: upkeep, re-pop, Fireball"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          )}
        </Field>
        {q !== '' ? (
          <p className={styles.count} aria-live="polite">
            {found.length === 0
              ? `No guide page mentions that. ${matchCount(matches.length)}`
              : `${found.length} ${found.length === 1 ? 'page mentions' : 'pages mention'} that. ${matchCount(matches.length)}`}
          </p>
        ) : null}
        {shownMatches.length > 0 ? (
          <section aria-labelledby="wiki-matches" className={styles.group}>
            <h2 id="wiki-matches">In the reference lists</h2>
            <ul className={styles.cards}>
              {shownMatches.map(({ article, entry }) => (
                <li key={`${article.slug}-${entry.id}`}>
                  <Link
                    to={`/wiki/${article.slug}?q=${encodeURIComponent(entry.title)}`}
                    className={styles.card}
                  >
                    <span className={styles.cardTitle}>{entry.title}</span>
                    <span className={styles.cardSummary}>
                      {article.title}
                      {entry.meta ? `, ${entry.meta}` : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {matches.length > shownMatches.length ? (
              <p>
                Showing the first {shownMatches.length}. Type more of the name to narrow it down.
              </p>
            ) : null}
          </section>
        ) : null}
        {GROUPS.map((group) => {
          const list = found.filter((a) => a.group === group.id);
          if (list.length === 0) return null;
          return (
            <section key={group.id} aria-labelledby={`wiki-${group.id}`} className={styles.group}>
              <h2 id={`wiki-${group.id}`}>{group.title}</h2>
              <ul className={styles.cards}>
                {list.map((article) => (
                  <li key={article.slug}>
                    <Link to={`/wiki/${article.slug}`} className={styles.card}>
                      <span className={styles.cardTitle}>{article.title}</span>
                      <span className={styles.cardSummary}>{article.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {LOCAL_MODE ? null : <OfflineStatusCard />}
      </div>
    </Screen>
  );
}

function scrollToAnchor(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView?.({ block: 'start' });
  target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}

function ArticleView({ article }: { article: Article }) {
  const ruleset = wikiRuleset();
  const location = useLocation();
  const source = article.body ? article.body(ruleset) : '';
  const contents = article.body ? headings(source) : [];
  const index = ARTICLES.indexOf(article);
  const previous = index > 0 ? ARTICLES[index - 1] : undefined;
  const next = index < ARTICLES.length - 1 ? ARTICLES[index + 1] : undefined;

  // Links such as /wiki/points#retirement open at that section.
  useEffect(() => {
    const anchor = location.hash.replace(/^#/, '');
    if (anchor) scrollToAnchor(anchor);
  }, [location.hash, article.slug]);

  return (
    <Screen title={[article.title, 'Rules wiki']}>
      <article className={styles.page}>
        <p className={styles.crumbs}>
          <Link to="/wiki">Rules wiki</Link>
        </p>
        <h1>{article.title}</h1>
        <p className={styles.lede}>{article.summary}</p>
        {contents.length > 2 ? (
          <nav aria-label="On this page" className={styles.contents}>
            <p className={styles.contentsTitle}>On this page</p>
            <ul>
              {contents.map((heading) => (
                <li key={heading}>
                  <button
                    type="button"
                    className={styles.contentsLink}
                    onClick={() => scrollToAnchor(anchorId(heading))}
                  >
                    {heading}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        {article.body ? <Markdown source={source} /> : null}
        {article.list ? (
          <>
            <p>
              From the rules data this app uses, so it matches the character sheet. Tap an entry to
              open it.
            </p>
            <ReferenceList list={article.list} rs={ruleset} />
          </>
        ) : null}
        <nav aria-label="More wiki pages" className={styles.pager}>
          {previous ? (
            <Link to={`/wiki/${previous.slug}`} className={styles.pagerLink}>
              <ArrowLeft aria-hidden="true" />
              <span>
                <span className={styles.pagerLabel}>Previous</span> {previous.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link to={`/wiki/${next.slug}`} className={`${styles.pagerLink} ${styles.pagerNext}`}>
              <span>
                <span className={styles.pagerLabel}>Next</span> {next.title}
              </span>
              <ArrowRight aria-hidden="true" />
            </Link>
          ) : null}
        </nav>
      </article>
    </Screen>
  );
}
