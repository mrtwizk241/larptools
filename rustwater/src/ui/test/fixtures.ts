// Sample characters for UI tests, read from tests/fixtures as text (Vite `?raw`).
import type { StoredCharacter } from '../../engine/model.ts';
import { parseCharacterFile } from '../../io/index.ts';
import miraText from '../../../tests/fixtures/characters/sample-mira.rwchar.json?raw';
import tomText from '../../../tests/fixtures/characters/sample-tom.rwchar.json?raw';

export { miraText, tomText };

function load(text: string): StoredCharacter {
  const parsed = parseCharacterFile(text);
  if (!parsed.ok) throw new Error(`Bad fixture: ${parsed.errors.join(' ')}`);
  return parsed.value.character;
}

export const mira = (): StoredCharacter => load(miraText);
export const tom = (): StoredCharacter => load(tomText);

/** Mira with a second action, so a file holding only the first is older than this copy. */
export function miraWithNote(): StoredCharacter {
  const base = mira();
  const first = base.actions[0];
  if (!first) throw new Error('Bad fixture: no actions.');
  return {
    ...base,
    actions: [
      first,
      {
        id: 'note-action-2',
        seq: 2,
        at: '2026-10-10T10:00:00.000Z',
        actor: { role: 'staff' },
        type: 'profile.updated',
        payload: { notes: 'Owes the ferryman.' },
      },
    ],
  };
}

export function fileFrom(text: string, name: string): File {
  return new File([text], name, { type: 'application/json' });
}
