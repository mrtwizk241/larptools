// Test-only: builds small .xlsx files in memory, shaped like a Google Sheets download (shared
// strings, cached formula values). Used by the reader and import tests.
import { strToU8, zipSync, type Zippable } from 'fflate';

/** A typed value, or a formula with its cached value. */
export type TestCell =
  | string
  | number
  | boolean
  | null
  | { readonly formula: string; readonly value: string | number | boolean }
  | { readonly inline: string }
  | { readonly text: string }
  | { readonly error: string };

export interface TestWorkbookOptions {
  /** Shared strings for typed text (Google Sheets); false writes inline strings (openpyxl). */
  readonly sharedStrings?: boolean;
  readonly date1904?: boolean;
  /** Extra zip entries, for damaged-file tests. */
  readonly extra?: Readonly<Record<string, string>>;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sortRefs(refs: string[]): Map<number, string[]> {
  const rows = new Map<number, string[]>();
  for (const ref of refs) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref);
    if (!m) throw new Error(`bad ref ${ref}`);
    const r = Number(m[2]);
    rows.set(r, [...(rows.get(r) ?? []), ref]);
  }
  return new Map([...rows].sort((a, b) => a[0] - b[0]));
}

/** Builds an .xlsx with one tab per key of `sheets`, in order. */
export function buildXlsx(
  sheets: Readonly<Record<string, Readonly<Record<string, TestCell>>>>,
  options: TestWorkbookOptions = {},
): Uint8Array<ArrayBuffer> {
  const useShared = options.sharedStrings ?? true;
  const shared: string[] = [];
  const share = (s: string) => {
    const i = shared.indexOf(s);
    if (i >= 0) return i;
    shared.push(s);
    return shared.length - 1;
  };
  const files: Zippable = {};
  const names = Object.keys(sheets);
  names.forEach((name, i) => {
    const cells = sheets[name] ?? {};
    const rows = sortRefs(Object.keys(cells));
    let xml = '';
    for (const [r, refs] of rows) {
      xml += `<row r="${r}">`;
      for (const ref of refs) {
        const v = cells[ref];
        if (v === null || v === undefined) xml += `<c r="${ref}"/>`;
        else if (typeof v === 'number') xml += `<c r="${ref}"><v>${v}</v></c>`;
        else if (typeof v === 'boolean') xml += `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
        else if (typeof v === 'string')
          xml += useShared
            ? `<c r="${ref}" t="s"><v>${share(v)}</v></c>`
            : `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
        else if ('formula' in v) {
          const t =
            typeof v.value === 'number' ? '' : typeof v.value === 'boolean' ? ' t="b"' : ' t="str"';
          const val = typeof v.value === 'boolean' ? (v.value ? '1' : '0') : esc(String(v.value));
          xml += `<c r="${ref}"${t}><f>${esc(v.formula)}</f><v>${val}</v></c>`;
        } else if ('inline' in v)
          xml += `<c r="${ref}" t="inlineStr"><is><r><t>${esc(v.inline.slice(0, 2))}</t></r><r><t>${esc(v.inline.slice(2))}</t></r></is></c>`;
        else if ('text' in v) xml += `<c r="${ref}" t="s"><v>${share(v.text)}</v></c>`;
        else xml += `<c r="${ref}" t="e"><v>${esc(v.error)}</v></c>`;
      }
      xml += '</row>';
    }
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xml}</sheetData></worksheet>`,
    );
  });
  const rels = names
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join('');
  files['xl/_rels/workbook.xml.rels'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
  );
  files['xl/workbook.xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr${options.date1904 ? ' date1904="1"' : ''}/><sheets>${names
      .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('')}</sheets></workbook>`,
  );
  // Written last so every shared string is known; one rich-text entry checks run joining.
  files['xl/sharedStrings.xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared
      .map((s) =>
        s.startsWith('rich:')
          ? `<si><r><t>${esc(s.slice(5, 8))}</t></r><r><t>${esc(s.slice(8))}</t></r><rPh><t>ignored</t></rPh></si>`
          : `<si><t xml:space="preserve">${esc(s)}</t></si>`,
      )
      .join('')}</sst>`,
  );
  files['[Content_Types].xml'] = strToU8('<?xml version="1.0"?><Types/>');
  for (const [k, v] of Object.entries(options.extra ?? {})) files[k] = strToU8(v);
  return new Uint8Array(zipSync(files));
}

/** The six tabs the import requires, empty, plus any cells given. */
export function sheetTabs(
  cells: Partial<Record<string, Readonly<Record<string, TestCell>>>> = {},
): Record<string, Record<string, TestCell>> {
  const tabs = [
    'PlayerCharacter Info',
    'Basics',
    'Standard Skills',
    'Magic Skills',
    'Crafting Skills',
    'KnowledgesSpellsRecipes',
    'Points EarnedSpent',
  ];
  return Object.fromEntries(tabs.map((t) => [t, { ...(cells[t] ?? {}) }]));
}
