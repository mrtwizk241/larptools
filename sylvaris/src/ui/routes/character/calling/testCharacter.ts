// Test helper: Ash Merrow before The Protector started (six events, 30 CXP, no Calling).
import type { StoredCharacter } from '../../../../engine/model.ts';
import { ash } from '../../../test/veteran.ts';

export function ashBeforeCalling(): StoredCharacter {
  const character = ash();
  const index = character.actions.findIndex((a) => a.type === 'calling.started');
  return { ...character, actions: character.actions.slice(0, index) };
}
