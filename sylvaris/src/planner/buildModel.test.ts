import { describe, expect, it } from 'vitest';
import {
  BUILD_STORAGE_KEY,
  EMPTY_BUILD,
  addEvent,
  awakenArtifact,
  buildSummary,
  buyStep,
  changePoints,
  leaveCalling,
  loadBuild,
  removableSteps,
  removeArtifactPower,
  removeFamiliar,
  removeStep,
  saveBuild,
  setArtifactPower,
  setFamiliar,
  sheetOf,
  startBuild,
  startCalling,
  undo,
  unlockArtifactSlot,
  type Build,
  type Result,
  type StorageLike,
} from './buildModel.ts';

function ok(result: Result): Build {
  if (!result.ok) throw new Error(result.errors.join(' | '));
  return result.build;
}

function errors(result: Result): readonly string[] {
  if (result.ok) throw new Error('expected the rules to refuse this');
  return result.errors;
}

function human(): Build {
  return ok(startBuild('Test Wren', 'human', {}));
}

function withEvents(build: Build, n: number): Build {
  let b = build;
  for (let i = 0; i < n; i++) b = ok(addEvent(b));
  return b;
}

describe('test build planner', () => {
  it('starts with the starting XP and buys skills at the rulebook costs', () => {
    let b = human();
    expect(sheetOf(b).points.xp).toMatchObject({ earned: 150, spent: 0, available: 150 });
    b = ok(buyStep(b, 'toughness', { level: 3 }));
    b = ok(buyStep(b, 'toughness', { technique: 'expert' }));
    // hand-derived: 5 + 10 + 15 + 5 = 35 XP (Rulebook p.17)
    expect(sheetOf(b).points.xp.spent).toBe(35);
    // hand-derived: 10 base + 20 from the Expert Technique
    expect(sheetOf(b).stats.lifePoints.value).toBe(30);
  });

  it('adds and removes points, and events give the event awards', () => {
    let b = human();
    b = ok(changePoints(b, 'xp', 40));
    b = ok(changePoints(b, 'xp', -10));
    expect(sheetOf(b).points.xp.available).toBe(180);
    b = ok(addEvent(b));
    expect(sheetOf(b).points.xp.available).toBe(240);
    expect(sheetOf(b).points.cxp.earned).toBe(5);
    expect(sheetOf(b).points.axp.earned).toBe(1);
    expect(errors(changePoints(b, 'xp', 0))).toEqual(['Enter a whole number of points.']);
  });

  it('removes only the top level or the top Technique, and undo takes back one change', () => {
    let b = ok(buyStep(human(), 'aggression', { level: 3 }));
    b = ok(buyStep(b, 'aggression', { technique: 'expert' }));
    expect(removableSteps(b, 'aggression')).toEqual([{ technique: 'expert' }]);
    b = ok(removeStep(b, 'aggression', { technique: 'expert' }));
    expect(removableSteps(b, 'aggression')).toEqual([{ level: 3 }]);
    expect(sheetOf(b).points.xp.spent).toBe(30);
    b = undo(b);
    expect(sheetOf(b).points.xp.spent).toBe(35);
  });

  it('refuses what the rules refuse, in plain words', () => {
    const b = human();
    expect(errors(buyStep(b, 'assassinate', { level: 1 })).join(' ')).toMatch(/Master Technique/);
    expect(errors(buyStep(b, 'toughness', { technique: 'expert' })).length).toBeGreaterThan(0);
  });

  it('starts a Calling after five events, and its Techniques need a later event', () => {
    let b = human();
    expect(errors(startCalling(b, 'protector', {})).length).toBeGreaterThan(0);
    b = withEvents(b, 6);
    b = ok(startCalling(b, 'protector', {}));
    expect(sheetOf(b).calling?.name).toBe('The Protector');
    const skill = sheetOf(b).calling?.skillIds[0] ?? '';
    // hand-derived: 6 events x 5 CXP = 30, minus 10 to start = 20; levels 2 and 3 cost 25
    expect(errors(buyStep(b, skill, { level: 3 })).join(' ')).toMatch(/Not enough CXP/);
    b = ok(changePoints(b, 'cxp', 20));
    b = ok(buyStep(b, skill, { level: 3 }));
    expect(errors(buyStep(b, skill, { technique: 'expert' })).length).toBeGreaterThan(0);
    b = ok(addEvent(b));
    b = ok(buyStep(b, skill, { technique: 'expert' }));
    b = ok(leaveCalling(b));
    expect(sheetOf(b).calling).toBeNull();
  });

  it('sets and removes a familiar', () => {
    let b = ok(setFamiliar(human(), { name: 'Pip', quality: 'expert', tricks: [] }));
    expect(sheetOf(b).familiar).toMatchObject({ name: 'Pip', trickSlots: 2 });
    b = ok(removeFamiliar(b));
    expect(sheetOf(b).familiar).toBeNull();
  });

  it('awakens an Artifact at 500 XP earned, unlocks slots with AXP, and sets powers', () => {
    let b = human();
    expect(errors(awakenArtifact(b, 'Lantern')).length).toBeGreaterThan(0);
    b = withEvents(b, 6); // hand-derived: 150 + 6 x 60 = 510 XP earned, 6 AXP
    b = ok(changePoints(b, 'axp', 10));
    b = ok(awakenArtifact(b, 'Lantern'));
    b = ok(unlockArtifactSlot(b));
    b = ok(unlockArtifactSlot(b));
    expect(sheetOf(b).artifact).toMatchObject({ slotsUnlocked: 3 });
    b = ok(setArtifactPower(b, 'art-passive-weapon-damage', ''));
    const entry = sheetOf(b).artifact?.powers[0]?.entryId ?? '';
    expect(buildSummary(sheetOf(b))).toMatch(/Artifact: Lantern, 3 slots, powers: /);
    b = ok(removeArtifactPower(b, entry));
    expect(sheetOf(b).artifact?.powers).toEqual([]);
  });

  it('saves to and loads from browser storage, and ignores broken data', () => {
    const store = new Map<string, string>();
    const storage: StorageLike = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
    };
    const b = ok(buyStep(human(), 'toughness', { level: 2 }));
    saveBuild(storage, b);
    expect(sheetOf(loadBuild(storage)).points.xp.spent).toBe(15);
    store.set(BUILD_STORAGE_KEY, '{not json');
    expect(loadBuild(storage)).toBe(EMPTY_BUILD);
    saveBuild(storage, EMPTY_BUILD);
    expect(store.has(BUILD_STORAGE_KEY)).toBe(false);
    expect(loadBuild(null)).toBe(EMPTY_BUILD);
  });

  it('writes a plain summary', () => {
    const b = ok(buyStep(human(), 'toughness', { level: 2 }));
    const text = buildSummary(sheetOf(b));
    expect(text).toContain('Test Wren (Human), test build');
    expect(text).toContain('- Toughness 2');
  });
});
