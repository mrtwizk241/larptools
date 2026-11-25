import { describe, expect, it } from 'vitest';
import { withCharacter } from '../engine/testkit.ts';
import type { StoredCharacter } from '../engine/model.ts';
import { LOCAL_PREFIX, createLocalRepository, memoryStore } from './local.ts';

function character(id = 'local-1'): StoredCharacter {
  const h = withCharacter();
  return {
    id,
    schemaVersion: 1,
    rulesetId: 'sylvaris-1.3.1',
    createdAt: '2026-11-14T12:00:00.000Z',
    updatedAt: '2026-11-14T12:00:00.000Z',
    actions: h.actions,
  };
}

describe('no-login builder storage', () => {
  it('saves, lists, reads, and deletes characters with their tracker', async () => {
    const store = memoryStore();
    const repo = createLocalRepository(store, () => new Date('2026-11-14T13:00:00.000Z'));
    expect(repo.persistent).toBe(true);
    const saved = await repo.saveCharacter(character());
    expect(saved.updatedAt).toBe('2026-11-14T13:00:00.000Z');
    expect((await repo.listCharacters()).items.map((c) => c.id)).toEqual(['local-1']);
    expect((await repo.getCharacter('local-1'))?.actions.length).toBe(saved.actions.length);
    await repo.saveTracker({
      characterId: 'local-1',
      perEncounter: {},
      perRepop: { 'skill:toughness': 1 },
      updatedAt: '2026-11-14T12:00:00.000Z',
    });
    expect((await repo.getTracker('local-1'))?.perRepop).toEqual({ 'skill:toughness': 1 });
    await repo.deleteCharacter('local-1');
    expect((await repo.listCharacters()).items).toEqual([]);
    expect(await repo.getTracker('local-1')).toBeUndefined();
    expect(store.length).toBe(0);
  });

  it('survives a reload: a new repository over the same storage sees the data', async () => {
    const store = memoryStore();
    await createLocalRepository(store).saveCharacter(character('a'));
    await createLocalRepository(store).saveEvent({
      key: '2026-11-21-frost-vigil',
      name: 'Frost Vigil',
      date: '2026-11-21',
    });
    const again = createLocalRepository(store);
    expect((await again.listCharacters()).items).toHaveLength(1);
    expect((await again.listEvents()).items.map((e) => e.name)).toEqual(['Frost Vigil']);
  });

  it('reports unreadable records instead of crashing', async () => {
    const store = memoryStore();
    const repo = createLocalRepository(store);
    await expect(
      repo.saveCharacter({ ...character(), actions: [] as never }),
    ).resolves.toBeTruthy();
    store.setItem(`${LOCAL_PREFIX}char:bad`, '{not json');
    const listed = await repo.listCharacters();
    expect(listed.invalid.map((i) => i.key)).toEqual([`${LOCAL_PREFIX}char:bad`]);
  });

  it('keeps data in memory and says so when the browser blocks storage', async () => {
    const repo = createLocalRepository(null);
    expect(repo.persistent).toBe(false);
    await repo.saveCharacter(character());
    expect((await repo.listCharacters()).items).toHaveLength(1);
  });

  it('stores settings, falling back to the defaults', async () => {
    const repo = createLocalRepository(memoryStore());
    expect((await repo.getSettings()).theme).toBe('system');
    await repo.saveSettings({ mode: 'staff', theme: 'dark' });
    expect((await repo.getSettings()).theme).toBe('dark');
  });
});
