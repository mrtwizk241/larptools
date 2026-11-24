import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, SIGNED_OUT_EVENT, api } from '../../api/client.ts';
import type { UserInfo } from '../../api/contract.ts';
import { clearServerCache } from '../../storage/remote.ts';
import { AuthContext, type AuthApi, type AuthState } from './authContext.ts';

const USER_KEY = 'rw.user';

function readCachedUser(): UserInfo | null {
  try {
    const text = localStorage.getItem(USER_KEY);
    return text ? (JSON.parse(text) as UserInfo) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: UserInfo | null): void {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    // Storage blocked: the app still works online.
  }
}

export interface AuthProviderProps {
  children: ReactNode;
  /**
   * Tests: a fixed account (or null for signed out) and no server calls. Leave it out in the
   * app.
   */
  fixedUser?: UserInfo | null;
}

export function AuthProvider({ children, fixedUser }: AuthProviderProps) {
  const fixed = fixedUser !== undefined;
  const [state, setState] = useState<AuthState>(() =>
    fixed
      ? fixedUser
        ? { status: 'signed-in', user: fixedUser, offline: false }
        : { status: 'signed-out' }
      : { status: 'loading' },
  );

  const becomeSignedOut = useCallback(() => {
    writeCachedUser(null);
    void clearServerCache();
    setState({ status: 'signed-out' });
  }, []);

  const becomeSignedIn = useCallback(async (user: UserInfo) => {
    const previous = readCachedUser();
    // Another account used this device: its saved copies must not show.
    if (previous && previous.id !== user.id) await clearServerCache();
    writeCachedUser(user);
    setState({ status: 'signed-in', user, offline: false });
    return user;
  }, []);

  useEffect(() => {
    if (fixed) return;
    let cancelled = false;
    void (async () => {
      try {
        const { user } = await api.session();
        if (cancelled) return;
        if (user) await becomeSignedIn(user);
        else becomeSignedOut();
      } catch (error) {
        if (cancelled) return;
        const cached = readCachedUser();
        if (error instanceof ApiError && error.offline && cached)
          setState({ status: 'signed-in', user: cached, offline: true });
        else setState({ status: 'signed-out' });
      }
    })();
    const onSignedOut = () => becomeSignedOut();
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => {
      cancelled = true;
      window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
    };
  }, [fixed, becomeSignedIn, becomeSignedOut]);

  const value = useMemo<AuthApi>(
    () => ({
      state,
      user: state.status === 'signed-in' ? state.user : null,
      signIn: async (email, password, portal) =>
        becomeSignedIn((await api.login(email, password, portal)).user),
      signUp: async (name, email, password) =>
        becomeSignedIn((await api.signup(name, email, password)).user),
      redeemCode: async (email, code, password) =>
        becomeSignedIn((await api.reset(email, code, password)).user),
      signOut: async () => {
        try {
          if (!fixed) await api.logout();
        } catch {
          // Signed out on this device even if the server is unreachable.
        }
        becomeSignedOut();
      },
      updateUser: (user) => {
        writeCachedUser(user);
        setState((current) => (current.status === 'signed-in' ? { ...current, user } : current));
      },
    }),
    [state, fixed, becomeSignedIn, becomeSignedOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
