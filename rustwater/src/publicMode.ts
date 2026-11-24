// The public site build (docs/PUBLIC-SITE-PLAN.md): no sign-in, no server, and every character is
// the visitor's own test build, saved in this browser. `__RW_PUBLIC__` is set by
// `vite.config.ts` (false) and `vite.public.config.ts` (true), so the normal app keeps every
// server feature and the public build drops them at build time.
import type { CharacterMeta, UserInfo } from './api/contract.ts';

declare const __RW_PUBLIC__: boolean;

export const PUBLIC_MODE: boolean = typeof __RW_PUBLIC__ === 'boolean' ? __RW_PUBLIC__ : false;

/** The open source repo of the public site, linked from the footer. */
export const PUBLIC_REPO_URL = 'https://github.com/mrtwizk241/larptools';

/** The one built-in account of the public site: a player with no server behind it. */
export const PUBLIC_USER: UserInfo = {
  id: 'public-visitor',
  email: '',
  name: 'You',
  role: 'player',
  disabled: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

/** On the public site every saved character is the visitor's own test build (ADR 0007). */
export function publicTestBuildMeta(id: string): CharacterMeta {
  return {
    id,
    kind: 'test',
    status: 'active',
    ownerId: PUBLIC_USER.id,
    ownerName: PUBLIC_USER.name,
    ownerEmail: null,
    submittedAt: null,
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
    draft: null,
  };
}
