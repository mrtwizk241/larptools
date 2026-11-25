import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset, summarize } from '../../engine/index.ts';
import { ash, ashAfter, ashText, ASH_LATEST_EVENT } from './veteran.ts';
import { lark, larkText, mira, miraText, tom, tomText } from './fixtures.ts';
import {
  buildAsh,
  buildLark,
  buildMira,
  buildTom,
  SAMPLE_FILES,
  sampleFileText,
} from './sampleCharacters.ts';

const rs = loadRuleset();

describe('sample character files', () => {
  it('match their engine builders (run `node scripts/make-fixtures.ts` after a change)', () => {
    const texts: Record<string, string> = {
      'tests/fixtures/characters/sample-mira.sychar.json': miraText,
      'tests/fixtures/characters/sample-tom.sychar.json': tomText,
      'tests/e2e/fixtures/sample-lark.sychar.json': larkText,
      'tests/e2e/fixtures/sample-ash-veteran.sychar.json': ashText,
    };
    expect(SAMPLE_FILES.map((s) => s.path).sort()).toEqual(Object.keys(texts).sort());
    // The files are Prettier-formatted, so compare the data, not the text.
    for (const sample of SAMPLE_FILES)
      expect(JSON.parse(sampleFileText(sample.build())), sample.path).toEqual(
        JSON.parse(texts[sample.path] ?? 'null'),
      );
  });

  it('replay without warnings, on the Sylvaris rules', () => {
    for (const character of [mira(), tom(), lark(), ash()]) {
      expect(character.rulesetId).toBe('sylvaris-1.3.1');
      expect(deriveSheet(rs, character.actions).warnings).toEqual([]);
    }
  });

  it('cover new characters and a veteran', () => {
    expect(summarize(deriveSheet(rs, buildMira().actions))).toEqual({
      characterName: 'Mira Voss',
      playerName: 'Sam Hollis',
      raceName: 'Elf',
      callingName: '',
      xpAvailable: 85,
      events: 0,
      retired: false,
    });
    expect(summarize(deriveSheet(rs, buildTom().actions))).toMatchObject({
      raceName: 'Dwarf',
      events: 1,
    });
    expect(deriveSheet(rs, buildLark().actions).journals.craftingJournal).toHaveLength(1);
    const veteran = deriveSheet(rs, buildAsh().actions);
    expect(summarize(veteran)).toMatchObject({
      characterName: 'Ash Merrow',
      raceName: 'Human',
      callingName: 'The Protector',
      events: 6,
    });
    // 150 + 6 x 60 earned; 6 x 5 CXP, 10 spent on the Calling; 1 AXP per event; MT from extras.
    expect(veteran.points.xp.earned).toBe(510);
    expect(veteran.points.cxp).toMatchObject({ earned: 30, spent: 10, available: 20 });
    expect(veteran.points.axp.available).toBe(6);
    expect(veteran.points.mt).toEqual({ earned: 200, spent: 50, balance: 150 });
    expect(veteran.events.at(-1)?.key).toBe(ASH_LATEST_EVENT);
    expect(veteran.spirit.current).toBe(veteran.spirit.max - 1);
    expect(veteran.journals.spellbook.map((e) => [e.refId, e.status])).toEqual([
      ['grant-life', 'tagged'],
      ['life-dart', 'pending'],
    ]);
    expect(veteran.requestDecisions.map((d) => d.status)).toEqual(['approved']);
    expect(veteran.owed.map((o) => o.delivered)).toEqual([false]);
  });

  it('ashAfter plans more staff commands on the veteran', () => {
    const after = ashAfter([
      { type: 'awardPoints', currency: 'mt', amount: 50, kind: 'volunteer' },
    ]);
    expect(deriveSheet(rs, after.actions).points.mt.balance).toBe(200);
    expect(() =>
      ashAfter([{ type: 'learnSkill', skillId: 'toughness', step: { technique: 'grandmaster' } }]),
    ).toThrow(/Toughness Grandmaster Technique/);
  });
});
