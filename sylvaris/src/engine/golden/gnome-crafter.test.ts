// Golden character 3: Tibbit Cogsworth, a Gnome crafter with Harvesting and Merchanting, through
// two check-ins and a pre-registration. Every number is hand-derived.
import { describe, expect, it } from 'vitest';
import { checkRegistration } from '../checkin/checkInPlan.ts';
import { event, harness, rs } from '../testkit.ts';

const E1 = event('2026-04-10', 'spring-gathering', 'Spring Gathering');
const E2 = event('2026-05-15', 'summer-moot', 'Summer Moot');

function build() {
  const h = harness();
  h.run({
    type: 'createCharacter',
    characterName: 'Tibbit Cogsworth',
    playerName: 'Sample Player',
    raceId: 'gnome',
    startingSkills: [
      { skillId: 'alchemy', level: 5, techniques: ['expert'] },
      { skillId: 'harvesting', level: 4, techniques: ['expert'] },
      { skillId: 'merchanting', level: 1 },
    ],
  });
  h.run({
    type: 'addJournal',
    kind: 'recipe',
    refId: 'alchemy-cure-wounds-potion',
    source: 'starting',
  });
  h.run({
    type: 'addJournal',
    kind: 'recipe',
    refId: 'alchemy-lesser-armor-potion',
    source: 'teacher',
    teacher: 'Brewer Nell',
  });
  h.run({
    type: 'addJournal',
    kind: 'recipe',
    refId: 'alchemy-potion-of-warding',
    source: 'research',
  });
  h.run({ type: 'checkIn', event: E1, extras: ['sunday-cleanup'] });
  return h;
}

describe('golden: Tibbit Cogsworth (Gnome crafter)', () => {
  it('creation, journal, and the first check-in', () => {
    const sheet = build().sheet();
    expect(sheet.warnings).toEqual([]);
    // hand-derived: Alchemy 75 + 5 = 80; Harvesting 5+10+15+20 = 50, + 5 = 55; Merchanting 5
    //   spent 140; earned 150 + 60 = 210; available 70
    expect(sheet.points.xp).toMatchObject({ earned: 210, spent: 140, available: 70 });
    // hand-derived: Sunday clean up 100 MT
    expect(sheet.points.mt.balance).toBe(100);
    // Gnome: 6 Attunement Slots plus 1 for tools only
    expect(sheet.stats.slots.attunement).toBe(6);
    expect(sheet.stats.slots.attunementToolOnly).toBe(1);
    expect(sheet.journals.craftingJournal.map((e) => [e.refId, e.usableNow])).toEqual([
      ['alchemy-cure-wounds-potion', true],
      ['alchemy-lesser-armor-potion', true],
      ['alchemy-potion-of-warding', false],
    ]);
    const first = sheet.events[0];
    // First event: no upkeep. Default income: Harvesting 2 x 4 + Expert 3 = 11 Basic Components;
    // Merchanting level 1 takes the first option, 5 Copper.
    expect(first?.upkeep).toEqual({ dueSilver: 0, coveredBy: null });
    expect(first?.handedOut).toEqual([
      '11 Basic Components (Harvesting)',
      '5 Copper (Merchanting)',
    ]);
  });

  it('pre-registration and the second check-in with Merchanting covering upkeep', () => {
    const h = build();
    const reg = checkRegistration(rs, h.actions, E2, {
      purchases: [{ purchaseId: 'basic-component', qty: 4 }],
      choices: { upkeep: 'merchanting' },
    });
    expect(reg.errors).toEqual([]);
    expect(reg.upkeep).toMatchObject({ dueSilver: 1, due: true, coveredBy: 'merchanting' });
    // hand-derived: 4 x 25 MT = 100 MT
    expect(reg.mtCost).toBe(100);
    expect(reg.items.map((i) => i.text)).toEqual([
      '11 Basic Components (Harvesting)',
      'Covers 2 Silver of own upkeep (Merchanting)',
      '4 Basic Components',
    ]);

    for (const c of reg.purchaseCommands) h.run({ type: 'spendMt', ...c, eventKey: E2.key });
    h.run({
      type: 'checkIn',
      event: E2,
      upkeep: 'merchanting',
      handedOut: reg.items.map((i) => i.text),
    });
    const sheet = h.sheet();
    expect(sheet.warnings).toEqual([]);
    expect(sheet.points.mt).toEqual({ earned: 100, spent: 100, balance: 0 });
    expect(sheet.events[1]?.upkeep).toEqual({ dueSilver: 1, coveredBy: 'merchanting' });
    // hand-derived: earned 150 + 2 x 60 = 270; available 270 - 140 = 130
    expect(sheet.points.xp.available).toBe(130);
    // Per-event cap: 10 Basic Components per event, 4 already bought.
    h.run({ type: 'adjustPoints', currency: 'mt', amount: 500, reason: 'test setup' });
    expect(
      h.fail({ type: 'spendMt', purchaseId: 'basic-component', qty: 7, eventKey: E2.key }),
    ).toEqual(['PURCHASE_OVER_CAP']);
  });
});
