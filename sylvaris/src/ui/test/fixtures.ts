// Sample characters for UI tests, read from tests/fixtures as text (Vite `?raw`). The files are
// invented Sylvaris characters written from sampleCharacters.ts through the rules engine.
import type { StoredCharacter } from '../../engine/model.ts';
import { parseCharacterFile } from '../../io/index.ts';
import miraText from '../../../tests/fixtures/characters/sample-mira.sychar.json?raw';
import tomText from '../../../tests/fixtures/characters/sample-tom.sychar.json?raw';
import larkText from '../../../tests/e2e/fixtures/sample-lark.sychar.json?raw';

export { larkText, miraText, tomText };

function load(text: string): StoredCharacter {
  const parsed = parseCharacterFile(text);
  if (!parsed.ok) throw new Error(`Bad fixture: ${parsed.errors.join(' ')}`);
  return parsed.value.character;
}

/** Mira Voss (player Sam Hollis): a new Elf fire caster, no events yet. */
export const mira = (): StoredCharacter => load(miraText);
/** Old Tom (player Priya Nair): a Dwarf with one event. */
export const tom = (): StoredCharacter => load(tomText);
/** Lark Fennimore (player Dee Okafor): a new Gnome tinker. */
export const lark = (): StoredCharacter => load(larkText);

/** Mira with one more action, so a file holding only Mira's log is older than this copy. */
export function miraWithNote(): StoredCharacter {
  const base = mira();
  return {
    ...base,
    actions: [
      ...base.actions,
      {
        id: 'note-action-2',
        seq: base.actions.length + 1,
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
