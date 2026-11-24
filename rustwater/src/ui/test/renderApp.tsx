import { render } from '@testing-library/react';
import type { UserInfo } from '../../api/contract.ts';
import { App } from '../App.tsx';
import { createMemoryRepository, type MemoryRepositoryOptions } from '../data/memoryRepository.ts';

export const TEST_STAFF: UserInfo = {
  id: 'user-staff',
  email: 'staff@test.invalid',
  name: 'Test Staff',
  role: 'staff',
  disabled: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const TEST_PLAYER: UserInfo = {
  ...TEST_STAFF,
  id: 'user-player',
  email: 'player@test.invalid',
  name: 'Test Player',
  role: 'player',
};

export interface RenderAppOptions extends MemoryRepositoryOptions {
  /** The signed-in account. Defaults to staff or player from `settings.mode`; null: signed out. */
  user?: UserInfo | null;
}

/** Renders the whole app at a hash route with an in-memory repository and a fixed account. */
export function renderApp(route: string, options: RenderAppOptions = {}) {
  window.location.hash = `#${route}`;
  const { user, ...repositoryOptions } = options;
  const repository = createMemoryRepository(repositoryOptions);
  const account =
    user !== undefined ? user : options.settings?.mode === 'staff' ? TEST_STAFF : TEST_PLAYER;
  const view = render(<App repository={repository} user={account} />);
  return { ...view, repository };
}
