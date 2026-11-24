// Test character for the memory screen: Lark Fennimore, Life Magic basic 2 and Engineering
// basic 1. The same file is imported by the e2e tests.
import type { StoredCharacter } from '../../../../engine/model.ts';
import { parseCharacterFile } from '../../../../io/index.ts';
import larkText from '../../../../../tests/e2e/fixtures/sample-lark.rwchar.json?raw';

export function lark(): StoredCharacter {
  const parsed = parseCharacterFile(larkText);
  if (!parsed.ok) throw new Error(`Bad fixture: ${parsed.errors.join(' ')}`);
  return parsed.value.character;
}
