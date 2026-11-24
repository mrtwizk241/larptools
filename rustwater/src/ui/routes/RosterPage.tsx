import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  CalendarCheck,
  ChevronRight,
  ClipboardCheck,
  Inbox,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { CharacterEntry } from '../../api/contract.ts';
import { characterMetaFor, loadCharacterEntries } from '../../storage/remote.ts';
import { deriveSheet } from '../../engine/index.ts';
import type { Action, StoredCharacter } from '../../engine/model.ts';
import type { ImportDecision } from '../../io/index.ts';
import {
  Badge,
  Button,
  ButtonLink,
  ConfirmDialog,
  Field,
  IconButton,
  useToast,
} from '../components/index.ts';
import { suggestedOwner, useAccounts } from '../data/accounts.ts';
import { useCharacters, useRepository, useSettings } from '../data/hooks.ts';
import { checkCharacterImport } from '../data/importCharacter.ts';
import { pendingCount, useRequests } from '../data/requests.ts';
import { rulesetFor, useRuleset } from '../data/rulesetContext.ts';
import { summarizeCharacter, type CharacterSummary } from '../data/summary.ts';
import { actionLookup, describeAction } from '../lib/describeAction.ts';
import { dateTimeText } from '../lib/names.ts';
import { Screen } from '../Screen.tsx';
import styles from './RosterPage.module.css';
import { isSpreadsheet, XLSX_MIME } from './sheetFile.ts';
import { useSheetImport } from './SheetImport.tsx';
import { OwnerSelect } from './staff/OwnerSelect.tsx';
import { rosterSections } from './testBuilds/testBuilds.ts';

const BASE = import.meta.env.BASE_URL;
const NO_CHARACTERS: StoredCharacter[] = [];

type Conflict = {
  incoming: StoredCharacter;
  name: string;
  decision: Extract<ImportDecision, { kind: 'conflict' }>;
};

/** A staff import that appends actions to a local character: shown before saving (audit S-01). */
type Additions = {
  incoming: StoredCharacter;
  name: string;
  decision: Extract<ImportDecision, { kind: 'replace' }>;
};

/** "3 entries", or "3 new entries". */
function entries(count: number, isNew = false): string {
  return `${count}${isNew ? ' new' : ''} ${count === 1 ? 'entry' : 'entries'}`;
}

type Row = { summary: CharacterSummary; character: StoredCharacter };

/** A new character from a file, waiting for staff to pick its player account. */
type Adding = { incoming: StoredCharacter; name: string };

/** Server only: every character this account can see, with owner and approval status. */
function useEntries(server: boolean, version: number): CharacterEntry[] {
  const [entries, setEntries] = useState<CharacterEntry[]>([]);
  useEffect(() => {
    if (!server) return;
    let cancelled = false;
    loadCharacterEntries()
      .then((list) => {
        if (!cancelled) setEntries(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [server, version]);
  return entries;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function matches(summary: CharacterSummary, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (q === '') return true;
  return (
    summary.characterName.toLocaleLowerCase().includes(q) ||
    summary.playerName.toLocaleLowerCase().includes(q)
  );
}

function ancestryText(ancestry: string, subtype: string): string {
  return subtype ? `${ancestry}, ${subtype}` : ancestry;
}

/** `#/`: the character list. */
export function RosterPage() {
  const repository = useRepository();
  const { settings } = useSettings();
  const characters = useCharacters();
  const ruleset = useRuleset();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [importErrors, setImportErrors] = useState<string[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [additions, setAdditions] = useState<Additions | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const [adding, setAdding] = useState<Adding | null>(null);
  const [owner, setOwner] = useState('');
  const requests = useRequests();
  const accounts = useAccounts();
  const sheetImport = useSheetImport({ onProblem: setImportErrors });
  const [version, setVersion] = useState(0);
  const server = repository.server === true;
  const serverEntries = useEntries(server, version);
  const waitingCharacters = serverEntries.filter((e) => e.meta.status === 'pending').length;
  const pending =
    (requests.status === 'ready' ? pendingCount(requests.groups) : 0) +
    (settings?.mode === 'staff' ? waitingCharacters : 0);

  const isStaff = settings?.mode === 'staff';
  const { reload: reloadCharacters } = characters;
  const { reload: reloadRequests } = requests;
  // Character imports and deletes can change which requests are shown or decided.
  const reload = async () => {
    await reloadCharacters();
    await reloadRequests();
    setVersion((v) => v + 1);
  };

  const list = characters.status === 'ready' ? characters.characters : NO_CHARACTERS;
  const rows = useMemo<Row[]>(
    () => list.map((character) => ({ character, summary: summarizeCharacter(character, ruleset) })),
    [list, ruleset],
  );
  const visible = rows.filter((row) => matches(row.summary, query));

  function clearMessages() {
    setImportErrors(null);
    setProblem(null);
  }

  async function saveImported(
    incoming: StoredCharacter,
    toastText: string,
    options: { replace?: boolean; ownerId?: string | null } = {},
  ) {
    try {
      await repository.saveCharacter(incoming, server ? options : {});
      await reload();
      toast.show(toastText);
    } catch (error) {
      setProblem(`The character could not be saved: ${message(error)}`);
    }
  }

  async function onFilePicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    clearMessages();
    if (isSpreadsheet(file)) {
      await sheetImport.open(file);
      return;
    }
    const check = await checkCharacterImport(repository, file);
    if (!check.ok) {
      setImportErrors(check.errors);
      return;
    }
    const { incoming, decision } = check;
    const name = summarizeCharacter(incoming, ruleset).characterName;
    switch (decision.kind) {
      case 'new':
        // With the server, staff choose the player account first.
        if (server && accounts.status === 'ready') {
          const users = accounts.users;
          const rs = rulesetFor(incoming.rulesetId);
          const email = rs ? deriveSheet(rs, incoming.actions).profile.playerEmail : undefined;
          setOwner(suggestedOwner(users, email));
          setAdding({ incoming, name });
        } else {
          await saveImported(incoming, `Imported ${name}.`);
        }
        break;
      case 'replace':
        // Staff see what the file adds before it reaches the source of truth (audit S-01).
        // Players keep the silent replace: a newer staff file replaces their copy (ADR 0003).
        if (isStaff && decision.fromPrefix) setAdditions({ incoming, name, decision });
        else await saveImported(incoming, `Updated ${name} with ${entries(decision.added, true)}.`);
        break;
      case 'same':
        toast.show(`${name} is already up to date.`);
        break;
      case 'conflict':
        setConflict({ incoming, name, decision });
        break;
    }
  }

  async function confirmDelete() {
    const row = pendingDelete;
    setPendingDelete(null);
    if (!row) return;
    clearMessages();
    const { character, summary } = row;
    try {
      // Snapshot everything the delete removes, so Undo can put it back.
      const tracker = await repository.getTracker(character.id).catch(() => undefined);
      // With the server, Undo puts back the character and its player account; its learning
      // requests are gone with it.
      const requests = server ? [] : (await repository.listRequests(character.id)).items;
      const ownerId = server ? (characterMetaFor(character.id)?.ownerId ?? null) : undefined;
      await repository.deleteCharacter(character.id);
      await reload();
      toast.show(`Deleted ${summary.characterName}.`, {
        onUndo: () => {
          void (async () => {
            try {
              await repository.saveCharacter(character, ownerId !== undefined ? { ownerId } : {});
              if (tracker) await repository.saveTracker(tracker);
              for (const request of requests) await repository.saveRequest(request);
              await reload();
              toast.show(`Restored ${summary.characterName}.`);
            } catch (error) {
              setProblem(`The character could not be restored: ${message(error)}`);
            }
          })();
        },
      });
    } catch (error) {
      setProblem(`The character could not be deleted: ${message(error)}`);
    }
  }

  const actions = isStaff ? (
    <div className={styles.actions}>
      <ButtonLink to="/new" variant="primary" icon={<Plus />}>
        New character
      </ButtonLink>
      <Button icon={<Upload />} onClick={() => fileInput.current?.click()}>
        Upload character sheet
      </Button>
    </div>
  ) : (
    <div className={styles.actions}>
      <ButtonLink to="/new" variant="primary" icon={<Plus />}>
        Create a new character
      </ButtonLink>
    </div>
  );
  const sections = rosterSections(serverEntries);
  const submissions = isStaff ? [] : sections.waiting;
  // Players on the server: Live characters and Test builds sections (ADR 0007).
  const sectioned = server && settings !== undefined && !isStaff;
  const testRows: Row[] = sections.test.map((entry) => ({
    character: entry.character,
    summary: summarizeCharacter(entry.character, ruleset),
  }));

  const loading = characters.status === 'loading' || settings === undefined;

  return (
    <Screen title="Characters">
      <div className={styles.page}>
        <h1>{isStaff || settings === undefined ? 'Characters' : 'My Characters'}</h1>

        {isStaff ? (
          <input
            ref={fileInput}
            type="file"
            accept={`.xlsx,.json,application/json,${XLSX_MIME}`}
            hidden
            onChange={(event) => void onFilePicked(event)}
          />
        ) : null}
        {isStaff ? (
          <p className={styles.note}>
            Upload takes an .xlsx downloaded from the Google Sheet (File, Download, Microsoft Excel)
            or a character file from this app.
          </p>
        ) : null}

        {importErrors ? (
          <div role="alert" className={styles.alert}>
            <div className={styles.alertText}>
              <p className={styles.alertTitle}>This file could not be imported.</p>
              <ul>
                {importErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
            <IconButton
              aria-label="Dismiss message"
              icon={<X />}
              onClick={() => setImportErrors(null)}
            />
          </div>
        ) : null}
        {problem ? (
          <div role="alert" className={styles.alert}>
            <p className={styles.alertText}>{problem}</p>
            <IconButton
              aria-label="Dismiss message"
              icon={<X />}
              onClick={() => setProblem(null)}
            />
          </div>
        ) : null}

        {characters.status === 'error' ? (
          <p role="alert">Characters could not be read: {characters.message}</p>
        ) : null}
        {characters.status === 'ready' && characters.invalid.length > 0 ? (
          <p className={styles.note}>
            {characters.invalid.length === 1
              ? '1 saved character could not be read and is not shown.'
              : `${characters.invalid.length} saved characters could not be read and are not shown.`}
          </p>
        ) : null}

        {loading ? <p>Loading characters…</p> : null}

        {submissions.length > 0 ? <Submissions entries={submissions} onChange={reload} /> : null}

        <LiveSection sectioned={sectioned}>
          {!loading && characters.status === 'ready' && rows.length === 0 ? (
            <div className={styles.empty}>
              <img
                className={styles.emptyLogo}
                src={`${BASE}brand/logo-256.webp`}
                width={128}
                height={128}
                alt=""
                decoding="async"
              />
              <p>
                {isStaff
                  ? 'No characters yet. Create one, or upload a character sheet.'
                  : 'No approved characters yet. Create one and send it to staff, or ask staff to link your existing character to this account.'}
              </p>
              {actions}
            </div>
          ) : null}

          {!loading && rows.length > 0 ? (
            <>
              <Field label="Search">
                {(control) => (
                  <input
                    {...control}
                    type="search"
                    placeholder="Character or player name"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                )}
              </Field>
              {visible.length > 0 ? (
                <ul className={styles.list}>
                  {visible.map((row) => (
                    <li key={row.summary.id} className={styles.row}>
                      <Link to={`/c/${row.summary.id}`} className={styles.rowLink}>
                        <span className={styles.rowMain}>
                          <span className={styles.name}>{row.summary.characterName}</span>
                          {row.summary.playerName ? (
                            <span className={styles.meta}>Player: {row.summary.playerName}</span>
                          ) : null}
                          {isStaff && server ? (
                            <span className={styles.meta}>
                              {ownerText(characterMetaFor(row.summary.id)?.ownerName)}
                            </span>
                          ) : null}
                          <span className={styles.meta}>
                            CXP <span className="num">{row.summary.cxpTotal}</span> total
                          </span>
                        </span>
                        <span className={styles.side}>
                          {row.summary.ancestryName ? (
                            <span className={styles.ancestry}>
                              {ancestryText(row.summary.ancestryName, row.summary.subtypeName)}
                            </span>
                          ) : null}
                          {row.summary.retired ? <Badge kind="player">Retired</Badge> : null}
                        </span>
                        <ChevronRight aria-hidden="true" className={styles.chevron} />
                      </Link>
                      {isStaff ? (
                        <IconButton
                          className={styles.delete}
                          aria-label={`Delete ${row.summary.characterName}`}
                          icon={<Trash2 />}
                          onClick={() => setPendingDelete(row)}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p role="status">No characters match “{query.trim()}”.</p>
              )}
              {actions}
            </>
          ) : null}
        </LiveSection>
        {sectioned && !loading ? <TestBuilds rows={testRows} /> : null}
        {!loading && (rows.length > 0 || isStaff) ? (
          <>
            <div className={styles.row}>
              <Link
                to={isStaff && server ? '/staff/approvals' : '/requests'}
                className={styles.rowLink}
              >
                {isStaff && server ? (
                  <ClipboardCheck aria-hidden="true" className={styles.rowIcon} />
                ) : (
                  <Inbox aria-hidden="true" className={styles.rowIcon} />
                )}
                <span className={styles.rowMain}>
                  <span className={styles.name}>
                    {isStaff ? (server ? 'Approvals' : 'Requests') : 'My learning requests'}
                  </span>
                </span>
                {pending > 0 ? <Badge kind="pending">{pending} pending</Badge> : null}
                <ChevronRight aria-hidden="true" className={styles.chevron} />
              </Link>
            </div>
            {isStaff ? (
              <div className={styles.row}>
                <Link to="/events" className={styles.rowLink}>
                  <CalendarCheck aria-hidden="true" className={styles.rowIcon} />
                  <span className={styles.rowMain}>
                    <span className={styles.name}>Events</span>
                  </span>
                  <ChevronRight aria-hidden="true" className={styles.chevron} />
                </Link>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete ${pendingDelete?.summary.characterName ?? ''}?`}
        confirmLabel="Delete"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      >
        <p>
          {server
            ? 'This removes the character, its log, and its learning requests for everyone. Back up first if unsure.'
            : 'This removes the character and its log from this device. Export it first if unsure.'}
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={conflict !== null}
        title={`Replace ${conflict?.name ?? ''}?`}
        confirmLabel="Replace"
        danger
        onCancel={() => setConflict(null)}
        onConfirm={() => {
          const current = conflict;
          setConflict(null);
          if (current)
            void saveImported(current.incoming, `Replaced ${current.name}.`, { replace: true });
        }}
      >
        {conflict ? <ConflictText conflict={conflict} /> : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={adding !== null}
        title={`Add ${adding?.name ?? ''}?`}
        confirmLabel="Add character"
        onCancel={() => setAdding(null)}
        onConfirm={() => {
          const current = adding;
          setAdding(null);
          if (current)
            void saveImported(current.incoming, `Imported ${current.name}.`, {
              ownerId: owner === '' ? null : owner,
            });
        }}
      >
        <p>This adds the character from the file.</p>
        {accounts.status === 'ready' ? (
          <OwnerSelect users={accounts.users} value={owner} onChange={setOwner} />
        ) : null}
      </ConfirmDialog>

      {sheetImport.dialog}

      <ConfirmDialog
        open={additions !== null}
        title={`Update ${additions?.name ?? ''}?`}
        confirmLabel="Import"
        onCancel={() => setAdditions(null)}
        onConfirm={() => {
          const current = additions;
          setAdditions(null);
          if (current)
            void saveImported(
              current.incoming,
              `Updated ${current.name} with ${entries(current.decision.added, true)}.`,
            );
        }}
      >
        {additions ? <AddedEntries additions={additions} /> : null}
      </ConfirmDialog>
    </Screen>
  );
}

function ownerText(name: string | null | undefined): string {
  return name ? `Account: ${name}` : 'Unassigned';
}

/** Players on the server: the live characters under their own heading. Otherwise no wrapper. */
function LiveSection({ sectioned, children }: { sectioned: boolean; children: ReactNode }) {
  if (!sectioned) return <>{children}</>;
  return (
    <section aria-labelledby="live-heading" className={styles.submissions}>
      <h2 id="live-heading">Live Characters</h2>
      {children}
    </section>
  );
}

/** A player's private test builds (ADR 0007), with New test build. */
function TestBuilds({ rows }: { rows: Row[] }) {
  return (
    <section aria-labelledby="test-builds-heading" className={styles.submissions}>
      <h2 id="test-builds-heading">Test Builds</h2>
      {rows.length > 0 ? (
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.summary.id} className={styles.row}>
              <Link to={`/c/${row.summary.id}`} className={styles.rowLink}>
                <span className={styles.rowMain}>
                  <span className={styles.name}>{row.summary.characterName}</span>
                  <span className={styles.meta}>
                    CXP <span className="num">{row.summary.cxpTotal}</span> total
                  </span>
                </span>
                <span className={styles.side}>
                  {row.summary.ancestryName ? (
                    <span className={styles.ancestry}>
                      {ancestryText(row.summary.ancestryName, row.summary.subtypeName)}
                    </span>
                  ) : null}
                  <Badge kind="player">Test build</Badge>
                </span>
                <ChevronRight aria-hidden="true" className={styles.chevron} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.note}>
          No test builds yet. A test build is a private copy for planning: try skills and points
          without changing your live characters.
        </p>
      )}
      <div className={styles.actions}>
        <ButtonLink to="/test-builds/new" icon={<Plus />}>
          New test build
        </ButtonLink>
      </div>
    </section>
  );
}

/** A player's new characters still with staff: waiting, or sent back with a note. */
function Submissions({
  entries,
  onChange,
}: {
  entries: CharacterEntry[];
  onChange: () => Promise<void>;
}) {
  const ruleset = useRuleset();
  const toast = useToast();
  const [withdrawing, setWithdrawing] = useState<CharacterEntry | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const nameOf = (entry: CharacterEntry) =>
    summarizeCharacter(entry.character, ruleset).characterName;
  async function withdraw() {
    const entry = withdrawing;
    setWithdrawing(null);
    if (!entry) return;
    try {
      const { api } = await import('../../api/client.ts');
      await api.withdrawSubmission(entry.character.id);
      await onChange();
      toast.show(`Deleted ${nameOf(entry)}.`);
    } catch (error) {
      setProblem(`It could not be deleted: ${message(error)}`);
    }
  }
  return (
    <section aria-labelledby="submissions-heading" className={styles.submissions}>
      <h2 id="submissions-heading">Waiting for staff</h2>
      {problem ? <p role="alert">{problem}</p> : null}
      <ul className={styles.list}>
        {entries.map((entry) => {
          const name = nameOf(entry);
          const sentBack = entry.meta.status === 'rejected';
          return (
            <li key={entry.character.id} className={styles.row}>
              <Link to={`/c/${entry.character.id}`} className={styles.rowLink}>
                <span className={styles.rowMain}>
                  <span className={styles.name}>{name}</span>
                  <span className={styles.meta}>
                    {sentBack
                      ? `Sent back: ${entry.meta.reviewNote ?? 'see the note on the sheet'}`
                      : `Sent ${entry.meta.submittedAt ? dateTimeText(entry.meta.submittedAt) : ''}`}
                  </span>
                </span>
                <Badge kind={sentBack ? 'rejected' : 'pending'}>
                  {sentBack ? 'Sent back' : 'Waiting'}
                </Badge>
                <ChevronRight aria-hidden="true" className={styles.chevron} />
              </Link>
              <IconButton
                className={styles.delete}
                aria-label={`Delete ${name}`}
                icon={<Trash2 />}
                onClick={() => setWithdrawing(entry)}
              />
            </li>
          );
        })}
      </ul>
      {entries.some((e) => e.meta.status === 'rejected') ? (
        <p className={styles.note}>
          Open a character staff sent back to change it and send it again.
        </p>
      ) : null}
      <ConfirmDialog
        open={withdrawing !== null}
        title={`Delete ${withdrawing ? nameOf(withdrawing) : ''}?`}
        confirmLabel="Delete"
        danger
        onCancel={() => setWithdrawing(null)}
        onConfirm={() => void withdraw()}
      >
        <p>Staff will not see it any more. This cannot be undone.</p>
      </ConfirmDialog>
    </section>
  );
}

function actorText(action: Action): string {
  const role =
    action.actor.role === 'staff' ? 'Staff' : action.actor.role === 'player' ? 'Player' : 'System';
  return action.actor.name ? `${role}: ${action.actor.name}` : role;
}

/** Every action the file appends, so staff see what a character file changes before saving. */
function AddedEntries({ additions }: { additions: Additions }) {
  const fallback = useRuleset();
  const { incoming, decision } = additions;
  const ruleset = rulesetFor(incoming.rulesetId) ?? fallback;
  const lookup = actionLookup(incoming.actions);
  return (
    <>
      <p>This file adds {entries(decision.added)}:</p>
      <ol className={styles.added}>
        {decision.addedActions.map((action) => {
          const described = describeAction(ruleset, action, lookup);
          return (
            <li key={action.id}>
              <span className={styles.addedLabel}>{described.label}</span> {described.summary}
              <span className={styles.meta}>
                {dateTimeText(action.at)} · {actorText(action)}
              </span>
              {action.note ? <span className={styles.meta}>Note: {action.note}</span> : null}
            </li>
          );
        })}
      </ol>
      <p>Upload only if you expected these changes.</p>
    </>
  );
}

function ConflictText({ conflict }: { conflict: Conflict }) {
  const { name, decision } = conflict;
  if (decision.reason === 'local-newer') {
    return (
      <p>
        This device has a newer copy of {name} ({decision.localCount} entries) than the file (
        {decision.incomingCount} entries). Replacing it loses the newer entries on this device.
      </p>
    );
  }
  return (
    <p>
      The copy of {name} on this device and the one in the file have different histories (this
      device: {decision.localCount} entries, file: {decision.incomingCount}, the first{' '}
      {decision.sharedCount} match). Replacing it loses the entries made only on this device.
    </p>
  );
}
