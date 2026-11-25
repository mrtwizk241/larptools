// Invented Sylvaris sample characters, built through the rules engine (plan()). The fixture files
// in tests/fixtures/characters and tests/e2e/fixtures are written from these by
// `node scripts/make-fixtures.ts`; sampleCharacters.test.ts checks the files still match. Names
// and players are made up: no real people.
import { deriveSheet, loadRuleset, plan, type Command, type Sheet } from '../../engine/index.ts';
import type { GameEvent, StoredCharacter } from '../../engine/model.ts';
import { buildCharacterFile, serializeFile } from '../../io/index.ts';

/** One staff command at a time; a function gets the sheet so far (to name earlier actions). */
type Step = { at: string; command: Command | ((sheet: Sheet) => Command) };

/** Builds a character from staff commands with readable ids and fixed times. */
function build(
  options: { id: string; idPrefix: string; createdAt: string; actor: string },
  steps: readonly Step[],
): StoredCharacter {
  const ruleset = loadRuleset();
  const actions: StoredCharacter['actions'] = [];
  let n = 0;
  for (const step of steps) {
    const { at } = step;
    const sheet = deriveSheet(ruleset, actions);
    const command = typeof step.command === 'function' ? step.command(sheet) : step.command;
    const result = plan(ruleset, sheet, command, {
      actor: { role: 'staff', name: options.actor },
      now: () => at,
      newId: () => `${options.idPrefix}-${String(++n).padStart(4, '0')}`,
      nextSeq: sheet.lastSeq + 1,
    });
    if (!result.ok)
      throw new Error(
        `${options.id}: ${command.type} failed: ${result.errors.map((e) => e.message).join(' ')}`,
      );
    actions.push(...result.actions);
  }
  const last = actions.at(-1)?.at ?? options.createdAt;
  return {
    id: options.id,
    schemaVersion: 1,
    rulesetId: ruleset.id,
    createdAt: options.createdAt,
    updatedAt: last,
    actions,
  };
}

/** Mira Voss (player Sam Hollis): a new Elf fire caster with starting items and a spell. */
export function buildMira(): StoredCharacter {
  const at = '2026-10-03T17:45:00.000Z';
  return build(
    {
      id: '8f3c2a1e-5b7d-4c9a-9e21-3d4f6a7b8c90',
      idPrefix: 'mira',
      createdAt: at,
      actor: 'Check-in desk',
    },
    [
      {
        at,
        command: {
          type: 'createCharacter',
          characterName: 'Mira Voss',
          playerName: 'Sam Hollis',
          playerEmail: 'sam.hollis@example.test',
          raceId: 'elf',
          choices: { 'bonus-language': 'common' },
          concept: 'A hedge mage from the river towns.',
          startingSkills: [
            { skillId: 'fire-magic', level: 3, techniques: ['expert'] },
            { skillId: 'knowledge', level: 2 },
            { skillId: 'toughness', level: 2 },
          ],
        },
      },
      {
        at,
        command: {
          type: 'setStartingItems',
          picks: [
            { optionId: 'basic-spell', detail: 'fire-dart' },
            { optionId: 'basic-weapon', detail: 'Dagger' },
            { optionId: 'basic-clothing' },
            { optionId: 'cure-wounds-potion' },
          ],
        },
      },
      {
        at,
        command: { type: 'addJournal', kind: 'spell', refId: 'fire-dart', source: 'starting' },
      },
    ],
  );
}

/** Old Tom (player Priya Nair): a Dwarf with one event behind him. */
export function buildTom(): StoredCharacter {
  const at = '2026-09-19T17:30:00.000Z';
  const harvest: GameEvent = {
    key: '2026-09-19-harvest-moon',
    name: 'Harvest Moon',
    date: '2026-09-19',
  };
  return build(
    {
      id: '3a9d7c5e-2f1b-4e8d-b6a4-c0e9f8d7a6b5',
      idPrefix: 'tom',
      createdAt: at,
      actor: 'Check-in desk',
    },
    [
      {
        at,
        command: {
          type: 'createCharacter',
          characterName: 'Old Tom',
          playerName: 'Priya Nair',
          raceId: 'dwarf',
          ageCategory: 6,
          startingSkills: [
            { skillId: 'toughness', level: 3, techniques: ['expert'] },
            { skillId: 'wear-armor', level: 3, techniques: ['expert'] },
            { skillId: 'bash', level: 1 },
          ],
        },
      },
      {
        at: '2026-09-19T18:00:00.000Z',
        command: { type: 'checkIn', event: harvest, attendance: 'player' },
      },
    ],
  );
}

/** Lark Fennimore (player Dee Okafor): a new Gnome tinker with a starting recipe. */
export function buildLark(): StoredCharacter {
  const at = '2026-10-10T19:00:00.000Z';
  return build(
    {
      id: 'c4e8a2f6-5b1d-4c9e-a7f3-2d6b8e0c4a19',
      idPrefix: 'lark',
      createdAt: at,
      actor: 'Check-in desk',
    },
    [
      {
        at,
        command: {
          type: 'createCharacter',
          characterName: 'Lark Fennimore',
          playerName: 'Dee Okafor',
          raceId: 'gnome',
          literacy: 'common',
          startingSkills: [
            { skillId: 'tinkering', level: 3, techniques: ['expert'] },
            { skillId: 'harvesting', level: 2 },
            { skillId: 'research', level: 1 },
          ],
        },
      },
      {
        at,
        command: {
          type: 'setStartingItems',
          picks: [
            { optionId: 'basic-recipe', detail: 'tinkering-mica' },
            { optionId: 'basic-tools', detail: 'Tinkering' },
            { optionId: 'basic-lockpicks' },
            { optionId: 'coin-5-copper' },
          ],
        },
      },
      {
        at,
        command: {
          type: 'addJournal',
          kind: 'recipe',
          refId: 'tinkering-mica',
          source: 'starting',
        },
      },
    ],
  );
}

/** Ash Merrow's events, a month apart. The last one is ASH_LATEST_EVENT. */
export const ASH_EVENTS: readonly GameEvent[] = [
  { key: '2026-04-18-spring-thaw', name: 'Spring Thaw', date: '2026-04-18' },
  { key: '2026-05-16-blossom-court', name: 'Blossom Court', date: '2026-05-16' },
  { key: '2026-06-20-midsummer-fair', name: 'Midsummer Fair', date: '2026-06-20' },
  { key: '2026-07-18-river-games', name: 'River Games', date: '2026-07-18' },
  { key: '2026-08-15-ember-night', name: 'Ember Night', date: '2026-08-15' },
  { key: '2026-09-19-harvest-moon', name: 'Harvest Moon', date: '2026-09-19' },
];

/**
 * Ash Merrow (player Robin Vale): a Human veteran with six events, The Protector started at the
 * sixth, Mist Tokens earned and spent, a learned spell, an approved learning request, an owed
 * item, and a lost Spirit Fragment.
 */
export function buildAsh(): StoredCharacter {
  const [e1, e2, e3, e4, e5, e6] = ASH_EVENTS as [
    GameEvent,
    GameEvent,
    GameEvent,
    GameEvent,
    GameEvent,
    GameEvent,
  ];
  const checkIn = (event: GameEvent, extras: string[] = []) => ({
    at: `${event.date}T18:00:00.000Z`,
    command: {
      type: 'checkIn',
      event,
      attendance: 'player',
      extras,
      upkeep: 'paid',
    } as Command,
  });
  const late = (event: GameEvent, time: string) => `${event.date}T${time}:00.000Z`;
  return build(
    {
      id: '7d1e9a40-5b7d-4c9a-9e21-3d4f6a7b8c91',
      idPrefix: 'ash',
      createdAt: '2026-04-18T17:00:00.000Z',
      actor: 'Check-in desk',
    },
    [
      {
        at: '2026-04-18T17:00:00.000Z',
        command: {
          type: 'createCharacter',
          characterName: 'Ash Merrow',
          playerName: 'Robin Vale',
          playerEmail: 'robin.vale@example.test',
          raceId: 'human',
          ageCategory: 3,
          concept: 'A caravan guard who stayed.',
          startingSkills: [
            { skillId: 'toughness', level: 3, techniques: ['expert'] },
            { skillId: 'wear-armor', level: 3, techniques: ['expert'] },
            { skillId: 'deflection', level: 2 },
            { skillId: 'life-magic', level: 1 },
          ],
        },
      },
      {
        at: '2026-04-18T17:00:00.000Z',
        command: {
          type: 'setStartingItems',
          picks: [
            { optionId: 'basic-armor' },
            { optionId: 'basic-shield' },
            { optionId: 'basic-weapon', detail: 'Longsword' },
            { optionId: 'basic-spell', detail: 'grant-life' },
          ],
        },
      },
      {
        at: '2026-04-18T17:00:00.000Z',
        command: { type: 'addJournal', kind: 'spell', refId: 'grant-life', source: 'starting' },
      },
      checkIn(e1),
      checkIn(e2, ['sunday-cleanup']),
      {
        at: late(e2, '20:00'),
        command: {
          type: 'learnSkill',
          skillId: 'life-magic',
          step: { level: 3 },
          teacher: 'Sister Wren',
          eventKey: e2.key,
        },
      },
      checkIn(e3, ['friday-setup']),
      {
        at: late(e3, '21:00'),
        command: {
          type: 'addJournal',
          kind: 'spell',
          refId: 'life-dart',
          source: 'teacher',
          teacher: 'Sister Wren',
          eventKey: e3.key,
        },
      },
      checkIn(e4),
      {
        at: late(e4, '22:00'),
        command: { type: 'changeSpirit', delta: -1, reason: 'Died in the river fight.' },
      },
      checkIn(e5, ['marshal-medic']),
      {
        at: late(e5, '19:00'),
        command: { type: 'spendMt', purchaseId: 'basic-component', qty: 2, eventKey: e5.key },
      },
      {
        at: late(e5, '19:30'),
        command: {
          type: 'approveRequest',
          request: {
            id: 'ash-request-1',
            characterId: '7d1e9a40-5b7d-4c9a-9e21-3d4f6a7b8c91',
            createdAt: late(e5, '19:10'),
            kind: 'learn-skill',
            skillId: 'deflection',
            step: { level: 3 },
            teacher: 'Captain Dorn',
            note: 'Drilled with the guard all weekend.',
            status: 'sent',
          },
          eventKey: e5.key,
        },
      },
      {
        at: late(e5, '23:00'),
        command: { type: 'addOwed', text: 'Basic Shield repair kit', eventKey: e5.key },
      },
      checkIn(e6),
      {
        at: late(e6, '18:30'),
        command: {
          type: 'startCalling',
          callingId: 'protector',
          eventKey: e6.key,
          teacher: 'Calling book',
        },
      },
      {
        at: late(e6, '18:45'),
        command: (sheet) => ({
          type: 'tagJournal',
          entryId: sheet.journals.spellbook.find((e) => e.refId === 'grant-life')?.entryId ?? '',
        }),
      },
    ],
  );
}

/** The latest event Ash checked in to. */
export const ASH_LATEST_EVENT = '2026-09-19-harvest-moon';

/** Fixture files and the builders they are written from. Paths are relative to the project. */
export const SAMPLE_FILES: readonly { path: string; build: () => StoredCharacter }[] = [
  { path: 'tests/fixtures/characters/sample-mira.sychar.json', build: buildMira },
  { path: 'tests/fixtures/characters/sample-tom.sychar.json', build: buildTom },
  { path: 'tests/e2e/fixtures/sample-lark.sychar.json', build: buildLark },
  { path: 'tests/e2e/fixtures/sample-ash-veteran.sychar.json', build: buildAsh },
];

/** The character file text for a sample, exactly as written to disk. */
export function sampleFileText(character: StoredCharacter): string {
  return serializeFile(
    buildCharacterFile(character, {
      appVersion: '0.1.0',
      now: () => new Date(character.updatedAt),
    }),
  );
}
