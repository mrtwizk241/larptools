import { describe, expect, it } from 'vitest';
import {
  event,
  grantCxp,
  grantShinies,
  harness,
  learnBasic,
  rs,
  withCharacter,
} from '../testkit.ts';
import { deriveSheet } from '../derive/deriveSheet.ts';
import {
  checkInItems,
  checkInSources,
  checkRegistration,
  gatherTiers,
  playerFormProblems,
  type CheckInSource,
} from './checkInPlan.ts';

const THAW = event('2026-11-14', 'winter-gate', 'Winter Gate');

function texts(items: readonly { source: string; text: string }[]): string[] {
  return items.map((i) => `${i.source}: ${i.text}`);
}

function learn(
  h: ReturnType<typeof harness>,
  skillId: string,
  part: 'basic' | 'adept' | 'advanced' | 'mastery',
  toLevel: number,
) {
  h.run({ type: 'learnSkill', skillId, part, toLevel, teacher: 'Old Jory' });
}

describe('check-in sources', () => {
  it('a plain Human has the Scavenger passive: 2 resources, or 10 Bits', () => {
    const h = withCharacter();
    const sources = checkInSources(rs, h.sheet());
    expect(sources.map((s) => s.kind)).toEqual(['human-passive']);
    expect(texts(checkInItems(rs, sources, {}).items)).toEqual([
      'Human passive (Scavenger): 2 random Common resources',
    ]);
    expect(texts(checkInItems(rs, sources, { humanPassiveBits: true }).items)).toEqual([
      'Human passive (Scavenger): 10 Bits',
    ]);
  });

  it('Deep Pockets gives 2 resources per level, or 10 Bits per level', () => {
    const h = withCharacter({ subtypeId: 'human-sheltered', startingLxpAbilityId: 'deep-pockets' });
    const sources = checkInSources(rs, h.sheet());
    const deep = sources.find((s) => s.kind === 'deep-pockets');
    expect(deep).toMatchObject({ level: 2 });
    expect(texts(checkInItems(rs, sources, { deepPocketsBitsLevels: 1 }).items)).toEqual([
      'Human passive (Scavenger): 2 random Common resources',
      'Deep Pockets: 10 Bits',
      'Deep Pockets: 2 random Common resources',
    ]);
  });

  it('Look What I found! gives 2 random draws per level', () => {
    const h = withCharacter({ ancestryId: 'burrower', subtypeId: 'burrower-borrower' });
    const items = checkInItems(rs, checkInSources(rs, h.sheet()), {}).items;
    expect(items.find((i) => i.what === 'random-draw')?.qty).toBe(2);
  });

  it('Scavenging: upgrades never exceed the basic level; each tier can be taken as Bits', () => {
    const h = withCharacter();
    grantCxp(h, 500);
    learn(h, 'scavenging', 'basic', 2);
    learnBasic(h, 'assault', 6); // AP for the upgrades
    const sources = checkInSources(rs, h.sheet());
    expect(sources.find((s) => s.kind === 'scavenging')).toMatchObject({ basic: 2, adept: 0 });
    const scav = sources.filter((s) => s.kind === 'scavenging');
    expect(texts(checkInItems(rs, scav, {}).items)).toEqual([
      'Scavenging: 2 random Common resources',
    ]);
    expect(
      texts(checkInItems(rs, scav, { scavengingBits: { common: 1, uncommon: 0, rare: 0 } }).items),
    ).toEqual(['Scavenging: 10 Bits', 'Scavenging: 1 random Common resource']);
    const fake: CheckInSource = {
      kind: 'scavenging',
      name: 'Scavenging',
      text: '',
      basic: 2,
      adept: 3,
      advanced: 1,
      mastery: true,
    };
    expect(
      texts(
        checkInItems(rs, [fake], { scavengingBits: { common: 0, uncommon: 1, rare: 0 } }).items,
      ),
    ).toEqual([
      'Scavenging: 15 Bits',
      'Scavenging Mastery: 1 random Uncommon resource',
      'Scavenging: 1 random Rare resource',
      'Scavenging Mastery: 1 random Rare resource',
    ]);
  });

  it('Dismantle and Harvesting: automatic upgrades, advanced first, split between two types', () => {
    expect(gatherTiers(3, 1, 1)).toEqual({ common: 2, uncommon: 2, rare: 1 });
    expect(gatherTiers(1, 2, 2)).toEqual({ common: 0, uncommon: 0, rare: 1 });
    const dismantle: CheckInSource = {
      kind: 'dismantle',
      name: 'Dismantle',
      text: '',
      basic: 2,
      adept: 1,
      advanced: 0,
      types: ['scrap', 'junk'],
    };
    expect(texts(checkInItems(rs, [dismantle], {}).items)).toEqual([
      'Dismantle: 2 Common Scrap',
      'Dismantle: 2 Uncommon Scrap',
    ]);
    expect(
      texts(
        checkInItems(rs, [dismantle], { dismantleFirstType: { common: 1, uncommon: 0, rare: 0 } })
          .items,
      ),
    ).toEqual([
      'Dismantle: 1 Common Scrap',
      'Dismantle: 1 Common Junk',
      'Dismantle: 2 Uncommon Junk',
    ]);
  });

  it('a familiar with Gather brings 3 random resources', () => {
    const h = withCharacter();
    h.run({ type: 'adjustPoints', currency: 'fp', amount: 5, reason: 'test setup' });
    h.run({ type: 'bondFamiliar', name: 'Pip' });
    h.run({ type: 'awakenFamiliar', awakenedSkillId: 'gather' });
    const items = checkInItems(rs, checkInSources(rs, h.sheet()), {}).items;
    expect(texts(items)).toContain('Gather (familiar Pip): 3 random resources');
  });
});

describe('checkRegistration', () => {
  it('checks Shiny purchases with prices, caps, and the balance, and lists what to pull', () => {
    const h = withCharacter();
    grantShinies(h, 400);
    // One event before, so upkeep is due.
    h.run({
      type: 'checkIn',
      event: event('2026-10-10', 'harvest-moon', 'Harvest Moon'),
      attendance: 'player',
    });
    const check = checkRegistration(rs, h.actions, THAW, {
      purchases: [
        { purchaseId: 'buy-cxp', qty: 5 },
        { purchaseId: 'buy-basic-resource', qty: 3, types: { scrap: 2, junk: 1 } },
      ],
      choices: { upkeep: 'shinies' },
    });
    expect(check.errors).toEqual([]);
    expect(check.shiniesCost).toBe(5 * 50 + 3 * 20 + 40);
    expect(check.upkeep).toMatchObject({ due: true, paidWith: 'shinies' });
    expect(texts(check.items)).toEqual([
      'Human passive (Scavenger): 2 random Common resources',
      'Shinies: Basic Resource: 2 Common Scrap',
      'Shinies: Basic Resource: 1 Common Junk',
    ]);
    expect(check.purchaseCommands).toEqual([
      { purchaseId: 'buy-cxp', qty: 5 },
      { purchaseId: 'buy-basic-resource', qty: 3, note: 'Types: 2 Scrap, 1 Junk' },
      { purchaseId: 'buy-upkeep', qty: 1 },
    ]);
    expect(check.picks).toContain('Upkeep: covered with Shinies');
  });

  it('refuses over-cap or unaffordable purchases, missing types, and missing upkeep', () => {
    const h = withCharacter();
    grantShinies(h, 100);
    h.run({
      type: 'checkIn',
      event: event('2026-10-10', 'harvest-moon', 'Harvest Moon'),
      attendance: 'player',
    });
    const check = checkRegistration(rs, h.actions, THAW, {
      purchases: [
        { purchaseId: 'buy-pxp', qty: 2 },
        { purchaseId: 'buy-rare-resource', qty: 1 },
        { purchaseId: 'buy-missed-event-cxp', qty: 1 },
      ],
    });
    expect(check.errors.join(' ')).toMatch(/PXP/);
    expect(check.errors).toContain('Rare Resource: choose a type for each of the 1 resources.');
    expect(check.errors).toContain('Missed Event CXP cannot be bought when pre-registering.');
    expect(check.errors).toContain('Choose how you pay upkeep.');
  });

  it('needs no upkeep at a first event', () => {
    const h = withCharacter();
    const check = checkRegistration(rs, h.actions, THAW, {});
    expect(check.upkeep).toEqual({ due: false, reason: 'first event: no upkeep', paidWith: null });
    expect(check.errors).toEqual([]);
  });

  it('refuses a character already checked in to the event', () => {
    const h = withCharacter();
    h.run({ type: 'checkIn', event: THAW, attendance: 'player' });
    const check = checkRegistration(rs, h.actions, THAW, { choices: { upkeep: 'bits' } });
    expect(check.errors.join(' ')).toMatch(/already checked in/);
  });

  it('records handed-out items and picks on the check-in', () => {
    const h = withCharacter();
    h.run({
      type: 'checkIn',
      event: THAW,
      attendance: 'player',
      handedOut: ['Human passive (Scavenger): 2 random Common resources'],
      picks: ['Upkeep: paying 10 Bits'],
    });
    const sheet = deriveSheet(rs, h.actions);
    expect(sheet.events[0]).toMatchObject({
      handedOut: ['Human passive (Scavenger): 2 random Common resources'],
      picks: ['Upkeep: paying 10 Bits'],
    });
  });
});

describe('Pre-Reg form questions', () => {
  function veteran(shinies = 0) {
    const h = withCharacter();
    if (shinies > 0) grantShinies(h, shinies);
    h.run({
      type: 'checkIn',
      event: event('2026-10-10', 'harvest-moon', 'Harvest Moon'),
      attendance: 'player',
    });
    return h;
  }

  it('upkeep paid with a level of Scavenging spends one basic use', () => {
    const h = veteran();
    grantCxp(h, 500);
    learn(h, 'scavenging', 'basic', 2);
    const check = checkRegistration(rs, h.actions, THAW, { choices: { upkeep: 'scavenging' } });
    expect(check.errors).toEqual([]);
    expect(texts(check.items)).toContain('Scavenging: 1 random Common resource');
    expect(check.picks).toContain('Upkeep: paying 1 level of Scavenging');
    const none = checkRegistration(rs, veteran().actions, THAW, {
      choices: { upkeep: 'scavenging' },
    });
    expect(none.errors).toContain('Paying upkeep with Scavenging needs a level of Scavenging.');
  });

  it('upkeep paid by another character needs its name', () => {
    const h = veteran();
    const blank = checkRegistration(rs, h.actions, THAW, {
      choices: { upkeep: 'other-character' },
    });
    expect(blank.errors).toContain('Say which character is paying your upkeep.');
    const named = checkRegistration(rs, h.actions, THAW, {
      choices: { upkeep: 'other-character', upkeepPayer: 'Mara Quill' },
    });
    expect(named.errors).toEqual([]);
    expect(named.picks).toContain('Upkeep: paid by another character (Mara Quill)');
  });

  it('Gather can be skipped for an event', () => {
    const h = withCharacter();
    h.run({ type: 'adjustPoints', currency: 'fp', amount: 5, reason: 'test setup' });
    h.run({ type: 'bondFamiliar', name: 'Pip' });
    h.run({ type: 'awakenFamiliar', awakenedSkillId: 'gather' });
    const check = checkRegistration(rs, h.actions, THAW, { choices: { familiarGather: false } });
    expect(texts(check.items).some((t) => t.startsWith('Gather'))).toBe(false);
    expect(check.picks).toContain('Gather (familiar Pip): not used this event');
  });

  it('missed-event and alternate-character CXP count against the Shinies and go to the desk', () => {
    const h = veteran(1200);
    const check = checkRegistration(rs, h.actions, THAW, {
      choices: { upkeep: 'bits' },
      eventCxp: {
        missedEvents: 1,
        missedDetails: 'April 9th-11th 2027',
        altCharacterEvents: 1,
        altCharacterName: 'Tam Rook',
      },
    });
    expect(check.errors).toEqual([]);
    expect(check.shiniesCost).toBe(1000);
    expect(check.purchases.filter((p) => p.atDesk).map((p) => [p.name, p.typesText])).toEqual([
      ['Missed Event CXP', 'April 9th-11th 2027'],
      ['Alternate Character Event CXP', 'Tam Rook'],
    ]);
    expect(check.purchaseCommands).toEqual([]);
    const poor = checkRegistration(rs, veteran(400).actions, THAW, {
      choices: { upkeep: 'bits' },
      eventCxp: { missedEvents: 1, missedDetails: '' },
    });
    expect(poor.errors).toContain('Missed event CXP: list the event dates you are buying for.');
    expect(poor.errors.some((e) => e.startsWith('These choices cost 500 Shinies'))).toBe(true);
  });

  it("the booking and payment questions are the player's", () => {
    expect(playerFormProblems({})).toEqual([
      'Confirm that you will also book the event on the website.',
      'Choose how you are paying for the event.',
    ]);
    expect(playerFormProblems({ bookingConfirmed: true, payment: 'season-pass' })).toEqual([]);
  });
});
