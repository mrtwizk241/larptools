// Test character for the print view: the Ash Merrow veteran after staff filled in every section
// the printed sheet shows (skills in four archetypes, spells, a knowledge, an ancestry level, a
// profession, a familiar, a boon, starting items, an owed reward, Shiny purchases, notes).
// tests/e2e/fixtures/sample-ash-print.rwchar.json holds the same character for Playwright, as
// printAshFileText() writes it; PrintPage.test.tsx fails when the two drift apart (rewrite the
// fixture with that text after changing the commands).
import type { Command } from '../../../../engine/index.ts';
import type { StoredCharacter } from '../../../../engine/model.ts';
import { buildCharacterFile, serializeFile } from '../../../../io/index.ts';
import { ASH_LATEST_EVENT, ashAfter, type RawStep } from '../../../test/veteran.ts';

const HARVEST = ASH_LATEST_EVENT;

export const PRINT_COMMANDS: readonly (Command | RawStep)[] = [
  { type: 'learnSkill', skillId: 'assault', part: 'basic', toLevel: 3, teacher: 'Jory' },
  { type: 'learnSkill', skillId: 'assault', part: 'adept', teacher: 'Jory' },
  { type: 'learnSkill', skillId: 'toughness-warrior', part: 'main', teacher: 'Jory' },
  { type: 'learnSkill', skillId: 'deflection', part: 'basic', toLevel: 2, teacher: 'Jory' },
  { type: 'learnSkill', skillId: 'armor', part: 'main', teacher: 'Jory' },
  { type: 'learnSkill', skillId: 'dash', part: 'basic', teacher: 'Moss' },
  { type: 'learnSkill', skillId: 'search', part: 'basic', toLevel: 2, teacher: 'Moss' },
  { type: 'learnSkill', skillId: 'life-magic', part: 'basic', toLevel: 2, teacher: 'Wren' },
  { type: 'memorize', kind: 'spell', refId: 'life-bolt' },
  { type: 'memorize', kind: 'spell', refId: 'health-spring' },
  // No command adds knowledges any more (they are story notes); this is an old-style entry.
  {
    raw: 'memorized.added',
    payload: { kind: 'knowledge', text: 'Old river trade routes', slot: 'none' },
  },
  { type: 'levelAncestryAbility', abilityId: 'make-it-work' },
  {
    type: 'setStartingItems',
    picks: [
      { optionId: 'basic-melee-weapon', detail: 'long' },
      { optionId: 'basic-armor' },
      { optionId: 'basic-shield' },
    ],
  },
  {
    type: 'startProfession',
    professionId: 'medic',
    eventKey: HARVEST,
    skills: ['medic-get-back-in-there', 'medic-stitch-em-up'],
  },
  { type: 'bondFamiliar', name: 'Pip', creature: 'raven' },
  { type: 'awakenFamiliar', awakenedSkillId: 'push' },
  { type: 'levelFamiliar', toLevel: 3 },
  { type: 'learnFamiliarSkill', skillId: 'fam-feint' },
  { type: 'addBoon', boonId: 'slap-in-the-face' },
  { type: 'addOwed', text: '1 Spell Blueprint (Life Bolt)', eventKey: HARVEST },
  { type: 'spendShinies', purchaseId: 'buy-cxp', qty: 2, eventKey: HARVEST },
  { type: 'spendShinies', purchaseId: 'buy-basic-resource', qty: 2, eventKey: HARVEST },
  { type: 'updateProfile', notes: 'Owes the ferryman a favor.' },
];

export function printAsh(): StoredCharacter {
  return ashAfter(PRINT_COMMANDS);
}

/** The e2e fixture text for printAsh(): a character file as the app exports it. */
export function printAshFileText(): string {
  return serializeFile(
    buildCharacterFile(printAsh(), {
      appVersion: '0.1.0',
      now: () => new Date('2026-09-19T21:30:00.000Z'),
    }),
  );
}
