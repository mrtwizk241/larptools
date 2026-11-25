// The no-login build ("Sylvaris Character Playground"): one HTML file that runs with no server and
// no sign-in. `__SY_LOCAL__` is set by `vite.local.config.ts` (true) and `vite.config.ts` (false),
// so the normal app keeps every server feature and the builder drops them at build time.
declare const __SY_LOCAL__: boolean;

export const LOCAL_MODE: boolean = typeof __SY_LOCAL__ === 'boolean' ? __SY_LOCAL__ : false;

/** The one built-in account of the no-login builder: full edit powers, no server behind it. */
export const LOCAL_USER = {
  id: 'local-player',
  email: '',
  name: 'You',
  role: 'staff',
  disabled: false,
  createdAt: '2026-01-01T00:00:00.000Z',
} as const;
