// `#/admin`: the super admin's page. Every account (make staff or player, turn off, reset code,
// delete), add accounts including staff, and the account activity log.
import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Power, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { api, errorMessage } from '../../../api/client.ts';
import type { AuditEntry, ResetCodeInfo, UserInfo } from '../../../api/contract.ts';
import { ROLE_LABEL, useAuth } from '../../auth/authContext.ts';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Field,
  useToast,
} from '../../components/index.ts';
import { useAccounts } from '../../data/accounts.ts';
import { dateTimeText } from '../../lib/names.ts';
import { Screen } from '../../Screen.tsx';
import { AddAccount, CodeNotice } from '../staff/StaffPage.tsx';
import styles from '../staff/staff.module.css';

const ACTION_TEXT: Record<string, string> = {
  'account.created': 'Signed up',
  'account.added': 'Added an account',
  'account.changed': 'Changed an account',
  'account.deleted': 'Deleted an account',
  'admin.created': 'Super admin set up',
  'password.reset': 'Password reset',
  'password.changed': 'Changed own password',
  'reset.code': 'Made a reset code',
  'signed.in': 'Signed in',
  'character.added': 'Added a character',
  'character.replaced': 'Replaced a character',
  'character.deleted': 'Deleted a character',
  'character.assigned': 'Changed a character’s player',
  'character.submitted': 'Sent a new character',
  'character.resubmitted': 'Sent a character again',
  'character.withdrawn': 'Withdrew a new character',
  'character.approved': 'Approved a new character',
  'character.sent.back': 'Sent a character back',
};

export function AdminPage() {
  const auth = useAuth();
  const accounts = useAccounts();
  const toast = useToast();
  const [problem, setProblem] = useState<string | null>(null);
  const [code, setCode] = useState<(ResetCodeInfo & { name: string; email: string }) | null>(null);
  const [deleting, setDeleting] = useState<UserInfo | null>(null);
  const [query, setQuery] = useState('');
  const log = useAudit();
  const users = accounts.status === 'ready' ? accounts.users : [];
  const q = query.trim().toLowerCase();
  const shown = users.filter(
    (u) => q === '' || u.name.toLowerCase().includes(q) || u.email.includes(q),
  );

  async function run(work: () => Promise<unknown>, done: string) {
    setProblem(null);
    try {
      await work();
      await accounts.reload();
      await log.reload();
      toast.show(done);
    } catch (error) {
      setProblem(errorMessage(error));
    }
  }

  async function resetCode(user: UserInfo) {
    setProblem(null);
    try {
      const info = await api.resetCode(user.id);
      setCode({ ...info, name: user.name, email: user.email });
      await log.reload();
    } catch (error) {
      setProblem(errorMessage(error));
    }
  }

  return (
    <Screen title="Admin">
      <div className={styles.page}>
        <h1>Admin</h1>
        <p>
          Only you see this page. Staff accounts can approve characters, edit any sheet, and manage
          players. Your own password is changed in Settings or with the admin command on the server.
        </p>
        {problem ? <Alert onDismiss={() => setProblem(null)}>{problem}</Alert> : null}
        {code ? <CodeNotice code={code} onDismiss={() => setCode(null)} /> : null}

        <section aria-labelledby="accounts-heading" className={styles.section}>
          <h2 id="accounts-heading">Accounts</h2>
          {accounts.status === 'loading' ? <p>Loading…</p> : null}
          {accounts.status === 'error' ? <p role="alert">{accounts.message}</p> : null}
          <Field label="Search accounts">
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
              const me = user.id === auth.user?.id;
              const locked = user.role === 'admin';
              return (
                <li key={user.id}>
                  <Card title={user.name} headingLevel={3}>
                    <p className={styles.wrap}>{user.email}</p>
                    <p className={styles.actions}>
                      <Badge kind={user.role === 'player' ? 'player' : 'staff'}>
                        {ROLE_LABEL[user.role]}
                      </Badge>
                      {user.disabled ? <Badge kind="rejected">Turned off</Badge> : null}
                      {me ? <span className={styles.muted}>This is you.</span> : null}
                    </p>
                    {locked ? null : (
                      <div className={styles.actions}>
                        {user.role === 'player' ? (
                          <Button
                            icon={<ShieldCheck />}
                            aria-label={`Make staff: ${user.name}`}
                            onClick={() =>
                              void run(
                                () => api.updateUser(user.id, { role: 'staff' }),
                                `${user.name} is now staff.`,
                              )
                            }
                          >
                            Make staff
                          </Button>
                        ) : (
                          <Button
                            icon={<UserRound />}
                            aria-label={`Make player: ${user.name}`}
                            onClick={() =>
                              void run(
                                () => api.updateUser(user.id, { role: 'player' }),
                                `${user.name} is now a player.`,
                              )
                            }
                          >
                            Make player
                          </Button>
                        )}
                        <Button
                          icon={<Power />}
                          aria-label={`${user.disabled ? 'Turn on' : 'Turn off'}: ${user.name}`}
                          onClick={() =>
                            void run(
                              () => api.updateUser(user.id, { disabled: !user.disabled }),
                              user.disabled
                                ? `${user.name} can sign in again.`
                                : `${user.name} is turned off and signed out.`,
                            )
                          }
                        >
                          {user.disabled ? 'Turn on' : 'Turn off'}
                        </Button>
                        <Button
                          icon={<KeyRound />}
                          aria-label={`Reset code for ${user.name}`}
                          onClick={() => void resetCode(user)}
                        >
                          Reset code
                        </Button>
                        <Button
                          variant="danger"
                          icon={<Trash2 />}
                          aria-label={`Delete ${user.name}`}
                          onClick={() => setDeleting(user)}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>

        <AddAccount
          canAddStaff
          onAdded={async (info) => {
            setCode(info);
            await accounts.reload();
            await log.reload();
          }}
        />

        <section aria-labelledby="log-heading" className={styles.section}>
          <h2 id="log-heading">Account activity</h2>
          <p className={styles.note}>
            Sign-ups, staff sign-ins, account changes, uploads, and approvals. Changes to a
            character’s points and skills are in that character’s own log.
          </p>
          {log.problem ? <p role="alert">{log.problem}</p> : null}
          {log.items.length === 0 && !log.problem ? (
            <p className={styles.muted}>Nothing yet.</p>
          ) : null}
          {log.items.length > 0 ? (
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Who</th>
                    <th scope="col">What</th>
                  </tr>
                </thead>
                <tbody>
                  {log.items.map((item) => (
                    <tr key={item.id}>
                      <td>{dateTimeText(item.at)}</td>
                      <td>{item.userName ?? 'Server'}</td>
                      <td className={styles.wrap}>
                        {ACTION_TEXT[item.action] ?? item.action}
                        {item.target ? `: ${item.target}` : ''}
                        {item.detail ? ` (${item.detail})` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? ''}?`}
        confirmLabel="Delete account"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target)
            void run(() => api.deleteUser(target.id), `Deleted the account of ${target.name}.`);
        }}
      >
        <p>
          This removes the account and signs it out. Its characters stay, with no player account, so
          staff can give them to someone else. To keep the account but stop sign-ins, use Turn off
          instead.
        </p>
      </ConfirmDialog>
    </Screen>
  );
}

function useAudit() {
  const [state, setState] = useState<{ items: AuditEntry[]; problem: string | null }>({
    items: [],
    problem: null,
  });
  const load = useCallback(async () => {
    try {
      return { items: (await api.audit()).items, problem: null };
    } catch (error) {
      return { items: [], problem: errorMessage(error) };
    }
  }, []);
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
