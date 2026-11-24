import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { cellDate } from './extract.ts';
import { buildXlsx } from './testWorkbook.ts';
import { MAX_XLSX_BYTES, readWorkbook, XlsxError } from './workbook.ts';

describe('readWorkbook', () => {
  const bytes = buildXlsx({
    First: {
      A1: 'Shared text',
      B1: 42,
      C1: '17',
      D1: ' 1,250 ',
      E1: true,
      F1: { formula: 'B1*2', value: 84 },
      G1: { formula: 'A1', value: 'Shared text' },
      H1: { error: '#N/A' },
      I1: { inline: 'Inline text' },
      J1: '',
      K1: null,
      A2: { text: 'rich:Rich text' },
      AB300: 'Far away',
    },
    'Second tab': { A1: 'Second' },
  });

  it('lists the tab names in order', () => {
    expect(readWorkbook(bytes).sheetNames).toEqual(['First', 'Second tab']);
  });

  it('reads shared strings, numbers, booleans, and cached formula values', () => {
    const s = readWorkbook(bytes).sheet('First');
    expect(s?.cell('A1')).toBe('Shared text');
    expect(s?.cell('B1')).toBe(42);
    expect(s?.cell('E1')).toBe(true);
    expect(s?.cell('F1')).toBe(84);
    expect(s?.cell('G1')).toBe('Shared text');
    expect(s?.cell('AB300')).toBe('Far away');
  });

  it('keeps numbers stored as text as text (the extractor reads them as numbers)', () => {
    const s = readWorkbook(bytes).sheet('First');
    expect(s?.cell('C1')).toBe('17');
    expect(s?.cell('D1')).toBe(' 1,250 ');
  });

  it('reads empty cells, missing cells and formula errors as null', () => {
    const s = readWorkbook(bytes).sheet('First');
    expect(s?.cell('H1')).toBeNull();
    expect(s?.cell('J1')).toBeNull();
    expect(s?.cell('K1')).toBeNull();
    expect(s?.cell('Z99')).toBeNull();
    expect(s?.cells.has('K1')).toBe(false);
  });

  it('joins rich text runs and skips phonetic runs', () => {
    const s = readWorkbook(bytes).sheet('First');
    expect(s?.cell('I1')).toBe('Inline text');
    expect(s?.cell('A2')).toBe('Rich text');
  });

  it('reads inline strings (openpyxl) like shared strings', () => {
    const wb = readWorkbook(buildXlsx({ T: { A1: 'Inline', B1: 3 } }, { sharedStrings: false }));
    expect(wb.sheet('T')?.cell('A1')).toBe('Inline');
  });

  it('returns undefined for a tab that is not there', () => {
    expect(readWorkbook(bytes).sheet('Nope')).toBeUndefined();
  });

  it('reports the 1904 date system', () => {
    expect(readWorkbook(bytes).date1904).toBe(false);
    expect(readWorkbook(buildXlsx({ T: {} }, { date1904: true })).date1904).toBe(true);
  });

  it('refuses files over 10 MB before unzipping', () => {
    const big = new Uint8Array(MAX_XLSX_BYTES + 1);
    expect(() => readWorkbook(big)).toThrow(XlsxError);
    expect(() => readWorkbook(big)).toThrow(/too large/);
  });

  it('refuses a file that is not a zip, or a zip that is not a workbook', () => {
    expect(() => readWorkbook(strToU8('just text'))).toThrow(/not an .xlsx workbook/);
    expect(() => readWorkbook(zipSync({ 'a.txt': strToU8('x') }))).toThrow(/not an .xlsx workbook/);
  });

  it('refuses damaged XML', () => {
    const files = zipSync({
      'xl/workbook.xml': strToU8('<workbook><sheets><sheet'),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships/>'),
    });
    expect(() => readWorkbook(files)).toThrow(/not valid XML/);
  });
});

describe('cellDate', () => {
  it('reads date serial numbers (1900 and 1904 systems)', () => {
    expect(cellDate(45360)).toBe('2024-03-09');
    expect(cellDate(45360.75)).toBe('2024-03-09');
    expect(cellDate(43898, true)).toBe('2024-03-09');
  });

  it('reads ISO and US text dates, and refuses others', () => {
    expect(cellDate('2024-03-09')).toBe('2024-03-09');
    expect(cellDate('3/9/2024')).toBe('2024-03-09');
    expect(cellDate('3/9/24')).toBe('2024-03-09');
    expect(cellDate('2024-02-30')).toBeUndefined();
    expect(cellDate('March 9th')).toBeUndefined();
    expect(cellDate(null)).toBeUndefined();
  });
});
