// Ash Merrow: an invented veteran with 4 check-ins (3 before the latest), PXP, FP, and owed
// check-in rewards. The same file is imported by the Playwright tests.
import { deriveSheet, loadRuleset, plan, type Command } from '../../engine/index.ts';
import type { ActionType, StoredCharacter } from '../../engine/model.ts';
import { parseCharacterFile } from '../../io/index.ts';
import ashText from '../../../tests/e2e/fixtures/sample-ash-veteran.rwchar.json?raw';

export { ashText };

/** The latest event Ash checked in to. */
export const ASH_LATEST_EVENT = '2026-09-19-harvest-moon';

export function ash(): StoredCharacter {
  const parsed = parseCharacterFile(ashText);
  if (!parsed.ok) throw new Error(`Bad fixture: ${parsed.errors.join(' ')}`);
  return parsed.value.character;
}

/**
 * An action written as-is, for entries no command writes any more (an old-style knowledge).
 * It gets the next `ash-extra-N` id and seq, like a planned action.
 */
export interface RawStep {
  readonly raw: ActionType;
  readonly payload: unknown;
}

/** Ash after staff commands, planned by the engine; throws when one is refused. */
export function ashAfter(commands: readonly (Command | RawStep)[]): StoredCharacter {
  const ruleset = loadRuleset();
  const character = ash();
  const actions = [...character.actions];
  let n = 0;
  for (const command of commands) {
    if ('raw' in command) {
      actions.push({
        id: `ash-extra-${++n}`,
        seq: actions.length + 1,
        at: '2026-09-19T21:00:00.000Z',
        actor: { role: 'staff' },
        type: command.raw,
        payload: command.payload,
      });
      continue;
    }
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
