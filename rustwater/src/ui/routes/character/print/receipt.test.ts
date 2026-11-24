import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset, type Sheet } from '../../../../engine/index.ts';
import type { StoredCharacter } from '../../../../engine/model.ts';
import { ASH_LATEST_EVENT, ash, ashAfter } from '../../../test/veteran.ts';
import { buildReceipt, latestEventKey, receiptEvents } from './receipt.ts';
import { printAsh } from './testCharacter.ts';

const ruleset = loadRuleset();
const sheetOf = (c: StoredCharacter): Sheet => deriveSheet(ruleset, c.actions);

describe('receipt events', () => {
  it('lists check-ins newest first and picks the latest', () => {
    const sheet = sheetOf(ash());
    expect(receiptEvents(sheet).map((e) => e.name)).toEqual([
      'Harvest Moon',
      'Long Summer',
      'Spring Flood',
      'Thaw Market',
    ]);
    expect(latestEventKey(sheet)).toBe(ASH_LATEST_EVENT);
  });

  it('has no latest event before any check-in', () => {
    const sheet = sheetOf(ash());
    expect(latestEventKey({ ...sheet, events: [] })).toBeNull();
  });
});

describe('buildReceipt', () => {
  it('assembles awards, Shiny purchases, items owed, and upkeep for one event', () => {
    const receipt = buildReceipt(ruleset, sheetOf(printAsh()), ASH_LATEST_EVENT);
    expect(receipt).not.toBeNull();
    if (!receipt) return;
    expect(receipt.characterName).toBe('Ash Merrow');
    expect(receipt.playerName).toBe('Robin Vale');
    expect(receipt.event).toEqual({
      key: ASH_LATEST_EVENT,
      name: 'Harvest Moon',
      date: '2026-09-19',
    });
    expect(receipt.attendance).toBe('Player');
    expect(receipt.awards).toEqual([
      { label: 'Event CXP', currency: 'cxp', amount: 75 },
      { label: 'Event attendance', currency: 'fp', amount: 1 },
    ]);
    // Staff PXP recorded at the event; the Shiny CXP shows on its purchase line only.
    expect(receipt.otherPoints).toEqual([{ label: 'Staff work', currency: 'pxp', amount: 40 }]);
    expect(receipt.purchases).toEqual([
      {
        name: 'CXP',
        qty: 2,
        cost: 100,
        grants: [expect.objectContaining({ currency: 'cxp', amount: 2 })],
        items: [],
      },
      expect.objectContaining({ qty: 2, cost: 40, grants: [], items: [expect.any(String)] }),
    ]);
    expect(receipt.shiniesSpent).toBe(140);
    expect(receipt.owed).toEqual([{ text: '1 Spell Blueprint (Life Bolt)', delivered: false }]);
    // Six undelivered NPC bundles from the three earlier events.
    expect(receipt.owedEarlier).toHaveLength(6);
    expect(receipt.owedEarlier[0]?.eventName).toBe('Thaw Market');
    expect(receipt.upkeep).toEqual({
      due: true,
      text: 'Upkeep due: 2 Common resources or 10 Bits',
    });
  });

  it('shows capped NPC awards as credited and no upkeep at the first event', () => {
    const receipt = buildReceipt(ruleset, sheetOf(ash()), '2026-03-14-thaw-market');
    expect(receipt?.attendance).toBe('Full Event NPC (Paid)');
    expect(receipt?.awards.map((a) => `${a.currency} ${a.amount}`)).toEqual([
      'cxp 75',
      'cxp 5',
      'pxp 5',
      'shinies 500',
      'fp 1',
    ]);
    expect(receipt?.owed).toHaveLength(2);
    expect(receipt?.owedEarlier).toHaveLength(4);
    expect(receipt?.upkeep).toEqual({ due: false, text: 'No upkeep: first event.' });
    expect(receipt?.purchases).toEqual([]);
    expect(receipt?.shiniesSpent).toBe(0);
  });

  it('lists staff awards made at the event and upkeep covered with Shinies', () => {
    const character = ashAfter([
      { type: 'spendShinies', purchaseId: 'buy-upkeep', eventKey: ASH_LATEST_EVENT },
      {
        type: 'awardPoints',
        currency: 'pxp',
        amount: 3,
        kind: 'staff',
        eventKey: ASH_LATEST_EVENT,
      },
    ]);
    const receipt = buildReceipt(ruleset, sheetOf(character), ASH_LATEST_EVENT);
    expect(receipt?.upkeep).toEqual({
      due: false,
      covered: true,
      text: 'Upkeep covered (40 Shinies)',
    });
    expect(receipt?.otherPoints).toEqual([
      { label: 'Staff work', currency: 'pxp', amount: 40 },
      { label: 'Staff work', currency: 'pxp', amount: 3 },
    ]);
    expect(receipt?.purchases[0]).toMatchObject({ name: 'Upkeep Covered', cost: 40 });
  });

  it('charges no upkeep to ancestries that pay none', () => {
    const sheet = sheetOf(ash());
    const aware: Sheet = {
      ...sheet,
      ancestry: sheet.ancestry && { ...sheet.ancestry, ancestryId: 'aware', ancestryName: 'Aware' },
    };
    expect(buildReceipt(ruleset, aware, ASH_LATEST_EVENT)?.upkeep).toEqual({
      due: false,
      text: 'No upkeep: Aware pay none.',
    });
  });

  it('returns null for an event the character did not check in to', () => {
    expect(buildReceipt(ruleset, sheetOf(ash()), '2026-01-01-nope')).toBeNull();
  });
});
