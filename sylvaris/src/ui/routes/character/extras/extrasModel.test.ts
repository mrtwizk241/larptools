import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset } from '../../../../engine/index.ts';
import { ash, ashAfter } from '../../../test/veteran.ts';
import {
  awakenLines,
  labelFromId,
  nextSlotText,
  powerName,
  removalUsed,
  slotsText,
  trickSlots,
} from './extrasModel.ts';

const ruleset = loadRuleset();

describe('Artifact display', () => {
  it('makes a readable label from an id when the data has no name', () => {
    expect(labelFromId('art-basic-skill-use')).toBe('Basic skill use');
    expect(powerName(ruleset, 'not-a-power')).toBe('Not a power');
    expect(powerName(ruleset, 'art-language').length).toBeGreaterThan(0);
  });

  it('shows what awakening needs', () => {
    const sheet = deriveSheet(ruleset, ash().actions);
    expect(awakenLines(ruleset, sheet)).toEqual([
      { met: true, text: 'XP earned: 510 (needs 500).' },
      { met: true, text: 'AXP available: 6 (needs 5).' },
    ]);
  });

  it('shows slots used, free, and unlocked, and the next slot cost', () => {
    const awakened = deriveSheet(
      ruleset,
      ashAfter([{ type: 'awakenArtifact', name: 'Oath Ring' }]).actions,
    ).artifact;
    if (!awakened) throw new Error('not awakened');
    expect(slotsText(awakened)).toBe('0 of 1 unlocked slot used, 1 free. 1 of 10 slots unlocked.');
    expect(nextSlotText(awakened)).toBe('Next slot: 5 AXP.');
    const withPower = deriveSheet(
      ruleset,
      ashAfter([
        { type: 'awakenArtifact', name: 'Oath Ring' },
        { type: 'setArtifactPower', powerId: 'art-language', choice: 'Elvish' },
      ]).actions,
    ).artifact;
    if (!withPower) throw new Error('not awakened');
    expect(slotsText(withPower)).toBe('1 of 1 unlocked slot used, 0 free. 1 of 10 slots unlocked.');
    expect(removalUsed(ruleset, withPower, '2026')).toBe(false);
  });

  it('gives trick slots by familiar quality', () => {
    expect(trickSlots(ruleset, 'basic')).toBe(1);
    expect(trickSlots(ruleset, 'grandmaster')).toBe(4);
  });
});
