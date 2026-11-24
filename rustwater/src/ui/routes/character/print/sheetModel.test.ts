import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset, type SheetSkill } from '../../../../engine/index.ts';
import {
  costMark,
  damageRows,
  memoryLists,
  oneLine,
  printSkillGroups,
  skillRows,
} from './sheetModel.ts';
import { printAsh } from './testCharacter.ts';

const ruleset = loadRuleset();
const sheet = deriveSheet(ruleset, printAsh().actions);

function part(over: Partial<SheetSkill['parts'][number]>): SheetSkill['parts'][number] {
  return {
    part: 'basic',
    level: 1,
    maxLevel: 10,
    costKind: 'basic',
    currency: 'cxp',
    spent: 0,
    apEarned: 0,
    nextCost: null,
    frequency: 'per-repop',
    timing: null,
    uses: null,
    extraUses: [],
    teacher: null,
    ...over,
  };
}

describe('printed skill groups', () => {
  it('lists Ancestry first, then archetypes in order, with what is left to spend', () => {
    const groups = printSkillGroups(ruleset, sheet);
    expect(groups.map((g) => [g.title, g.left])).toEqual([
      ['Ancestry', '1 LXP left'],
      ['Warrior', '0 AP left'],
      ['Defender', '0 AP left'],
      ['Rogue', '1 AP left'],
      ['Utility', '3 AP left'],
      ['Magic', '3 AP left'],
    ]);
  });

  it('marks what each skill costs: CP for basic parts, AP for the rest, LXP for ancestry', () => {
    expect(costMark('cxp')).toBe('CP');
    expect(costMark('ap')).toBe('AP');
    expect(costMark('lxp')).toBe('LXP');
    const groups = printSkillGroups(ruleset, sheet);
    const marks = groups.flatMap((g) => g.skills.map((s) => `${s.name} (${s.mark ?? ''})`));
    expect(marks).toEqual([
      'Human Resilience 1 (LXP)',
      'Make It Work 2 (LXP)',
      'Assault 3 (CP)',
      'Toughness (Warrior) 1 (AP)',
      'Deflection 2 (CP)',
      'Armor 1 (AP)',
      'Dash 1 (CP)',
      'Search 2 (CP)',
      'Life Magic 2 (CP)',
    ]);
  });

  it('gives a box per use, with the Adept row under the basic one', () => {
    const warrior = printSkillGroups(ruleset, sheet).find((g) => g.id === 'warrior');
    const [assault, toughness] = warrior?.skills ?? [];
    expect(assault?.rows).toEqual([
      { key: 'basic-0', part: null, mark: null, count: 3, period: 'repop', note: null },
      { key: 'adept-0', part: 'Adept', mark: 'AP', count: 1, period: 'encounter', note: null },
    ]);
    // A passive skill has no boxes; the line says Passive.
    expect(toughness?.rows).toEqual([]);
    expect(toughness?.note).toBe('Passive');
    const ancestry = printSkillGroups(ruleset, sheet).find((g) => g.id === 'ancestry');
    expect(ancestry?.skills[1]?.rows).toEqual([
      { key: 'uses', part: null, mark: null, count: 2, period: 'repop', note: null },
    ]);
  });

  it('puts Advanced uses and extra periods on rows of their own', () => {
    const skill: SheetSkill = {
      skillId: 'assault',
      name: 'Assault',
      category: 'standard',
      type: 'basic',
      archetype: 'warrior',
      archetypeChosen: false,
      parts: [
        part({
          uses: { count: 4, per: 'repop' },
          extraUses: [{ count: 1, per: 'encounter', fromSkillId: 'x', fromPart: 'mastery' }],
        }),
        part({ part: 'adept', currency: 'ap', uses: { count: 2, per: 'encounter' } }),
        part({ part: 'advanced', currency: 'ap', uses: { count: 1, per: 'event' } }),
        part({ part: 'mastery', currency: 'ap', frequency: 'passive', maxLevel: 1 }),
      ],
    };
    expect(skillRows(ruleset, skill)).toEqual([
      { key: 'basic-0', part: null, mark: null, count: 4, period: 'repop', note: null },
      { key: 'basic-1', part: null, mark: null, count: 1, period: 'encounter', note: null },
      { key: 'adept-0', part: 'Adept', mark: 'AP', count: 2, period: 'encounter', note: null },
      { key: 'advanced-0', part: 'Advanced', mark: 'AP', count: 1, period: 'event', note: null },
      { key: 'mastery', part: 'Mastery', mark: 'AP', count: 0, period: null, note: 'Passive' },
    ]);
  });
});

describe('printed damage lines', () => {
  it('pads saved lines with blank lines to write in', () => {
    const line = {
      id: 'a',
      name: 'Old Faithful',
      attackId: 'long',
      type: 'Steel',
      total: 2,
      call: '2 Steel',
    };
    expect(damageRows([line])).toEqual([
      { key: 'a', name: 'Old Faithful', call: '2 Steel' },
      { key: 'blank-1', name: '', call: '' },
      { key: 'blank-2', name: '', call: '' },
    ]);
    // Nothing saved and no default: a blank damage area.
    expect(damageRows([])).toEqual([
      { key: 'blank-0', name: '', call: '' },
      { key: 'blank-1', name: '', call: '' },
      { key: 'blank-2', name: '', call: '' },
    ]);
    const many = Array.from({ length: 5 }, (_, i) => ({ ...line, id: `l${i}` }));
    expect(damageRows(many)).toHaveLength(5);
  });
});

describe('printed memory', () => {
  it('lists spells with their slots and leaves knowledges out', () => {
    expect(memoryLists(sheet)).toEqual([
      {
        kind: 'spell',
        title: 'Spells',
        slots: 'Life 2 of 2',
        names: ['Life Bolt (B)', 'Health Spring (B)'],
      },
    ]);
  });
});

describe('one line of rule text', () => {
  it('keeps the first sentence and cuts long ones', () => {
    expect(oneLine('Collect 2 resources.  You may take bits.')).toBe('Collect 2 resources.');
    expect(oneLine('a'.repeat(200), 20)).toBe(`${'a'.repeat(19)}…`);
  });
});
