import { describe, expect, it } from 'vitest';
import { preview } from './plan.ts';
import { BASE_CHARACTER, grant, harness, learn, rs, withCharacter } from '../testkit.ts';

describe('createCharacter', () => {
  it('creates a character with 150 XP and the defaults', () => {
    const h = harness();
    const r = h.plan(BASE_CHARACTER);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.actions.map((a) => a.type)).toEqual(['character.created']);
    expect(r.notices.map((n) => n.code)).toEqual(['XP_UNSPENT']);
    h.actions.push(...r.actions);
    const s = h.sheet();
    expect(s.points.xp).toMatchObject({ earned: 150, spent: 0, available: 150, cap: 2000 });
    expect(s.points.cxp).toMatchObject({ earned: 0, cap: 610 });
    expect(s.profile).toMatchObject({
      characterName: 'Wren Ashdown',
      ageCategory: 2,
      startingXp: 150,
    });
    expect(s.race?.literacyLanguage).toEqual({ id: 'common', name: 'Common' });
  });

  it('records the concept and backstory at creation; older logs without them still replay', () => {
    const h = harness();
    const r = h.plan({
      ...BASE_CHARACTER,
      concept: ' A ferry pilot ',
      backstory: ' Raised by river folk. ',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.actions[0]?.payload).toMatchObject({
      concept: 'A ferry pilot',
      backstory: 'Raised by river folk.',
    });
    h.actions.push(...r.actions);
    expect(h.sheet().profile).toMatchObject({
      concept: 'A ferry pilot',
      backstory: 'Raised by river folk.',
    });

    const old = harness();
    const plain = old.plan(BASE_CHARACTER);
    if (!plain.ok) throw new Error('plan failed');
    expect(plain.actions[0]?.payload).not.toHaveProperty('backstory');
    expect(plain.actions[0]?.payload).not.toHaveProperty('concept');
    old.actions.push(...plain.actions);
    expect(old.sheet().profile).toMatchObject({ concept: '', backstory: '' });
    expect(old.sheet().warnings).toEqual([]);
  });

  it('a second creation is refused', () => {
    expect(withCharacter().fail(BASE_CHARACTER)).toEqual(['ALREADY_CREATED']);
  });

  it('other commands need a character first', () => {
    expect(harness().fail({ type: 'changeSpirit', delta: -1, reason: 'x' })).toEqual([
      'NO_CHARACTER',
    ]);
  });

  it('only staff may plan', () => {
    const r = harness().plan(BASE_CHARACTER, 'player');
    expect(r.ok ? [] : r.errors.map((e) => e.code)).toEqual(['ROLE_NOT_ALLOWED']);
  });

  it('race and choices are checked', () => {
    const h = harness();
    expect(h.fail({ ...BASE_CHARACTER, raceId: 'goblin' })).toEqual(['UNKNOWN_RACE']);
    expect(h.fail({ ...BASE_CHARACTER, raceId: 'dragonborn' })).toEqual([
      'CHOICE_REQUIRED',
      'CHOICE_REQUIRED',
    ]);
    expect(
      h.fail({
        ...BASE_CHARACTER,
        raceId: 'dragonborn',
        choices: { element: 'shadow', 'natural-weapon': 'bite' },
      }),
    ).toEqual(['CHOICE_INVALID']);
    // The Elf's extra language must be a new one.
    expect(
      h.fail({ ...BASE_CHARACTER, raceId: 'elf', choices: { 'bonus-language': 'elven' } }),
    ).toEqual(['CHOICE_INVALID']);
    expect(h.fail({ ...BASE_CHARACTER, choices: { totem: 'Wolf' } })).toEqual(['CHOICE_INVALID']);
    expect(h.fail({ ...BASE_CHARACTER, ageCategory: 1 })).toEqual(['AGE_CATEGORY_RANGE']);
  });

  it('starting skills: creation limits, racial skills, prerequisites, budget', () => {
    const h = harness();
    expect(
      h.fail({ ...BASE_CHARACTER, startingSkills: [{ skillId: 'toughness', level: 6 }] }),
    ).toEqual(['CREATION_LEVEL_LIMIT']);
    expect(
      h.fail({
        ...BASE_CHARACTER,
        startingSkills: [{ skillId: 'toughness', level: 5, techniques: ['expert', 'master'] }],
      }),
    ).toEqual(['TECHNIQUE_LEVEL']);
    expect(
      h.fail({
        ...BASE_CHARACTER,
        startingSkills: [{ skillId: 'toughness', level: 6, techniques: ['expert', 'master'] }],
      }),
    ).toEqual(['CREATION_LEVEL_LIMIT', 'CREATION_TECHNIQUE_LIMIT']);
    expect(
      h.fail({ ...BASE_CHARACTER, startingSkills: [{ skillId: 'armor-plating', level: 1 }] }),
    ).toEqual(['RACIAL_SKILL_OTHER_RACE']);
    expect(
      h.fail({ ...BASE_CHARACTER, startingSkills: [{ skillId: 'frenzy', level: 1 }] }),
    ).toEqual(['PREREQ_NOT_MET', 'PREREQ_NOT_MET']);
    // hand-derived: two skills at 5 + Expert cost 80 each = 160 > 150
    expect(
      h.fail({
        ...BASE_CHARACTER,
        startingSkills: [
          { skillId: 'toughness', level: 5, techniques: ['expert'] },
          { skillId: 'wear-armor', level: 5, techniques: ['expert'] },
        ],
      }),
    ).toEqual(['NOT_ENOUGH_XP']);
    expect(
      h.fail({ ...BASE_CHARACTER, startingSkills: [{ skillId: 'calling-skill', level: 1 }] }),
    ).toEqual(['UNKNOWN_SKILL']);
  });

  it('starting skills are recorded at creation without teachers', () => {
    const h = withCharacter({
      startingSkills: [{ skillId: 'toughness', level: 3, techniques: ['expert'] }],
    });
    const t = h.sheet().skills.find((s) => s.skillId === 'toughness');
    expect(t?.teaching.map((x) => [x.step, x.atCreation, x.unverified])).toEqual([
      ['basic', true, false],
      ['expert', true, false],
    ]);
    expect(h.sheet().learningLog.every((l) => l.atCreation)).toBe(true);
  });

  it('a low retirement share warns (Q-RET-2)', () => {
    const r = harness().plan({
      ...BASE_CHARACTER,
      retirement: { fromName: 'Short Life', xp: 40, cxp: 0, axp: 0, coinCopper: 0 },
    });
    expect(r.ok && r.notices.map((n) => n.code)).toContain('RETIREMENT_BELOW_START');
  });
});

describe('updateProfile', () => {
  it('records only what changed', () => {
    const h = withCharacter();
    expect(h.fail({ type: 'updateProfile', characterName: 'Wren Ashdown' })).toEqual([
      'NOTHING_CHANGED',
    ]);
    h.run({
      type: 'updateProfile',
      backstory: 'Raised by river folk.',
      ageCategory: 4,
      ageYears: 41,
    });
    expect(h.sheet().profile).toMatchObject({
      backstory: 'Raised by river folk.',
      ageCategory: 4,
      ageYears: 41,
    });
    expect(h.fail({ type: 'updateProfile', ageCategory: 11 })).toEqual(['AGE_CATEGORY_RANGE']);
  });

  it('changes race choices and literacy with the same checks', () => {
    const h = withCharacter({
      raceId: 'dragonborn',
      choices: { element: 'fire', 'natural-weapon': 'bite' },
    });
    h.run({
      type: 'updateProfile',
      choices: { element: 'water', 'natural-weapon': 'short-claws' },
    });
    expect(h.sheet().race?.naturalWeapon?.baseDamage).toBe(2);
    expect(h.fail({ type: 'updateProfile', choices: { element: 'water' } })).toEqual([
      'CHOICE_REQUIRED',
    ]);
    h.run({ type: 'updateProfile', literacy: 'common' });
    expect(h.sheet().race?.literacyLanguage.id).toBe('common');
  });
});

describe('retireCharacter', () => {
  it('needs a reason, shows the carry in preview, then locks the sheet', () => {
    const h = withCharacter();
    grant(h, 'xp', 50);
    const p = preview(rs, h.sheet(), { type: 'retireCharacter', goodsValueCopper: 1000 });
    // hand-derived: XP floor((200 - 150) x 0.25) = 12; coin floor(1000 x 0.25) - 50 = 200
    expect(p.carry).toEqual({ xp: 12, cxp: 0, axp: 0, coinCopper: 200 });
    expect(p.allowed).toBe(true);
    expect(h.fail({ type: 'retireCharacter' })).toEqual(['REASON_REQUIRED']);
    h.run({ type: 'retireCharacter', reason: 'Moved away' });
    expect(h.sheet().retired?.carry.coinCopper).toBe(0);
    expect(h.fail({ type: 'learnSkill', skillId: 'toughness', step: { level: 1 } })).toEqual([
      'CHARACTER_RETIRED',
    ]);
    // Notes still work.
    h.run({ type: 'updateProfile', notes: 'Retired at the spring event.' });
    expect(h.sheet().profile.notes).toBe('Retired at the spring event.');
  });
});

describe('assignRetirement ([RET-ASSIGN])', () => {
  it('records where the carry-over went, once, and only after retiring', () => {
    const h = withCharacter();
    const to = {
      type: 'assignRetirement',
      toCharacterId: 'char-new-one',
      toName: 'New One',
      kind: 'new',
    } as const;
    expect(h.fail(to)).toEqual(['NOT_RETIRED']);
    h.run({ type: 'retireCharacter', reason: 'Moved away' });
    expect(h.sheet().retired?.assignedTo).toBeNull();
    h.run(to);
    expect(h.sheet().retired?.assignedTo).toMatchObject({
      characterId: 'char-new-one',
      characterName: 'New One',
      kind: 'new',
    });
    expect(h.sheet().warnings).toEqual([]);
    expect(h.fail({ ...to, toCharacterId: 'char-other', kind: 'existing' })).toEqual([
      'RETIREMENT_ALREADY_ASSIGNED',
    ]);
  });
});

describe('changeRace (Race Change ritual)', () => {
  it('refunds the old racial skills (Q-MAG-5)', () => {
    const h = withCharacter({
      raceId: 'dwarf',
      startingSkills: [
        { skillId: 'dwarven-persistence', level: 3, techniques: ['expert'] },
        { skillId: 'toughness', level: 2 },
      ],
    });
    expect(h.sheet().points.xp.spent).toBe(50);
    const r = h.plan({ type: 'changeRace', toRaceId: 'human', reason: 'Race Change ritual' });
    expect(r.ok && r.notices.map((n) => n.code)).toEqual(['RACIAL_SKILLS_REFUNDED']);
    h.run({ type: 'changeRace', toRaceId: 'human', reason: 'Race Change ritual' });
    const s = h.sheet();
    // hand-derived: 50 spent - 35 refunded = 15 (Toughness 5 + 10)
    expect(s.points.xp.spent).toBe(15);
    expect(s.skills.map((x) => x.skillId)).toEqual(['toughness']);
    expect(s.race?.raceId).toBe('human');
    expect(s.raceChanges[0]).toMatchObject({
      fromRaceId: 'dwarf',
      toRaceId: 'human',
      refunds: [{ skillId: 'dwarven-persistence', amount: 35 }],
    });
  });

  it('to Clockwork: Wear Armor is refunded, Armor Plating replaces it (Rulebook p.27)', () => {
    const h = withCharacter({
      startingSkills: [
        { skillId: 'wear-armor', level: 3, techniques: ['expert'] },
        { skillId: 'toughness', level: 2 },
      ],
    });
    // hand-derived: Wear Armor 5 + 10 + 15 + 5 = 35, Toughness 5 + 10 = 15
    expect(h.sheet().points.xp.spent).toBe(50);
    const r = h.plan({ type: 'changeRace', toRaceId: 'clockwork', reason: 'Race Change ritual' });
    expect(r.ok && r.actions[0]?.payload).toMatchObject({
      refunds: [{ skillId: 'wear-armor', amount: 35 }],
    });
    h.run({ type: 'changeRace', toRaceId: 'clockwork', reason: 'Race Change ritual' });
    const s = h.sheet();
    expect(s.points.xp.spent).toBe(15);
    expect(s.skills.map((x) => x.skillId)).toEqual(['toughness']);
    expect(s.warnings).toEqual([]);
  });

  it('blocks the same race, missing choices, and no reason', () => {
    const h = withCharacter();
    expect(h.fail({ type: 'changeRace', toRaceId: 'human', reason: 'x' })).toEqual(['SAME_RACE']);
    expect(h.fail({ type: 'changeRace', toRaceId: 'beast-kin', reason: 'x' })).toEqual([
      'CHOICE_REQUIRED',
      'CHOICE_REQUIRED',
    ]);
    expect(h.fail({ type: 'changeRace', toRaceId: 'orc' })).toEqual(['REASON_REQUIRED']);
  });

  it('a refunded racial skill can no longer be advanced', () => {
    const h = withCharacter({ raceId: 'orc' });
    learn(h, 'orcish-anger', 1);
    h.run({ type: 'changeRace', toRaceId: 'human', reason: 'Race Change ritual' });
    expect(
      h.fail({ type: 'learnSkill', skillId: 'orcish-anger', step: { level: 1 }, teacher: 'x' }),
    ).toEqual(['RACIAL_SKILL_OTHER_RACE']);
  });
});
