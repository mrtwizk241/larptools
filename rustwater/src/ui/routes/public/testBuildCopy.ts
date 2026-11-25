// Copy a test build on the public site: the same log (later entries point at earlier action ids,
// so ids stay), a new character id, and a rename to "<name> (copy)" recorded in the log. Pure;
// tested in testBuildCopy.test.ts.
import { deriveSheet, plan, type Ruleset, type RuleError } from '../../../engine/index.ts';
import type { StoredCharacter } from '../../../engine/model.ts';
import { UNNAMED_CHARACTER } from '../../data/summary.ts';

export const COPY_SUFFIX = ' (copy)';

/** Longest character name the engine accepts. */
const MAX_NAME = 200;

export type CopyResult =
  { ok: true; character: StoredCharacter; name: string } | { ok: false; errors: RuleError[] };

export function copyTestBuild(
  ruleset: Ruleset,
  source: StoredCharacter,
  newId: string,
  nowIso: string,
): CopyResult {
  const sheet = deriveSheet(ruleset, source.actions);
  const base = sheet.profile.characterName.trim() || UNNAMED_CHARACTER;
  const name = `${base.slice(0, MAX_NAME - COPY_SUFFIX.length)}${COPY_SUFFIX}`;
  const rename = plan(
    ruleset,
    sheet,
    { type: 'updateProfile', characterName: name, note: `Copied from ${base}.` },
    {
      actor: { role: 'player' },
      now: () => nowIso,
      newId: () => crypto.randomUUID(),
      nextSeq: sheet.lastSeq + 1,
    },
    { testBuild: true },
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
