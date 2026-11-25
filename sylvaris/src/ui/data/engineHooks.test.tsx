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

    const before = character.actions.length;
    let outcome: Awaited<ReturnType<typeof result.current.command.run>> | undefined;
    await act(async () => {
      outcome = await result.current.command.run(
        { type: 'learnSkill', skillId: 'toughness', step: { level: 3 } },
        { success: 'Toughness is now level 3.' },
      );
    });

    expect(outcome?.ok).toBe(true);
    const stored = repository.data.characters.get(character.id);
    expect(stored?.actions).toHaveLength(before + 1);
    expect(stored?.actions[before]).toMatchObject({
      seq: before + 1,
      type: 'skill.learned',
      actor: { role: 'staff' },
      payload: { skillId: 'toughness', step: { level: 3 }, currency: 'xp', cost: 15 },
    });
    expect(result.current.command.errors).toEqual([]);
    expect(screen.getByText('Toughness is now level 3.')).toBeInTheDocument();
    const sheet = result.current.sheet;
    if (sheet.status !== 'ready') throw new Error('sheet not ready');
    expect(sheet.sheet.skills.find((s) => s.skillId === 'toughness')?.level).toBe(3);
    expect(sheet.sheet.points.xp.available).toBe(70);
  });

  it('returns rule errors and saves nothing when the engine blocks the command', async () => {
    const character = mira();
    const repository = createMemoryRepository({ characters: [character], settings: STAFF });
    const { result } = await ready(character.id, repository);
    let outcome: Awaited<ReturnType<typeof result.current.command.run>> | undefined;
    await act(async () => {
      outcome = await result.current.command.run({
        type: 'learnSkill',
        skillId: 'fire-magic',
        step: { level: 10 },
      });
    });

    expect(outcome?.ok).toBe(false);
    expect(result.current.command.errors.map((e) => e.code)).toEqual(['NOT_ENOUGH_XP']);
    expect(result.current.command.errors[0]?.message).toBe('Not enough XP: needs 245, 85 left.');
    expect(repository.data.characters.get(character.id)?.actions).toHaveLength(
      character.actions.length,
    );
  });

  it('runs as the player in player mode, so the engine refuses', async () => {
    const character = mira();
    const repository = createMemoryRepository({ characters: [character], settings: PLAYER });
    const { result } = await ready(character.id, repository);
    await act(async () => {
      await result.current.command.run({ type: 'updateProfile', notes: 'Hi.' });
    });
    expect(result.current.command.errors.map((e) => e.code)).toEqual(['ROLE_NOT_ALLOWED']);
    expect(repository.data.characters.get(character.id)?.actions).toHaveLength(
      character.actions.length,
    );
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
        raceId: 'human',
        startingSkills: [{ skillId: 'toughness', level: 1 }],
      });
    });

    const stored = repository.data.characters.get('new-character');
    expect(stored).toMatchObject({
      id: 'new-character',
      schemaVersion: 1,
      rulesetId: 'sylvaris-1.3.1',
    });
    expect(stored?.actions.map((a) => a.type)).toEqual(['character.created', 'skill.learned']);
    expect(result.current.command.notices.map((n) => n.code)).toEqual(['XP_UNSPENT']);
    expect(screen.getByText('145 starting XP left unspent; it carries over.')).toBeInTheDocument();
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
