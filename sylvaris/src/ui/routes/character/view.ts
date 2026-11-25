import type { Ruleset, Sheet } from '../../../engine/index.ts';
import type { CharacterMeta, CharacterStatus } from '../../../api/contract.ts';
import type { StoredCharacter } from '../../../engine/model.ts';

/** What every character sub-screen gets from CharacterLayout. */
export interface CharacterView {
  id: string;
  character: StoredCharacter;
  sheet: Sheet;
  ruleset: Ruleset;
  /** Staff mode: edit controls are shown. Player mode: text only. */
  isStaff: boolean;
  /** With the server: active, or a new character waiting for staff (pending, rejected). */
  status?: CharacterStatus;
  /** With the server: owner account and review details. */
  meta?: CharacterMeta;
}
