// Who is signed in. Screens use useAuth(); AuthProvider fills it.
import { createContext, useContext } from 'react';
import type { Portal, Role, UserInfo } from '../../api/contract.ts';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  /** `offline`: the server could not be reached, so this is the account last seen on this device. */
  | { status: 'signed-in'; user: UserInfo; offline: boolean };

export interface AuthApi {
  state: AuthState;
  /** The signed-in account, or null. */
  user: UserInfo | null;
  signIn(email: string, password: string, portal: Portal): Promise<UserInfo>;
  signUp(name: string, email: string, password: string): Promise<UserInfo>;
  /** Sets a new password with a one-time code from staff, and signs in. */
  redeemCode(email: string, code: string, password: string): Promise<UserInfo>;
  signOut(): Promise<void>;
  /** After the account changes (for example a new name). */
  updateUser(user: UserInfo): void;
}

export const AuthContext = createContext<AuthApi | null>(null);

export function useAuth(): AuthApi {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}

export function useOptionalAuth(): AuthApi | null {
  return useContext(AuthContext);
}

export function isStaffRole(role: Role | undefined): boolean {
  return role === 'staff' || role === 'admin';
}

export const ROLE_LABEL: Record<Role, string> = {
  player: 'Player',
  staff: 'Staff',
  admin: 'Super admin',
};
