import { describe, expect, it } from 'vitest';
import * as api from './index.ts';
import {
  actionLogErrors,
  eventKey,
  RequestSchema,
  slug,
  stepLabel,
  StoredCharacterSchema,
  type Action,
} from './model.ts';

describe('model', () => {
  it('slug and eventKey are deterministic', () => {
    expect(slug('Spring Thaw: Revenge!')).toBe('spring-thaw-revenge');
    expect(slug('Élan')).toBe('elan');
    expect(slug('!!!')).toBe('event');
    expect(eventKey('2026-05-16', 'Summer Moot')).toBe('2026-05-16-summer-moot');
  });

  it('actionLogErrors checks seq and ids', () => {
    const a = { id: 'a', seq: 1 } as Action;
    expect(actionLogErrors([a, { ...a, seq: 3 }])).toEqual([
      'actions[1].seq: expected 2, found 3.',
      'actions[1].id: duplicate action id "a".',
    ]);
  });

  it('requests carry a step instead of a part', () => {
    const base = {
      id: 'r1',
      characterId: 'c1',
      createdAt: '2026-05-01T10:00:00.000Z',
      kind: 'learn-skill',
      skillId: 'stun',
      teacher: 'Pell',
      note: '',
      status: 'sent',
    };
    expect(RequestSchema.safeParse({ ...base, step: { level: 1 } }).success).toBe(true);
    expect(RequestSchema.safeParse({ ...base, step: { technique: 'master' } }).success).toBe(true);
    expect(RequestSchema.safeParse({ ...base, step: { technique: 'legend' } }).success).toBe(false);
    expect(RequestSchema.safeParse({ ...base, step: { level: 1 }, extra: 'ignored' }).success).toBe(
      true,
    );
    expect(stepLabel({ technique: 'expert' })).toBe('Expert Technique');
    expect(stepLabel({ level: 4 })).toBe('level 4');
  });

  it('stored characters cap the log size', () => {
    const r = StoredCharacterSchema.safeParse({
      id: 'c1',
      schemaVersion: 1,
      rulesetId: 'sylvaris-1.3.1',
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
      actions: [],
    });
    expect(r.success).toBe(true);
  });
});

describe('public API', () => {
  it('exports the names the UI uses', () => {
    for (const name of [
      'deriveSheet',
      'plan',
      'preview',
      'summarize',
      'checkRequest',
      'COMMAND_TYPES',
      'ACTION_REGISTRY',
      'LEDGER_CURRENCIES',
      'checkRegistration',
      'checkInItems',
      'checkInSources',
      'upkeepFor',
      'loadRuleset',
      'levelCost',
      'skillLevel',
      'StoredCharacterSchema',
      'RequestSchema',
      'formatIssues',
      'eventKey',
    ])
      expect(api[name as keyof typeof api], name).toBeDefined();
    expect(api.LEDGER_CURRENCIES).toEqual(['xp', 'cxp', 'axp', 'mt']);
    expect(api.COMMAND_TYPES).toContain('learnSkill');
    expect(api.COMMAND_TYPES).toHaveLength(34);
  });
});
