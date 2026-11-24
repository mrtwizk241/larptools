import { describe, expect, it } from 'vitest';
import {
  ActionSchema,
  CURRENT_SCHEMA_VERSION,
  EventKeySchema,
  SettingsSchema,
  StoredCharacterSchema,
  actionLogErrors,
  eventKey,
  slug,
  type Action,
} from './model.ts';

function action(seq: number, id = `a${seq}`): Action {
  return {
    id,
    seq,
    at: '2026-05-16T10:00:00.000Z',
    actor: { role: 'staff' },
    type: 'points.awarded',
    payload: { currency: 'cxp', amount: 75 },
  };
}

describe('model', () => {
  it('starts at schema version 1', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });

  it('builds deterministic lowercase ascii event keys', () => {
    expect(eventKey('2026-05-16', 'Spring Thaw')).toBe('2026-05-16-spring-thaw');
    expect(eventKey('2026-05-16', '  Spring   Thaw!! ')).toBe('2026-05-16-spring-thaw');
    expect(eventKey('2026-07-01', 'Fête du Rouillé')).toBe('2026-07-01-fete-du-rouille');
    expect(eventKey('2026-07-01', '☂☂☂')).toBe('2026-07-01-event');
    expect(EventKeySchema.safeParse(eventKey('2026-07-01', 'x'.repeat(500))).success).toBe(true);
  });

  it('caps slugs at 60 characters without a trailing dash', () => {
    const s = slug(`${'a'.repeat(59)} b`);
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith('-')).toBe(false);
  });

  it('strips unknown fields from actions and keeps the payload as is', () => {
    const parsed = ActionSchema.parse({ ...action(1), extra: 'drop me' });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed.payload).toEqual({ currency: 'cxp', amount: 75 });
  });

  it('rejects unknown action types and unsafe ids', () => {
    expect(ActionSchema.safeParse({ ...action(1), type: 'nope' }).success).toBe(false);
    expect(ActionSchema.safeParse({ ...action(1), id: '../x' }).success).toBe(false);
  });

  it('accepts a minimal stored character', () => {
    const result = StoredCharacterSchema.safeParse({
      id: 'c1',
      schemaVersion: 1,
      rulesetId: '2026-2.0',
      createdAt: '2026-05-16T10:00:00.000Z',
      updatedAt: '2026-05-16T10:00:00.000Z',
      actions: [action(1)],
    });
    expect(result.success).toBe(true);
  });

  it('reports seq gaps and duplicate ids in an action log', () => {
    expect(actionLogErrors([action(1), action(2)])).toEqual([]);
    expect(actionLogErrors([action(1), action(3)])).toEqual([
      'actions[1].seq: expected 2, found 3.',
    ]);
    expect(actionLogErrors([action(1), action(2, 'a1')])).toEqual([
      'actions[1].id: duplicate action id "a1".',
    ]);
  });

  it('validates settings pin fields', () => {
    expect(SettingsSchema.safeParse({ mode: 'staff', theme: 'dark' }).success).toBe(true);
    expect(SettingsSchema.safeParse({ mode: 'staff', theme: 'dark', pinHash: 'zz' }).success).toBe(
      false,
    );
  });
});
