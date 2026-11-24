import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset } from '../engine/index.ts';
import { extractCharacter, SheetImportError } from './extract.ts';
import { importSheet } from './index.ts';
import { sheetLabels } from './labels.ts';
import { buildXlsx, sheetTabs, type TestCell } from './testWorkbook.ts';
import { readWorkbook } from './workbook.ts';

const rs = loadRuleset();
const PCI = 'PlayerCharacter Info';
const PTS = 'Points EarnedSpent';
const STD = 'Standard Skills';
const KSR = 'KnowledgesSpellsRecipes';
/** 2024-03-09 as a date serial number. */
const DAY1 = 45360;

type Cells = Record<string, TestCell>;

/** An invented Wasteland Human with 250 starting CXP, one event, and Bash 3. */
function sheet(over: Partial<Record<string, Cells>> = {}): Uint8Array {
  const base: Record<string, Cells> = {
    [PCI]: {
      B1: 'Invented Player Q',
      B2: 'player.q@example.org',
      B3: 'Quill Ashdown',
      B4: 'Wasteland Human',
      D2: 3,
      H15: 2,
      H16: 1,
    },
    [PTS]: {
      A6: 250,
      B6: 'Starting character',
      C6: DAY1,
      A7: 75,
      B7: 'Event 1',
      C7: DAY1,
      M6: 1,
      N6: 'Event 1',
      O6: DAY1,
    },
    [STD]: { A6: 'Bash', F6: 3 },
  };
  const merged: Record<string, Cells> = {};
  for (const tab of new Set([...Object.keys(base), ...Object.keys(over)]))
    merged[tab] = { ...(base[tab] ?? {}), ...(over[tab] ?? {}) };
  return buildXlsx(sheetTabs(merged));
}

function extract(bytes: Uint8Array) {
  return extractCharacter(readWorkbook(bytes), rs, { today: '2026-11-07' });
}

function importOf(bytes: Uint8Array) {
  let n = 0;
  return importSheet(bytes, rs, {
    characterId: 'unit-import',
    now: '2026-11-07T12:00:00.000Z',
    newId: () => `u-${++n}`,
  });
}

describe('extractCharacter', () => {
  it('reads a plain sheet without warnings', () => {
    const { character, warnings } = extract(sheet());
    expect(warnings).toEqual([]);
    expect(character.name).toBe('Quill Ashdown');
    expect(character.player).toBe('Invented Player Q');
    expect(character.email).toBe('player.q@example.org');
    expect(character.ancestry).toMatchObject({
      id: 'human',
      subtype: 'human-wastelander',
      abilityLevels: { 'human-resilience': 2, 'make-it-work': 1 },
      extraInfection: 0,
      infectionGained: 0,
    });
    expect(character.skills).toEqual([{ skill: 'bash', part: 'basic', level: 3 }]);
    expect(character.ledger).toEqual([
      { date: '2024-03-09', kind: 'start', reason: 'Starting character', cxp: 250 },
      { date: '2024-03-09', kind: 'event', reason: 'Event 1', event: 'E1', cxp: 75, fp: 1 },
    ]);
  });

  it('refuses a workbook without the sheet tabs', () => {
    const bytes = buildXlsx({ Sheet1: { A1: 'Hello' } });
    expect(() => extract(bytes)).toThrow(SheetImportError);
    expect(() => extract(bytes)).toThrow(/no "PlayerCharacter Info", .* tabs/);
  });

  it('refuses a sheet with no ancestry, or one the app does not know', () => {
    expect(() => extract(sheet({ [PCI]: { B4: null } }))).toThrow(/B4 \(the ancestry\) is blank/);
    expect(() => extract(sheet({ [PCI]: { B4: 'Moon Person' } }))).toThrow(
      /"Moon Person" is not an ancestry/,
    );
  });

  it('reads numbers stored as text', () => {
    const { character, warnings } = extract(
      sheet({ [STD]: { F6: '3' }, [PTS]: { A6: '250', M6: ' 1 ' } }),
    );
    expect(warnings).toEqual([]);
    expect(character.skills?.[0]?.level).toBe(3);
    expect(character.ledger[0]?.cxp).toBe(250);
  });

  it('warns about labels it fixed: case, a typo, and an old mastery name (Q-SKL-14)', () => {
    const { character, warnings } = extract(
      sheet({
        [STD]: {
          A6: 'bash',
          F6: 3,
          A7: 'Asault',
          F7: 2,
          A8: 'Disarm/Unlock Device',
          F8: 10,
          K6: 'Lockpicking Mastery',
          Q6: 1,
        },
      }),
    );
    expect(warnings).toEqual([
      'Standard Skills A6: "bash" was read as "Bash".',
      'Standard Skills A7: "Asault" was read as "Assault".',
      'Standard Skills K6: "Lockpicking Mastery" is an old or other name; read as "Disarm/Unlock Device Mastery".',
    ]);
    expect(character.skills).toContainEqual({
      skill: 'disarm-unlock-device',
      part: 'mastery',
      level: 1,
    });
  });

  it('warns about labels it cannot map and values out of range', () => {
    const { character, warnings } = extract(
      sheet({
        [STD]: { A7: 'Juggling', F7: 2, A8: 'Slay', F8: 12, A9: 'Taunt', F9: 'lots', A10: 'Dash' },
        [PCI]: { H16: 9 },
        [KSR]: { A11: 'Fire Ball of Doom', C11: 'Elemental', A12: 'Elemental Bolt' },
      }),
    );
    expect(warnings).toEqual(
      expect.arrayContaining([
        'Standard Skills A7: "Juggling" is not a skill on this tab the app knows; left out.',
        'Standard Skills A8: "Slay" level 12 is above the maximum 10; read as 10.',
        'Standard Skills A9: level "lots" is not a number; left out.',
        'Standard Skills A9: "Taunt" has no level; left out.',
        'Standard Skills A10: "Dash" has no level; left out.',
        "PlayerCharacter Info H16: Make It Work level 9 is above the sheet's 1 to 6 range.",
        'KnowledgesSpellsRecipes A11: "Fire Ball of Doom" is not a spell the app knows; left out.',
        'KnowledgesSpellsRecipes C12: "Elemental Bolt" has no slot; put in elemental.',
      ]),
    );
    expect(character.skills).toContainEqual({ skill: 'slay', part: 'basic', level: 10 });
    expect(character.spells).toEqual([{ spell: 'elemental-bolt', slot: 'elemental' }]);
  });

  it('clips long cell text quoted in warnings to 80 characters (S-16)', () => {
    const { warnings } = extract(sheet({ [STD]: { A7: 'J'.repeat(5000), F7: 2 } }));
    expect(warnings).toContain(
      `Standard Skills A7: "${'J'.repeat(80)}…" is not a skill on this tab the app knows; left out.`,
    );
  });

  it('dates undated ledger rows like the row above, and says so', () => {
    const { character, warnings } = extract(
      sheet({ [PTS]: { A8: 5, B8: 'NPC time, 5 hours', I6: 50, J6: 'NPC time, 5 hours' } }),
    );
    expect(warnings).toContain(
      'Points EarnedSpent: 2 ledger rows have no date; dated like the row above (or the first date).',
    );
    expect(character.ledger).toContainEqual({
      date: '2024-03-09',
      kind: 'npc',
      reason: 'NPC time, 5 hours',
      event: 'E1',
      cxp: 5,
      shinies: 50,
    });
  });

  it('warns when no row is the starting CXP', () => {
    const { warnings } = extract(sheet({ [PTS]: { A6: 200, B6: 'Opening balance' } }));
    expect(warnings).toContain(
      'Points EarnedSpent: no starting CXP row found; every CXP row counts as earned.',
    );
  });

  it('reads a familiar and the FP rows that paid for it', () => {
    const { character, warnings } = extract(
      sheet({
        [PCI]: { G18: 'Pebble', F19: 'Gather', H19: 3, F21: '1/repop Feint' },
        [PTS]: {
          M7: 9,
          N7: 'Volunteer FP',
          O7: DAY1,
          M8: -5,
          N8: 'Level up',
          O8: DAY1 + 30,
          M9: -3,
          N9: 'Familiar level 3',
          O9: DAY1 + 60,
        },
      }),
    );
    expect(warnings).toEqual([]);
    expect(character.familiar).toEqual({
      name: 'Pebble',
      level: 3,
      awakenedSkill: 'gather',
      slots: ['fam-feint'],
      extraSlots: 0,
    });
    expect(character.ledger.filter((r) => r.kind === 'familiar').map((r) => r.fp)).toEqual([
      -5, -3,
    ]);
  });

  it('warns when the FP ledger does not pay for the familiar level', () => {
    const bytes = sheet({ [PCI]: { G18: 'Pebble', F19: 'Gather', H19: 3 } });
    const { warnings } = extract(bytes);
    expect(warnings).toContain(
      'Points EarnedSpent: the FP ledger pays for familiar levels up to 1 only. The import charges 8 FP for levels 2 to 3, so FP available is 8 lower than on the sheet.',
    );
    const imported = importOf(bytes);
    expect(imported.sheet.familiar?.level).toBe(3);
    expect(imported.sheet.points.fp.available).toBe(1 - 8);
  });

  it('imports a familiar above level 1 with no awakened skill at level 1', () => {
    const { character, warnings } = extract(sheet({ [PCI]: { G18: 'Pebble', H19: 4 } }));
    expect(character.familiar?.level).toBe(1);
    expect(warnings).toContain(
      'PlayerCharacter Info: the familiar is level 4 but has no awakened skill the app knows; imported at level 1.',
    );
  });

  it('leaves out a dropdown label that is not a rulebook skill, with the reason', () => {
    const { character, warnings } = extract(
      sheet({ 'Crafting Skills': { A6: 'Quick Crafting', E6: 2, J6: 'Quick Crafting', P6: 1 } }),
    );
    expect(warnings).toEqual([
      'Crafting Skills J6: "Quick Crafting" is left out: the rulebook has one Quick Crafting skill, bought on the basic rows (D-34).',
    ]);
    expect(character.skills).toContainEqual({ skill: 'quick-crafting', part: 'basic', level: 2 });
  });

  it('lists ledger reasons it records as Other award', () => {
    const { character, warnings } = extract(
      sheet({ [PTS]: { I6: 40, J6: 'Birthday gift', K6: DAY1 + 3 } }),
    );
    expect(warnings).toEqual([
      'Points EarnedSpent: a reason the import does not recognise was recorded as "Other award": "Birthday gift".',
    ]);
    expect(character.ledger).toContainEqual({
      date: '2024-03-12',
      kind: 'other-award',
      reason: 'Birthday gift',
      shinies: 40,
    });
  });
});

describe('importSheet', () => {
  it('builds a valid character and a preview', () => {
    const imported = importOf(sheet());
    expect(imported.warnings).toEqual([]);
    expect(imported.stored).toMatchObject({
      id: 'unit-import',
      rulesetId: rs.id,
      createdAt: '2026-11-07T12:00:00.000Z',
    });
    expect(imported.stored.actions.map((a) => a.seq)).toEqual(
      imported.stored.actions.map((_, i) => i + 1),
    );
    expect(imported.preview).toEqual({
      characterName: 'Quill Ashdown',
      playerName: 'Invented Player Q',
      playerEmail: 'player.q@example.org',
      ancestryName: 'Human',
      subtypeName: 'Wastelander',
      cxpTotal: 325,
      skills: 1,
      spells: 0,
      recipes: 0,
      otherKnowledges: 0,
      profession: null,
      familiar: null,
    });
    const replay = deriveSheet(rs, imported.stored.actions);
    expect(replay.points.cxp.spent).toBe(imported.sheet.points.cxp.spent);
  });

  it('records profession levels the ledger cannot pace after the last row, with a warning', () => {
    const imported = importOf(
      sheet({ [PCI]: { B5: 'Medic', G30: 1, G31: 2 }, [PTS]: { E6: 60, F6: 'PXP', G6: DAY1 } }),
    );
    expect(imported.warnings).toContain(
      'The ledger does not show events and PXP for every profession level; 1 level of Get back in there! and 2 levels of Stitch em up were recorded after the last ledger row.',
    );
    expect(imported.sheet.profession?.levels).toEqual({
      'medic-get-back-in-there': 1,
      'medic-stitch-em-up': 2,
    });
    expect(imported.sheet.warnings).toEqual([]);
    expect(imported.preview.profession).toBe('Medic (levels 1 and 2)');
  });

  it("compares the ledger totals with the sheet's cached totals", () => {
    const sum = (value: number) => ({ formula: 'SUM($A$6:$A1000)', value });
    expect(importOf(sheet({ [PTS]: { C4: sum(325) } })).warnings).toEqual([]);
    expect(importOf(sheet({ [PTS]: { C4: sum(999) } })).warnings).toEqual([
      'The sheet shows CXP total 999 (Points EarnedSpent C4); the import has 325.',
    ]);
  });

  it('adds the replay warnings, such as a negative balance', () => {
    const imported = importOf(sheet({ [STD]: { A6: 'Bash', F6: 10, A7: 'Slay', F7: 10 } }));
    expect(imported.warnings.some((w) => /CXP available is -/.test(w))).toBe(true);
  });
});

describe('sheet labels', () => {
  it('has a label for every skill part a standard skill can be bought in', () => {
    const labels = sheetLabels(rs);
    expect(labels.skills.standard.basic.find('Assault')?.value).toEqual({
      skill: 'assault',
      part: 'basic',
    });
    expect(labels.skills.magic.archetype.find('Raw Magic Procifiency')?.value).toEqual({
      skill: 'raw-magic-proficiency',
      part: 'main',
    });
    expect(
      labels.skills.standard.archetype.find('Warrior Meditation Skill Refresh')?.value,
    ).toEqual({ skill: 'meditation-skill-refresh', part: 'main', archetype: 'warrior' });
    expect(labels.skills.crafting.archetype.find('Skill Refresh')?.value).toEqual({
      skill: 'meditation-skill-refresh',
      part: 'main',
      archetype: 'crafting',
    });
    expect(labels.recipes.find('Railraod Spike')?.how).toBe('exact');
    expect(labels.recipes.find('Railroad Spike')).toMatchObject({
      how: 'alias',
      label: 'Railraod Spike',
    });
  });
});
