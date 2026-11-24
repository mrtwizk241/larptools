// `#/wiki` and `#/wiki/:slug`: the public rules wiki. Visitors read it without signing in.
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Field } from '../../components/index.ts';
import { useRuleset } from '../../data/rulesetContext.ts';
import { Screen } from '../../Screen.tsx';
import { ARTICLES, ARTICLES_BY_SLUG, GROUPS, type Article } from './articles.ts';
import { Markdown } from './Markdown.tsx';
import { anchorId, headings, titleCase } from './wikiText.ts';
import { ReferenceList } from './ReferenceLists.tsx';
import styles from './wiki.module.css';

export function WikiPage() {
  const { slug } = useParams();
  if (slug === undefined) return <WikiIndex />;
  const article = ARTICLES_BY_SLUG.get(slug);
  if (!article)
    return (
      <Screen title={['Page Not Found', 'Rules Wiki']}>
        <div className={styles.page}>
          <h1>Page Not Found</h1>
          <p>There is no wiki page at this address.</p>
          <Link to="/wiki">All wiki pages</Link>
        </div>
      </Screen>
    );
  return <ArticleView article={article} />;
}

function WikiIndex() {
  const ruleset = useRuleset();
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
  return (
    <Screen title="Rules Wiki">
      <div className={styles.page}>
        <h1>Rules Wiki</h1>
        <p>
          A plain-English guide to the Rustwater rulebook (version {ruleset.ruleset.rulebookVersion}
          ) and the Professions Document. Unofficial: when this guide and the rulebook disagree, the
          rulebook wins.
        </p>
        <Field label="Search the wiki">
          {(control) => (
            <input
              {...control}
              type="search"
              placeholder="For example: upkeep, re-pop, Toughness"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          )}
        </Field>
        {q !== '' ? (
          <p className={styles.count} aria-live="polite">
            {found.length === 0
              ? 'No page mentions that. Try the reference lists, which have their own search.'
              : `${found.length} ${found.length === 1 ? 'page mentions' : 'pages mention'} that.`}
          </p>
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
  const ruleset = useRuleset();
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
    <Screen title={[article.title, 'Rules Wiki']}>
      <article className={styles.page}>
        <p className={styles.crumbs}>
          <Link to="/wiki">Rules Wiki</Link>
        </p>
        <h1>{article.title}</h1>
        <p className={styles.lede}>{article.summary}</p>
        {contents.length > 2 ? (
          <nav aria-label="On this page" className={styles.contents}>
            <p className={styles.contentsTitle}>On This Page</p>
            <ul>
              {contents.map((heading) => (
                <li key={heading}>
                  <button
                    type="button"
                    className={styles.contentsLink}
                    onClick={() => scrollToAnchor(anchorId(heading))}
                  >
                    {titleCase(heading)}
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
            <ReferenceList list={article.list} ruleset={ruleset} />
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
