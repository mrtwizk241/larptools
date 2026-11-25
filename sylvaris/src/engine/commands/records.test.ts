import { describe, expect, it } from 'vitest';
import { grant, learn, withCharacter } from '../testkit.ts';

describe('setStartingItems', () => {
  it('10 picks, repeats allowed, choices named', () => {
    const h = withCharacter();
    const picks = Array.from({ length: 10 }, () => ({ optionId: 'cure-wounds-potion' }));
    h.run({ type: 'setStartingItems', picks });
    expect(h.sheet().startingItems).toHaveLength(10);
    expect(
      h.fail({ type: 'setStartingItems', picks: [...picks, { optionId: 'basic-shield' }] }),
    ).toEqual(['STARTING_ITEMS_OVER']);
    expect(h.fail({ type: 'setStartingItems', picks: [{ optionId: 'flying-carpet' }] })).toEqual([
      'UNKNOWN_STARTING_ITEM',
    ]);
    expect(h.fail({ type: 'setStartingItems', picks: [{ optionId: 'basic-spell' }] })).toEqual([
      'CHOICE_REQUIRED',
    ]);
    expect(
      h.fail({
        type: 'setStartingItems',
        picks: [{ optionId: 'basic-spell', detail: 'fireball' }],
      }),
    ).toEqual(['STARTING_NOT_BASIC']);
    const r = h.plan({ type: 'setStartingItems', picks: [{ optionId: 'simple-pet' }] });
    expect(r.ok && r.notices.map((n) => n.code)).toEqual(['GM_APPROVAL', 'STARTING_ITEMS_FEWER']);
  });
});

describe('changeSpirit', () => {
  it('stays between 0 and 10, with a reason', () => {
    const h = withCharacter();
    expect(h.fail({ type: 'changeSpirit', delta: 1, reason: 'x' })).toEqual(['SPIRIT_RANGE']);
    expect(h.fail({ type: 'changeSpirit', delta: -1 })).toEqual(['REASON_REQUIRED']);
    h.run({ type: 'changeSpirit', delta: -3, reason: 'Raised after the death count' });
    h.run({ type: 'changeSpirit', delta: 1, reason: 'Spirit quest' });
    expect(h.sheet().spirit).toMatchObject({ current: 8, max: 10 });
    expect(h.sheet().spirit.history.map((x) => x.after)).toEqual([7, 8]);
    expect(h.sheet().stats.spiritFragments.current).toBe(8);
    const r = h.plan({ type: 'changeSpirit', delta: -8, reason: 'x' });
    expect(r.ok && r.notices.map((n) => n.code)).toEqual(['NO_SPIRIT_LEFT']);
  });
});

describe('boons', () => {
  it('fills greater and lesser slots, mutagens in their slot', () => {
    const h = withCharacter();
    h.run({ type: 'addBoon', recipeId: 'flesh-crafting-fortitude-mutagen' });
    expect(h.sheet().boons.entries[0]).toMatchObject({
      slot: 'greater',
      name: 'Fortitude Mutagen',
    });
    expect(
      h.fail({ type: 'addBoon', slot: 'lesser', recipeId: 'flesh-crafting-fortitude-mutagen' }),
    ).toEqual(['BOON_SLOT_MISMATCH']);
    expect(h.fail({ type: 'addBoon', recipeId: 'alchemy-jump-potion' })).toEqual(['NOT_A_BOON']);
    expect(h.fail({ type: 'addBoon', name: 'Blessing' })).toEqual(['CHOICE_REQUIRED']);
    for (let i = 0; i < 4; i++) h.run({ type: 'addBoon', slot: 'lesser', name: `Gift ${i}` });
    expect(h.fail({ type: 'addBoon', slot: 'lesser', name: 'One more' })).toEqual([
      'BOON_SLOTS_FULL',
    ]);
    const id = h.sheet().boons.entries[1]?.actionId ?? '';
    h.run({ type: 'removeBoon', boonActionId: id, reason: 'Mutagenic Neutralizer' });
    expect(h.sheet().boons).toMatchObject({ greaterUsed: 1, lesserUsed: 3 });
    expect(h.fail({ type: 'removeBoon', boonActionId: id })).toEqual(['BOON_NOT_FOUND']);
  });
});

describe('familiarized locations', () => {
  it('the tavern is fixed; portals and trees up to their slots; 20 in total', () => {
    const h = withCharacter();
    expect(h.sheet().locations).toMatchObject({ used: 1, capacity: 1 });
    expect(h.fail({ type: 'familiarizeLocation', name: 'Old Mill', date: '2026-05-01' })).toEqual([
      'LOCATION_SLOTS_FULL',
    ]);
    learn(h, 'blink', 2);
    h.run({ type: 'familiarizeLocation', name: 'Old Mill', date: '2026-05-01' });
    expect(h.fail({ type: 'familiarizeLocation', name: 'old mill', date: '2026-05-02' })).toEqual([
      'LOCATION_DUPLICATE',
    ]);
    expect(
      h.fail({ type: 'familiarizeLocation', name: "Raven's Rest", date: '2026-05-02' }),
    ).toEqual(['LOCATION_DUPLICATE']);
    expect(
      h.fail({ type: 'familiarizeLocation', name: 'Oak', kind: 'tree', date: '2026-05-02' }),
    ).toEqual(['LOCATION_SLOTS_FULL']);
    h.run({ type: 'familiarizeLocation', name: 'North Gate', date: '2026-05-02' });
    expect(h.sheet().locations).toMatchObject({ used: 3, capacity: 3 });
    const id = h.sheet().locations.entries[0]?.entryId ?? '';
    h.run({ type: 'removeLocation', entryId: id, reason: 'Erased by a GM event' });
    expect(h.sheet().locations.entries.map((e) => e.name)).toEqual(['North Gate']);
  });

  it('caps at 20 with the tavern', () => {
    const h = withCharacter();
    grant(h, 'xp', 1000);
    learn(h, 'blink', 10);
    learn(h, 'air-magic', 10);
    expect(h.sheet().locations).toMatchObject({ portalSlots: 20, capacity: 20 });
    for (let i = 0; i < 19; i++)
      h.run({ type: 'familiarizeLocation', name: `Place ${i}`, date: '2026-05-01' });
    expect(h.fail({ type: 'familiarizeLocation', name: 'Place 20', date: '2026-05-01' })).toEqual([
      'LOCATION_MAX',
    ]);
  });
});

describe('familiar', () => {
  it('trick slots by quality; skill and special tricks; check-in income', () => {
    const h = withCharacter();
    h.run({
      type: 'setFamiliar',
      name: 'Pip',
      form: 'Fox plush',
      quality: 'master',
      tricks: [
        { id: 'merchanting', slots: 2 },
        { id: 'fam-scouting', slots: 1 },
      ],
    });
    const f = h.sheet().familiar;
    expect(f).toMatchObject({ name: 'Pip', trickSlots: 3, slotsUsed: 3 });
    expect(f?.tricks[0]).toMatchObject({ kind: 'skill', level: 'expert', uses: 2 });
    // hand-derived: 10 Copper x 2 slots = 20 Copper at check-in
    expect(
      h.sheet().stats.checkInIncome.find((i) => i.id === 'familiar:merchanting')?.fixed?.text,
    ).toBe('20 Copper');
    expect(
      h.fail({
        type: 'setFamiliar',
        name: 'Pip',
        quality: 'basic',
        tricks: [{ id: 'stun', slots: 2 }],
      }),
    ).toEqual(['TRICK_SLOTS_FULL']);
    expect(
      h.fail({
        type: 'setFamiliar',
        name: 'Pip',
        quality: 'grandmaster',
        tricks: [{ id: 'fire-magic', slots: 1 }],
      }),
    ).toEqual(['TRICK_SKILL_NOT_ALLOWED']);
    expect(
      h.fail({
        type: 'setFamiliar',
        name: 'Pip',
        quality: 'grandmaster',
        tricks: [{ id: 'orcish-anger', slots: 1 }],
      }),
    ).toEqual(['TRICK_SKILL_NOT_ALLOWED']);
    expect(
      h.fail({
        type: 'setFamiliar',
        name: 'Pip',
        quality: 'grandmaster',
        tricks: [{ id: 'stun', slots: 3 }],
      }),
    ).toEqual(['TRICK_SLOTS_INVALID']);
    expect(
      h.fail({
        type: 'setFamiliar',
        name: 'Pip',
        quality: 'grandmaster',
        tricks: [{ id: 'fam-scouting', slots: 2 }],
      }),
    ).toEqual(['TRICK_SLOTS_INVALID']);
    expect(h.fail({ type: 'removeFamiliar' })).toEqual(['REASON_REQUIRED']);
    h.run({ type: 'removeFamiliar', reason: 'Released' });
    expect(h.sheet().familiar).toBeNull();
  });
});

describe('owed items', () => {
  it('adds and delivers, also after retirement', () => {
    const h = withCharacter();
    const [owed] = h.run({ type: 'addOwed', text: 'Expert Trade Item' });
    h.run({ type: 'retireCharacter', reason: 'Done' });
    h.run({ type: 'deliverOwed', owedId: owed?.id ?? '' });
    expect(h.sheet().owed[0]).toMatchObject({ text: 'Expert Trade Item', delivered: true });
    expect(h.fail({ type: 'deliverOwed', owedId: owed?.id ?? '' })).toEqual([
      'OWED_ALREADY_DELIVERED',
    ]);
    expect(h.fail({ type: 'deliverOwed', owedId: 'nope' })).toEqual(['OWED_NOT_FOUND']);
  });
});
