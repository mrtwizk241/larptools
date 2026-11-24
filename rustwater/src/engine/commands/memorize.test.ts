import { describe, expect, it } from 'vitest';
import type { Action } from '../model.ts';
import type { Sheet } from '../sheet.ts';
import { AT, grantCxp, learnBasic, withCharacter, type Harness } from '../testkit.ts';
import type { PlanResult } from './define.ts';
import { preview } from './plan.ts';
import { rs } from '../testkit.ts';

function codes(result: PlanResult): string[] {
  return result.ok ? [] : result.errors.map((e) => e.code);
}

function pool(sheet: Sheet, id: string) {
  const p = sheet.memory.slots.find((s) => s.pool === id);
  if (!p) throw new Error(`no pool ${id}`);
  return p;
}

function memorizeSpell(h: Harness, refId: string, extra: Record<string, unknown> = {}) {
  return h.run({ type: 'memorize', kind: 'spell', refId, ...extra });
}

/** Elemental Magic basic 6 and adept 2: 8 elemental slots, 12 Magic AP left. */
function caster(): Harness {
  const h = withCharacter();
  grantCxp(h, 1000);
  learnBasic(h, 'elemental-magic', 6);
  h.run({ type: 'learnSkill', skillId: 'elemental-magic', part: 'adept', toLevel: 2 });
  return h;
}

const ELEMENTAL_BASIC = [
  'elemental-bolt',
  'air-release',
  'elemental-barrier',
  'earth-bind',
  'elemental-blade',
];
const ELEMENTAL_ADEPT = ['elemental-blast', 'stoneskin', 'guidance-of-water', 'cutting-elements'];

describe('memorize: spells', () => {
  it('lists every pool with its breakdown, all zero for a new character', () => {
    const sheet = withCharacter().sheet();
    expect(sheet.memory.slots.map((p) => p.pool)).toEqual([
      'spell-elemental',
      'spell-life',
      'spell-death',
      'spell-tech',
      'spell-universal',
      'recipe-engineering',
      'recipe-chemistry',
      'recipe-medicine',
      'recipe-gearcraft',
      'recipe-universal',
      'performance',
      'ritual',
    ]);
    expect(sheet.memory.slots.every((p) => p.slots === 0 && p.free === 0)).toBe(true);
  });

  it('counts school slots from basic, adept, and advanced levels', () => {
    const sheet = caster().sheet();
    expect(pool(sheet, 'spell-elemental')).toMatchObject({
      slots: 8,
      total: 8,
      used: 0,
      free: 8,
      fromBasic: 6,
      fromAdept: 2,
      fromAdvanced: 0,
      fromMemorization: 0,
      universal: false,
    });
    expect(pool(sheet, 'spell-universal')).toMatchObject({
      slots: 0,
      fromMemorization: 0,
      universal: true,
      memorizationSkillId: 'spell-memorization',
    });
  });

  it('fills the school pool for free, then needs a memorization level', () => {
    const h = caster();
    const apBefore = h.sheet().points.ap['magic']?.available;
    for (const id of [...ELEMENTAL_BASIC, ...ELEMENTAL_ADEPT.slice(0, 3)]) memorizeSpell(h, id);
    let sheet = h.sheet();
    expect(pool(sheet, 'spell-elemental')).toMatchObject({ slots: 8, used: 8, free: 0 });
    expect(sheet.points.ap['magic']?.available).toBe(apBefore);
    expect(sheet.memory.entries[0]).toMatchObject({
      kind: 'spell',
      refId: 'elemental-bolt',
      name: 'Elemental Bolt',
      rank: 'basic',
      slot: 'elemental',
      pool: 'spell-elemental',
    });

    const blocked = h.plan({ type: 'memorize', kind: 'spell', refId: 'cutting-elements' });
    expect(codes(blocked)).toEqual(['SLOT_REQUIRED']);
    expect(blocked.ok ? '' : blocked.errors[0]?.message).toBe(
      'No free spell slot for Cutting Elements. One more Spell Memorization level costs 1 AP.',
    );
    const p = preview(rs, h.sheet(), {
      type: 'memorize',
      kind: 'spell',
      refId: 'cutting-elements',
    });
    expect(p.allowed).toBe(false);
    expect(p.cost).toEqual({ currency: 'ap', amount: 1, archetype: 'magic' });

    const actions = memorizeSpell(h, 'cutting-elements', { buySlot: true, teacher: 'Old Jory' });
    expect(actions.map((a) => a.type)).toEqual(['skill.learned', 'memorized.added']);
    expect(actions[1]?.payload).toEqual({
      kind: 'spell',
      refId: 'cutting-elements',
      slot: 'universal',
      apBought: 1,
    });
    sheet = h.sheet();
    expect(pool(sheet, 'spell-universal')).toMatchObject({
      slots: 1,
      used: 1,
      free: 0,
      fromMemorization: 1,
    });
    expect(sheet.points.ap['magic']?.available).toBe((apBefore ?? 0) - 1);
  });

  it('buySlot follows the teacher rule for the first memorization level', () => {
    const h = caster();
    for (const id of [...ELEMENTAL_BASIC, ...ELEMENTAL_ADEPT.slice(0, 3)]) memorizeSpell(h, id);
    const r = h.plan({ type: 'memorize', kind: 'spell', refId: 'cutting-elements', buySlot: true });
    expect(codes(r)).toEqual(['TEACHER_REQUIRED']);
    expect(
      preview(rs, h.sheet(), {
        type: 'memorize',
        kind: 'spell',
        refId: 'cutting-elements',
        buySlot: true,
      }).allowed,
    ).toBe(true);
  });

  it('memorization goes above level 5 and each level adds a universal slot', () => {
    const h = caster();
    h.run({
      type: 'learnSkill',
      skillId: 'spell-memorization',
      part: 'main',
      toLevel: 7,
      teacher: 'Old Jory',
    });
    const sheet = h.sheet();
    expect(pool(sheet, 'spell-universal')).toMatchObject({
      slots: 7,
      fromMemorization: 7,
      free: 7,
    });
    // 21 AP from Elemental 6, minus 9 (adept 2) and 7 (memorization 7).
    expect(sheet.points.ap['magic']).toMatchObject({ earned: 21, spent: 16, available: 5 });
    // A free universal slot is used without buying.
    for (const id of [...ELEMENTAL_BASIC, ...ELEMENTAL_ADEPT]) memorizeSpell(h, id);
    expect(pool(h.sheet(), 'spell-elemental').free).toBe(0);
    expect(pool(h.sheet(), 'spell-universal').used).toBe(1);
  });

  it('a forced slot must fit the spell', () => {
    const h = caster();
    expect(
      codes(h.plan({ type: 'memorize', kind: 'spell', refId: 'elemental-bolt', slot: 'life' })),
    ).toEqual(['MEMORY_SLOT_INVALID']);
    expect(
      codes(
        h.plan({ type: 'memorize', kind: 'spell', refId: 'elemental-bolt', slot: 'universal' }),
      ),
    ).toEqual(['SLOT_REQUIRED']);
  });

  it('needs the school at the spell rank', () => {
    const h = caster();
    const r = h.plan({ type: 'memorize', kind: 'spell', refId: 'rock-tomb' });
    expect(codes(r)).toContain('MEMORY_REQUIREMENT');
    expect(r.ok ? '' : r.errors[0]?.message).toBe('Rock Tomb needs Elemental Magic Advanced.');
    expect(codes(h.plan({ type: 'memorize', kind: 'spell', refId: 'health-spring' }))).toContain(
      'MEMORY_REQUIREMENT',
    );
  });

  it('rejects mastery abilities, duplicates, and unknown ids', () => {
    const h = caster();
    expect(codes(h.plan({ type: 'memorize', kind: 'spell', refId: 'blood-magic-basic' }))).toEqual([
      'NOT_MEMORIZABLE',
    ]);
    memorizeSpell(h, 'elemental-bolt');
    expect(codes(h.plan({ type: 'memorize', kind: 'spell', refId: 'elemental-bolt' }))).toEqual([
      'ALREADY_MEMORIZED',
    ]);
    expect(codes(h.plan({ type: 'memorize', kind: 'spell', refId: 'no-such-spell' }))).toEqual([
      'UNKNOWN_MEMORY_ITEM',
    ]);
    expect(codes(h.plan({ type: 'memorize', kind: 'spell' }))).toEqual(['REF_REQUIRED']);
  });

  it('forgetting frees the slot and refunds nothing', () => {
    const h = caster();
    memorizeSpell(h, 'elemental-bolt');
    const before = h.sheet();
    const entry = before.memory.entries[0];
    h.run({ type: 'forgetMemorized', entryId: entry?.actionId ?? '' });
    const after = h.sheet();
    expect(after.memory.entries).toEqual([]);
    expect(pool(after, 'spell-elemental').free).toBe(8);
    expect(after.points.ap).toEqual(before.points.ap);
    expect(codes(h.plan({ type: 'forgetMemorized', entryId: 'nope' }))).toEqual([
      'MEMORY_ENTRY_NOT_FOUND',
    ]);
  });

  it('replay warns when a pool is over capacity', () => {
    const h = caster();
    for (const id of [...ELEMENTAL_BASIC, ...ELEMENTAL_ADEPT.slice(0, 3)]) memorizeSpell(h, id);
    const extra: Action = {
      id: 'manual-1',
      seq: h.actions.length + 1,
      at: AT,
      actor: { role: 'staff' },
      type: 'memorized.added',
      payload: { kind: 'spell', refId: 'cutting-elements', slot: 'elemental' },
    };
    h.actions.push(extra);
    const sheet = h.sheet();
    expect(pool(sheet, 'spell-elemental')).toMatchObject({ used: 9, free: -1 });
    expect(sheet.warnings.map((w) => w.code)).toContain('MEMORY_OVER_CAPACITY');
  });
});

/** Medicine 6 + adept 1, Gearcraft 6, Medcraft. */
function crafter(): Harness {
  const h = withCharacter();
  grantCxp(h, 500);
  learnBasic(h, 'medicine', 6);
  learnBasic(h, 'gearcraft', 6);
  h.run({ type: 'learnSkill', skillId: 'medicine', part: 'adept', toLevel: 1 });
  return h;
}

describe('memorize: recipes', () => {
  it('counts craft slots and uses them', () => {
    const h = crafter();
    let sheet = h.sheet();
    expect(pool(sheet, 'recipe-medicine')).toMatchObject({
      slots: 7,
      fromBasic: 6,
      fromAdept: 1,
      fromAdvanced: 0,
    });
    expect(pool(sheet, 'recipe-gearcraft')).toMatchObject({ slots: 6, fromBasic: 6 });
    h.run({ type: 'memorize', kind: 'recipe', refId: 'health-tonic' });
    h.run({ type: 'memorize', kind: 'recipe', refId: 'painkillers' });
    sheet = h.sheet();
    expect(pool(sheet, 'recipe-medicine')).toMatchObject({ used: 2, free: 5 });
    expect(sheet.memory.entries[1]).toMatchObject({ rank: 'adept', slot: 'medicine' });
    expect(codes(h.plan({ type: 'memorize', kind: 'recipe', refId: 'endurance-draught' }))).toEqual(
      ['MEMORY_REQUIREMENT'],
    );
  });

  it('mastery recipes need the mastery craft and a universal slot (1 AP)', () => {
    const h = crafter();
    expect(codes(h.plan({ type: 'memorize', kind: 'recipe', refId: 'bionic-ears' }))).toEqual([
      'MEMORY_REQUIREMENT',
      'SLOT_REQUIRED',
    ]);
    h.run({ type: 'learnSkill', skillId: 'medcraft', part: 'main', teacher: 'Doc Hallow' });
    const apBefore = h.sheet().points.ap['crafting']?.available ?? 0;
    const blocked = h.plan({ type: 'memorize', kind: 'recipe', refId: 'bionic-ears' });
    expect(codes(blocked)).toEqual(['SLOT_REQUIRED']);
    const actions = h.run({
      type: 'memorize',
      kind: 'recipe',
      refId: 'bionic-ears',
      buySlot: true,
      teacher: 'Doc Hallow',
    });
    expect(actions[0]?.payload).toMatchObject({ skillId: 'recipe-memorization', toLevel: 1 });
    const sheet = h.sheet();
    expect(sheet.memory.entries[0]).toMatchObject({
      refId: 'bionic-ears',
      rank: 'mastery',
      slot: 'universal',
      pool: 'recipe-universal',
    });
    expect(pool(sheet, 'recipe-universal')).toMatchObject({
      slots: 1,
      used: 1,
      fromMemorization: 1,
    });
    expect(pool(sheet, 'recipe-gearcraft').used).toBe(0);
    expect(sheet.points.ap['crafting']?.available).toBe(apBefore - 1);
    // A mastery recipe never goes in a craft slot.
    expect(
      codes(h.plan({ type: 'memorize', kind: 'recipe', refId: 'bionic-eyes', slot: 'gearcraft' })),
    ).toEqual(['MEMORY_SLOT_INVALID']);
  });
});

describe('memorize: performances, rituals, knowledges', () => {
  it('every Bardic Performance level gives a performance slot (Q-MULTI-2)', () => {
    const h = withCharacter();
    learnBasic(h, 'bardic-performance', 3, 'utility');
    expect(codes(h.plan({ type: 'memorize', kind: 'performance', refId: 'speed' }))).toEqual([
      'MEMORY_REQUIREMENT',
    ]);
    h.run({ type: 'learnSkill', skillId: 'bardic-performance', part: 'adept', toLevel: 1 });
    expect(pool(h.sheet(), 'performance')).toMatchObject({
      slots: 4,
      fromBasic: 3,
      fromAdept: 1,
      memorizationSkillId: 'bardic-performance-memorization',
    });
    for (const id of ['opening-act', 'quickness', 'restful-sleep', 'speed'])
      h.run({ type: 'memorize', kind: 'performance', refId: id });
    expect(
      codes(h.plan({ type: 'memorize', kind: 'performance', refId: 'spell-enhancement' })),
    ).toEqual(['SLOT_REQUIRED']);
    const actions = h.run({
      type: 'memorize',
      kind: 'performance',
      refId: 'spell-enhancement',
      buySlot: true,
      teacher: 'Lark',
    });
    expect(actions[0]?.payload).toMatchObject({
      skillId: 'bardic-performance-memorization',
      archetype: 'utility',
    });
    expect(pool(h.sheet(), 'performance')).toMatchObject({
      slots: 5,
      used: 5,
      fromMemorization: 1,
    });
    expect(h.sheet().points.ap['utility']?.spent).toBe(4);
  });

  it('rituals: Ritualism grants Ritual Circle and one ritual slot', () => {
    const h = withCharacter();
    grantCxp(h, 700);
    learnBasic(h, 'chemistry', 6);
    learnBasic(h, 'medicine', 6);
    learnBasic(h, 'death-magic', 6);
    expect(codes(h.plan({ type: 'memorize', kind: 'ritual', refId: 'manifest' }))).toContain(
      'MEMORY_REQUIREMENT',
    );
    h.run({
      type: 'learnSkill',
      skillId: 'ritualism',
      part: 'main',
      archetype: 'crafting',
      teacher: 'Grey Wen',
    });
    let sheet = h.sheet();
    expect(sheet.memory.autoLearned).toEqual([
      { kind: 'ritual', refId: 'ritual-circle', name: 'Ritual Circle' },
    ]);
    expect(pool(sheet, 'ritual')).toMatchObject({ slots: 1, fromGrant: 1, free: 1 });
    expect(codes(h.plan({ type: 'memorize', kind: 'ritual', refId: 'ritual-circle' }))).toEqual([
      'NOT_MEMORIZABLE',
    ]);
    h.run({ type: 'memorize', kind: 'ritual', refId: 'manifest' });
    h.run({
      type: 'memorize',
      kind: 'ritual',
      refId: 'face-trauma',
      buySlot: true,
      teacher: 'Grey Wen',
    });
    sheet = h.sheet();
    expect(pool(sheet, 'ritual')).toMatchObject({ slots: 2, used: 2, fromMemorization: 1 });
    expect(sheet.skills.find((s) => s.skillId === 'ritual-memorization')?.archetype).toBe(
      'crafting',
    );
  });

  it('refuses new knowledges: they are story notes now', () => {
    const h = withCharacter();
    const result = h.plan({ type: 'memorize', kind: 'knowledge', text: 'Old river songs' });
    expect(codes(result)).toEqual(['KNOWLEDGE_IS_STORY_NOTE']);
    expect(result.ok ? '' : result.errors[0]?.message).toBe(
      'Knowledges are story notes now. Add a story note instead.',
    );
  });
});
