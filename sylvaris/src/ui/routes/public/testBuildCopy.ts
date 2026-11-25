// Test build helpers for the public site: copying one, and the facts a Test Builds row shows.
// Pure; tested in testBuildCopy.test.ts.
import { deriveSheet, plan, type Ruleset, type RuleError } from '../../../engine/index.ts';
import type { StoredCharacter } from '../../../engine/model.ts';
import { rulesetFor } from '../../data/rulesetContext.ts';
import { UNNAMED_CHARACTER } from '../../data/summary.ts';
import { RULESET_ID } from '../../version.ts';

export const COPY_SUFFIX = ' (copy)';

/** Longest character name the engine accepts. */
const MAX_NAME = 200;

export type CopyResult =
  { ok: true; character: StoredCharacter; name: string } | { ok: false; errors: RuleError[] };

/**
 * The same log (later entries point at earlier action ids, so ids stay), a new character id, and
 * a rename to "<name> (copy)" recorded in the log as an `updateProfile`.
 */
export function copyTestBuild(
  ruleset: Ruleset,
  source: StoredCharacter,
  newId: string,
  nowIso: string,
  newActionId: () => string = () => crypto.randomUUID(),
): CopyResult {
  const sheet = deriveSheet(ruleset, source.actions);
  const base = sheet.profile.characterName.trim() || UNNAMED_CHARACTER;
  const name = `${base.slice(0, MAX_NAME - COPY_SUFFIX.length)}${COPY_SUFFIX}`;
  const rename = plan(
    ruleset,
    sheet,
    { type: 'updateProfile', characterName: name, note: `Copied from ${base}.` },
    {
      // The no-login app's one account has full edit powers (src/localMode.ts).
      actor: { role: 'staff' },
      now: () => nowIso,
      newId: newActionId,
      nextSeq: sheet.lastSeq + 1,
      playground: true,
    },
  );
  if (!rename.ok) return { ok: false, errors: rename.errors };
  return {
    ok: true,
    name,
    character: {
      ...structuredClone(source),
      id: newId,
      createdAt: nowIso,
      updatedAt: nowIso,
      actions: [...structuredClone(source.actions), ...rename.actions],
    },
  };
}

export interface TestBuildRow {
  id: string;
  name: string;
  /** XP earned in all (the starting XP plus every addition). */
  xpTotal: number;
  raceName: string;
}

/** Name, total XP, and race for a row on Test Builds. */
export function testBuildRow(
  stored: StoredCharacter,
  fallback: Ruleset | undefined = rulesetFor(RULESET_ID),
): TestBuildRow {
  const ruleset = rulesetFor(stored.rulesetId) ?? fallback;
  if (!ruleset) return { id: stored.id, name: UNNAMED_CHARACTER, xpTotal: 0, raceName: '' };
  const sheet = deriveSheet(ruleset, stored.actions);
  return {
    id: stored.id,
    name: sheet.profile.characterName.trim() || UNNAMED_CHARACTER,
    xpTotal: sheet.points.xp.earned,
    raceName: sheet.race?.name ?? '',
  };
}
