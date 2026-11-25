// Sign-in screens: player sign-in (`#/login`), staff sign-in (`#/staff/login`), create an account
// (`#/signup`), use a code from staff (`#/reset`), and the signed-out home page.
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { BookOpen, LogIn, UserPlus } from 'lucide-react';
import { BRAND } from '../../brandAssets.ts';
import { ApiError } from '../../../api/client.ts';
import type { Portal } from '../../../api/contract.ts';
import { useAuth } from '../../auth/authContext.ts';
import { Alert, Button, ButtonLink, Field } from '../../components/index.ts';
import { Screen } from '../../Screen.tsx';
import styles from './auth.module.css';

const MIN_PASSWORD = 8;

function problemText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

/** Where to go after signing in: the page that sent the visitor here, or home. */
function useReturnTo(): string {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/';
}

function useSubmit(action: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await action();
    } catch (error) {
      setProblem(problemText(error));
    } finally {
      setBusy(false);
    }
  }
  return { busy, problem, setProblem, onSubmit };
}

function AuthScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Screen title={title}>
      <div className={styles.page}>
        <h1>{title}</h1>
        {children}
      </div>
    </Screen>
  );
}

/** `#/login` (players) and `#/staff/login` (staff and the super admin). */
export function SignInPage({ portal }: { portal: Portal }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const returnTo = useReturnTo();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const form = useSubmit(async () => {
    await auth.signIn(email, password, portal);
    void navigate(returnTo, { replace: true });
  });
  if (auth.user) return <Navigate to={returnTo} replace />;
  const staff = portal === 'staff';
  return (
    <AuthScreen title={staff ? 'Staff sign-in' : 'Sign in'}>
      {staff ? (
        <p>For Sylvaris staff and the site admin. Players sign in on the main sign-in page.</p>
      ) : (
        <p>Sign in to see your characters and send what you learned to staff.</p>
      )}
      <form className={styles.form} onSubmit={(event) => void form.onSubmit(event)} noValidate>
        {form.problem ? <Alert>{form.problem}</Alert> : null}
        <Field label="Email" required>
          {(control) => (
            <input
              {...control}
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>
        <Field label="Password" required>
          {(control) => (
            <input
              {...control}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>
        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            icon={<LogIn />}
            aria-disabled={form.busy || undefined}
          >
            {form.busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </div>
      </form>
      <div className={styles.links}>
        {staff ? null : <Link to="/signup">New here? Create an account</Link>}
        <Link to="/reset">Forgot your password, or have a code from staff?</Link>
        {staff ? (
          <Link to="/login">Player sign-in</Link>
        ) : (
          <Link to="/staff/login">Staff sign-in</Link>
        )}
      </div>
    </AuthScreen>
  );
}

function PasswordFields({
  password,
  repeat,
  onPassword,
  onRepeat,
  label = 'Password',
}: {
  password: string;
  repeat: string;
  onPassword: (value: string) => void;
  onRepeat: (value: string) => void;
  label?: string;
}) {
  return (
    <>
      <Field label={label} hint={`At least ${MIN_PASSWORD} characters.`} required>
        {(control) => (
          <input
            {...control}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => onPassword(event.target.value)}
          />
        )}
      </Field>
      <Field label="Repeat password" required>
        {(control) => (
          <input
            {...control}
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(event) => onRepeat(event.target.value)}
          />
        )}
      </Field>
    </>
  );
}

function checkPasswords(password: string, repeat: string): void {
  if (password.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters.`);
  if (password !== repeat) throw new Error('The two passwords are different.');
}

/** `#/signup`: a new player account. */
export function SignUpPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const form = useSubmit(async () => {
    if (name.trim() === '') throw new Error('Enter your name.');
    checkPasswords(password, repeat);
    await auth.signUp(name, email, password);
    void navigate('/', { replace: true });
  });
  if (auth.user) return <Navigate to="/" replace />;
  return (
    <AuthScreen title="Create an account">
      <p>
        For players. Use the name staff know you by. Staff see your name and email so they can match
        you to your characters.
      </p>
      <form className={styles.form} onSubmit={(event) => void form.onSubmit(event)} noValidate>
        {form.problem ? <Alert>{form.problem}</Alert> : null}
        <Field label="Your name" required>
          {(control) => (
            <input
              {...control}
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <Field label="Email" required>
          {(control) => (
            <input
              {...control}
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>
        <PasswordFields
          password={password}
          repeat={repeat}
          onPassword={setPassword}
          onRepeat={setRepeat}
        />
        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            icon={<UserPlus />}
            aria-disabled={form.busy || undefined}
          >
            {form.busy ? 'Creating…' : 'Create account'}
          </Button>
        </div>
      </form>
      <div className={styles.links}>
        <Link to="/login">Already have an account? Sign in</Link>
      </div>
    </AuthScreen>
  );
}

/** `#/reset`: set a password with a one-time code from staff (new accounts and resets). */
export function ResetPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const form = useSubmit(async () => {
    checkPasswords(password, repeat);
    await auth.redeemCode(email, code, password);
    void navigate('/', { replace: true });
  });
  return (
    <AuthScreen title="Use a code from staff">
      <p>
        Forgot your password, or staff made your account? Ask staff for a one-time code, then choose
        a new password here. Codes look like K7MX-2QPA-9TRD and expire after a few days.
      </p>
      <form className={styles.form} onSubmit={(event) => void form.onSubmit(event)} noValidate>
        {form.problem ? <Alert>{form.problem}</Alert> : null}
        <Field label="Email" required>
          {(control) => (
            <input
              {...control}
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>
        <Field label="Code from staff" required>
          {(control) => (
            <input
              {...control}
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          )}
        </Field>
        <PasswordFields
          label="New password"
          password={password}
          repeat={repeat}
          onPassword={setPassword}
          onRepeat={setRepeat}
        />
        <div className={styles.actions}>
          <Button type="submit" variant="primary" aria-disabled={form.busy || undefined}>
            {form.busy ? 'Saving…' : 'Set password and sign in'}
          </Button>
        </div>
      </form>
      <div className={styles.links}>
        <Link to="/login">Back to sign-in</Link>
      </div>
    </AuthScreen>
  );
}

/** The home page when nobody is signed in. */
export function WelcomePage() {
  return (
    <Screen title="Welcome">
      <div className={styles.welcome}>
        <img
          className={styles.logo}
          src={BRAND.logo256}
          width={128}
          height={128}
          alt=""
          decoding="async"
        />
        <h1>Sylvaris character sheets</h1>
        <p>
          Your Sylvaris characters, skills, and points in one place. Sign in to see your sheet, or
          read the rules first.
        </p>
        <div className={styles.choices}>
          <ButtonLink to="/login" variant="primary" icon={<LogIn />}>
            Sign in
          </ButtonLink>
          <ButtonLink to="/signup" icon={<UserPlus />}>
            Create an account
          </ButtonLink>
          <ButtonLink to="/wiki" variant="ghost" icon={<BookOpen />}>
            Read the rules wiki
          </ButtonLink>
        </div>
        <p className={styles.note}>
          Unofficial fan tool. <Link to="/staff/login">Staff sign-in</Link>
        </p>
      </div>
    </Screen>
  );
}

/** Staff-only and admin-only screens say so instead of showing an empty page. */
export function NotAllowed({ what }: { what: string }) {
  return (
    <div className={styles.page}>
      <h1>Not available</h1>
      <p>{what}</p>
      <Link to="/">Back to characters</Link>
    </div>
  );
}
