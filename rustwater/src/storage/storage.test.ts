import 'fake-indexeddb/auto';
import { clear, createStore, get, set } from 'idb-keyval';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Action, Request, StoredCharacter } from '../engine/model.ts';
import { createIdbRepository, InvalidRecordError, type Migration } from './index.ts';
import { hashPin, isValidPin, verifyPin } from './pin.ts';

const store = createStore('rustwater-test', 'kv');
const NOW = new Date('2026-06-01T12:00:00.000Z');
const repo = createIdbRepository({ store, now: () => NOW });

function action(seq: number): Action {
  return {
    id: `act-${seq}`,
    seq,
    at: '2026-05-16T10:00:00.000Z',
    actor: { role: 'staff', name: 'Staff Sam' },
    type: seq === 1 ? 'character.created' : 'points.awarded',
    payload: { n: seq },
  };
}

function character(id: string, actionCount = 2): StoredCharacter {
  return {
    id,
    schemaVersion: 1,
    rulesetId: '2026-2.0',
    createdAt: '2026-05-16T10:00:00.000Z',
    updatedAt: '2026-05-16T10:00:00.000Z',
    actions: Array.from({ length: actionCount }, (_, i) => action(i + 1)),
  };
}

function request(id: string, characterId: string, createdAt = '2026-05-17T09:00:00.000Z'): Request {
  return {
    id,
    characterId,
    createdAt,
    kind: 'learn-skill',
    skillId: 'first-aid',
    part: 'basic',
    toLevel: 1,
    teacher: 'Old Mags',
    note: '',
    status: 'draft',
  };
}

beforeEach(async () => {
  await clear(store);
});

describe('character records', () => {
  it('round trips and sets updatedAt on save', async () => {
    const saved = await repo.saveCharacter(character('c1'));
    expect(saved.updatedAt).toBe(NOW.toISOString());
    expect(await repo.getCharacter('c1')).toEqual(saved);
    expect(await repo.getCharacter('missing')).toBeUndefined();
  });

  it('lists characters, most recently updated first', async () => {
    await set('char:old', { ...character('old'), updatedAt: '2026-01-01T00:00:00.000Z' }, store);
    await repo.saveCharacter(character('new'));
    const { items, invalid } = await repo.listCharacters();
    expect(items.map((c) => c.id)).toEqual(['new', 'old']);
    expect(invalid).toEqual([]);
  });

  it('reports invalid records without breaking the list', async () => {
    await repo.saveCharacter(character('good'));
    await set('char:junk', { hello: 'world' }, store);
    await set('char:badseq', { ...character('badseq'), actions: [action(2)] }, store);
    await set('char:future', { ...character('future'), schemaVersion: 99 }, store);
    const { items, invalid } = await repo.listCharacters();
    expect(items.map((c) => c.id)).toEqual(['good']);
    expect(invalid.map((r) => r.key).sort()).toEqual(['char:badseq', 'char:future', 'char:junk']);
    expect(invalid.find((r) => r.key === 'char:badseq')?.errors[0]).toMatch(/seq: expected 1/);
    expect(invalid.find((r) => r.key === 'char:future')?.errors[0]).toMatch(/newer version/);
  });

  it('throws InvalidRecordError on a bad single read or write', async () => {
    await set('char:junk', 42, store);
    await expect(repo.getCharacter('junk')).rejects.toBeInstanceOf(InvalidRecordError);
    const dupes = { ...character('d'), actions: [action(1), { ...action(2), id: 'act-1' }] };
    await expect(repo.saveCharacter(dupes)).rejects.toThrow(/duplicate action id/);
    await expect(repo.getCharacter('../etc')).rejects.toBeInstanceOf(InvalidRecordError);
  });

  it('strips unknown fields on save', async () => {
    const extra = { ...character('c1'), sneaky: true } as StoredCharacter;
    await repo.saveCharacter(extra);
    expect(await get('char:c1', store)).not.toHaveProperty('sneaky');
  });

  it('deletes a character with its tracker and requests', async () => {
    await repo.saveCharacter(character('c1'));
    await repo.saveCharacter(character('c2'));
    await repo.saveTracker({
      characterId: 'c1',
      perEncounter: { 'first-aid:basic': 1 },
      perRepop: {},
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await repo.saveRequest(request('r1', 'c1'));
    await repo.saveRequest(request('r2', 'c2'));
    await set('req:broken', { characterId: 'c1', junk: true }, store);

    await repo.deleteCharacter('c1');

    expect(await repo.getCharacter('c1')).toBeUndefined();
    expect(await repo.getTracker('c1')).toBeUndefined();
    expect(await get('req:broken', store)).toBeUndefined();
    const all = await repo.listRequests();
    expect(all.items.map((r) => r.id)).toEqual(['r2']);
    expect(await repo.getCharacter('c2')).toBeDefined();
  });
});

describe('trackers, requests, events, settings', () => {
  it('round trips a tracker and sets updatedAt', async () => {
    const saved = await repo.saveTracker({
      characterId: 'c1',
      perEncounter: { 'dodge:basic': 2 },
      perRepop: { 'heal:adept': 1 },
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(saved.updatedAt).toBe(NOW.toISOString());
    expect(await repo.getTracker('c1')).toEqual(saved);
    await expect(repo.saveTracker({ ...saved, perRepop: { x: -1 } })).rejects.toBeInstanceOf(
      InvalidRecordError,
    );
  });

  it('lists requests by character or all, oldest first, and deletes one', async () => {
    await repo.saveRequest(request('r2', 'c1', '2026-05-18T09:00:00.000Z'));
    await repo.saveRequest(request('r1', 'c1', '2026-05-17T09:00:00.000Z'));
    await repo.saveRequest(request('r3', 'c2'));
    await set('req:bad', { id: 'bad' }, store);

    const forC1 = await repo.listRequests('c1');
    expect(forC1.items.map((r) => r.id)).toEqual(['r1', 'r2']);
    const all = await repo.listRequests();
    expect(all.items.map((r) => r.id)).toEqual(['r1', 'r3', 'r2']);
    expect(all.invalid.map((r) => r.key)).toEqual(['req:bad']);

    await repo.deleteRequest('r1');
    expect((await repo.listRequests('c1')).items.map((r) => r.id)).toEqual(['r2']);
  });

  it('saves and lists events in date order', async () => {
    await repo.saveEvent({ key: '2026-07-01-summer', name: 'Summer', date: '2026-07-01' });
    await repo.saveEvent({
      key: '2026-05-16-spring-thaw',
      name: 'Spring Thaw',
      date: '2026-05-16',
    });
    const { items } = await repo.listEvents();
    expect(items.map((e) => e.key)).toEqual(['2026-05-16-spring-thaw', '2026-07-01-summer']);
    await expect(
      repo.saveEvent({ key: 'Not A Key', name: 'x', date: '2026-07-01' }),
    ).rejects.toBeInstanceOf(InvalidRecordError);
  });

  it('returns default settings when missing or unreadable, and round trips saved ones', async () => {
    expect(await repo.getSettings()).toEqual({ mode: 'player', theme: 'system' });
    await set('settings', { mode: 'admin' }, store);
    expect(await repo.getSettings()).toEqual({ mode: 'player', theme: 'system' });
    const { hash, salt } = await hashPin('1234');
    await repo.saveSettings({ mode: 'staff', theme: 'dark', pinHash: hash, pinSalt: salt });
    expect(await repo.getSettings()).toEqual({
      mode: 'staff',
      theme: 'dark',
      pinHash: hash,
      pinSalt: salt,
    });
  });
});

describe('migrations', () => {
  // A fake v0 shape: the log was called `log` and actors were plain strings.
  const v0to1: Migration = {
    from: 0,
    description: 'v0 to v1: rename log to actions',
    character: (raw) => {
      const { log, ...rest } = raw;
      const actions = (log as Record<string, unknown>[]).map((a) => ({
        ...a,
        actor: { role: a.actor },
      }));
      return { ...rest, actions };
    },
    run: async (ctx) => {
      await ctx.set('settings', { mode: 'player', theme: 'light' });
    },
  };
  const v0Character = {
    id: 'old',
    schemaVersion: 0,
    rulesetId: '2026-2.0',
    createdAt: '2026-05-16T10:00:00.000Z',
    updatedAt: '2026-05-16T10:00:00.000Z',
    log: [{ ...action(1), actor: 'staff' }],
  };

  it('marks a fresh database as current', async () => {
    expect(await repo.runMigrations()).toEqual({ ok: true, from: 1, to: 1, applied: [] });
    expect(await get('meta', store)).toEqual({ schemaVersion: 1 });
  });

  it('runs a v0 to v1 migration over stored records', async () => {
    const migrating = createIdbRepository({ store, migrations: [v0to1], targetVersion: 1 });
    await set('meta', { schemaVersion: 0 }, store);
    await set('char:old', v0Character, store);

    const report = await migrating.runMigrations();

    expect(report).toEqual({ ok: true, from: 0, to: 1, applied: [v0to1.description] });
    expect(await get('meta', store)).toEqual({ schemaVersion: 1 });
    const stored = (await get('char:old', store)) as StoredCharacter;
    expect(stored.schemaVersion).toBe(1);
    expect(stored.actions[0]?.actor).toEqual({ role: 'staff' });
    expect(await migrating.getSettings()).toEqual({ mode: 'player', theme: 'light' });
    // Running again is a no-op.
    expect(await migrating.runMigrations()).toEqual({ ok: true, from: 1, to: 1, applied: [] });
  });

  it('migrates an older character on read', async () => {
    const migrating = createIdbRepository({ store, migrations: [v0to1], targetVersion: 1 });
    await set('char:old', v0Character, store);
    const read = await migrating.getCharacter('old');
    expect(read?.schemaVersion).toBe(1);
    expect(read?.actions).toHaveLength(1);
  });

  it('reports a missing step, a newer database, and unreadable meta', async () => {
    await set('meta', { schemaVersion: 0 }, store);
    expect(await repo.runMigrations()).toMatchObject({ ok: false, error: /No storage migration/ });
    await set('meta', { schemaVersion: 5 }, store);
    expect(await repo.runMigrations()).toMatchObject({ ok: false, error: /newer version/ });
    await set('meta', 'garbage', store);
    expect(await repo.runMigrations()).toMatchObject({ ok: false, from: undefined });
  });
});

describe('PIN', () => {
  it('accepts only 4 to 8 digits', () => {
    expect(['1234', '12345678'].every(isValidPin)).toBe(true);
    expect(['123', '123456789', '12a4', ' 1234', '١٢٣٤'].some(isValidPin)).toBe(false);
  });

  it('hashes with a random salt and verifies', async () => {
    const a = await hashPin('2468');
    const b = await hashPin('2468');
    expect(a.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(await verifyPin('2468', a.hash, a.salt)).toBe(true);
    expect(await verifyPin('2469', a.hash, a.salt)).toBe(false);
    expect(await verifyPin('24', a.hash, a.salt)).toBe(false);
    expect(await verifyPin('2468', a.hash, 'zz')).toBe(false);
  });

  it('is deterministic for a given salt', async () => {
    const salt = '00112233445566778899aabbccddeeff';
    const first = await hashPin('1234', salt);
    expect(first.salt).toBe(salt);
    expect((await hashPin('1234', salt)).hash).toBe(first.hash);
  });

  it('rejects bad PINs and salts when hashing', async () => {
    await expect(hashPin('12')).rejects.toThrow(/4 to 8 digits/);
    await expect(hashPin('1234', 'abc')).rejects.toThrow(/Salt/);
  });
});
