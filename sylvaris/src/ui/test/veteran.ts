// Ash Merrow: an invented Human veteran with six check-ins, The Protector started at the sixth,
// Mist Tokens earned and spent, spells (one tagged), an approved learning request, an owed item,
// and a lost Spirit Fragment. The same file is imported by the Playwright tests. Built in
// sampleCharacters.ts.
import { deriveSheet, loadRuleset, plan, type Command } from '../../engine/index.ts';
import type { StoredCharacter } from '../../engine/model.ts';
import { parseCharacterFile } from '../../io/index.ts';
import ashText from '../../../tests/e2e/fixtures/sample-ash-veteran.sychar.json?raw';

export { ashText };
export { ASH_EVENTS, ASH_LATEST_EVENT } from './sampleCharacters.ts';

export function ash(): StoredCharacter {
  const parsed = parseCharacterFile(ashText);
  if (!parsed.ok) throw new Error(`Bad fixture: ${parsed.errors.join(' ')}`);
  return parsed.value.character;
}

/** Ash after staff commands, planned by the engine; throws when one is refused. */
export function ashAfter(commands: readonly Command[]): StoredCharacter {
  const ruleset = loadRuleset();
  const character = ash();
  const actions = [...character.actions];
  let n = 0;
  for (const command of commands) {
    const result = plan(ruleset, deriveSheet(ruleset, actions), command, {
      actor: { role: 'staff' },
      now: () => '2026-09-19T21:00:00.000Z',
      newId: () => `ash-extra-${++n}`,
      nextSeq: actions.length + 1,
    });
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' '));
    actions.push(...result.actions);
  }
  return { ...character, actions };
}
