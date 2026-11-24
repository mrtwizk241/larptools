// A small Markdown subset for the wiki articles, rendered as React elements (never as HTML
// strings). Blocks: `## ` and `### ` headings, paragraphs, `- ` lists, `1. ` lists, `| a | b |`
// tables (the second row is the `|---|` divider), and `> ` tips. Inline: **bold** and
// [text](/wiki/slug) links (app links) or [text](https://...) (other sites).
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';
import { anchorId, parseBlocks, titleCase } from './wikiText.ts';
import styles from './wiki.module.css';

/** **bold** and [links](target). Everything else is plain text. */
export function Inline({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    if (index > last) out.push(text.slice(last, index));
    if (match[1] !== undefined) {
      out.push(<strong key={key++}>{match[1]}</strong>);
    } else {
      const label = match[2] ?? '';
      const target = match[3] ?? '';
      if (target.startsWith('/')) {
        out.push(
          <Link key={key++} to={target}>
            {label}
          </Link>,
        );
      } else if (/^https:\/\//.test(target)) {
        out.push(
          <a key={key++} href={target} target="_blank" rel="noreferrer noopener">
            {label}
          </a>,
        );
      } else {
        out.push(label);
      }
    }
    last = index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

export function Markdown({ source }: { source: string }) {
  const blocks = parseBlocks(source);
  return (
    <div className={styles.prose}>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'h2':
            return (
              <h2 key={index} id={anchorId(block.text)}>
                {titleCase(block.text)}
              </h2>
            );
          case 'h3':
            return (
              <h3 key={index} id={anchorId(block.text)}>
                {titleCase(block.text)}
              </h3>
            );
          case 'p':
            return (
              <p key={index}>
                <Inline text={block.text} />
              </p>
            );
          case 'tip':
            return (
              <aside key={index} className={styles.tip}>
                <Inline text={block.text} />
              </aside>
            );
          case 'ul':
          case 'ol': {
            const List = block.kind;
            return (
              <List key={index}>
                {block.items.map((item, n) => (
                  <li key={n}>
                    <Inline text={item} />
                  </li>
                ))}
              </List>
            );
          }
          case 'table':
            return (
              <div key={index} className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {block.head.map((cell, n) => (
                        <th key={n} scope="col">
                          <Inline text={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, n) => (
                          <td key={n}>
                            <Inline text={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return <Fragment key={index} />;
        }
      })}
    </div>
  );
}
