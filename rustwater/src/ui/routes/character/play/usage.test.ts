import { describe, expect, it } from 'vitest';
import { event, grantCxp, rs, withCharacter, type Harness } from '../../../../engine/testkit.ts';
import {
  clampSpent,
  filterByArchetype,
  groupByPeriod,
  leftOf,
  pipLabel,
  resetPeriods,
  RESET_SCOPE,
  restoreFrom,
  restoreOne,
  restoreUse,
  spendOne,
  spendUse,
  upgradeBlocked,
  spentFromTracker,
  trackedUses,
  trackerFromSpent,
  type TrackedUse,
} from './usage.ts';

function learnBasic(h: Harness, skillId: string, toLevel: number) {
  h.run({ type: 'learnSkill', skillId, part: 'basic', toLevel, teacher: 'Old Jory' });
}

/** Sheltered human with skills of each period, a mastery, a profession, and a familiar. */
function fullCharacter(): Harness {
  const h = withCharacter({ subtypeId: 'human-sheltered' });
  grantCxp(h, 600);
  learnBasic(h, 'assault', 9);
  h.run({ type: 'learnSkill', skillId: 'assault', part: 'adept', toLevel: 2 });
  h.run({ type: 'learnSkill', skillId: 'assault', part: 'mastery', teacher: 'Master Hal' });
  learnBasic(h, 'scavenging', 2);
  for (const e of [
    event('2026-01-10', 'frost-moot'),
    event('2026-02-14', 'thaw-market'),
    event('2026-03-14', 'mud-season'),
  ])
    h.run({ type: 'checkIn', event: e, attendance: 'player' });
  h.run({ type: 'adjustPoints', currency: 'pxp', amount: 400, reason: 'test setup' });
  h.run({ type: 'adjustPoints', currency: 'fp', amount: 40, reason: 'test setup' });
  const buy = ['2026-04-11-a', '2026-05-16-b', '2026-06-13-c', '2026-07-18-d', '2026-08-15-e'];
  h.run({
    type: 'startProfession',
    professionId: 'medic',
    eventKey: buy[0] ?? '',
    skills: ['medic-get-back-in-there', 'medic-stitch-em-up'],
  });
  for (const key of buy.slice(1))
    h.run({ type: 'levelProfession', skillId: 'medic-stitch-em-up', eventKey: key });
  h.run({ type: 'bondFamiliar', name: 'Murk', creature: 'Mud toad' });
  h.run({ type: 'awakenFamiliar', awakenedSkillId: 'push' });
  h.run({ type: 'levelFamiliar' });
  h.run({ type: 'learnFamiliarSkill', skillId: 'fam-feint' });
  return h;
}

function byKey(items: readonly TrackedUse[]): Record<string, TrackedUse> {
  return Object.fromEntries(items.map((i) => [i.key, i]));
}

describe('trackedUses', () => {
  it('lists every use with a stable key, name, count, and period', () => {
    const items = trackedUses(fullCharacter().sheet(), rs);
    const map = byKey(items);
    expect(map['ancestry:human-resilience']).toMatchObject({ count: 1, period: 'encounter' });
    expect(map['ancestry:deep-pockets']).toMatchObject({
      name: 'Deep Pockets',
      count: 1,
      period: 'event',
    });
    expect(map['skill:assault:basic']).toMatchObject({
      name: 'Assault',
      count: 9,
      period: 'repop',
    });
    expect(map['skill:assault:adept']).toMatchObject({
      name: 'Assault Adept',
      count: 2,
      period: 'encounter',
    });
    expect(map['skill:assault:basic:extra:encounter']).toMatchObject({
      name: 'Assault extra',
      count: 1,
      period: 'encounter',
      note: 'Extra use from Assault Mastery.',
    });
    // Mastery itself is passive: not tracked.
    expect(map['skill:assault:mastery']).toBeUndefined();
    // Check-in skill: per event.
    expect(map['skill:scavenging:basic']).toMatchObject({ count: 2, period: 'event' });
    expect(map['profession:medic-stitch-em-up:basic']).toMatchObject({ count: 5, period: 'repop' });
    expect(map['profession:medic-stitch-em-up:adept']).toMatchObject({
      count: 2,
      period: 'repop',
      note: 'Upgrades a basic use: also spends one basic use.',
    });
    expect(map['profession:medic-stitch-em-up:advanced']).toMatchObject({ count: 1 });
    expect(map['profession:medic-get-back-in-there:basic']).toMatchObject({
      count: 1,
      period: 'encounter',
    });
    // No upgrades at level 1: no rows.
    expect(map['profession:medic-get-back-in-there:adept']).toBeUndefined();
    expect(map['familiar:awakened:push']).toMatchObject({
      name: 'Push',
      count: 1,
      period: 'repop',
    });
    expect(map['familiar:fam-feint']).toMatchObject({ count: 1, period: 'repop' });
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
  });

  it('a new character tracks only its ancestry abilities', () => {
    const items = trackedUses(withCharacter().sheet(), rs);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.key.startsWith('ancestry:') && i.count > 0)).toBe(true);
  });

  it('groups by period in display order, skipping empty groups', () => {
    const items = trackedUses(fullCharacter().sheet(), rs);
    expect(groupByPeriod(items).map((g) => g.period)).toEqual(['encounter', 'repop', 'event']);
    const only = items.filter((i) => i.period === 'repop');
    expect(groupByPeriod(only).map((g) => g.period)).toEqual(['repop']);
  });
});

const ITEMS: TrackedUse[] = [
  { key: 'a', name: 'Assault', count: 3, period: 'repop', note: null },
  { key: 'b', name: 'Bash', count: 2, period: 'encounter', note: null },
  { key: 'c', name: 'Deep Pockets', count: 1, period: 'event', note: null },
];
const [A, B, C] = ITEMS as [TrackedUse, TrackedUse, TrackedUse];

describe('spent counts', () => {
  it('spends and restores within 0..count', () => {
    let spent = spendOne({}, A);
    spent = spendOne(spent, A);
    expect(leftOf(spent, A)).toBe(1);
    spent = spendOne(spendOne(spent, A), A);
    expect(spent['a']).toBe(3);
    expect(restoreOne(restoreOne(restoreOne(restoreOne(spent, A), A), A), A)['a']).toBe(0);
  });

  it('clamps to a smaller count and drops unknown keys', () => {
    const spent = { a: 5, b: 1, gone: 2 };
    expect(clampSpent(spent, ITEMS)).toEqual({ a: 3, b: 1 });
    const same = { a: 1 };
    expect(clampSpent(same, ITEMS)).toBe(same);
    expect(leftOf(spendOne(spendOne(spendOne({}, B), B), B), B)).toBe(0);
  });

  it('a repop reset restores repop and encounter uses, not event ones; undo puts them back', () => {
    const spent = { a: 2, b: 2, c: 1 };
    const after = resetPeriods(spent, ITEMS, RESET_SCOPE.repop);
    expect(after).toEqual({ c: 1 });
    expect(resetPeriods(spent, ITEMS, RESET_SCOPE.encounter)).toEqual({ a: 2, c: 1 });
    expect(resetPeriods(spent, ITEMS, RESET_SCOPE.event)).toEqual({ a: 2, b: 2 });
    expect(restoreFrom({ ...after, b: 1 }, spent, ITEMS, RESET_SCOPE.repop)).toEqual(spent);
  });

  it('round trips through the tracker record, event uses under a prefix in perRepop', () => {
    const tracker = trackerFromSpent(
      'c1',
      { a: 2, b: 1, c: 1, gone: 3 },
      ITEMS,
      '2026-01-01T00:00:00.000Z',
    );
    expect(tracker).toEqual({
      characterId: 'c1',
      perEncounter: { b: 1 },
      perRepop: { a: 2, 'event:c': 1 },
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(spentFromTracker(tracker)).toEqual({ a: 2, b: 1, c: 1 });
    expect(spentFromTracker(undefined)).toEqual({});
    expect(leftOf(spentFromTracker(tracker), C)).toBe(0);
  });

  it('labels each pip with its number and state', () => {
    expect(pipLabel(A, 1, true)).toBe('Assault use 2 of 3, spent');
    expect(pipLabel(A, 0, false)).toBe('Assault use 1 of 3, available');
  });
});

describe('Adept and Advanced uses', () => {
  const items = trackedUses(fullCharacter().sheet(), rs);
  const map = byKey(items);
  const basic = map['skill:assault:basic'];
  const extra = map['skill:assault:basic:extra:encounter'];
  const adept = map['skill:assault:adept'];
  if (!basic || !extra || !adept) throw new Error('missing Assault uses');

  it('know the Basic use they upgrade and sit right under it', () => {
    expect(adept.upgradeOf).toBe('skill:assault:basic');
    expect(adept.note).toBe('Upgrades a basic use: also spends one basic use.');
    expect(map['profession:medic-stitch-em-up:adept']?.upgradeOf).toBe(
      'profession:medic-stitch-em-up:basic',
    );
    expect(basic.upgradeOf).toBeUndefined();
    const groups = groupByPeriod(items);
    const repop = groups.find((g) => g.period === 'repop')?.items.map((i) => i.key) ?? [];
    const at = repop.indexOf('skill:assault:basic');
    expect(repop[at + 1]).toBe('skill:assault:adept');
    // The per-encounter Adept use is not also listed in the encounter group.
    const encounter = groups.find((g) => g.period === 'encounter')?.items ?? [];
    expect(encounter.map((i) => i.key)).not.toContain('skill:assault:adept');
  });

  it('spending one also spends a Basic use; restoring gives both back', () => {
    const spent = spendUse({}, items, adept);
    expect(spent).toEqual({ 'skill:assault:adept': 1, 'skill:assault:basic': 1 });
    expect(restoreUse(spent, items, adept)).toEqual({
      'skill:assault:adept': 0,
      'skill:assault:basic': 0,
    });
    // A plain use spends only itself.
    expect(spendUse({}, items, basic)).toEqual({ 'skill:assault:basic': 1 });
  });

  it('uses an extra Basic use when the Basic uses are gone, and is blocked with none left', () => {
    const noBasic = { 'skill:assault:basic': basic.count };
    expect(upgradeBlocked(noBasic, items, adept)).toBe(false);
    expect(spendUse(noBasic, items, adept)).toEqual({
      ...noBasic,
      'skill:assault:adept': 1,
      'skill:assault:basic:extra:encounter': 1,
    });
    const none = { ...noBasic, 'skill:assault:basic:extra:encounter': extra.count };
    expect(upgradeBlocked(none, items, adept)).toBe(true);
    expect(spendUse(none, items, adept)).toBe(none);
  });

  it('filter chips keep skills of the chosen archetypes; none chosen keeps everything', () => {
    expect(filterByArchetype(items, [])).toHaveLength(items.length);
    const warrior = filterByArchetype(items, ['warrior']);
    expect(warrior.map((i) => i.key)).toContain('skill:assault:adept');
    expect(warrior.every((i) => i.archetype === 'warrior')).toBe(true);
    expect(filterByArchetype(items, ['magic'])).toEqual([]);
  });
});
