// Reads a character from the official character sheet's cells into the domain-level character
// (types.ts). The reverse of tools/parity/run.py write_character: same tabs, cells and rows.
// Only typed input cells are read; computed cells are ignored. Anything the import cannot map
// exactly becomes a plain-English warning; a sheet with no readable ancestry is refused.
import type { Ruleset } from '../data/index.ts';
import type { SkillPart } from '../engine/model.ts';
import type { LedgerCurrency } from '../engine/sheet.ts';
import { familiarLevelFp } from '../engine/rules/progression.ts';
import { maxLevelOf, type CostKind } from '../engine/rules/costs.ts';
import {
  SHEET_ONLY_SKILLS,
  sheetLabels,
  type LabelIndex,
  type Match,
  type SkillTab,
} from './labels.ts';
import type {
  BoonEntry,
  FamiliarEntry,
  LedgerEntry,
  OtherKnowledge,
  SheetCharacter,
  SkillEntry,
  StartingItemEntry,
} from './types.ts';
import type { CellValue, Workbook, Worksheet } from './workbook.ts';

export const TAB = {
  info: 'PlayerCharacter Info',
  standard: 'Standard Skills',
  magic: 'Magic Skills',
  crafting: 'Crafting Skills',
  knowledges: 'KnowledgesSpellsRecipes',
  points: 'Points EarnedSpent',
} as const;

/** Tabs a workbook must have to be read as a character sheet. */
export const REQUIRED_TABS: readonly string[] = Object.values(TAB);

/** A workbook that cannot be imported at all. */
export class SheetImportError extends Error {
  override name = 'SheetImportError';
}

export interface Extracted {
  readonly character: SheetCharacter;
  /** Plain-English notes on everything read with a guess, fixed, or left out. */
  readonly warnings: string[];
}

export interface ExtractOptions {
  /** Date for ledger rows when the sheet has no dates at all (default: today, UTC). */
  readonly today?: string;
}

// ---- Cell helpers ----

function text(v: CellValue): string {
  if (v === null || typeof v === 'boolean') return '';
  return String(v).trim();
}

/** A number, also when typed as text ("3", " 1,250 "). */
function num(v: CellValue): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const t = v.trim().replace(/,/g, '');
  if (t === '' || !/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(t)) return undefined;
  return Number(t);
}

/** Longest cell text quoted in a warning; longer text is clipped. */
const QUOTE_MAX = 80;

function q(s: string): string {
  if (s.length <= QUOTE_MAX) return `"${s}"`;
  // Do not split a surrogate pair at the cut.
  const cut = /[\uD800-\uDBFF]/.test(s.charAt(QUOTE_MAX - 1)) ? QUOTE_MAX - 1 : QUOTE_MAX;
  return `"${s.slice(0, cut)}…"`;
}

const STANDARD_ROWS = { first: 6, last: 53 };
const OTHER_ROWS = { first: 6, last: 86 };
const KNOWLEDGE_ROWS = { first: 11, last: 107 };
const LEDGER_ROWS = { first: 6, last: 1000 };

/** Columns per skill block: label and level. */
const SKILL_COLUMNS: Record<SkillTab, Record<'basic' | 'archetype', [string, string]>> = {
  standard: { basic: ['A', 'F'], archetype: ['K', 'Q'] },
  magic: { basic: ['A', 'E'], archetype: ['J', 'P'] },
  crafting: { basic: ['A', 'E'], archetype: ['J', 'P'] },
};

/** Ledger columns per currency: amount, reason, date. */
const LEDGER_COLUMNS: Record<LedgerCurrency, [string, string, string]> = {
  cxp: ['A', 'B', 'C'],
  pxp: ['E', 'F', 'G'],
  shinies: ['I', 'J', 'K'],
  fp: ['M', 'N', 'O'],
};
const CURRENCY_ORDER: readonly LedgerCurrency[] = ['cxp', 'pxp', 'shinies', 'fp'];
const CURRENCY_NAME: Record<LedgerCurrency, string> = {
  cxp: 'CXP',
  pxp: 'PXP',
  shinies: 'Shinies',
  fp: 'FP',
};

const SPELL_SLOTS = ['elemental', 'life', 'death', 'tech', 'universal'];
const RECIPE_SLOTS = ['engineering', 'chemistry', 'gearcraft', 'medicine', 'universal'];

/** Ancestry ability level dropdown (H15, H16). */
const ABILITY_LEVEL_MAX = 6;

class Notes {
  readonly list: string[] = [];
  add(message: string): void {
    if (!this.list.includes(message)) this.list.push(message);
  }
  /** Warns when a label was read with an alias or a typo fix. */
  matched<T>(where: string, raw: string, m: Match<T>, what = ''): void {
    if (m.how === 'exact') return;
    const suffix = what ? ` ${what}` : '';
    if (m.how === 'alias')
      this.add(`${where}: ${q(raw)} is an old or other name; read as ${q(m.label)}${suffix}.`);
    else this.add(`${where}: ${q(raw)} was read as ${q(m.label)}${suffix}.`);
  }
}

function lookup<T>(
  notes: Notes,
  index: LabelIndex<T>,
  where: string,
  raw: string,
  kind: string,
): T | undefined {
  const m = index.find(raw);
  if (!m) {
    notes.add(`${where}: ${q(raw)} is not a ${kind} the app knows; left out.`);
    return undefined;
  }
  notes.matched(where, raw, m);
  return m.value;
}

/** Whole number, or undefined with a warning. */
function wholeNumber(notes: Notes, where: string, v: CellValue, what: string): number | undefined {
  const n = num(v);
  if (n === undefined) {
    if (text(v) !== '') notes.add(`${where}: ${what} ${q(text(v))} is not a number; left out.`);
    return undefined;
  }
  if (!Number.isInteger(n)) {
    const r = Math.round(n);
    notes.add(`${where}: ${what} ${n} is not a whole number; read as ${r}.`);
    return r;
  }
  return n;
}

// ---- Dates ----

const DAY_MS = 86_400_000;

function iso(ms: number): string | undefined {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

function validYmd(y: number, m: number, d: number): string | undefined {
  const ms = Date.UTC(y, m - 1, d);
  const out = iso(ms);
  const back = new Date(ms);
  return out && back.getUTCMonth() === m - 1 && back.getUTCDate() === d ? out : undefined;
}

/** A date cell: a date serial number (Google Sheets, Excel), or text as 2024-03-09 or 3/9/2024. */
export function cellDate(v: CellValue, date1904 = false): string | undefined {
  if (typeof v === 'number') {
    const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    return iso(epoch + Math.floor(v) * DAY_MS);
  }
  const t = text(v);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(t);
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t);
  if (m) {
    const y = Number(m[3]);
    return validYmd(y < 100 ? 2000 + y : y, Number(m[1]), Number(m[2]));
  }
  return undefined;
}

// ---- Ledger ----

interface RawRow {
  readonly currency: LedgerCurrency;
  readonly amount: number;
  readonly reason: string;
  readonly date: string;
  readonly row: number;
}

interface Merged {
  date: string;
  reason: string;
  kind: string;
  event?: string;
  amounts: Partial<Record<LedgerCurrency, number>>;
  /** Sheet row of the first amount, for warnings. */
  row: number;
  currency: LedgerCurrency;
}

const NO_REASON = 'No reason given on the sheet';

function readLedgerRows(
  sheet: Worksheet,
  notes: Notes,
  date1904: boolean,
  today: string,
): RawRow[] {
  const raw: (Omit<RawRow, 'date'> & { date?: string })[] = [];
  let undated = 0;
  let badDates = 0;
  for (const currency of CURRENCY_ORDER) {
    const [ca, cb, cc] = LEDGER_COLUMNS[currency];
    let previous: string | undefined;
    for (let r = LEDGER_ROWS.first; r <= LEDGER_ROWS.last; r++) {
      const amountCell = sheet.cell(`${ca}${r}`);
      if (text(amountCell) === '') continue;
      const where = `${TAB.points} ${CURRENCY_NAME[currency]} row ${r}`;
      const amount = wholeNumber(notes, where, amountCell, 'amount');
      if (amount === undefined || amount === 0) continue;
      const reason = text(sheet.cell(`${cb}${r}`));
      const dateCell = sheet.cell(`${cc}${r}`);
      let date = cellDate(dateCell, date1904);
      if (date === undefined) {
        if (text(dateCell) === '') undated++;
        else badDates++;
        date = previous;
      }
      if (date !== undefined) previous = date;
      raw.push({ currency, amount, reason, row: r, ...(date !== undefined ? { date } : {}) });
    }
  }
  const known = raw.map((r) => r.date).filter((d): d is string => d !== undefined);
  const first = known.length > 0 ? known.reduce((a, b) => (b < a ? b : a)) : today;
  if (undated > 0)
    notes.add(
      `${TAB.points}: ${undated} ledger ${undated === 1 ? 'row has' : 'rows have'} no date; dated like the row above (or the first date).`,
    );
  if (badDates > 0)
    notes.add(
      `${TAB.points}: ${badDates} ledger ${badDates === 1 ? 'date is' : 'dates are'} not a date the import can read; dated like the row above.`,
    );
  return raw.map((r) => ({ ...r, date: r.date ?? first }));
}

/**
 * The sheet keeps one ledger per currency. Rows with the same date and reason are one entry
 * (an event row gives CXP and FP; an NPC row CXP, PXP and Shinies): the k-th such row of each
 * currency joins the k-th entry.
 */
function mergeRows(rows: readonly RawRow[]): Merged[] {
  const entries: Merged[] = [];
  const byKey = new Map<string, Merged[]>();
  const seen = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.date}|${r.reason}`;
    const countKey = `${key}|${r.currency}`;
    const k = seen.get(countKey) ?? 0;
    seen.set(countKey, k + 1);
    const list = byKey.get(key) ?? [];
    byKey.set(key, list);
    let entry = list[k];
    if (!entry) {
      entry = {
        date: r.date,
        reason: r.reason,
        kind: '',
        amounts: {},
        row: r.row,
        currency: r.currency,
      };
      list.push(entry);
      entries.push(entry);
    }
    entry.amounts[r.currency] = r.amount;
  }
  // Date order; within a date, credits before spends so no balance dips below zero midway.
  const spends = (e: Merged) => Object.values(e.amounts).some((a) => (a ?? 0) < 0);
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) =>
      a.e.date !== b.e.date
        ? a.e.date < b.e.date
          ? -1
          : 1
        : Number(spends(a.e)) - Number(spends(b.e)) || a.i - b.i,
    )
    .map((x) => x.e);
}

/** Ledger kind from the reason and the amounts. Unknown credits are "other-award". */
function inferKind(e: Merged): string {
  const r = e.reason.toLowerCase();
  const a = e.amounts;
  const positive = CURRENCY_ORDER.filter((c) => (a[c] ?? 0) > 0);
  const negative = CURRENCY_ORDER.filter((c) => (a[c] ?? 0) < 0);
  const onlyCxp = positive.length === 1 && positive[0] === 'cxp' && negative.length === 0;
  if (onlyCxp && /infection/.test(r)) return 'infection-bonus';
  if (onlyCxp && /\bstart|creation|new character|initial/.test(r)) return 'start';
  if ((a.shinies ?? 0) < 0 && positive.length > 0 && negative.length === 1) return 'shiny-purchase';
  if (negative.length === 1 && negative[0] === 'fp' && positive.length === 0)
    return /familiar|awaken/.test(r) ? 'familiar' : 'adjustment';
  if (negative.length > 0)
    return /penalt|strike|loss|lost|deduct|fine\b/.test(r) ? 'penalty' : 'adjustment';
  if (/retire/.test(r)) return 'retirement-carry';
  if (/\bnpc\b/.test(r)) return 'npc';
  if (/donat/.test(r)) return 'donation';
  if (/volunteer/.test(r)) return 'volunteer';
  if (/staff|logistic|\bgm\b|narrat|marshal|set[- ]?up|clean ?up|tear ?down|month/.test(r))
    return 'staff';
  if (/\bevent\b|\bgame\b/.test(r)) return 'event';
  if (/grade/.test(r)) return 'grades';
  return 'other-award';
}

function readLedger(
  rs: Ruleset,
  sheet: Worksheet,
  notes: Notes,
  date1904: boolean,
  today: string,
  familiar: { level: number; awakened: boolean } | undefined,
): LedgerEntry[] {
  const entries = mergeRows(readLedgerRows(sheet, notes, date1904, today));
  for (const e of entries) {
    if (e.reason === '') e.reason = NO_REASON;
    e.kind = inferKind(e);
  }
  const other = [...new Set(entries.filter((e) => e.kind === 'other-award').map((e) => e.reason))];
  if (other.length > 0)
    notes.add(
      `${TAB.points}: ${other.length === 1 ? 'a reason' : `${other.length} reasons`} the import does not recognise ${other.length === 1 ? 'was' : 'were'} recorded as "Other award": ${other
        .slice(0, 5)
        .map(q)
        .join(', ')}${other.length > 5 ? ', ...' : ''}.`,
    );

  // Starting CXP: the first CXP row when no row says "start" and it is the usual amount.
  if (!entries.some((e) => e.kind === 'start')) {
    const first = entries.find((e) => e.amounts.cxp !== undefined);
    if (
      first &&
      first.amounts.cxp === rs.ruleset.startingCxp &&
      Object.keys(first.amounts).length === 1
    ) {
      first.kind = 'start';
      notes.add(
        `${TAB.points} CXP row ${first.row}: ${q(first.reason)} (${rs.ruleset.startingCxp} CXP) was read as the starting CXP.`,
      );
    } else notes.add(`${TAB.points}: no starting CXP row found; every CXP row counts as earned.`);
  }

  // Events: each date with an event row is one event (E1, E2, ... in date order). Every other
  // entry that day belongs to it, except the creation rows.
  const eventDates = [...new Set(entries.filter((e) => e.kind === 'event').map((e) => e.date))];
  eventDates.sort();
  const eventOf = new Map(eventDates.map((d, i) => [d, `E${i + 1}`]));
  for (const e of entries) {
    const ev = eventOf.get(e.date);
    if (ev && !['start', 'infection-bonus', 'retirement-carry'].includes(e.kind)) e.event = ev;
  }

  // Familiar FP: the spends that pay each level in turn ([FAM-AWAKEN], [FAM-LEVEL]). The
  // engine charges that FP itself, so those rows become familiar levels.
  let level = rs.familiar.levels.min;
  const target = familiar?.awakened ? familiar.level : level;
  let renamed = 0;
  for (const e of entries) {
    const onlyFp = Object.keys(e.amounts).length === 1 && (e.amounts.fp ?? 0) < 0;
    if (!onlyFp) continue;
    const cost = familiarLevelFp(rs, level + 1);
    if (level < target && -(e.amounts.fp ?? 0) === cost) {
      e.kind = 'familiar';
      level++;
    } else if (e.kind === 'familiar') {
      e.kind = 'adjustment';
      renamed++;
    }
  }
  if (renamed > 0)
    notes.add(
      `${TAB.points}: ${renamed} FP ${renamed === 1 ? 'spend mentions' : 'spends mention'} the familiar but ${renamed === 1 ? 'does' : 'do'} not match a familiar level's cost; kept as FP adjustments.`,
    );
  if (familiar?.awakened && level < familiar.level) {
    let missing = 0;
    for (let n = level + 1; n <= familiar.level; n++) missing += familiarLevelFp(rs, n);
    notes.add(
      `${TAB.points}: the FP ledger pays for familiar levels up to ${level} only. The import charges ${missing} FP for levels ${level + 1} to ${familiar.level}, so FP available is ${missing} lower than on the sheet.`,
    );
  }

  return entries.map((e) => ({
    date: e.date,
    kind: e.kind,
    reason: e.reason,
    ...(e.event !== undefined ? { event: e.event } : {}),
    ...e.amounts,
  }));
}

// ---- The rest of the sheet ----

function requireSheet(wb: Workbook, name: string): Worksheet {
  const sheet = wb.sheet(name);
  if (!sheet) throw new SheetImportError(`The workbook has no "${name}" tab.`);
  return sheet;
}

/** Throws SheetImportError unless every tab the import reads is present. */
export function checkTabs(wb: Workbook): void {
  const missing = REQUIRED_TABS.filter((t) => !wb.sheetNames.includes(t));
  if (missing.length > 0)
    throw new SheetImportError(
      `This does not look like the Rustwater character sheet: the workbook has no ${missing
        .map(q)
        .join(', ')} ${missing.length === 1 ? 'tab' : 'tabs'}.`,
    );
}

function readSkills(rs: Ruleset, wb: Workbook, notes: Notes): SkillEntry[] {
  const labels = sheetLabels(rs);
  const out: SkillEntry[] = [];
  const index = new Map<string, number>();
  const tabs: [SkillTab, string, { first: number; last: number }][] = [
    ['standard', TAB.standard, STANDARD_ROWS],
    ['magic', TAB.magic, OTHER_ROWS],
    ['crafting', TAB.crafting, OTHER_ROWS],
  ];
  for (const [tab, name, rows] of tabs) {
    const sheet = requireSheet(wb, name);
    for (const block of ['basic', 'archetype'] as const) {
      const [labelCol, levelCol] = SKILL_COLUMNS[tab][block];
      for (let r = rows.first; r <= rows.last; r++) {
        const raw = text(sheet.cell(`${labelCol}${r}`));
        if (raw === '') continue;
        const where = `${name} ${labelCol}${r}`;
        const only = SHEET_ONLY_SKILLS[raw];
        if (only && only.tab === tab && only.block === block) {
          notes.add(`${where}: ${q(raw)} is left out: ${only.why}.`);
          continue;
        }
        const ref = lookup(notes, labels.skills[tab][block], where, raw, 'skill on this tab');
        if (!ref) continue;
        const def = rs.skillsById[ref.skill];
        const part = def?.parts[ref.part];
        if (!def || !part) continue;
        let level = wholeNumber(notes, where, sheet.cell(`${levelCol}${r}`), 'level');
        if (level === undefined) {
          notes.add(`${where}: ${q(raw)} has no level; left out.`);
          continue;
        }
        if (level < 1) {
          if (level < 0) notes.add(`${where}: ${q(raw)} level ${level} is below 1; left out.`);
          continue;
        }
        const max = maxLevelOf(rs, part.costKind as CostKind);
        if (max !== null && level > max) {
          notes.add(
            `${where}: ${q(raw)} level ${level} is above the maximum ${max}; read as ${max}.`,
          );
          level = max;
        }
        const key = `${ref.skill}.${ref.part}`;
        const at = index.get(key);
        if (at !== undefined) {
          const prev = out[at];
          notes.add(
            `${where}: ${q(raw)} is listed twice; the higher level (${Math.max(level, prev?.level ?? 0)}) is kept.`,
          );
          if (prev && level > prev.level) out[at] = { ...prev, level };
          continue;
        }
        index.set(key, out.length);
        out.push({
          skill: ref.skill,
          part: ref.part as SkillPart,
          level,
          ...(ref.archetype !== undefined ? { archetype: ref.archetype } : {}),
        });
      }
    }
  }
  return out;
}

function slotOf(
  notes: Notes,
  where: string,
  raw: string,
  allowed: readonly string[],
  fallback: string,
  name: string,
): string {
  const slot = raw.toLowerCase();
  if (allowed.includes(slot)) return slot;
  if (raw === '') notes.add(`${where}: ${q(name)} has no slot; put in ${fallback}.`);
  else
    notes.add(
      `${where}: slot ${q(raw)} for ${q(name)} is not one the app knows; put in ${fallback}.`,
    );
  return fallback;
}

function readKnowledges(
  rs: Ruleset,
  sheet: Worksheet,
  notes: Notes,
): Pick<SheetCharacter, 'spells' | 'recipes' | 'otherKnowledges'> {
  const labels = sheetLabels(rs);
  const spells: { spell: string; slot: string }[] = [];
  const recipes: { recipe: string; slot: string }[] = [];
  const other: OtherKnowledge[] = [];
  for (let r = KNOWLEDGE_ROWS.first; r <= KNOWLEDGE_ROWS.last; r++) {
    const spellRaw = text(sheet.cell(`A${r}`));
    if (spellRaw !== '') {
      const where = `${TAB.knowledges} A${r}`;
      const id = lookup(notes, labels.spells, where, spellRaw, 'spell');
      const spell = id ? rs.spellsById[id] : undefined;
      if (id && spell) {
        if (spells.some((s) => s.spell === id))
          notes.add(`${where}: ${q(spellRaw)} is listed twice; kept once.`);
        else {
          const fallback = spell.mastery ? 'universal' : spell.school;
          const slot = slotOf(
            notes,
            `${TAB.knowledges} C${r}`,
            text(sheet.cell(`C${r}`)),
            SPELL_SLOTS,
            fallback ?? 'universal',
            spell.name,
          );
          spells.push({ spell: id, slot });
        }
      }
    }
    const recipeRaw = text(sheet.cell(`F${r}`));
    if (recipeRaw !== '') {
      const where = `${TAB.knowledges} F${r}`;
      const id = lookup(notes, labels.recipes, where, recipeRaw, 'recipe');
      const recipe = id ? rs.recipesById[id] : undefined;
      if (id && recipe) {
        if (recipes.some((x) => x.recipe === id))
          notes.add(`${where}: ${q(recipeRaw)} is listed twice; kept once.`);
        else {
          const fallback = recipe.mastery ? 'universal' : recipe.discipline;
          const slot = slotOf(
            notes,
            `${TAB.knowledges} H${r}`,
            text(sheet.cell(`H${r}`)),
            RECIPE_SLOTS,
            fallback ?? 'universal',
            recipe.name,
          );
          recipes.push({ recipe: id, slot });
        }
      }
    }
    const name = text(sheet.cell(`K${r}`));
    if (name !== '') {
      const type = text(sheet.cell(`L${r}`));
      const rank = text(sheet.cell(`M${r}`));
      const where = `${TAB.knowledges} K${r}`;
      const perf = labels.performances.find(name);
      const ritual = labels.rituals.find(name);
      if (perf && (!/ritual/i.test(type) || !ritual)) {
        notes.matched(where, name, perf);
        other.push({ performance: perf.value });
      } else if (ritual) {
        notes.matched(where, name, ritual);
        other.push({ ritual: ritual.value });
      } else {
        other.push({ name, ...(type ? { type } : {}), ...(rank ? { rank } : {}) });
      }
    }
  }
  return { spells, recipes, otherKnowledges: other };
}

function readFamiliar(rs: Ruleset, sheet: Worksheet, notes: Notes): FamiliarEntry | undefined {
  const labels = sheetLabels(rs);
  const name = text(sheet.cell('G18'));
  const awakenedRaw = text(sheet.cell('F19'));
  const levelCell = sheet.cell('H19');
  const slotRaw = [21, 22, 23, 24, 25, 26].map((r) => ({ r, raw: text(sheet.cell(`F${r}`)) }));
  let level = wholeNumber(notes, `${TAB.info} H19`, levelCell, 'familiar level');
  const hasSkills = slotRaw.some((s) => s.raw !== '');
  if (name === '' && awakenedRaw === '' && !hasSkills && (level === undefined || level <= 1))
    return undefined;
  const { min, max } = rs.familiar.levels;
  if (level === undefined || level < min) level = min;
  if (level > max) {
    notes.add(
      `${TAB.info} H19: familiar level ${level} is above the maximum ${max}; read as ${max}.`,
    );
    level = max;
  }
  let awakened: string | undefined;
  if (awakenedRaw !== '')
    awakened = lookup(
      notes,
      labels.awakenedSkills,
      `${TAB.info} F19`,
      awakenedRaw,
      'awakened skill',
    );
  if (level > min && awakened === undefined) {
    notes.add(
      `${TAB.info}: the familiar is level ${level} but has no awakened skill the app knows; imported at level ${min}.`,
    );
    level = min;
  }
  const slots: string[] = [];
  for (const { r, raw } of slotRaw) {
    if (raw === '') continue;
    const id = lookup(notes, labels.familiarSkills, `${TAB.info} F${r}`, raw, 'familiar skill');
    if (id) slots.push(id);
  }
  if (slots.length > 0 && awakened === undefined) {
    notes.add(
      `${TAB.info}: familiar skills need an awakened familiar; the ${slots.length} familiar skills are left out.`,
    );
    slots.length = 0;
  }
  let extraSlots = ['E25', 'E26'].filter(
    (c) => text(sheet.cell(c)).toLowerCase() === 'skill slot',
  ).length;
  const base = rs.familiar.essence.baseSkillSlots;
  if (slots.length > base + extraSlots) {
    const needed = slots.length - base;
    notes.add(
      `${TAB.info}: ${slots.length} familiar skills need ${needed} extra ${needed === 1 ? 'slot' : 'slots'}; the import unlocks ${needed - extraSlots} more (${rs.familiar.essence.extraSlotCost} Essence each).`,
    );
    extraSlots = needed;
  }
  const finalName = name !== '' ? name : 'Familiar';
  if (name === '') notes.add(`${TAB.info} G18: the familiar has no name; named "Familiar".`);
  return {
    name: finalName,
    level,
    ...(awakened !== undefined ? { awakenedSkill: awakened } : {}),
    slots,
    extraSlots,
  };
}

function readFreeText(rs: Ruleset, sheet: Worksheet, notes: Notes) {
  const labels = sheetLabels(rs);
  const effectsNotes: string[] = [];
  for (let r = 8; r <= 23; r++) {
    const t = text(sheet.cell(`A${r}`));
    if (t !== '') effectsNotes.push(t);
  }
  const boons: BoonEntry[] = [];
  for (let r = 8; r <= 10; r++) {
    const t = text(sheet.cell(`E${r}`));
    if (t === '') continue;
    const m = labels.boons.find(t);
    if (m) notes.matched(`${TAB.info} E${r}`, t, m);
    boons.push(m ? { boon: m.value } : { name: t });
  }
  const startingItems: StartingItemEntry[] = [];
  for (let r = 26; r <= 35; r++) {
    const t = text(sheet.cell(`A${r}`));
    if (t === '') continue;
    const dash = t.lastIndexOf(' - ');
    const head = dash > 0 ? t.slice(0, dash) : t;
    const detail = dash > 0 ? t.slice(dash + 3).trim() : '';
    const m = labels.startingItems.find(head);
    if (m && m.how === 'exact')
      startingItems.push({ item: m.value, ...(detail ? { detail } : {}) });
    else startingItems.push({ text: t });
  }
  const unmatched = startingItems.filter((i) => i.text !== undefined).length;
  if (unmatched > 0)
    notes.add(
      `${TAB.info} A26:A35: ${unmatched} starting ${unmatched === 1 ? 'item does' : 'items do'} not match a starting item option; kept in the character notes.`,
    );
  return { effectsNotes, boons, startingItems };
}

/**
 * Reads the character from a workbook of the official sheet. Throws SheetImportError when the
 * tabs are missing or the ancestry (PlayerCharacter Info B4) cannot be read.
 */
export function extractCharacter(
  wb: Workbook,
  rs: Ruleset,
  options: ExtractOptions = {},
): Extracted {
  checkTabs(wb);
  const notes = new Notes();
  const labels = sheetLabels(rs);
  const info = requireSheet(wb, TAB.info);
  const today = options.today ?? new Date().toISOString().slice(0, 10);

  // Names
  let name = text(info.cell('B3'));
  if (name === '') {
    name = 'Imported character';
    notes.add(`${TAB.info} B3: the character has no name; named "Imported character".`);
  }
  let player = text(info.cell('B1'));
  if (player === '') {
    player = 'Unknown player';
    notes.add(`${TAB.info} B1: no player name; recorded as "Unknown player".`);
  }
  const email = text(info.cell('B2'));

  // Ancestry
  const subtypeRaw = text(info.cell('B4'));
  if (subtypeRaw === '')
    throw new SheetImportError(
      `${TAB.info} B4 (the ancestry) is blank, so the character cannot be imported.`,
    );
  const sub = labels.subtypes.find(subtypeRaw);
  if (!sub)
    throw new SheetImportError(
      `${TAB.info} B4: ${q(subtypeRaw)} is not an ancestry the app knows, so the character cannot be imported.`,
    );
  notes.matched(`${TAB.info} B4`, subtypeRaw, sub);
  const ancestry = rs.ancestriesById[sub.value.ancestry];
  const entry = rs.subtypesById[sub.value.subtype];
  if (!ancestry || !entry) throw new SheetImportError(`${TAB.info} B4: unknown ancestry.`);
  // H15 holds the shared ability, H16 the subtype's; Cryptids swap them (D-28).
  const swapped = ancestry.sharedAbility.choice !== undefined;
  const slots = swapped
    ? [entry.subtype.ability, ancestry.sharedAbility]
    : [ancestry.sharedAbility, entry.subtype.ability];
  const abilityLevels: Record<string, number> = {};
  slots.forEach((ability, i) => {
    const cell = i === 0 ? 'H15' : 'H16';
    const where = `${TAB.info} ${cell}`;
    let level = wholeNumber(notes, where, info.cell(cell), `${ability.name} level`) ?? 1;
    if (level < 1) {
      notes.add(`${where}: ${ability.name} level ${level} is below 1; read as 1.`);
      level = 1;
    }
    if (level > ABILITY_LEVEL_MAX)
      notes.add(
        `${where}: ${ability.name} level ${level} is above the sheet's 1 to ${ABILITY_LEVEL_MAX} range.`,
      );
    abilityLevels[ability.id] = level;
  });

  // Familiar first: the ledger needs its level to find the FP rows that paid for it.
  const familiar = readFamiliar(rs, info, notes);
  const ledger = readLedger(
    rs,
    requireSheet(wb, TAB.points),
    notes,
    wb.date1904,
    today,
    familiar
      ? { level: familiar.level, awakened: familiar.awakenedSkill !== undefined }
      : undefined,
  );
  if (ledger.length === 0)
    notes.add(`${TAB.points}: the ledgers are empty; the character starts with no points.`);

  // Infection: D2 is typed as base + extra at creation + gained in play.
  const connection = ancestry.infectionTrack === 'connection';
  const bonus = ledger
    .filter((r) => r.kind === 'infection-bonus')
    .reduce((s, r) => s + (r.cxp ?? 0), 0);
  const perLevel = rs.ruleset.extraInfection.cxpPerLevel;
  let extraInfection = connection ? 0 : Math.floor(bonus / perLevel);
  if (!connection && bonus % perLevel !== 0)
    notes.add(
      `${TAB.points}: the extra infection CXP (${bonus}) is not a multiple of ${perLevel}; read as ${extraInfection} levels.`,
    );
  if (extraInfection > rs.ruleset.extraInfection.maxLevels) {
    notes.add(
      `${TAB.points}: ${extraInfection} levels of extra infection is above the maximum ${rs.ruleset.extraInfection.maxLevels}.`,
    );
    extraInfection = Math.min(extraInfection, 10);
  }
  const typed = wholeNumber(notes, `${TAB.info} D2`, info.cell('D2'), 'infection');
  let infectionGained = 0;
  if (typed !== undefined) {
    infectionGained = typed - ancestry.baseInfection - extraInfection;
    if (infectionGained < 0) {
      notes.add(
        `${TAB.info} D2: infection ${typed} is below the ancestry's starting ${ancestry.baseInfection + extraInfection}; read as ${ancestry.baseInfection + extraInfection}.`,
      );
      infectionGained = 0;
    }
  }
  const ageValue = wholeNumber(notes, `${TAB.info} D4`, info.cell('D4'), 'age');
  const age = ageValue !== undefined && ageValue >= 0 && ageValue <= 100000 ? ageValue : undefined;

  // Profession
  let profession: SheetCharacter['profession'];
  const profRaw = text(info.cell('B5'));
  if (profRaw !== '') {
    const id = lookup(notes, labels.professions, `${TAB.info} B5`, profRaw, 'profession');
    const prof = id ? rs.professionsById[id] : undefined;
    if (prof) {
      const levels: Record<string, number> = {};
      const max = rs.professions.rules.maxLevel;
      for (const [slot, cell] of [
        ['skill-1', 'G30'],
        ['skill-2', 'G31'],
      ] as const) {
        const skill = prof.skills.find((s) => s.slot === slot);
        if (!skill) continue;
        const where = `${TAB.info} ${cell}`;
        let level = wholeNumber(notes, where, info.cell(cell), `${skill.name} level`);
        if (level === undefined || level < 1) continue;
        if (level > max) {
          notes.add(
            `${where}: ${skill.name} level ${level} is above the maximum ${max}; read as ${max}.`,
          );
          level = max;
        }
        levels[skill.id] = level;
      }
      profession = { id: prof.id, levels };
    }
  }

  const freeText = readFreeText(rs, info, notes);
  const character: SheetCharacter = {
    name,
    player,
    ...(email !== '' ? { email } : {}),
    ancestry: {
      id: ancestry.id,
      subtype: entry.subtype.id,
      abilityLevels,
      extraInfection,
      infectionGained,
      ...(age !== undefined ? { age } : {}),
    },
    ledger,
    skills: readSkills(rs, wb, notes),
    ...readKnowledges(rs, requireSheet(wb, TAB.knowledges), notes),
    ...(profession ? { profession } : {}),
    ...(familiar ? { familiar } : {}),
    ...freeText,
  };
  return { character, warnings: notes.list };
}
