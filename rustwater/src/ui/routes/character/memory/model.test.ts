import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset, plan, type Command } from '../../../../engine/index.ts';
import type { Action } from '../../../../engine/model.ts';
import { lark } from './testCharacter.ts';
import {
  hasAccess,
  matchesSearch,
  pickerItems,
  poolBreakdown,
  poolSummary,
  unlockText,
  visiblePools,
} from './model.ts';

const rs = loadRuleset();

/** Lark (Life Magic 2, Engineering 1) plus `commands`, as a derived sheet. */
function sheetWith(...commands: Command[]) {
  const actions: Action[] = [...lark().actions];
  let n = 0;
  for (const command of commands) {
    const result = plan(rs, deriveSheet(rs, actions), command, {
      actor: { role: 'staff' },
      now: () => '2026-11-01T10:00:00.000Z',
      newId: () => `test-${++n}`,
      nextSeq: actions.length + 1,
    });
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' '));
    actions.push(...result.actions);
  }
  return deriveSheet(rs, actions);
}

describe('memory picker', () => {
  it('lists only spells of the schools and ranks the character knows, with the pool', () => {
    const items = pickerItems(rs, sheetWith(), 'spell');
    expect(items.map((i) => i.name)).toEqual([
      'Amplify Healing',
      'Bolster Toughness',
      'Health Spring',
      'Invigorate Spirit',
      'Life Bolt',
    ]);
    expect(items.every((i) => i.detail === 'Basic, Life')).toBe(true);
    expect(items.every((i) => i.pool?.pool === 'spell-life' && !i.needsSlot)).toBe(true);
  });

  it('filters by search words, ignoring case', () => {
    expect(pickerItems(rs, sheetWith(), 'spell', 'BOLT').map((i) => i.refId)).toEqual([
      'life-bolt',
    ]);
    expect(pickerItems(rs, sheetWith(), 'spell', 'life spring')).toHaveLength(1);
    expect(pickerItems(rs, sheetWith(), 'spell', 'elemental')).toEqual([]);
    expect(matchesSearch({ name: 'Life Bolt', detail: 'Basic, Life' }, '  ')).toBe(true);
  });

  it('drops memorized items and points at the universal pool once the school is full', () => {
    const sheet = sheetWith(
      { type: 'memorize', kind: 'spell', refId: 'life-bolt' },
      { type: 'memorize', kind: 'spell', refId: 'health-spring' },
    );
    const items = pickerItems(rs, sheet, 'spell');
    expect(items.map((i) => i.refId)).not.toContain('life-bolt');
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.needsSlot && i.pool?.pool === 'spell-universal')).toBe(true);
  });

  it('recipes follow the crafts known; mastery recipes need their mastery skill', () => {
    const items = pickerItems(rs, sheetWith(), 'recipe');
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.detail === 'Basic, Engineering')).toBe(true);
  });

  it('access and unlock text per tab', () => {
    const sheet = sheetWith();
    expect(hasAccess(rs, sheet, 'spell')).toBe(true);
    expect(hasAccess(rs, sheet, 'recipe')).toBe(true);
    expect(hasAccess(rs, sheet, 'performance')).toBe(false);
    expect(hasAccess(rs, sheet, 'ritual')).toBe(false);
    expect(hasAccess(rs, sheet, 'knowledge')).toBe(true);
    expect(pickerItems(rs, sheet, 'performance')).toEqual([]);
    expect(unlockText(rs, 'spell')).toBe(
      'Learn a magic school (Elemental Magic, Life Magic, Death Magic, or Tech Magic) to memorize spells.',
    );
    expect(unlockText(rs, 'performance')).toBe(
      'Learn Bardic Performance to memorize performances.',
    );
    expect(unlockText(rs, 'ritual')).toBe('Learn Ritualism to memorize rituals.');
  });

  it('pool summaries and breakdowns', () => {
    const sheet = sheetWith({ type: 'memorize', kind: 'spell', refId: 'life-bolt' });
    const pools = visiblePools(sheet, 'spell', true);
    expect(pools.map(poolSummary)).toEqual(['Life: 1 of 2 used', 'Universal: 0 of 0 used']);
    const [life, universal] = pools;
    if (!life || !universal) throw new Error('missing pools');
    expect(poolBreakdown(rs, life)).toEqual(['2 from basic levels']);
    expect(poolBreakdown(rs, universal)).toEqual([]);
    expect(visiblePools(sheet, 'performance', false)).toEqual([]);
  });
});
