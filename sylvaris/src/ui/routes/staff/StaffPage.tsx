// `#/staff/:tab`: staff tools. Approvals (new characters and learnings), Players (accounts, reset
// codes, which characters belong to whom), and links to events and uploads.
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { CalendarCheck, Check, KeyRound, Undo2, Upload, UserPlus } from 'lucide-react';
import { api, errorMessage } from '../../../api/client.ts';
import type { CharacterEntry, ResetCodeInfo, UserInfo } from '../../../api/contract.ts';
import { deriveSheet, summarize } from '../../../engine/index.ts';
import { loadCharacterEntries } from '../../../storage/remote.ts';
import { useAuth } from '../../auth/authContext.ts';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  Dialog,
  Field,
  Tabs,
  useToast,
} from '../../components/index.ts';
import { useAccounts } from '../../data/accounts.ts';
import { useRepository } from '../../data/hooks.ts';
import { pendingCount, useRequests } from '../../data/requests.ts';
import { rulesetFor } from '../../data/rulesetContext.ts';
import { dateText, dateTimeText } from '../../lib/names.ts';
import { Screen } from '../../Screen.tsx';
import { StaffRequests } from '../requests/StaffRequests.tsx';
import { OwnerSelect } from './OwnerSelect.tsx';
import styles from './staff.module.css';

const TABS = ['approvals', 'players'] as const;
type Tab = (typeof TABS)[number];

function isTab(value: string | undefined): value is Tab {
  return (TABS as readonly string[]).includes(value ?? '');
}

/** Name, race, and unspent XP of a character, from its log. */
function describe(entry: CharacterEntry) {
  const ruleset = rulesetFor(entry.character.rulesetId);
  if (!ruleset) return { name: entry.meta.id, race: '', xpLeft: null };
  const summary = summarize(deriveSheet(ruleset, entry.character.actions));
  return {
    name: summary.characterName || 'Unnamed character',
    race: summary.raceName,
    xpLeft: summary.xpAvailable,
  };
}

/** Server only; without a server (tests) there are no submissions or accounts to show. */
function useEntries(server: boolean) {
  const [state, setState] = useState<{ entries: CharacterEntry[] | null; problem: string | null }>({
    entries: null,
    problem: null,
  });
  const load = useCallback(async () => {
    if (!server) return { entries: [], problem: null };
    try {
      return { entries: await loadCharacterEntries(), problem: null };
    } catch (error) {
      return { entries: null, problem: errorMessage(error) };
    }
  }, [server]);
  useEffect(() => {
    let cancelled = false;
    void load().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);
  const reload = useCallback(async () => {
    setState(await load());
  }, [load]);
  return { ...state, reload };
}

export function StaffPage() {
  const { tab: param } = useParams();
  const navigate = useNavigate();
  const tab: Tab = isTab(param) ? param : 'approvals';
  const server = useRepository().server === true;
  const entries = useEntries(server);
  const requests = useRequests();
  const waiting = (entries.entries ?? []).filter((e) => e.meta.status === 'pending').length;
  const learnings = requests.status === 'ready' ? pendingCount(requests.groups) : 0;

  return (
    <Screen title={['Staff tools']}>
      <div className={styles.page}>
        <h1>Staff tools</h1>
        <div className={styles.quick}>
          <ButtonLink to="/" icon={<Upload />}>
            Characters and uploads
          </ButtonLink>
          <ButtonLink to="/events" icon={<CalendarCheck />}>
            Events and check-in
          </ButtonLink>
        </div>
        {entries.problem ? <Alert>{entries.problem}</Alert> : null}
        <Tabs
          label="Staff tools"
          selectedId={tab}
          onSelect={(id) => void navigate(`/staff/${id}`, { replace: true })}
          tabs={[
            {
              id: 'approvals',
              label: `Approvals${waiting + learnings > 0 ? ` (${waiting + learnings})` : ''}`,
              content:
                tab === 'approvals' ? (
                  <div className={styles.tabBody}>
                    <NewCharacters
                      entries={entries.entries}
                      onChange={async () => {
                        await entries.reload();
                      }}
                    />
                    <section aria-labelledby="learnings-heading" className={styles.section}>
                      <h2 id="learnings-heading">Learnings</h2>
                      {requests.status === 'loading' ? <p>Loading…</p> : null}
                      {requests.status === 'error' ? (
                        <p role="alert">Requests could not be read: {requests.message}</p>
                      ) : null}
                      {requests.status === 'ready' ? (
                        <StaffRequests groups={requests.groups} reload={requests.reload} />
                      ) : null}
                    </section>
                  </div>
                ) : null,
            },
            {
              id: 'players',
              label: 'Players',
              content:
                tab === 'players' ? (
                  <div className={styles.tabBody}>
                    <Players entries={entries.entries ?? []} onChange={entries.reload} />
                  </div>
                ) : null,
            },
          ]}
        />
      </div>
    </Screen>
  );
}

// ---------- new characters ----------

function NewCharacters({
  entries,
  onChange,
}: {
  entries: CharacterEntry[] | null;
  onChange: () => Promise<void>;
}) {
  const [deciding, setDeciding] = useState<{
    entry: CharacterEntry;
    kind: 'approve' | 'reject';
  } | null>(null);
  const pending = (entries ?? []).filter((e) => e.meta.status === 'pending');
  return (
    <section aria-labelledby="new-characters-heading" className={styles.section}>
      <h2 id="new-characters-heading">New characters</h2>
      <p>Characters players built with the new character rules. Open one to check the sheet.</p>
      {entries === null ? <p>Loading…</p> : null}
      {entries !== null && pending.length === 0 ? (
        <p className={styles.muted}>No new characters waiting.</p>
      ) : null}
      <ul className={styles.cards}>
        {pending.map((entry) => {
          const { name, race, xpLeft } = describe(entry);
          return (
            <li key={entry.meta.id}>
              <Card title={name} headingLevel={3}>
                <dl className={styles.facts}>
                  <div>
                    <dt>Player</dt>
                    <dd>
                      {entry.meta.ownerName ?? 'Unknown'}
                      {entry.meta.ownerEmail ? ` (${entry.meta.ownerEmail})` : ''}
                    </dd>
                  </div>
                  {race ? (
                    <div>
                      <dt>Race</dt>
                      <dd>{race}</dd>
                    </div>
                  ) : null}
                  {xpLeft !== null ? (
                    <div>
                      <dt>Starting XP left</dt>
                      <dd className="num">{xpLeft}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Sent</dt>
                    <dd>{entry.meta.submittedAt ? dateTimeText(entry.meta.submittedAt) : ''}</dd>
                  </div>
                </dl>
                <div className={styles.actions}>
                  <ButtonLink to={`/c/${entry.meta.id}`}>Open sheet</ButtonLink>
                  <Button
                    variant="primary"
                    icon={<Check />}
                    aria-label={`Approve ${name}`}
                    onClick={() => setDeciding({ entry, kind: 'approve' })}
                  >
                    Approve
                  </Button>
                  <Button
                    icon={<Undo2 />}
                    aria-label={`Send back ${name}`}
                    onClick={() => setDeciding({ entry, kind: 'reject' })}
                  >
                    Send back
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      {deciding ? (
        <ReviewDialog
          entry={deciding.entry}
          kind={deciding.kind}
          onClose={() => setDeciding(null)}
          onDone={async () => {
            setDeciding(null);
            await onChange();
          }}
        />
      ) : null}
    </section>
  );
}

function ReviewDialog({
  entry,
  kind,
  onClose,
  onDone,
}: {
  entry: CharacterEntry;
  kind: 'approve' | 'reject';
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const formId = useId();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { name } = describe(entry);
  const approve = kind === 'approve';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!approve && note.trim() === '') {
      setProblem('Tell the player what to change.');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      if (approve) await api.approveSubmission(entry.meta.id, note.trim() || undefined);
      else await api.rejectSubmission(entry.meta.id, note.trim());
      toast.show(approve ? `Approved ${name}.` : `Sent ${name} back to the player.`);
      await onDone();
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={approve ? `Approve ${name}?` : `Send ${name} back?`}
      actions={
        <>
          <Button variant="primary" type="submit" form={formId} aria-disabled={busy || undefined}>
            {approve ? 'Approve' : 'Send back'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={styles.form} onSubmit={(e) => void submit(e)}>
        <p>
          {approve
            ? 'The character becomes live and the player can use it. The log records who approved it.'
            : 'The player sees your note, can change the character, and send it again.'}
        </p>
        {problem ? <Alert>{problem}</Alert> : null}
        <Field
          label={approve ? 'Note (optional)' : 'What should the player change?'}
          required={!approve}
        >
          {(control) => (
            <textarea {...control} value={note} onChange={(e) => setNote(e.target.value)} />
          )}
        </Field>
      </form>
    </Dialog>
  );
}

// ---------- players ----------

function Players({
  entries,
  onChange,
}: {
  entries: CharacterEntry[];
  onChange: () => Promise<void>;
}) {
  const auth = useAuth();
  const accounts = useAccounts();
  const toast = useToast();
  const [code, setCode] = useState<(ResetCodeInfo & { name: string; email: string }) | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const active = entries.filter((e) => e.meta.status === 'active');
  const unassigned = active.filter((e) => e.meta.ownerId === null);
  const users = accounts.status === 'ready' ? accounts.users : [];
  const players = users.filter((u) => u.role === 'player');
  const q = query.trim().toLowerCase();
  const shown = players.filter(
    (u) => q === '' || u.name.toLowerCase().includes(q) || u.email.includes(q),
  );

  async function resetCode(user: UserInfo) {
    setProblem(null);
    try {
      const info = await api.resetCode(user.id);
      setCode({ ...info, name: user.name, email: user.email });
    } catch (error) {
      setProblem(errorMessage(error));
    }
  }

  return (
    <>
      {problem ? <Alert onDismiss={() => setProblem(null)}>{problem}</Alert> : null}
      {code ? <CodeNotice code={code} onDismiss={() => setCode(null)} /> : null}

      <section aria-labelledby="unassigned-heading" className={styles.section}>
        <h2 id="unassigned-heading">Characters with no player account</h2>
        {unassigned.length === 0 ? (
          <p className={styles.muted}>Every character belongs to an account.</p>
        ) : (
          <ul className={styles.cards}>
            {unassigned.map((entry) => (
              <li key={entry.meta.id}>
                <AssignRow
                  entry={entry}
                  users={users}
                  onAssigned={async (who) => {
                    await onChange();
                    toast.show(`${describe(entry).name} now belongs to ${who}.`);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="players-heading" className={styles.section}>
        <h2 id="players-heading">Player accounts</h2>
        {accounts.status === 'loading' ? <p>Loading…</p> : null}
        {accounts.status === 'error' ? <p role="alert">{accounts.message}</p> : null}
        <Field label="Search players">
          {(control) => (
            <input
              {...control}
              type="search"
              placeholder="Name or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
        </Field>
        <ul className={styles.cards}>
          {shown.map((user) => {
            const theirs = entries.filter((e) => e.meta.ownerId === user.id);
            return (
              <li key={user.id}>
                <Card title={user.name} headingLevel={3}>
                  <p className={styles.wrap}>{user.email}</p>
                  {user.disabled ? <Badge kind="rejected">Turned off</Badge> : null}
                  {theirs.length > 0 ? (
                    <ul className={styles.inline}>
                      {theirs.map((entry) => (
                        <li key={entry.meta.id}>
                          <Link to={`/c/${entry.meta.id}`}>{describe(entry).name}</Link>
                          {entry.meta.status !== 'active' ? (
                            <span className={styles.muted}>
                              {' '}
                              ({entry.meta.status === 'pending' ? 'waiting' : 'sent back'})
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.muted}>No characters yet.</p>
                  )}
                  <div className={styles.actions}>
                    <Button
                      icon={<KeyRound />}
                      aria-label={`Reset code for ${user.name}`}
                      onClick={() => void resetCode(user)}
                    >
                      Reset code
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
        <p className={styles.note}>
          {players.length} {players.length === 1 ? 'player account' : 'player accounts'}.
        </p>
      </section>

      <AddAccount
        canAddStaff={auth.user?.role === 'admin'}
        onAdded={async (info) => {
          setCode(info);
          await accounts.reload();
        }}
      />
    </>
  );
}

function AssignRow({
  entry,
  users,
  onAssigned,
}: {
  entry: CharacterEntry;
  users: UserInfo[];
  onAssigned: (who: string) => Promise<void>;
}) {
  const [owner, setOwner] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const { name, race } = describe(entry);
  async function assign() {
    if (owner === '') return;
    try {
      const saved = await api.setOwner(entry.meta.id, owner);
      await onAssigned(saved.meta.ownerName ?? 'that account');
    } catch (error) {
      setProblem(errorMessage(error));
    }
  }
  return (
    <Card title={name} headingLevel={3}>
      {race ? <p className={styles.muted}>{race}</p> : null}
      {problem ? <Alert>{problem}</Alert> : null}
      <OwnerSelect users={users} value={owner} onChange={setOwner} hint="Pick the player." />
      <div className={styles.actions}>
        <Button variant="primary" disabled={owner === ''} onClick={() => void assign()}>
          Assign
        </Button>
        <ButtonLink to={`/c/${entry.meta.id}`}>Open sheet</ButtonLink>
      </div>
    </Card>
  );
}

/** A one-time code to read out or send to the person. Shown once. */
export function CodeNotice({
  code,
  onDismiss,
}: {
  code: ResetCodeInfo & { name: string; email: string };
  onDismiss: () => void;
}) {
  return (
    <Alert kind="info" title={`One-time code for ${code.name}`} onDismiss={onDismiss}>
      <p className={styles.code}>{code.code}</p>
      <p>
        Give this to {code.name} ({code.email}). They open Sign in, choose “Forgot your password, or
        have a code from staff?”, and set a password. It works once, until{' '}
        {dateText(code.expiresAt)}. It is not shown again.
      </p>
    </Alert>
  );
}

export function AddAccount({
  canAddStaff,
  onAdded,
}: {
  canAddStaff: boolean;
  onAdded: (info: ResetCodeInfo & { name: string; email: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'player' | 'staff'>('player');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await api.addUser(name, email, role);
      setName('');
      setEmail('');
      await onAdded({
        code: result.code,
        expiresAt: result.expiresAt,
        name: result.user.name,
        email: result.user.email,
      });
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="add-account-heading" className={styles.section}>
      <h2 id="add-account-heading">Add an account</h2>
      <p>
        For someone who cannot sign up themselves. You get a one-time code to give them; they use it
        to set their own password.
      </p>
      <form className={styles.form} onSubmit={(e) => void submit(e)} noValidate>
        {problem ? <Alert>{problem}</Alert> : null}
        <Field label="Name" required>
          {(control) => (
            <input {...control} value={name} onChange={(e) => setName(e.target.value)} />
          )}
        </Field>
        <Field label="Email" required>
          {(control) => (
            <input
              {...control}
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        {canAddStaff ? (
          <Field label="Role">
            {(control) => (
              <select
                {...control}
                value={role}
                onChange={(e) => setRole(e.target.value === 'staff' ? 'staff' : 'player')}
              >
                <option value="player">Player</option>
                <option value="staff">Staff</option>
              </select>
            )}
          </Field>
        ) : null}
        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            icon={<UserPlus />}
            aria-disabled={busy || undefined}
          >
            Add account
          </Button>
        </div>
      </form>
    </section>
  );
}
