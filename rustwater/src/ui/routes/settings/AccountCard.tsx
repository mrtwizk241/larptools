import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { LogOut } from 'lucide-react';
import { api, errorMessage } from '../../../api/client.ts';
import { ROLE_LABEL, useOptionalAuth } from '../../auth/authContext.ts';
import { Alert, Badge, Button, Card, Field, useToast } from '../../components/index.ts';
import styles from './settings.module.css';

/** Account: who is signed in, rename, change password, sign out. */
export function AccountCard() {
  const auth = useOptionalAuth();
  const navigate = useNavigate();
  const toast = useToast();
  if (!auth) return null;
  const user = auth.user;
  if (!user) {
    return (
      <Card title="Account">
        <p>
          You are not signed in. <Link to="/login">Sign in</Link> or{' '}
          <Link to="/signup">create an account</Link>.
        </p>
      </Card>
    );
  }
  const offline = auth.state.status === 'signed-in' && auth.state.offline;
  return (
    <Card title="Account">
      <div className={styles.stack}>
        <dl className={styles.facts}>
          <div>
            <dt>Name</dt>
            <dd>{user.name}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>
              <Badge kind={user.role === 'player' ? 'player' : 'staff'}>
                {ROLE_LABEL[user.role]}
              </Badge>
            </dd>
          </div>
        </dl>
        {offline ? (
          <p className={styles.note}>Offline: account changes need a connection.</p>
        ) : (
          <>
            <RenameForm
              name={user.name}
              onSaved={(next) => {
                auth.updateUser(next);
                toast.show('Name saved.');
              }}
            />
            <PasswordForm
              onSaved={() => toast.show('Password changed. Other devices are signed out.')}
            />
          </>
        )}
        <div className={styles.row}>
          <Button
            icon={<LogOut />}
            onClick={() => {
              void auth.signOut().then(() => navigate('/'));
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    </Card>
  );
}

function RenameForm({
  name,
  onSaved,
}: {
  name: string;
  onSaved: (user: Awaited<ReturnType<typeof api.renameAccount>>['user']) => void;
}) {
  const [value, setValue] = useState(name);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setProblem(null);
    setBusy(true);
    try {
      onSaved((await api.renameAccount(value)).user);
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={styles.stack} onSubmit={(event) => void submit(event)} noValidate>
      {problem ? <Alert>{problem}</Alert> : null}
      <Field label="Your name" hint="Staff see this name.">
        {(control) => (
          <input
            {...control}
            autoComplete="name"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
      </Field>
      <div className={styles.row}>
        <Button type="submit" disabled={busy || value.trim() === '' || value.trim() === name}>
          Save name
        </Button>
      </div>
    </form>
  );
}

function PasswordForm({ onSaved }: { onSaved: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setProblem(null);
    if (next !== repeat) {
      setProblem('The two new passwords are different.');
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      setRepeat('');
      onSaved();
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={styles.stack} onSubmit={(event) => void submit(event)} noValidate>
      <h3 className={styles.subheading}>Change password</h3>
      {problem ? <Alert>{problem}</Alert> : null}
      <Field label="Current password">
        {(control) => (
          <input
            {...control}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        )}
      </Field>
      <Field label="New password" hint="At least 8 characters.">
        {(control) => (
          <input
            {...control}
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        )}
      </Field>
      <Field label="Repeat new password">
        {(control) => (
          <input
            {...control}
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        )}
      </Field>
      <div className={styles.row}>
        <Button type="submit" disabled={busy || current === '' || next === ''}>
          Change password
        </Button>
      </div>
    </form>
  );
}
