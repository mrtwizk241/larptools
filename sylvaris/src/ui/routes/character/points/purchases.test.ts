import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset, plan } from '../../../../engine/index.ts';
import { ASH_EVENTS, ash, ashAfter } from '../../../test/veteran.ts';
import {
  awardKinds,
  capLeft,
  capText,
  forEventOptions,
  priceText,
  spendCommand,
  teachableSkills,
  type SpendForm,
} from './purchases.ts';

const ruleset = loadRuleset();
const purchase = (id: string) => {
  const p = ruleset.mtPurchasesById[id];
  if (!p) throw new Error(id);
  return p;
};
const [SPRING, , , , EMBER, HARVEST] = ASH_EVENTS.map((e) => e.key) as [
  string,
  string,
  string,
  string,
  string,
  string,
];
const FORM: SpendForm = {
  purchaseId: 'xp',
  qty: 1,
  namedLevel: '',
  skillId: '',
  eventKey: '',
  forEventKey: '',
  attended: null,
  note: '',
};

describe('price and cap text', () => {
  it('names the price per unit or per named level', () => {
    expect(priceText(purchase('xp'))).toBe('50 Mist Tokens each');
    expect(priceText(purchase('missed-event-xp'))).toBe('500 Mist Tokens');
    expect(priceText(purchase('spell-enhancement'))).toBe(
      'Basic 50, Expert 100, Master 150 Mist Tokens',
    );
  });

  it('counts what is left for the event and the year', () => {
    const rich = ashAfter([
      { type: 'awardPoints', currency: 'mt', amount: 2000, kind: 'donation' },
      { type: 'spendMt', purchaseId: 'xp', qty: 3, eventKey: HARVEST },
    ]);
    const sheet = deriveSheet(ruleset, rich.actions);
    const left = capLeft(ruleset, sheet, purchase('xp'), HARVEST);
    expect(left.perEvent).toEqual({ cap: 10, bought: 3, left: 7 });
    expect(capText(purchase('xp'), left)).toBe('10 per event; 7 left for this event.');
    expect(capText(purchase('xp'), capLeft(ruleset, sheet, purchase('xp'), null))).toBe(
      '10 per event: choose the event to see what is left.',
    );
    const alt = capLeft(ruleset, sheet, purchase('alt-character-event-xp'), HARVEST);
    expect(capText(purchase('alt-character-event-xp'), alt)).toBe('3 per year; 3 left in 2026.');
    // Teaching shares one cap between normal and advanced.
    expect(capLeft(ruleset, sheet, purchase('teaching-advanced'), HARVEST).perEvent?.left).toBe(1);
  });
});

describe('events a purchase may count for', () => {
  const sheet = deriveSheet(ruleset, ash().actions);
  const known = [
    ...ASH_EVENTS,
    { key: '2026-10-17-frost-court', name: 'Frost Court', date: '2026-10-17' },
    { key: '2025-10-18-old-moon', name: 'Old Moon', date: '2025-10-18' },
  ];

  it('back-buys: attended events of the same year, not the purchase event', () => {
    const keys = forEventOptions(purchase('xp'), sheet, known, HARVEST).map((e) => e.key);
    expect(keys).toContain(SPRING);
    expect(keys).not.toContain(HARVEST);
    expect(keys).not.toContain('2026-10-17-frost-court');
    expect(forEventOptions(purchase('xp'), sheet, known, '')).toEqual([]);
    expect(forEventOptions(purchase('copper'), sheet, known, HARVEST)).toEqual([]);
  });

  it('missed event XP: a known event of the same year without credit', () => {
    const keys = forEventOptions(purchase('missed-event-xp'), sheet, known, HARVEST).map(
      (e) => e.key,
    );
    expect(keys).toEqual(['2026-10-17-frost-court']);
  });
});

describe('spendCommand', () => {
  it('sends the purchase event with every back-buy', () => {
    const p = purchase('xp');
    expect(spendCommand(p, { ...FORM, qty: 2, eventKey: HARVEST, forEventKey: EMBER })).toEqual({
      type: 'spendMt',
      purchaseId: 'xp',
      qty: 2,
      eventKey: HARVEST,
      forEventKey: EMBER,
    });
    // No purchase event: the earlier event is not sent alone.
    expect(spendCommand(p, { ...FORM, forEventKey: EMBER })).toEqual({
      type: 'spendMt',
      purchaseId: 'xp',
      qty: 1,
    });
  });

  it('sends the attendance count with missed and alternate character XP', () => {
    const cmd = spendCommand(purchase('alt-character-event-xp'), {
      ...FORM,
      qty: 4,
      eventKey: HARVEST,
      forEventKey: '2026-10-17-frost-court',
      attended: 2,
    });
    expect(cmd).toMatchObject({
      qty: 1,
      eventKey: HARVEST,
      forEventKey: '2026-10-17-frost-court',
      playerEventsAttendedInYear: 2,
    });
  });

  it('a back-buy the form builds passes the engine', () => {
    const rich = ashAfter([
      { type: 'awardPoints', currency: 'mt', amount: 1000, kind: 'donation' },
    ]);
    const sheet = deriveSheet(ruleset, rich.actions);
    const cmd = spendCommand(purchase('xp'), {
      ...FORM,
      qty: 10,
      eventKey: HARVEST,
      forEventKey: EMBER,
    });
    const result = plan(ruleset, sheet, cmd, {
      actor: { role: 'staff' },
      now: () => '2026-09-19T21:00:00.000Z',
      newId: () => 'x',
      nextSeq: sheet.lastSeq + 1,
    });
    expect(result.ok).toBe(true);
  });

  it('teaching sends the skill and named level', () => {
    const cmd = spendCommand(purchase('teaching-normal'), {
      ...FORM,
      namedLevel: 'expert',
      skillId: 'toughness',
      eventKey: HARVEST,
    });
    expect(cmd).toMatchObject({ namedLevel: 'expert', skillId: 'toughness', qty: 1 });
    expect(teachableSkills(ruleset, purchase('teaching-normal')).some((s) => s.advanced)).toBe(
      false,
    );
  });
});

describe('awardKinds', () => {
  it('offers only the kinds that fit the currency and never the reserved ones', () => {
    const ids = (c: string) => awardKinds(ruleset, c).map((k) => k.id);
    expect(ids('mt')).toContain('donation');
    expect(ids('xp')).not.toContain('donation');
    expect(ids('xp')).toContain('gm-award');
    expect(ids('xp')).not.toContain('starting');
    expect(ids('mt')).not.toContain('mt-purchase');
  });
});
