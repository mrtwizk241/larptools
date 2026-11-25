import { describe, expect, it } from 'vitest';
import { grant, learn, withCharacter } from '../testkit.ts';

describe('addJournal / tagJournal / removeJournal', () => {
  it('adds entries pending, tags, removes with a reason', () => {
    const h = withCharacter();
    learn(h, 'alchemy', 1);
    const [added] = h.run({
      type: 'addJournal',
      kind: 'recipe',
      refId: 'alchemy-jump-potion',
      source: 'teacher',
      teacher: 'Brewer Nell',
    });
    const id = added?.id ?? '';
    expect(h.sheet().journals.craftingJournal[0]).toMatchObject({
      entryId: id,
      name: 'Jump Potion',
      level: 'basic',
      group: 'alchemy',
      status: 'pending',
      teacher: 'Brewer Nell',
      usableNow: true,
    });
    h.run({ type: 'tagJournal', entryId: id });
    expect(h.sheet().journals.craftingJournal[0]?.status).toBe('tagged');
    expect(h.fail({ type: 'tagJournal', entryId: id })).toEqual(['ALREADY_TAGGED']);
    expect(h.fail({ type: 'removeJournal', entryId: id })).toEqual(['REASON_REQUIRED']);
    h.run({ type: 'removeJournal', entryId: id, reason: 'Journal stolen' });
    expect(h.sheet().journals.craftingJournal).toEqual([]);
    expect(h.fail({ type: 'tagJournal', entryId: id })).toEqual(['JOURNAL_NOT_FOUND']);
  });

  it('checks ids, duplicates, teachers, starting picks', () => {
    const h = withCharacter();
    expect(
      h.fail({ type: 'addJournal', kind: 'spell', refId: 'fire-tornado', source: 'other' }),
    ).toEqual(['UNKNOWN_JOURNAL_ENTRY']);
    expect(
      h.fail({ type: 'addJournal', kind: 'spell', refId: 'fire-dart', source: 'teacher' }),
    ).toEqual(['TEACHER_REQUIRED']);
    expect(
      h.fail({ type: 'addJournal', kind: 'spell', refId: 'fireball', source: 'starting' }),
    ).toEqual(['STARTING_NOT_BASIC']);
    const r = h.plan({ type: 'addJournal', kind: 'spell', refId: 'fire-dart', source: 'starting' });
    // Q-MAG-3: allowed without Fire Magic, shown as not castable yet.
    expect(r.ok && r.notices.map((n) => n.code)).toEqual(['NOT_USABLE_YET']);
    h.run({ type: 'addJournal', kind: 'spell', refId: 'fire-dart', source: 'starting' });
    expect(
      h.fail({ type: 'addJournal', kind: 'spell', refId: 'fire-dart', source: 'other' }),
    ).toEqual(['JOURNAL_DUPLICATE']);
    expect(h.sheet().journals.spellbook[0]?.reason).toBe('Needs Fire Magic.');
  });

  it('performance notes need the Performance Technique for their level (Q-SKL-9)', () => {
    const h = withCharacter();
    expect(
      h.fail({
        type: 'addJournal',
        kind: 'performance',
        refId: 'opening-act',
        source: 'teacher',
        teacher: 'Lark',
      }),
    ).toEqual(['PERFORMANCE_TECHNIQUE_REQUIRED']);
    // A starting pick is allowed with a notice (Q-ITEM-2).
    h.run({
      type: 'addJournal',
      kind: 'performance',
      refId: 'restful-lullaby',
      source: 'starting',
    });
    learn(h, 'performance', 3);
    h.run({
      type: 'addJournal',
      kind: 'performance',
      refId: 'opening-act',
      source: 'teacher',
      teacher: 'Lark',
    });
    expect(
      h.fail({
        type: 'addJournal',
        kind: 'performance',
        refId: 'performance-of-anger',
        source: 'teacher',
        teacher: 'Lark',
      }),
    ).toEqual(['PERFORMANCE_TECHNIQUE_REQUIRED']);
    learn(h, 'performance', 3, ['expert']);
    h.run({
      type: 'addJournal',
      kind: 'performance',
      refId: 'performance-of-anger',
      source: 'teacher',
      teacher: 'Lark',
    });
    expect(h.sheet().journals.performanceRecord.map((e) => e.usableNow)).toEqual([
      true,
      true,
      true,
    ]);
  });

  it('rituals need Ritualism and every required magic at Expert', () => {
    const h = withCharacter();
    grant(h, 'xp', 1000);
    h.run({ type: 'addJournal', kind: 'ritual', refId: 'unlearn', source: 'research' });
    expect(h.sheet().journals.rituals[0]?.reason).toBe('Needs Ritualism.');
    learn(h, 'death-magic', 6, ['expert', 'master']);
    learn(h, 'fire-magic', 6, ['expert', 'master']);
    learn(h, 'ritualism', 1);
    expect(h.sheet().journals.rituals[0]).toMatchObject({ usableNow: true, reason: null });
    h.run({ type: 'addJournal', kind: 'ritual', refId: 'race-change', source: 'research' });
    expect(h.sheet().journals.rituals[1]?.reason).toBe('Needs Ritualism (Expert Technique).');
    learn(h, 'ritualism', 3, ['expert']);
    expect(h.sheet().journals.rituals[1]?.reason).toBe('Needs Air Magic (Expert Technique).');
  });
});
