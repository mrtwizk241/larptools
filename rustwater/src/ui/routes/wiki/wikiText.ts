// Parsing for the wiki's Markdown subset (rendering is in Markdown.tsx).

export type Block =
  | { kind: 'h2' | 'h3' | 'p' | 'tip'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] };

/** Heading text to an anchor id: "Earning CXP" -> "earning-cxp". */
export function anchorId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (trimmed === '') {
      i += 1;
      continue;
    }
    if (trimmed.startsWith('### ')) {
      blocks.push({ kind: 'h3', text: trimmed.slice(4) });
      i += 1;
    } else if (trimmed.startsWith('## ')) {
      blocks.push({ kind: 'h2', text: trimmed.slice(3) });
      i += 1;
    } else if (trimmed.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('- ')) {
        items.push((lines[i] ?? '').trim().slice(2));
        i += 1;
      }
      blocks.push({ kind: 'ul', items });
    } else if (/^\d+\. /.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test((lines[i] ?? '').trim())) {
        items.push((lines[i] ?? '').trim().replace(/^\d+\. /, ''));
        i += 1;
      }
      blocks.push({ kind: 'ol', items });
    } else if (trimmed.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('|')) {
        rows.push(cells(lines[i] ?? ''));
        i += 1;
      }
      const [head = [], , ...body] = rows;
      blocks.push({ kind: 'table', head, rows: body });
    } else if (trimmed.startsWith('> ')) {
      const parts: string[] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('> ')) {
        parts.push((lines[i] ?? '').trim().slice(2));
        i += 1;
      }
      blocks.push({ kind: 'tip', text: parts.join(' ') });
    } else {
      const parts: string[] = [];
      while (i < lines.length) {
        const next = (lines[i] ?? '').trim();
        if (next === '' || /^(#{2,3} |- |\d+\. |\||> )/.test(next)) break;
        parts.push(next);
        i += 1;
      }
      blocks.push({ kind: 'p', text: parts.join(' ') });
    }
  }
  return blocks;
}

/** The `## ` headings of an article, for its contents list. */
export function headings(source: string): string[] {
  return parseBlocks(source).flatMap((b) => (b.kind === 'h2' ? [b.text] : []));
}

const MINOR_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'in',
  'nor',
  'of',
  'on',
  'or',
  'the',
  'to',
  'up',
  'vs',
  'with',
]);

function capitalize(word: string): string {
  // Each part of a hyphenated word: "Multi-archetype" -> "Multi-Archetype". Letters already in
  // capitals (CXP, AP) stay as they are.
  return word.replace(/(^|-)([a-z])/g, (_match, lead: string, letter: string) => {
    return lead + letter.toUpperCase();
  });
}

/**
 * Title case for wiki titles and headings: every word capitalized except short minor words
 * (a, and, of, the, ...) unless first or last. "Points and currencies" -> "Points and Currencies".
 */
export function titleCase(text: string): string {
  const words = text.split(' ');
  const last = words.length - 1;
  return words
    .map((word, index) => {
      const bare = word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '').toLowerCase();
      const afterColon = index > 0 && (words[index - 1] ?? '').endsWith(':');
      if (index !== 0 && index !== last && !afterColon && MINOR_WORDS.has(bare))
        return word.replace(/[A-Za-z]+/, (w) => w.toLowerCase());
      // Capitalize the first letter of the word, even behind an opening bracket or a number.
      return capitalize(
        word.replace(/^([^A-Za-z]*)([a-z])/, (_m, pre: string, c: string) => pre + c.toUpperCase()),
      );
    })
    .join(' ');
}
