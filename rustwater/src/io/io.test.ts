import { describe, expect, it } from 'vitest';
import miraText from '../../tests/fixtures/characters/sample-mira.rwchar.json?raw';
import tomText from '../../tests/fixtures/characters/sample-tom.rwchar.json?raw';
import type { Action, LearnSkillRequest, Request, StoredCharacter } from '../engine/model.ts';
import {
  MAX_IMPORT_BYTES,
  buildBackupFile,
  buildCharacterFile,
  buildRequestsFile,
  decideCharacterImport,
  fileNameFor,
  parseAnyFile,
  parseBackupFile,
  parseCharacterFile,
  parseRequestsFile,
  readImportFile,
  serializeFile,
} from './index.ts';

const NOW = () => new Date('2026-06-01T12:00:00.000Z');

const CREATED_PAYLOAD = {
  characterName: 'Mara Vex',
  playerName: 'Invented Player',
  ancestryId: 'test-ancestry',
  subtypeId: 'test-subtype',
  extraInfection: 0,
};

function action(seq: number, id = `act-${seq}`): Action {
  return {
    id,
    seq,
    at: '2026-05-16T10:00:00.000Z',
    actor: { role: 'staff' },
    type: seq === 1 ? 'character.created' : 'points.awarded',
    payload:
      seq === 1
        ? { ...CREATED_PAYLOAD }
        : { currency: 'cxp', amount: seq, kind: 'event-attendance' },
  };
}

function character(id = 'c1', actionCount = 2): StoredCharacter {
  return {
    id,
    schemaVersion: 1,
    rulesetId: '2026-2.0',
    createdAt: '2026-05-16T10:00:00.000Z',
    updatedAt: '2026-05-16T10:00:00.000Z',
    actions: Array.from({ length: actionCount }, (_, i) => action(i + 1)),
  };
}

function request(id: string, characterId = 'c1'): Request {
  return {
    id,
    characterId,
    createdAt: '2026-05-17T09:00:00.000Z',
    kind: 'learn-skill',
    skillId: 'first-aid',
    part: 'basic',
    toLevel: 1,
    teacher: 'Old Mags',
    note: 'Taught at the well',
    status: 'sent',
  };
}

function characterJson(overrides: Record<string, unknown> = {}): string {
  const file = buildCharacterFile(character(), { appVersion: '0.1.0', now: NOW });
  return JSON.stringify({ ...file, ...overrides });
}

function errorsOf(result: { ok: boolean; errors?: string[] }): string[] {
  expect(result.ok).toBe(false);
  return result.errors ?? [];
}

describe('character files', () => {
  it('round trips through build, serialize, and parse', () => {
    const file = buildCharacterFile(character(), { appVersion: '0.1.0', now: NOW });
    expect(file).toMatchObject({
      format: 'rustwater-character',
      formatVersion: 1,
      exportedAt: '2026-06-01T12:00:00.000Z',
    });
    const parsed = parseCharacterFile(serializeFile(file));
    expect(parsed).toEqual({ ok: true, value: file });
  });

  it('rejects files over 5 MB before parsing', () => {
    const huge = `{"pad":"${'x'.repeat(MAX_IMPORT_BYTES)}"}`;
    expect(errorsOf(parseCharacterFile(huge))[0]).toMatch(/too large.*limit is 5 MB/);
    // Multi-byte characters count as bytes, not characters.
    const wide = `"${'é'.repeat(Math.ceil(MAX_IMPORT_BYTES / 2) + 10)}"`;
    expect(wide.length).toBeLessThan(MAX_IMPORT_BYTES);
    expect(errorsOf(parseCharacterFile(wide))[0]).toMatch(/too large/);
  });

  it('rejects a blob over 5 MB without reading it', async () => {
    const big = { size: MAX_IMPORT_BYTES + 1, text: () => Promise.reject(new Error('read')) };
    expect(errorsOf(await readImportFile(big as unknown as Blob))[0]).toMatch(/too large/);
    const small = new Blob(['{"a":1}']);
    expect(await readImportFile(small)).toEqual({ ok: true, value: '{"a":1}' });
  });

  it('rejects text that is not JSON, or not an object', () => {
    expect(errorsOf(parseCharacterFile('{not json'))).toEqual(['The file is not valid JSON.']);
    expect(errorsOf(parseCharacterFile('[1,2]'))[0]).toMatch(/Rustwater data object/);
    expect(errorsOf(parseCharacterFile('null'))[0]).toMatch(/Rustwater data object/);
  });

  it('rejects the wrong format with a clear message', () => {
    expect(errorsOf(parseCharacterFile(characterJson({ format: 'rustwater-requests' })))).toEqual([
      'This is a Rustwater requests file, not a character file.',
    ]);
    expect(errorsOf(parseCharacterFile(characterJson({ format: 'something-else' })))).toEqual([
      'This is not a Rustwater character file.',
    ]);
  });

  it('rejects missing, newer, and older format versions', () => {
    expect(errorsOf(parseCharacterFile(characterJson({ formatVersion: '1' })))[0]).toMatch(
      /no valid formatVersion/,
    );
    expect(errorsOf(parseCharacterFile(characterJson({ formatVersion: 2 })))[0]).toMatch(
      /newer version of the app/,
    );
    expect(errorsOf(parseCharacterFile(characterJson({ formatVersion: 0 })))[0]).toMatch(
      /not supported/,
    );
  });

  it('reports schema errors with their path', () => {
    const bad = character();
    const text = characterJson({
      character: { ...bad, actions: [{ ...action(1), seq: 'one' }] },
    });
    expect(errorsOf(parseCharacterFile(text))[0]).toMatch(/^character\.actions\[0\]\.seq: /);
  });

  it('rejects seq numbers that are not 1..n in order', () => {
    const text = characterJson({ character: { ...character(), actions: [action(1), action(3)] } });
    expect(errorsOf(parseCharacterFile(text))).toEqual([
      'character.actions[1].seq: expected 2, found 3.',
    ]);
    const swapped = characterJson({
      character: { ...character(), actions: [action(2), action(1)] },
    });
    expect(errorsOf(parseCharacterFile(swapped))).toHaveLength(2);
  });

  it('rejects duplicate action ids', () => {
    const text = characterJson({
      character: { ...character(), actions: [action(1, 'x'), action(2, 'x')] },
    });
    expect(errorsOf(parseCharacterFile(text))).toEqual([
      'character.actions[1].id: duplicate action id "x".',
    ]);
  });

  it('rejects characters from a newer schema version', () => {
    const text = characterJson({ character: { ...character(), schemaVersion: 2 } });
    expect(errorsOf(parseCharacterFile(text))[0]).toMatch(/newer version/);
  });

  it('strips unknown fields at every level, payloads included', () => {
    const c = character();
    const text = characterJson({
      evil: '<script>',
      character: {
        ...c,
        settings: { pinHash: 'x' },
        actions: [{ ...action(1), extra: 1, actor: { role: 'staff', hat: 'big' } }, action(2)],
      },
    });
    const result = parseCharacterFile(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toHaveProperty('evil');
    expect(result.value.character).not.toHaveProperty('settings');
    expect(result.value.character.actions[0]).not.toHaveProperty('extra');
    expect(result.value.character.actions[0]?.actor).toEqual({ role: 'staff' });
    expect(result.value.character.actions[0]?.payload).toEqual(CREATED_PAYLOAD);
  });

  it('strips unknown payload keys, including __proto__ and constructor', () => {
    const json = characterJson().replace(
      '"kind":"event-attendance"',
      '"kind":"event-attendance","bonus":999,"__proto__":{"polluted":true},"constructor":{"x":1}',
    );
    expect(json).toContain('"bonus":999');
    const result = parseCharacterFile(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const payload = result.value.character.actions[1]?.payload;
    expect(payload).toEqual({ currency: 'cxp', amount: 2, kind: 'event-attendance' });
    expect(Object.keys(payload as object)).toEqual(['currency', 'amount', 'kind']);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('trims payload strings to the schema parse output', () => {
    const c = character();
    c.actions[0] = { ...action(1), payload: { ...CREATED_PAYLOAD, characterName: '  Mara Vex ' } };
    const result = parseCharacterFile(characterJson({ character: c }));
    expect(result.ok && result.value.character.actions[0]?.payload).toEqual(CREATED_PAYLOAD);
  });

  it('rejects a bad payload, naming the action seq and type', () => {
    const c = character('c1', 3);
    c.actions[2] = { ...action(3), payload: { currency: 'gold', amount: -5 } };
    const errors = errorsOf(parseCharacterFile(characterJson({ character: c })));
    expect(errors.length).toBeGreaterThan(0);
    for (const line of errors) {
      expect(line.startsWith('character.actions[2], seq 3 (points.awarded): payload.')).toBe(true);
    }
    expect(errors.join(' ')).toMatch(/payload\.currency/);
  });

  it('drops deeply nested data under an unknown payload key, so the result can be cloned', () => {
    const depth = 100_000;
    const json = characterJson().replace(
      '"kind":"event-attendance"',
      `"kind":"event-attendance","junk":${'['.repeat(depth)}${']'.repeat(depth)}`,
    );
    const result = parseCharacterFile(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.character.actions[1]?.payload).not.toHaveProperty('junk');
    expect(() => structuredClone(result.value)).not.toThrow();
    expect(() => JSON.stringify(result.value)).not.toThrow();
  });

  it('lists at most ten failing actions and counts the rest', () => {
    const c = character('c1', 15);
    c.actions = c.actions.map((a) => (a.seq === 1 ? a : { ...a, payload: {} }));
    const errors = errorsOf(parseCharacterFile(characterJson({ character: c })));
    expect(errors.length).toBeLessThanOrEqual(21);
    expect(errors.at(-1)).toMatch(/more (problems|actions with invalid payloads)\.$/);
  });

  it('rejects an oversized action array quickly with one clear message', () => {
    const base = JSON.parse(characterJson()) as { character: Record<string, unknown> };
    const text = JSON.stringify({
      ...base,
      character: { ...base.character, actions: new Array(2_600_000).fill(0) },
    });
    expect(text.length).toBeLessThan(MAX_IMPORT_BYTES);
    // Time the validation only: JSON.parse of 5 MB is the same for any file of that size.
    const jsonStart = performance.now();
    JSON.parse(text);
    const jsonMs = performance.now() - jsonStart;
    const start = performance.now();
    const errors = errorsOf(parseCharacterFile(text));
    const elapsed = performance.now() - start - jsonMs;
    expect(errors).toEqual(['character.actions: At most 10,000 actions per character.']);
    expect(elapsed).toBeLessThan(50);
  });

  it('parses the sample fixtures and is idempotent on them', () => {
    for (const [name, text] of [
      ['mira', miraText],
      ['tom', tomText],
    ] as const) {
      const first = parseCharacterFile(text);
      expect(first.ok, name).toBe(true);
      if (!first.ok) continue;
      const second = parseCharacterFile(serializeFile(first.value));
      expect(second).toEqual(first);
      const local = first.value.character;
      expect(decideCharacterImport(local, JSON.parse(text).character as StoredCharacter)).toEqual({
        kind: 'same',
      });
    }
  });

  it('refuses to build an invalid file', () => {
    const broken = { ...character(), actions: [action(2)] };
    expect(() => buildCharacterFile(broken, { appVersion: '0.1.0' })).toThrow(/Cannot export/);
  });
});

describe('requests files', () => {
  it('round trips', () => {
    const file = buildRequestsFile(
      { characterId: 'c1', characterName: 'Mara Vex', requests: [request('r1'), request('r2')] },
      { now: NOW },
    );
    expect(parseRequestsFile(serializeFile(file))).toEqual({ ok: true, value: file });
  });

  it('keeps the archetype of a multi-archetype request, and old files without one stay valid', () => {
    const bard: LearnSkillRequest = {
      ...(request('r1') as LearnSkillRequest),
      skillId: 'bardic-performance',
      archetype: 'magic',
    };
    const file = buildRequestsFile(
      { characterId: 'c1', characterName: 'Mara Vex', requests: [bard, request('r2')] },
      { now: NOW },
    );
    const parsed = parseRequestsFile(serializeFile(file));
    expect(parsed).toEqual({ ok: true, value: file });
    expect(
      parsed.ok &&
        parsed.value.requests.map((r) => (r.kind === 'learn-skill' ? r.archetype : undefined)),
    ).toEqual(['magic', undefined]);
    expect('archetype' in (parsed.ok ? parsed.value.requests[1]! : {})).toBe(false);
  });

  it('rejects an archetype that is not an id', () => {
    const base = buildRequestsFile({ characterId: 'c1', characterName: 'Mara', requests: [] });
    const text = JSON.stringify({
      ...base,
      requests: [{ ...request('r1'), archetype: 'Magic <b>' }],
    });
    expect(errorsOf(parseRequestsFile(text))).toEqual([
      'requests[0].archetype: Must be an archetype id such as "magic".',
    ]);
  });

  it('rejects duplicate ids and requests for another character', () => {
    const base = buildRequestsFile({ characterId: 'c1', characterName: 'Mara', requests: [] });
    const text = JSON.stringify({ ...base, requests: [request('r1'), request('r1', 'c2')] });
    expect(errorsOf(parseRequestsFile(text))).toEqual([
      "requests[1].characterId: does not match the file's character.",
      'requests: duplicate request id "r1".',
    ]);
  });

  it('rejects more than 500 requests with one message', () => {
    const base = buildRequestsFile({ characterId: 'c1', characterName: 'Mara', requests: [] });
    const text = JSON.stringify({ ...base, requests: new Array(501).fill(0) });
    expect(errorsOf(parseRequestsFile(text))).toEqual(['requests: At most 500 requests per file.']);
  });

  it('rejects a character file passed as requests', () => {
    expect(errorsOf(parseRequestsFile(characterJson()))[0]).toBe(
      'This is a Rustwater character file, not a requests file.',
    );
  });
});

describe('backup files', () => {
  const event = { key: '2026-05-16-spring-thaw', name: 'Spring Thaw', date: '2026-05-16' };

  it('round trips and never carries settings', () => {
    const input = {
      characters: [character('c1'), character('c2')],
      events: [event],
      settings: { mode: 'staff', pinHash: 'a'.repeat(64) },
    };
    const file = buildBackupFile(input, { now: NOW });
    expect(file).not.toHaveProperty('settings');
    expect(serializeFile(file)).not.toMatch(/pinHash|pinSalt/);
    expect(parseBackupFile(serializeFile(file))).toEqual({ ok: true, value: file });
  });

  it('strips settings from an imported backup', () => {
    const file = buildBackupFile({ characters: [], events: [] });
    const result = parseBackupFile(JSON.stringify({ ...file, settings: { pinHash: 'x' } }));
    expect(result.ok && result.value).not.toHaveProperty('settings');
  });

  it('caps characters and events at 1,000 each', () => {
    const file = buildBackupFile({ characters: [], events: [] });
    const text = JSON.stringify({
      ...file,
      characters: new Array(1_001).fill(0),
      events: new Array(1_001).fill(0),
    });
    expect(errorsOf(parseBackupFile(text))).toEqual([
      'characters: At most 1,000 characters per backup.',
      'events: At most 1,000 events per backup.',
    ]);
  });

  it('rejects a bad payload inside a backup, naming the character, seq, and type', () => {
    const file = buildBackupFile({ characters: [], events: [] });
    const bad = character('c2', 2);
    bad.actions[1] = { ...action(2), payload: { currency: 'cxp', amount: 0, kind: 'x' } };
    const text = JSON.stringify({ ...file, characters: [character('c1'), bad] });
    expect(errorsOf(parseBackupFile(text))[0]).toMatch(
      /^characters\[1\]\.actions\[1\], seq 2 \(points\.awarded\): payload\.amount: /,
    );
  });

  it('rejects duplicate character ids, duplicate events, and bad logs inside', () => {
    const file = buildBackupFile({ characters: [], events: [] });
    const text = JSON.stringify({
      ...file,
      characters: [character('c1'), { ...character('c1'), actions: [action(2)] }],
      events: [event, event],
    });
    expect(errorsOf(parseBackupFile(text))).toEqual([
      'characters[1].actions[0].seq: expected 1, found 2.',
      'characters: duplicate character id "c1".',
      'events: duplicate event key "2026-05-16-spring-thaw".',
    ]);
  });
});

describe('parseAnyFile', () => {
  it('detects each format', () => {
    const r = parseAnyFile(characterJson());
    expect(r.ok && r.value.kind).toBe('character');
    const backup = serializeFile(buildBackupFile({ characters: [], events: [] }));
    const b = parseAnyFile(backup);
    expect(b.ok && b.value.kind).toBe('backup');
    const reqs = serializeFile(
      buildRequestsFile({ characterId: 'c1', characterName: 'M', requests: [] }),
    );
    const q = parseAnyFile(reqs);
    expect(q.ok && q.value.kind).toBe('requests');
    expect(errorsOf(parseAnyFile('{"format":"zip"}'))).toEqual(['This is not a Rustwater file.']);
  });
});

describe('fileNameFor', () => {
  it.each([
    ['Mara Vex', 'character', 'Mara-Vex.rwchar.json'],
    ['../../etc/passwd', 'character', 'etc-passwd.rwchar.json'],
    ['C:\\Windows\\evil:name?.exe', 'character', 'C-Windows-evil-name-exe.rwchar.json'],
    ['Zoë Ångström', 'requests', 'Zoe-Angstrom.rwreq.json'],
    ['🔥🔥', 'character', 'character.rwchar.json'],
    ['', 'backup', 'rustwater-backup.rwbackup.json'],
    ['con', 'character', 'con-file.rwchar.json'],
    ['...hidden', 'character', 'hidden.rwchar.json'],
  ] as const)('%s -> %s', (name, kind, expected) => {
    expect(fileNameFor(kind, name)).toBe(expected);
  });

  it('caps long names', () => {
    const name = fileNameFor('character', 'a'.repeat(300));
    expect(name).toBe(`${'a'.repeat(60)}.rwchar.json`);
  });
});

describe('decideCharacterImport', () => {
  it('saves a new character', () => {
    expect(decideCharacterImport(undefined, character())).toEqual({ kind: 'new' });
  });

  it('does nothing for an identical log', () => {
    expect(decideCharacterImport(character('c1', 3), character('c1', 3))).toEqual({
      kind: 'same',
    });
  });

  it('replaces when the incoming log extends the local one, listing the added actions', () => {
    const incoming = character('c1', 5);
    expect(decideCharacterImport(character('c1', 2), incoming)).toEqual({
      kind: 'replace',
      added: 3,
      addedActions: incoming.actions.slice(2),
      fromPrefix: true,
    });
  });

  it('lists exactly the appended actions, with actor and note, on the replace path', () => {
    const local = character('c1', 2);
    const forged: Action = {
      ...action(3),
      actor: { role: 'staff', name: 'Any Name' },
      note: 'Bonus',
    };
    const decision = decideCharacterImport(local, {
      ...local,
      actions: [...local.actions, forged],
    });
    expect(decision.kind).toBe('replace');
    if (decision.kind !== 'replace') return;
    expect(decision.fromPrefix).toBe(true);
    expect(decision.added).toBe(1);
    expect(decision.addedActions).toEqual([forged]);
  });

  it('treats payloads that differ only in key order, trimming, or unknown keys as the same', () => {
    const local = character('c1', 2);
    const incoming = character('c1', 2);
    local.actions[0] = {
      ...action(1),
      payload: {
        extraInfection: 0,
        subtypeId: 'test-subtype',
        ancestryId: 'test-ancestry',
        playerName: ' Invented Player ',
        characterName: 'Mara Vex',
      },
    };
    incoming.actions[1] = {
      ...action(2),
      payload: { kind: 'event-attendance', amount: 2, currency: 'cxp', junk: true },
    };
    expect(decideCharacterImport(local, incoming)).toEqual({ kind: 'same' });
  });

  it('asks when the local copy is ahead', () => {
    expect(decideCharacterImport(character('c1', 5), character('c1', 2))).toEqual({
      kind: 'conflict',
      reason: 'local-newer',
      localCount: 5,
      incomingCount: 2,
      sharedCount: 2,
    });
  });

  it('asks when the logs diverge, even if the incoming one is longer', () => {
    const local = character('c1', 3);
    const incoming = character('c1', 4);
    incoming.actions[1] = { ...action(2), id: 'other' };
    expect(decideCharacterImport(local, incoming)).toEqual({
      kind: 'conflict',
      reason: 'diverged',
      localCount: 3,
      incomingCount: 4,
      sharedCount: 1,
    });
  });

  it('throws when the ids differ', () => {
    expect(() => decideCharacterImport(character('a'), character('b'))).toThrow();
  });
});
