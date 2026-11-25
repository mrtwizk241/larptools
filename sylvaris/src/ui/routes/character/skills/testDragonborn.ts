// Test helper: Ember Quill (invented), a new Fire Dragonborn with Breath Weapon, the element's
// Gift, and Toughness, built through the rules engine.
import { deriveSheet, loadRuleset, plan, type Command } from '../../../../engine/index.ts';
import type { StoredCharacter } from '../../../../engine/model.ts';

export const EMBER_ID = '5d1e7a2c-3b4f-4e6a-9c8d-1f2e3a4b5c6d';

export function emberDragonborn(element = 'fire'): StoredCharacter {
  const ruleset = loadRuleset();
  const at = '2026-10-03T17:45:00.000Z';
  const command: Command = {
    type: 'createCharacter',
    characterName: 'Ember Quill',
    playerName: 'Rae Tolliver',
    playerEmail: 'rae.tolliver@example.test',
    raceId: 'dragonborn',
    choices: { element, 'natural-weapon': 'bite' },
    concept: 'A scale-born courier.',
    startingSkills: [
      { skillId: 'breath-weapon', level: 3, techniques: ['expert'] },
      { skillId: 'elements-gift', level: 1 },
      { skillId: 'toughness', level: 2 },
    ],
  };
  let n = 0;
  const result = plan(ruleset, deriveSheet(ruleset, []), command, {
    actor: { role: 'staff', name: 'Check-in desk' },
    now: () => at,
    newId: () => `ember-${String(++n).padStart(4, '0')}`,
    nextSeq: 1,
  });
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' '));
  return {
    id: EMBER_ID,
    schemaVersion: 1,
    rulesetId: ruleset.id,
    createdAt: at,
    updatedAt: at,
    actions: [...result.actions],
  };
}
