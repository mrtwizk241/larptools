// Engine hooks: the derived sheet for a stored character, and running staff commands.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deriveSheet,
  plan,
  type Command,
  type Notice,
  type RuleError,
  type Ruleset,
  type Sheet,
} from '../../engine/index.ts';
import { CURRENT_SCHEMA_VERSION, type StoredCharacter } from '../../engine/model.ts';
import { PUBLIC_MODE } from '../../publicMode.ts';
import { isTestBuild } from '../../storage/remote.ts';
import { useToast } from '../components/index.ts';
import { publishCharacterSaved, subscribeCharacterSaved } from './characterEvents.ts';
import { useCharacter, useRepository, useSettings } from './hooks.ts';
import { rulesetFor, useRuleset } from './rulesetContext.ts';

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A UI-side error in the same shape as the engine's rule errors. */
function uiError(code: string, text: string): RuleError {
  return { code, message: text, ruleId: 'UI' };
}

export function unknownRulesetMessage(id: string): string {
  return `This character uses rules season ${id}, which this version of the app does not have.`;
}

export type SheetState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; character: StoredCharacter; sheet: Sheet; ruleset: Ruleset };

/**
 * The stored character and its derived Sheet. The sheet is memoized on the stored log, and
 * updates as soon as useCommand saves a change to the same character.
 */
export function useSheet(characterId: string): SheetState {
  const repository = useRepository();
  const loaded = useCharacter(characterId);
  const [saved, setSaved] = useState<StoredCharacter | undefined>(undefined);

  useEffect(
    () =>
      subscribeCharacterSaved(repository, (character) => {
        if (character.id === characterId) setSaved(character);
      }),
    [repository, characterId],
  );

  const character =
    saved?.id === characterId ? saved : loaded.status === 'ready' ? loaded.character : undefined;
  const ruleset = character ? rulesetFor(character.rulesetId) : undefined;
  const sheet = useMemo(
    () => (character && ruleset ? deriveSheet(ruleset, character.actions) : undefined),
    [character, ruleset],
  );

  if (character) {
    if (!ruleset || !sheet)
      return { status: 'error', message: unknownRulesetMessage(character.rulesetId) };
    return { status: 'ready', character, sheet, ruleset };
  }
  if (loaded.status === 'error') return { status: 'error', message: loaded.message };
  if (loaded.status === 'ready') return { status: 'missing' };
  return { status: 'loading' };
}

export interface CommandOptions {
  /** Toast text when the command succeeds, for example "Profile saved." */
  success?: string;
}

export type CommandOutcome =
  { ok: true; character: StoredCharacter; notices: Notice[] } | { ok: false; errors: RuleError[] };

export interface CommandApi {
  /** Plans the command, appends the actions, and saves. Errors are returned and kept in `errors`. */
  run: (command: Command, options?: CommandOptions) => Promise<CommandOutcome>;
  running: boolean;
  /** Errors from the last run, for inline display. */
  errors: RuleError[];
  /** Notices from the last successful run (also shown as toasts). */
  notices: Notice[];
  /** Clears `errors` and `notices`, for example when a dialog closes. */
  clear: () => void;
}

/**
 * Runs engine commands for one character: plan() with the current mode as the actor, append the
 * planned actions, save through the repository. A character id with nothing stored yet starts a
 * new character (for createCharacter).
 */
export function useCommand(characterId: string): CommandApi {
  const repository = useRepository();
  const { settings } = useSettings();
  const ruleset = useRuleset();
  const toast = useToast();
  const busy = useRef(false);
  const [running, setRunning] = useState(false);
  const [errors, setErrors] = useState<RuleError[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const role = settings?.mode ?? 'player';

  const run = useCallback(
    async (command: Command, options: CommandOptions = {}): Promise<CommandOutcome> => {
      const fail = (list: RuleError[]): CommandOutcome => {
        setErrors(list);
        setNotices([]);
        return { ok: false, errors: list };
      };
      if (busy.current) return { ok: false, errors: [uiError('BUSY', 'Still saving.')] };
      busy.current = true;
      setRunning(true);
      try {
        const stored = await repository.getCharacter(characterId);
        const rs = stored ? rulesetFor(stored.rulesetId) : ruleset;
        if (!rs)
          return fail([uiError('UNKNOWN_RULESET', unknownRulesetMessage(stored?.rulesetId ?? ''))]);
        const sheet = deriveSheet(rs, stored?.actions ?? []);
        const now = () => new Date().toISOString();
        // The owner's test build (ADR 0007): every command, checked again by the server.
        // On the public site a new character is a test build too (src/publicMode.ts).
        const testBuild = PUBLIC_MODE || (stored !== undefined && isTestBuild(characterId));
        const result = plan(
          rs,
          sheet,
          command,
          {
            actor: { role },
            now,
            newId: () => crypto.randomUUID(),
            nextSeq: sheet.lastSeq + 1,
          },
          { testBuild },
        );
        if (!result.ok) return fail(result.errors);

        // A player's own change (familiar, or a test build): the server checks and stores it.
        if ((role !== 'staff' || testBuild) && stored && repository.runCommand) {
          const saved = await repository.runCommand(characterId, command);
          publishCharacterSaved(repository, saved);
          setErrors([]);
          setNotices(result.notices);
          if (options.success) toast.show(options.success);
          return { ok: true, character: saved, notices: result.notices };
        }

        const at = now();
        const next: StoredCharacter = stored
          ? { ...stored, actions: [...stored.actions, ...result.actions] }
          : {
              id: characterId,
              schemaVersion: CURRENT_SCHEMA_VERSION,
              rulesetId: rs.id,
              createdAt: at,
              updatedAt: at,
              actions: result.actions,
            };
        const saved = await repository.saveCharacter(next);
        publishCharacterSaved(repository, saved);
        setErrors([]);
        setNotices(result.notices);
        if (options.success) toast.show(options.success);
        for (const notice of result.notices) toast.show(notice.message);
        return { ok: true, character: saved, notices: result.notices };
      } catch (error) {
        return fail([uiError('SAVE_FAILED', `The change could not be saved: ${message(error)}`)]);
      } finally {
        busy.current = false;
        setRunning(false);
      }
    },
    [repository, characterId, ruleset, role, toast],
  );

  const clear = useCallback(() => {
    setErrors([]);
    setNotices([]);
  }, []);

  return { run, running, errors, notices, clear };
}
