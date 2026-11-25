// Reads a picked character file and decides what importing it would do (merge rule, ADR 0003).
import type { StoredCharacter } from '../../engine/model.ts';
import {
  decideCharacterImport,
  parseCharacterFile,
  readImportFile,
  type ImportDecision,
} from '../../io/index.ts';
import type { Repository } from '../../storage/repository.ts';

export type CharacterImportCheck =
  | { ok: true; incoming: StoredCharacter; decision: ImportDecision }
  | { ok: false; errors: string[] };

export async function checkCharacterImport(
  repository: Repository,
  file: Blob,
): Promise<CharacterImportCheck> {
  const text = await readImportFile(file);
  if (!text.ok) return text;
  const parsed = parseCharacterFile(text.value);
  if (!parsed.ok) return parsed;
  const incoming = parsed.value.character;
  let local: StoredCharacter | undefined;
  try {
    local = await repository.getCharacter(incoming.id);
  } catch {
    // The local copy is unreadable: treat the file as a fresh copy that replaces it.
    local = undefined;
  }
  return { ok: true, incoming, decision: decideCharacterImport(local, incoming) };
}
