// Import a character from a downloaded .xlsx of the official Google Sheet (stretch goal S-1).
// Pure TS: no React or storage. The UI loads this module on demand (it carries the unzip
// library), reads the file's bytes, calls importSheet, shows the preview, and saves `stored`.
import type { Ruleset } from '../data/index.ts';
import { getActionDefinition } from '../engine/actions/registry.ts';
import { deriveSheet } from '../engine/derive/deriveSheet.ts';
import {
  actionLogErrors,
  CURRENT_SCHEMA_VERSION,
  StoredCharacterSchema,
  type Action,
  type StoredCharacter,
} from '../engine/model.ts';
import type { Sheet } from '../engine/sheet.ts';
import { extractCharacter, SheetImportError, TAB } from './extract.ts';
import { toActions } from './translate.ts';
import type { SheetCharacter } from './types.ts';
import { readWorkbook, XlsxError, type Workbook } from './workbook.ts';

export { readWorkbook, MAX_XLSX_BYTES, XlsxError } from './workbook.ts';
export type { CellValue, Workbook, Worksheet } from './workbook.ts';
export {
  extractCharacter,
  checkTabs,
  cellDate,
  REQUIRED_TABS,
  SheetImportError,
  TAB,
} from './extract.ts';
export type { Extracted, ExtractOptions } from './extract.ts';
export * from './translate.ts';
export type * from './types.ts';
export { normalizeLabel, SHEET_ONLY_SKILLS, sheetLabels, skillLabel } from './labels.ts';

/** What the preview dialog shows before the character is saved. */
export interface ImportPreview {
  readonly characterName: string;
  readonly playerName: string;
  readonly playerEmail: string;
  readonly ancestryName: string;
  readonly subtypeName: string;
  readonly cxpTotal: number;
  /** Skill rows read from the three skill tabs (each part, such as Adept Bash, is a row). */
  readonly skills: number;
  readonly spells: number;
  readonly recipes: number;
  /** Performances, rituals and free-text knowledges. */
  readonly otherKnowledges: number;
  /** For example "Medic (levels 1 and 2)"; null without a profession. */
  readonly profession: string | null;
  /** For example "Murk, level 8"; null without a familiar. */
  readonly familiar: string | null;
}

export interface SheetImport {
  readonly character: SheetCharacter;
  /** The new character, ready to save. */
  readonly stored: StoredCharacter;
  readonly sheet: Sheet;
  readonly preview: ImportPreview;
  /** Everything read with a guess, fixed, or left out, then the replay's own warnings. */
  readonly warnings: string[];
}

export interface ImportContext {
  /** Id of the new character (a uuid in the app). */
  readonly characterId: string;
  /** ISO timestamp for createdAt and updatedAt. */
  readonly now: string;
  /** A fresh unique action id. */
  newId(): string;
  /** Who the actions are recorded as (default: staff, "Google Sheet import"). */
  readonly actor?: Action['actor'];
}

function listText(levels: number[]): string {
  if (levels.length <= 1) return `level ${levels[0] ?? 0}`;
  return `levels ${levels.slice(0, -1).join(', ')} and ${levels[levels.length - 1]}`;
}

function previewOf(rs: Ruleset, c: SheetCharacter, sheet: Sheet): ImportPreview {
  const prof = c.profession ? rs.professionsById[c.profession.id] : undefined;
  const profLevels = prof
    ? prof.skills.map((s) => c.profession?.levels[s.id] ?? 0).filter((l) => l > 0)
    : [];
  return {
    characterName: sheet.profile.characterName,
    playerName: sheet.profile.playerName,
    playerEmail: sheet.profile.playerEmail ?? '',
    ancestryName: sheet.ancestry?.ancestryName ?? '',
    subtypeName: sheet.ancestry?.subtypeName ?? '',
    cxpTotal: sheet.points.cxp.total,
    skills: c.skills?.length ?? 0,
    spells: c.spells?.length ?? 0,
    recipes: c.recipes?.length ?? 0,
    otherKnowledges: c.otherKnowledges?.length ?? 0,
    profession: prof
      ? profLevels.length > 0
        ? `${prof.name} (${listText(profLevels)})`
        : prof.name
      : null,
    familiar: sheet.familiar ? `${sheet.familiar.name}, level ${sheet.familiar.level}` : null,
  };
}

/** Schema, log and per-type payload checks, as for a character file (src/io). */
function validated(stored: StoredCharacter): StoredCharacter {
  const parsed = StoredCharacterSchema.safeParse(stored);
  const problems: string[] = parsed.success ? [] : parsed.error.issues.map((i) => i.message);
  problems.push(...actionLogErrors(stored.actions));
  const actions = stored.actions.map((action) => {
    const result = getActionDefinition(action.type)?.payload.safeParse(action.payload);
    if (!result?.success) {
      problems.push(`${action.type} (seq ${action.seq}) has an invalid payload.`);
      return action;
    }
    return { ...action, payload: result.data };
  });
  if (problems.length > 0)
    throw new SheetImportError(
      `The import built an invalid character, so nothing was saved: ${problems.slice(0, 3).join(' ')}`,
    );
  return { ...stored, actions };
}

/**
 * Reads an .xlsx of the official sheet and builds the new character. Throws XlsxError or
 * SheetImportError (plain-English message) when the file cannot be imported at all.
 */
export function importSheet(bytes: Uint8Array, rs: Ruleset, ctx: ImportContext): SheetImport {
  const workbook = readWorkbook(bytes);
  const { character, warnings } = extractCharacter(workbook, rs, { today: ctx.now.slice(0, 10) });
  const translation = toActions(character, rs, {
    actor: ctx.actor ?? { role: 'staff', name: 'Google Sheet import' },
    newId: ctx.newId,
  });
  const stored = validated({
    id: ctx.characterId,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    rulesetId: rs.id,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    actions: translation.actions,
  });
  const sheet = deriveSheet(rs, stored.actions);
  return {
    character,
    stored,
    sheet,
    preview: previewOf(rs, character, sheet),
    warnings: [
      ...warnings,
      ...translation.warnings,
      ...totalsCheck(workbook, sheet),
      ...sheet.warnings.map((w) => w.message),
    ],
  };
}

/**
 * Ledger totals the sheet shows (cached values) against the imported ones. These are plain sums
 * of the ledgers, so a difference means rows the import could not read.
 */
function totalsCheck(workbook: Workbook, sheet: Sheet): string[] {
  const checks: [string, string, string, number][] = [
    ['CXP total', TAB.points, 'C4', sheet.points.cxp.total],
    ['Shinies balance', TAB.points, 'K4', sheet.points.shinies.balance],
    ['PXP total', TAB.info, 'J29', sheet.points.pxp.total],
  ];
  const out: string[] = [];
  for (const [label, tab, cell, imported] of checks) {
    const shown = workbook.sheet(tab)?.cell(cell);
    if (typeof shown === 'number' && Math.round(shown) !== imported)
      out.push(`The sheet shows ${label} ${shown} (${tab} ${cell}); the import has ${imported}.`);
  }
  return out;
}

/** True for the errors importSheet reports in plain English. */
export function isImportError(error: unknown): error is Error {
  return error instanceof XlsxError || error instanceof SheetImportError;
}
