// Reads cell values from an .xlsx workbook (Office Open XML) in the browser: unzip with fflate,
// then parse the workbook, shared strings and worksheet XML with DOMParser. Only cached values
// are read; formulas are never read or evaluated. No React, storage, or engine imports.
import { Inflate, strFromU8 } from 'fflate';

/** Files over this size are refused before they are unzipped. */
export const MAX_XLSX_BYTES = 10 * 1024 * 1024;
/** Largest single part that is inflated (guards against zip bombs). The largest seen is 1 MB. */
const MAX_PART_BYTES = 16 * 1024 * 1024;
/** Most bytes inflated by one readWorkbook, across all parts and tabs. */
const MAX_TOTAL_BYTES = 48 * 1024 * 1024;
/** Most zip entries looked at. A Google Sheets download has a few dozen. */
const MAX_ZIP_ENTRIES = 1_000;
/** Compressed bytes fed to the inflater at a time, so a bomb is caught after a few MB. */
const INFLATE_SLICE = 16 * 1024;

const DAMAGED = 'This file is not an .xlsx workbook, or it is damaged.';
const NOT_A_DOWNLOAD = 'This file does not look like a Google Sheets download.';
const TOO_MANY_PARTS = `${NOT_A_DOWNLOAD} It has too many parts.`;

/** A cell's cached value. Blank cells, missing cells and formula errors read as null. */
export type CellValue = string | number | boolean | null;

export class XlsxError extends Error {
  override name = 'XlsxError';
}

export interface Worksheet {
  readonly name: string;
  /** Value of one cell by A1 reference, for example `B3`. */
  cell(ref: string): CellValue;
  /** Every cell that has a value, keyed by A1 reference. */
  readonly cells: ReadonlyMap<string, CellValue>;
}

export interface Workbook {
  /** Tab names in workbook order. */
  readonly sheetNames: readonly string[];
  /** True when dates are counted from 1904 (old Mac Excel); Google Sheets uses 1900. */
  readonly date1904: boolean;
  /** The tab with this name, parsed on first use; undefined when there is no such tab. */
  sheet(name: string): Worksheet | undefined;
}

const MAIN_NS = 'officeDocument/2006/relationships';

function parseXml(text: string, part: string): Document {
  const Parser = globalThis.DOMParser;
  if (typeof Parser !== 'function') throw new XlsxError('This browser cannot read XML.');
  // Office parts never carry a DTD; refusing one rules out entity tricks in every browser.
  if (text.includes('<!DOCTYPE'))
    throw new XlsxError(`The workbook part ${part} is not valid XML.`);
  const doc = new Parser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0)
    throw new XlsxError(`The workbook part ${part} is not valid XML.`);
  return doc;
}

/** Elements by local name, whatever their namespace prefix. */
function byName(root: Document | Element, localName: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', localName));
}

function childrenNamed(el: Element, localName: string): Element[] {
  return Array.from(el.children).filter((c) => c.localName === localName);
}

/** The r:id of a sheet element (transitional or strict relationship namespace). */
function relId(el: Element): string | null {
  for (const attr of Array.from(el.attributes))
    if (attr.localName === 'id' && attr.namespaceURI?.endsWith(MAIN_NS)) return attr.value;
  return el.getAttribute('r:id');
}

/** Text of a shared or inline string: plain `<t>`, or rich text runs, without phonetic runs. */
function stringText(el: Element): string {
  const direct = childrenNamed(el, 't');
  if (direct.length > 0) return direct.map((t) => t.textContent ?? '').join('');
  return childrenNamed(el, 'r')
    .flatMap((r) => childrenNamed(r, 't'))
    .map((t) => t.textContent ?? '')
    .join('');
}

/** `xl/workbook.xml` relationship targets resolve against `xl/`; a leading `/` is the root. */
function resolveTarget(target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = `xl/${target}`.split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}

/** Column letters to a 1-based index, and back. */
function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
function columnLetters(index: number): string {
  let s = '';
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Bytes inflated so far by one readWorkbook, against MAX_TOTAL_BYTES. */
interface Budget {
  used: number;
}

interface ZipPart {
  readonly name: string;
  readonly method: number;
  readonly start: number;
  readonly size: number;
  readonly originalSize: number;
}

const u16 = (b: Uint8Array, o: number) => (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
const u32 = (b: Uint8Array, o: number) => (u16(b, o) | (u16(b, o + 2) << 16)) >>> 0;

/**
 * Walks the zip's central directory and returns the wanted entries, checked. Nothing is
 * inflated here. Refuses zip64, split archives, more than MAX_ZIP_ENTRIES entries, a wanted
 * name that appears twice, entries whose data overlap, and parts over the size limits.
 */
function zipDirectory(
  bytes: Uint8Array,
  wanted: (name: string) => boolean,
  budget: Budget,
): ZipPart[] {
  const damaged = () => new XlsxError(DAMAGED);
  const len = bytes.byteLength;
  let e = len - 22;
  while (e >= 0 && u32(bytes, e) !== 0x06054b50) {
    if (len - e > 22 + 0xffff) throw damaged();
    e -= 1;
  }
  if (e < 0) throw damaged();
  const count = u16(bytes, e + 10);
  const cdSize = u32(bytes, e + 12);
  const cdStart = u32(bytes, e + 16);
  // zip64 (or a split archive) is never needed for a sheet this size.
  if (
    (e >= 20 && u32(bytes, e - 20) === 0x07064b50) ||
    u16(bytes, e + 4) !== 0 ||
    u16(bytes, e + 6) !== 0 ||
    u16(bytes, e + 8) !== count ||
    count === 0xffff ||
    cdSize === 0xffffffff ||
    cdStart === 0xffffffff
  )
    throw new XlsxError(NOT_A_DOWNLOAD);
  if (count > MAX_ZIP_ENTRIES) throw new XlsxError(TOO_MANY_PARTS);
  const cdEnd = cdStart + cdSize;
  if (cdEnd > e) throw damaged();

  const parts: ZipPart[] = [];
  const ranges: [number, number][] = [];
  const seen = new Set<string>();
  let total = 0;
  let o = cdStart;
  for (let i = 0; i < count; i += 1) {
    if (o + 46 > cdEnd || u32(bytes, o) !== 0x02014b50) throw damaged();
    const flags = u16(bytes, o + 8);
    const method = u16(bytes, o + 10);
    const size = u32(bytes, o + 20);
    const originalSize = u32(bytes, o + 24);
    const nameLength = u16(bytes, o + 28);
    const next = o + 46 + nameLength + u16(bytes, o + 30) + u16(bytes, o + 32);
    const local = u32(bytes, o + 42);
    if (next > cdEnd || size === 0xffffffff || originalSize === 0xffffffff || local === 0xffffffff)
      throw new XlsxError(NOT_A_DOWNLOAD);
    const name = strFromU8(bytes.subarray(o + 46, o + 46 + nameLength), !(flags & 0x800));
    o = next;

    if (local + 30 > cdStart || u32(bytes, local) !== 0x04034b50) throw damaged();
    const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
    if (start + size > cdStart) throw damaged();
    ranges.push([local, start + size]);

    if (!wanted(name)) continue;
    if (seen.has(name))
      throw new XlsxError(`${NOT_A_DOWNLOAD} The part ${name} appears more than once.`);
    seen.add(name);
    if (flags & 1 || (method !== 0 && method !== 8) || (method === 0 && size !== originalSize))
      throw new XlsxError(NOT_A_DOWNLOAD);
    if (originalSize > MAX_PART_BYTES)
      throw new XlsxError(`The workbook part ${name} is too large to read. The limit is 16 MB.`);
    total += originalSize;
    parts.push({ name, method, start, size, originalSize });
  }

  // Each entry must have its own bytes: overlapping entries are a zip bomb trick.
  ranges.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ranges.length; i += 1)
    if (ranges[i]![0] < ranges[i - 1]![1]) throw new XlsxError(NOT_A_DOWNLOAD);

  if (budget.used + total > MAX_TOTAL_BYTES)
    throw new XlsxError('The workbook is too large to read. Its parts add up to over 48 MB.');
  budget.used += total;
  return parts;
}

/** Inflates one part, a slice at a time, and stops as soon as it outgrows its declared size. */
function inflatePart(bytes: Uint8Array, part: ZipPart): Uint8Array {
  const data = bytes.subarray(part.start, part.start + part.size);
  if (part.method === 0) return data.slice();
  const chunks: Uint8Array[] = [];
  let produced = 0;
  const inflater = new Inflate((chunk) => {
    produced += chunk.length;
    if (produced > part.originalSize) throw new XlsxError(NOT_A_DOWNLOAD);
    chunks.push(chunk);
  });
  // Deflate expands at most about 1,032 times, so a small part gets small slices.
  const slice = Math.min(INFLATE_SLICE, Math.max(1024, Math.ceil(part.originalSize / 1024)));
  for (let at = 0; at < data.length; at += slice)
    inflater.push(data.subarray(at, at + slice), at + slice >= data.length);
  if (data.length === 0) inflater.push(data, true);
  const out = new Uint8Array(produced);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

function unzipParts(
  bytes: Uint8Array,
  wanted: (name: string) => boolean,
  budget: Budget,
): Record<string, Uint8Array> {
  try {
    const out: Record<string, Uint8Array> = {};
    for (const part of zipDirectory(bytes, wanted, budget))
      out[part.name] = inflatePart(bytes, part);
    return out;
  } catch (error) {
    if (error instanceof XlsxError) throw error;
    throw new XlsxError(DAMAGED);
  }
}

function readCells(doc: Document, shared: readonly string[]): Map<string, CellValue> {
  const cells = new Map<string, CellValue>();
  for (const row of byName(doc, 'row')) {
    const rowNumber = Number(row.getAttribute('r'));
    let column = 0;
    for (const c of childrenNamed(row, 'c')) {
      const ref = c.getAttribute('r');
      const m = ref ? /^([A-Z]{1,3})(\d+)$/.exec(ref) : null;
      column = m ? columnIndex(m[1] ?? '') : column + 1;
      const key = m ? ref! : `${columnLetters(column)}${rowNumber}`;
      const value = cellValue(c, shared);
      if (value !== null) cells.set(key, value);
    }
  }
  return cells;
}

function cellValue(c: Element, shared: readonly string[]): CellValue {
  const type = c.getAttribute('t') ?? 'n';
  if (type === 'inlineStr') {
    const is = childrenNamed(c, 'is')[0];
    const text = is ? stringText(is) : '';
    return text === '' ? null : text;
  }
  const v = childrenNamed(c, 'v')[0]?.textContent ?? null;
  if (v === null) return null;
  switch (type) {
    case 's': {
      const text = shared[Number(v)];
      return text === undefined || text === '' ? null : text;
    }
    case 'str':
    case 'd':
      return v === '' ? null : v;
    case 'b':
      return v === '1' || v.toLowerCase() === 'true';
    case 'e':
      return null;
    default: {
      if (v.trim() === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : v;
    }
  }
}

/**
 * Opens an .xlsx file. Reads the tab names and the shared strings at once; each tab's cells
 * are read when `sheet()` first asks for it. Throws XlsxError for files over 10 MB and for
 * anything that is not a readable workbook.
 */
export function readWorkbook(bytes: Uint8Array): Workbook {
  if (bytes.byteLength > MAX_XLSX_BYTES) {
    const mb = (bytes.byteLength / (1024 * 1024)).toFixed(1);
    throw new XlsxError(`The file is too large (${mb} MB). The limit is 10 MB.`);
  }
  const budget: Budget = { used: 0 };
  const head = unzipParts(
    bytes,
    (name) =>
      name === 'xl/workbook.xml' ||
      name === 'xl/_rels/workbook.xml.rels' ||
      name === 'xl/sharedStrings.xml',
    budget,
  );
  const workbookXml = head['xl/workbook.xml'];
  const relsXml = head['xl/_rels/workbook.xml.rels'];
  if (!workbookXml || !relsXml) throw new XlsxError('This file is not an .xlsx workbook.');

  const rels = parseXml(strFromU8(relsXml), 'xl/_rels/workbook.xml.rels');
  const targets = new Map<string, string>();
  let sharedPart: string | undefined;
  for (const rel of byName(rels, 'Relationship')) {
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    if (!id || !target) continue;
    targets.set(id, resolveTarget(target));
    if (rel.getAttribute('Type')?.endsWith('/sharedStrings')) sharedPart = resolveTarget(target);
  }

  const wb = parseXml(strFromU8(workbookXml), 'xl/workbook.xml');
  const date1904 = byName(wb, 'workbookPr').some((p) => {
    const v = p.getAttribute('date1904');
    return v === '1' || v === 'true';
  });
  const partOf = new Map<string, string>();
  const sheetNames: string[] = [];
  for (const s of byName(wb, 'sheet')) {
    const name = s.getAttribute('name');
    const id = relId(s);
    const part = id ? targets.get(id) : undefined;
    if (!name || !part) continue;
    sheetNames.push(name);
    partOf.set(name, part);
  }

  // Shared strings: the relationship's part, or the usual name when the rels leave it out.
  let shared: string[] = [];
  const sstName = sharedPart ?? 'xl/sharedStrings.xml';
  const sstBytes =
    head[sstName] ??
    (sstName !== 'xl/sharedStrings.xml'
      ? unzipParts(bytes, (n) => n === sstName, budget)[sstName]
      : undefined);
  if (sstBytes) {
    const sst = parseXml(strFromU8(sstBytes), sstName);
    shared = byName(sst, 'si').map(stringText);
  }

  const cache = new Map<string, Worksheet>();
  return {
    sheetNames,
    date1904,
    sheet(name) {
      const hit = cache.get(name);
      if (hit) return hit;
      const part = partOf.get(name);
      if (!part) return undefined;
      const data = unzipParts(bytes, (n) => n === part, budget)[part];
      if (!data) throw new XlsxError(`The workbook is missing the "${name}" tab's data.`);
      const cells = readCells(parseXml(strFromU8(data), part), shared);
      const sheet: Worksheet = { name, cells, cell: (ref) => cells.get(ref) ?? null };
      cache.set(name, sheet);
      return sheet;
    },
  };
}
