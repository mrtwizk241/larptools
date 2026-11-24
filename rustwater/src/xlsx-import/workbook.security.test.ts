// Hostile .xlsx files from the security audit (S-15 to S-17), built from bytes here. Each must
// be refused with a plain message, fast.
import { deflateSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildXlsx } from './testWorkbook.ts';
import { readWorkbook, XlsxError } from './workbook.ts';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NOT_A_DOWNLOAD = /does not look like a Google Sheets download/;

interface Local {
  readonly name: string;
  readonly method: 0 | 8;
  readonly data: Uint8Array;
  /** Declared uncompressed size. */
  readonly size: number;
}
interface Central {
  readonly local: number;
  readonly name?: string;
}

/** A zip written by hand, so entries can overlap, repeat, or lie about sizes. */
function rawZip(locals: Local[], central: Central[], zip64Count?: number): Uint8Array {
  const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v: number) => [...u16(v & 0xffff), ...u16(v >>> 16)];
  const u64 = (v: number) => [...u32(v % 2 ** 32), ...u32(Math.floor(v / 2 ** 32))];
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let at = 0;
  for (const l of locals) {
    offsets.push(at);
    const name = strToU8(l.name);
    const bytes = new Uint8Array([
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0),
      ...u16(l.method),
      ...u32(0),
      ...u32(0),
      ...u32(l.data.length),
      ...u32(l.size),
      ...u16(name.length),
      ...u16(0),
      ...name,
    ]);
    parts.push(bytes, l.data);
    at += bytes.length + l.data.length;
  }
  const cdStart = at;
  // Central records are often identical, so build each distinct one once.
  const cache = new Map<string, Uint8Array>();
  let cdSize = 0;
  for (const c of central) {
    const l = locals[c.local]!;
    const key = `${c.local}:${c.name ?? ''}`;
    let rec = cache.get(key);
    if (!rec) {
      const name = strToU8(c.name ?? l.name);
      rec = new Uint8Array([
        ...u32(0x02014b50),
        ...u16(20),
        ...u16(20),
        ...u16(0),
        ...u16(l.method),
        ...u32(0),
        ...u32(0),
        ...u32(l.data.length),
        ...u32(l.size),
        ...u16(name.length),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(offsets[c.local]!),
        ...name,
      ]);
      cache.set(key, rec);
    }
    parts.push(rec);
    cdSize += rec.length;
  }
  if (zip64Count !== undefined) {
    const cdEnd = cdStart + cdSize;
    parts.push(
      new Uint8Array([
        ...u32(0x06064b50),
        ...u64(44),
        ...u16(45),
        ...u16(45),
        ...u32(0),
        ...u32(0),
        ...u64(zip64Count),
        ...u64(zip64Count),
        ...u64(cdSize),
        ...u64(cdStart),
      ]),
      new Uint8Array([...u32(0x07064b50), ...u32(0), ...u64(cdEnd), ...u32(1)]),
    );
  }
  const count = Math.min(central.length, 0xffff);
  parts.push(
    new Uint8Array([
      ...u32(0x06054b50),
      ...u16(0),
      ...u16(0),
      ...u16(count),
      ...u16(count),
      ...u32(cdSize),
      ...u32(cdStart),
      ...u16(0),
    ]),
  );
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const stored = (name: string, text: string): Local => {
  const data = strToU8(text);
  return { name, method: 0, data, size: data.length };
};

const relsXml = (tabs: number) =>
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Array.from(
    { length: tabs },
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="${R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join('')}</Relationships>`;
const workbookXml = (tabs: number) =>
  `<?xml version="1.0"?><workbook xmlns="${NS}" xmlns:r="${R}"><sheets>${Array.from(
    { length: tabs },
    (_, i) => `<sheet name="T${i + 1}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
  ).join('')}</sheets></workbook>`;
const worksheetXml = `<?xml version="1.0"?><worksheet xmlns="${NS}"><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>`;

/** Runs `fn`, expects it to throw an XlsxError matching `message`, and returns the time taken. */
function refuses(fn: () => unknown, message: RegExp): number {
  const t = performance.now();
  let error: unknown;
  try {
    fn();
  } catch (e) {
    error = e;
  }
  const ms = performance.now() - t;
  expect(error).toBeInstanceOf(XlsxError);
  expect((error as Error).message).toMatch(message);
  return ms;
}

describe('readWorkbook refuses hostile zips (S-15)', () => {
  // One 8 MB deflate stream that many directory entries point at.
  const big = 8 * 1024 * 1024;
  const bomb: Local = {
    name: 'xl/workbook.xml',
    method: 8,
    data: deflateSync(new Uint8Array(big), { level: 9 }),
    size: big,
  };

  it('65,535 entries sharing one stream', () => {
    const zip = rawZip(
      [bomb],
      Array.from({ length: 65_535 }, () => ({ local: 0 })),
    );
    expect(refuses(() => readWorkbook(zip), NOT_A_DOWNLOAD)).toBeLessThan(100);
  });

  it('more than 1,000 entries', () => {
    const zip = rawZip(
      [bomb],
      Array.from({ length: 1_001 }, () => ({ local: 0 })),
    );
    expect(refuses(() => readWorkbook(zip), /too many parts/)).toBeLessThan(100);
    const many = Array.from({ length: 1_001 }, (_, i) => stored(`junk/${i}.txt`, 'x'));
    const zip2 = rawZip(
      many,
      many.map((_, i) => ({ local: i })),
    );
    expect(refuses(() => readWorkbook(zip2), /too many parts/)).toBeLessThan(100);
  });

  it('a wanted part name that appears twice', () => {
    const zip = rawZip(
      [stored('xl/workbook.xml', workbookXml(0)), stored('xl/workbook.xml', workbookXml(0))],
      [{ local: 0 }, { local: 1 }],
    );
    expect(
      refuses(() => readWorkbook(zip), /The part xl\/workbook.xml appears more than once/),
    ).toBeLessThan(100);
  });

  it('two names pointing at the same bytes', () => {
    const zip = rawZip([bomb], [{ local: 0 }, { local: 0, name: 'xl/_rels/workbook.xml.rels' }]);
    expect(refuses(() => readWorkbook(zip), NOT_A_DOWNLOAD)).toBeLessThan(100);
  });

  it('a zip64 record claiming 4 billion entries', () => {
    const zip = rawZip(
      [stored('xl/_rels/workbook.xml.rels', relsXml(0)), stored('xl/workbook.xml', workbookXml(0))],
      [{ local: 0 }, { local: 1 }],
      0xfffffff0,
    );
    expect(refuses(() => readWorkbook(zip), NOT_A_DOWNLOAD)).toBeLessThan(100);
  });
});

describe('readWorkbook limits how much it inflates (S-16)', () => {
  it('a part declared over 16 MB, before inflating it', () => {
    const data = deflateSync(strToU8(workbookXml(0)));
    const zip = rawZip(
      [{ name: 'xl/workbook.xml', method: 8, data, size: 16 * 1024 * 1024 + 1 }],
      [{ local: 0 }],
    );
    expect(refuses(() => readWorkbook(zip), /too large to read/)).toBeLessThan(100);
  });

  it('a stream that inflates past its declared size, while inflating', () => {
    const data = deflateSync(new Uint8Array(8 * 1024 * 1024), { level: 9 });
    const zip = rawZip([{ name: 'xl/workbook.xml', method: 8, data, size: 1024 }], [{ local: 0 }]);
    expect(refuses(() => readWorkbook(zip), NOT_A_DOWNLOAD)).toBeLessThan(100);
  });

  it('parts that add up to over 48 MB across tabs', () => {
    const sheet = deflateSync(strToU8(worksheetXml));
    const locals: Local[] = [
      stored('xl/workbook.xml', workbookXml(4)),
      stored('xl/_rels/workbook.xml.rels', relsXml(4)),
      ...[1, 2, 3, 4].map((i): Local => ({
        name: `xl/worksheets/sheet${i}.xml`,
        method: 8,
        data: sheet,
        size: 15 * 1024 * 1024,
      })),
    ];
    const wb = readWorkbook(
      rawZip(
        locals,
        locals.map((_, i) => ({ local: i })),
      ),
    );
    expect(wb.sheet('T1')?.cell('A1')).toBe(1);
    wb.sheet('T2');
    wb.sheet('T3');
    expect(refuses(() => wb.sheet('T4'), /add up to over 48 MB/)).toBeLessThan(100);
  });
});

describe('readWorkbook refuses a DTD (S-17)', () => {
  it('an internal entity', () => {
    const sst = `<?xml version="1.0"?><!DOCTYPE sst [<!ENTITY who "Expanded">]><sst xmlns="${NS}"><si><t>&who;</t></si></sst>`;
    const zip = buildXlsx({ T: { A1: 'x' } }, { extra: { 'xl/sharedStrings.xml': sst } });
    expect(refuses(() => readWorkbook(zip), /xl\/sharedStrings.xml is not valid XML/)).toBeLessThan(
      100,
    );
  });

  it('billion laughs', () => {
    let dtd = '<!ENTITY lol "lollollollollollollollollollol">';
    for (let i = 1; i <= 9; i++)
      dtd += `<!ENTITY lol${i} "${`&lol${i === 1 ? '' : i - 1};`.repeat(10)}">`;
    const sst = `<?xml version="1.0"?><!DOCTYPE sst [${dtd}]><sst xmlns="${NS}"><si><t>&lol9;</t></si></sst>`;
    const zip = buildXlsx({ T: { A1: 'x' } }, { extra: { 'xl/sharedStrings.xml': sst } });
    expect(refuses(() => readWorkbook(zip), /not valid XML/)).toBeLessThan(100);
  });
});
