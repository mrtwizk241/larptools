import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset } from '../../../engine/index.ts';
import { ash } from '../../test/veteran.ts';
import { copyTestBuild } from './testBuildCopy.ts';

describe('copyTestBuild', () => {
  const ruleset = loadRuleset();
  const AT = '2026-11-24T12:00:00.000Z';

  it('keeps the log, gives a new id, and renames to "(copy)" in the log', () => {
    const source = ash();
    const result = copyTestBuild(ruleset, source, 'copy-1', AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { character, name } = result;
    expect(character.id).toBe('copy-1');
    expect(character.createdAt).toBe(AT);
    expect(character.actions.slice(0, source.actions.length)).toEqual(source.actions);
    expect(character.actions).toHaveLength(source.actions.length + 1);
    const before = deriveSheet(ruleset, source.actions);
    const after = deriveSheet(ruleset, character.actions);
    expect(name).toBe(`${before.profile.characterName} (copy)`);
    expect(after.profile.characterName).toBe(name);
    expect(after.points).toEqual(before.points);
    // The source is not changed.
    expect(source.actions).toHaveLength(ash().actions.length);
  });
});
