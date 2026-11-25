// Golden character 2: Ilyra Vael, an Elf fire caster with a spellbook, after 2 events.
// Every number is hand-derived (comments show the arithmetic).
import { describe, expect, it } from 'vitest';
import { attend, harness, learn } from '../testkit.ts';

function build() {
  const h = harness();
  h.run({
    type: 'createCharacter',
    characterName: 'Ilyra Vael',
    playerName: 'Sample Player',
    raceId: 'elf',
    choices: { 'bonus-language': 'draconic' },
    ageCategory: 3,
    startingSkills: [
      { skillId: 'fire-magic', level: 5, techniques: ['expert'] },
      { skillId: 'life-magic', level: 2 },
      { skillId: 'knowledge', level: 1 },
    ],
  });
  h.run({
    type: 'setStartingItems',
    picks: [
      { optionId: 'basic-spell', detail: 'fire-dart' },
      { optionId: 'basic-relic', detail: 'fire' },
      { optionId: 'basic-clothing' },
      { optionId: 'cure-wounds-potion' },
      { optionId: 'cure-wounds-potion' },
      { optionId: 'purifying-salve' },
      { optionId: 'basic-jewelry' },
      { optionId: 'coin-5-copper' },
      { optionId: 'coin-5-copper' },
      { optionId: 'coin-5-copper' },
    ],
  });
  h.run({ type: 'addJournal', kind: 'spell', refId: 'fire-dart', source: 'starting' });
  h.run({
    type: 'addJournal',
    kind: 'spell',
    refId: 'dragons-breath',
    source: 'teacher',
    teacher: 'Mage Orrin',
  });
  h.run({ type: 'addJournal', kind: 'spell', refId: 'fireball', source: 'scroll' });
  h.run({ type: 'addJournal', kind: 'spell', refId: 'cure-wounds', source: 'research' });
  return h;
}

describe('golden: Ilyra Vael (Elf caster)', () => {
  it('at creation', () => {
    const sheet = build().sheet();
    expect(sheet.warnings).toEqual([]);
    // hand-derived: Fire Magic 5 + 10 + 15 + 20 + 25 = 75, + Expert 5 = 80;
    //   Life Magic 5 + 10 = 15; Knowledge 5; spent 100 of 150, 50 left
    expect(sheet.points.xp).toMatchObject({ earned: 150, spent: 100, available: 50 });
    // hand-derived languages: literacy (Elven) 1 + Elf extra 1 + Knowledge level 1 reached 1 = 3
    expect(sheet.stats.languages.count).toBe(3);
    expect(sheet.stats.languages.known.map((l) => l.id)).toEqual(['elven', 'draconic']);
    expect(sheet.stats.languages.unnamed).toBe(1);
    expect(sheet.profile.ageCategory).toBe(3);
    expect(sheet.startingItems).toHaveLength(10);

    const book = sheet.journals.spellbook;
    expect(book.map((e) => [e.refId, e.status, e.usableNow])).toEqual([
      ['fire-dart', 'pending', true],
      ['dragons-breath', 'pending', true],
      // Master spell: needs the Fire Magic Master Technique (Q-MAG-3: allowed, not castable yet)
      ['fireball', 'pending', false],
      // Life Magic level 2 has no Expert Technique
      ['cure-wounds', 'pending', false],
    ]);
    expect(book[2]?.reason).toBe('Needs Fire Magic (Master Technique).');
  });

  it('after 2 events and more training', () => {
    const h = build();
    attend(h, 2);
    learn(h, 'fire-magic', 6, ['expert', 'master']);
    learn(h, 'life-magic', 3, ['expert']);
    const tag = h.sheet().journals.spellbook.find((e) => e.refId === 'dragons-breath');
    h.run({ type: 'tagJournal', entryId: tag?.entryId ?? '' });
    const sheet = h.sheet();
    expect(sheet.warnings).toEqual([]);
    // hand-derived: earned 150 + 2 x 60 = 270
    //   Fire Magic level 6 (30) + Master (10) = 40; Life Magic level 3 (15) + Expert (5) = 20
    //   spent 100 + 40 + 20 = 160; available 110
    expect(sheet.points.xp).toMatchObject({ earned: 270, spent: 160, available: 110 });
    expect(sheet.journals.spellbook.every((e) => e.usableNow)).toBe(true);
    expect(sheet.journals.spellbook.find((e) => e.refId === 'dragons-breath')?.status).toBe(
      'tagged',
    );
    const fire = sheet.skills.find((s) => s.skillId === 'fire-magic');
    expect(fire?.maxUses).toBe(6);
    expect(fire?.abilities.filter((a) => a.unlocked).map((a) => a.uses)).toEqual([1, 2, 3]);
    // Teachers: Basic at creation needs none; the Master Technique was taught.
    expect(fire?.teaching.map((t) => [t.step, t.atCreation, t.teacher])).toEqual([
      ['basic', true, null],
      ['expert', true, null],
      ['master', false, 'Old Jory'],
    ]);
  });
});
