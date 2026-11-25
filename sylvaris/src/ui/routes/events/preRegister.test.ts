import { describe, expect, it } from 'vitest';
import { loadRuleset } from '../../../engine/index.ts';
import { ash, ASH_LATEST_EVENT } from '../../test/veteran.ts';
import { checkedInKeys, preRegisterBlock } from './preRegister.ts';

// Acceptance AC-6.
describe('pre-registration is offered', () => {
  const event = { key: '2026-11-21-frost-vigil', date: '2026-11-21' };

  it('for events today or later only', () => {
    expect(preRegisterBlock(event, new Set(), '2026-11-08')).toBeNull();
    expect(preRegisterBlock(event, new Set(), '2026-11-21')).toBeNull();
    expect(preRegisterBlock(event, new Set(), '2026-11-22')).toBe('This event is over.');
  });

  it('not for an event the character is checked in to', () => {
    expect(preRegisterBlock(event, new Set([event.key]), '2026-11-08')).toBe(
      'Already checked in to this event.',
    );
    const keys = checkedInKeys(loadRuleset(), ash());
    expect(keys.has(ASH_LATEST_EVENT)).toBe(true);
  });
});
