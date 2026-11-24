import type { ReactNode } from 'react';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Settings } from '../../engine/model.ts';
import { ToastProvider } from '../components/index.ts';
import { mira } from '../test/fixtures.ts';
import { useSheet, useCommand } from './engineHooks.ts';
import { useSettings } from './hooks.ts';
import { createMemoryRepository, type MemoryRepository } from './memoryRepository.ts';
import { RepositoryProvider } from './RepositoryProvider.tsx';
import { RulesetProvider } from './RulesetProvider.tsx';

const STAFF: Settings = { mode: 'staff', theme: 'system' };
const PLAYER: Settings = { mode: 'player', theme: 'system' };

function setup(id: string, repository: MemoryRepository) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <RepositoryProvider repository={repository}>
      <RulesetProvider>
        <ToastProvider>{children}</ToastProvider>
      </RulesetProvider>
    </RepositoryProvider>
  );
  return renderHook(
    () => ({ command: useCommand(id), sheet: useSheet(id), settings: useSettings().settings }),
    { wrapper },
  );
}

async function ready(id: string, repository: MemoryRepository) {
  const view = setup(id, repository);
  await waitFor(() => expect(view.result.current.settings).toBeDefined());
  return view;
}

describe('useCommand', () => {
  it('plans, appends, saves, updates useSheet, and shows a success toast', async () => {
    const character = mira();
    const repository = createMemoryRepository({ characters: [character], settings: STAFF });
    const { result } = await ready(character.id, repository);
    await waitFor(() => expect(result.current.sheet.status).toBe('ready'));

    let outcome: Awaited<ReturnType<typeof result.current.command.run>> | undefined;
    await act(async () => {
      outcome = await result.current.command.run(
        { type: 'levelAncestryAbility', abilityId: 'quick-reflexes' },
        { success: 'Quick Reflexes is now level 2.' },
      );
    });

    expect(outcome?.ok).toBe(true);
    const stored = repository.data.characters.get(character.id);
    expect(stored?.actions).toHaveLength(2);
    expect(stored?.actions[1]).toMatchObject({
      seq: 2,
      type: 'ancestry.leveled',
      actor: { role: 'staff' },
      payload: { abilityId: 'quick-reflexes', toLevel: 2 },
    });
    expect(result.current.command.errors).toEqual([]);
    expect(screen.getByText('Quick Reflexes is now level 2.')).toBeInTheDocument();
    const sheet = result.current.sheet;
    if (sheet.status !== 'ready') throw new Error('sheet not ready');
    expect(sheet.sheet.ancestry?.abilities[0]?.level).toBe(2);
    expect(sheet.sheet.points.lxp.available).toBe(0);
  });

  it('returns rule errors and saves nothing when the engine blocks the command', async () => {
    const character = mira();
    const repository = createMemoryRepository({ characters: [character], settings: STAFF });
    const { result } = await ready(character.id, repository);
    const level = { type: 'levelAncestryAbility', abilityId: 'accuracy' } as const;

    await act(async () => {
      await result.current.command.run(level);
    });
    let outcome: Awaited<ReturnType<typeof result.current.command.run>> | undefined;
    await act(async () => {
      outcome = await result.current.command.run(level);
    });

    expect(outcome?.ok).toBe(false);
    expect(result.current.command.errors.map((e) => e.code)).toEqual(['NOT_ENOUGH_LXP']);
    expect(result.current.command.errors[0]?.message).toBe('Not enough LXP: needs 1, 0 left.');
    expect(repository.data.characters.get(character.id)?.actions).toHaveLength(2);
  });

  it('runs as the player in player mode, so the engine refuses', async () => {
    const character = mira();
    const repository = createMemoryRepository({ characters: [character], settings: PLAYER });
    const { result } = await ready(character.id, repository);
    await act(async () => {
      await result.current.command.run({ type: 'updateProfile', notes: 'Hi.' });
    });
    expect(result.current.command.errors.map((e) => e.code)).toEqual(['ROLE_NOT_ALLOWED']);
    expect(repository.data.characters.get(character.id)?.actions).toHaveLength(1);
  });

  it('creates a new stored character and shows engine notices as toasts', async () => {
    const repository = createMemoryRepository({ settings: STAFF });
    const { result } = await ready('new-character', repository);
    expect(result.current.sheet.status).toBe('missing');

    await act(async () => {
      await result.current.command.run({
        type: 'createCharacter',
        characterName: 'Wren Ashby',
        playerName: 'Jo Park',
        ancestryId: 'elf',
        subtypeId: 'elf-stonewalker',
        startingLxpAbilityId: 'shrug-it-off',
      });
    });

    const stored = repository.data.characters.get('new-character');
    expect(stored).toMatchObject({ id: 'new-character', schemaVersion: 1, rulesetId: '2026-2.0' });
    expect(stored?.actions.map((a) => a.type)).toEqual(['character.created', 'ancestry.leveled']);
    expect(result.current.command.notices.map((n) => n.code)).toEqual(['CXP_UNSPENT']);
    expect(screen.getByText('250 starting CXP left unspent.')).toBeInTheDocument();
    await waitFor(() => expect(result.current.sheet.status).toBe('ready'));
  });

  it('reports a failed save as an inline error', async () => {
    const character = mira();
    const repository = createMemoryRepository({ characters: [character], settings: STAFF });
    repository.saveCharacter = () => Promise.reject(new Error('Disk full'));
    const { result } = await ready(character.id, repository);
    await act(async () => {
      await result.current.command.run({ type: 'updateProfile', notes: 'Hi.' });
    });
    expect(result.current.command.errors).toEqual([
      { code: 'SAVE_FAILED', message: 'The change could not be saved: Disk full', ruleId: 'UI' },
    ]);
  });
});
