import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset } from '../../../engine/index.ts';
import { buildAsh, buildMira } from '../../test/sampleCharacters.ts';
import { COPY_SUFFIX, copyTestBuild, testBuildRow } from './testBuildCopy.ts';

describe('copyTestBuild', () => {
  const ruleset = loadRuleset();
  const AT = '2026-11-24T12:00:00.000Z';

  it('keeps the log, gives a new id, and renames to "(copy)" in the log', () => {
    const source = buildAsh();
    const length = source.actions.length;
    const result = copyTestBuild(ruleset, source, 'copy-1', AT, () => 'rename-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { character, name } = result;
    expect(character.id).toBe('copy-1');
    expect(character.createdAt).toBe(AT);
    expect(character.updatedAt).toBe(AT);
    expect(character.actions.slice(0, length)).toEqual(source.actions);
    expect(character.actions).toHaveLength(length + 1);
    const rename = character.actions.at(-1);
    expect(rename).toMatchObject({ id: 'rename-1', type: 'profile.updated', at: AT });
    const before = deriveSheet(ruleset, source.actions);
    const after = deriveSheet(ruleset, character.actions);
    expect(name).toBe(`${before.profile.characterName}${COPY_SUFFIX}`);
    expect(after.profile.characterName).toBe(name);
    expect(after.points).toEqual(before.points);
    expect(after.skills).toEqual(before.skills);
    // The source is not changed.
    expect(source.actions).toHaveLength(length);
  });

  it('keeps the copied name within the 200-character limit', () => {
    const long = 'A'.repeat(200);
    const first = copyTestBuild(ruleset, buildMira(), 'long-0', AT);
    if (!first.ok) throw new Error('rename failed');
    const renamed = copyTestBuild(
      ruleset,
      {
        ...first.character,
        actions: first.character.actions.map((a) =>
          a.type === 'profile.updated' ? { ...a, payload: { characterName: long } } : a,
        ),
      },
      'long-1',
      AT,
    );
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(renamed.name).toHaveLength(200);
    expect(renamed.name.endsWith(COPY_SUFFIX)).toBe(true);
  });
});

describe('testBuildRow', () => {
  it('shows the name, the XP earned in all, and the race', () => {
    const mira = buildMira();
    const sheet = deriveSheet(loadRuleset(), mira.actions);
    expect(testBuildRow(mira)).toEqual({
      id: mira.id,
      name: 'Mira Voss',
      xpTotal: sheet.points.xp.earned,
      raceName: sheet.race?.name,
    });
    expect(testBuildRow(mira).xpTotal).toBeGreaterThan(0);
  });

  it("reads a build from an unknown season with this build's season", () => {
    const row = testBuildRow({ ...buildMira(), rulesetId: 'no-such-season' });
    expect(row).toMatchObject({ name: 'Mira Voss', raceName: 'Elf' });
  });
});
