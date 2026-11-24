import { describe, expect, it } from 'vitest';
import { loadRuleset } from '../../../engine/index.ts';
import {
  EMPTY_DRAFT,
  WIZARD_STEPS,
  dryRunCreate,
  errorMessages,
  hasErrors,
  pickArchetype,
  pickLevel,
  pickTotals,
  setPickLevel,
  selectAncestry,
  selectSubtype,
  toCreateCommand,
  type StepId,
  type WizardDraft,
} from './steps.ts';
import { profileFieldErrors } from './validation.ts';

const rs = loadRuleset();

function validate(id: StepId, draft: WizardDraft) {
  const step = WIZARD_STEPS.find((s) => s.id === id);
  if (!step) throw new Error(`no step ${id}`);
  return step.validate(draft, rs);
}

const NAMED: WizardDraft = { ...EMPTY_DRAFT, characterName: 'Wren Ashby', playerName: 'Jo Park' };
const ELF: WizardDraft = { ...NAMED, ancestryId: 'elf', subtypeId: 'elf-windwalker' };

describe('create wizard steps', () => {
  it('has six steps in order', () => {
    expect(WIZARD_STEPS.map((s) => s.id)).toEqual([
      'names',
      'ancestry',
      'lxp',
      'skills',
      'items',
      'review',
    ]);
  });

  it('names: requires both names and checks email and age', () => {
    expect(validate('names', EMPTY_DRAFT)).toEqual({
      characterName: 'Enter the character name.',
      playerName: 'Enter the player name.',
    });
    const bad = validate('names', { ...NAMED, playerEmail: 'nope', age: '3.5' });
    expect(Object.keys(bad).sort()).toEqual(['age', 'playerEmail']);
    expect(
      hasErrors(validate('names', { ...NAMED, playerEmail: 'jo@example.com', age: '10' })),
    ).toBe(false);
  });

  it('names: age is a step from 2 to 10, defaulting to 2', () => {
    expect(EMPTY_DRAFT.age).toBe('2');
    const message = 'Enter an age step from 2 to 10.';
    for (const age of ['', '1', '11', '30', '0'])
      expect(validate('names', { ...NAMED, age })).toEqual({ age: message });
    for (const age of ['2', '5', '10'])
      expect(hasErrors(validate('names', { ...NAMED, age }))).toBe(false);
  });

  it('profile form: age is a step from 1 to 10 or blank', () => {
    const fields = { characterName: 'Wren', playerName: 'Jo', playerEmail: '' };
    for (const age of ['', '1', '10']) expect(profileFieldErrors({ ...fields, age })).toEqual({});
    for (const age of ['0', '11', '2.5', 'x'])
      expect(profileFieldErrors({ ...fields, age })).toEqual({
        age: 'Enter an age step from 1 to 10, or leave it blank.',
      });
  });

  it('ancestry: needs an ancestry and a subtype of it', () => {
    expect(validate('ancestry', NAMED)).toEqual({ ancestryId: 'Choose an ancestry.' });
    expect(validate('ancestry', { ...NAMED, ancestryId: 'elf' })).toEqual({
      subtypeId: 'Choose a subtype for Elf.',
    });
    expect(validate('ancestry', { ...ELF, subtypeId: 'human-wastelander' }).subtypeId).toBeTruthy();
    expect(validate('ancestry', ELF)).toEqual({});
  });

  it('ancestry: extra infection is 0 to 2, and none for Aware', () => {
    expect(validate('ancestry', { ...ELF, extraInfection: 2 })).toEqual({});
    expect(validate('ancestry', { ...ELF, extraInfection: 3 }).extraInfection).toBe(
      'Extra infection is 0 to 2 levels.',
    );
    const aware = rs.ancestriesById['aware'];
    const subtype = aware?.subtypes[0]?.id ?? '';
    expect(
      validate('ancestry', { ...NAMED, ancestryId: 'aware', subtypeId: subtype, extraInfection: 1 })
        .extraInfection,
    ).toBe('Aware cannot take extra infection levels.');
  });

  it('ancestry: Cryptids must choose what From Legends copies', () => {
    const cryptid = rs.ancestries.ancestries.find((a) => a.sharedAbility.choice);
    if (!cryptid) throw new Error('no From Legends ancestry in the data');
    const draft = { ...NAMED, ancestryId: cryptid.id, subtypeId: cryptid.subtypes[0]?.id ?? '' };
    expect(validate('ancestry', draft).fromLegendsChoice).toMatch(/^Choose the ability/);
    const allowed = cryptid.sharedAbility.choice?.allowedAbilityIds[0] ?? '';
    expect(validate('ancestry', { ...draft, fromLegendsChoice: allowed })).toEqual({});
  });

  it('lxp: one of the two abilities must be picked', () => {
    expect(validate('lxp', ELF)).toEqual({
      startingLxpAbilityId: 'Choose which ability starts at level 2.',
    });
    expect(validate('lxp', { ...ELF, startingLxpAbilityId: 'shrug-it-off' })).not.toEqual({});
    expect(validate('lxp', { ...ELF, startingLxpAbilityId: 'accuracy' })).toEqual({});
    expect(validate('lxp', { ...ELF, startingLxpAbilityId: 'quick-reflexes' })).toEqual({});
  });

  it('review: passes a complete draft and reports engine reasons otherwise', () => {
    expect(validate('review', { ...ELF, startingLxpAbilityId: 'accuracy' })).toEqual({});
    const blocked = validate('review', { ...ELF, ancestryId: 'nowhere' });
    expect(errorMessages(blocked)).toEqual(['Unknown ancestry "nowhere".']);
  });

  it('changing ancestry or subtype clears the choices that depended on it', () => {
    const picked = { ...ELF, extraInfection: 1, startingLxpAbilityId: 'accuracy' };
    expect(selectSubtype(picked, 'elf-stonewalker', rs).startingLxpAbilityId).toBe('');
    const shared = { ...picked, startingLxpAbilityId: 'quick-reflexes' };
    expect(selectSubtype(shared, 'elf-stonewalker', rs).startingLxpAbilityId).toBe(
      'quick-reflexes',
    );
    expect(selectAncestry(picked, 'human')).toMatchObject({
      ancestryId: 'human',
      subtypeId: '',
      extraInfection: 0,
      startingLxpAbilityId: '',
    });
  });

  it('builds the createCharacter command, leaving out blank optional fields', () => {
    expect(toCreateCommand({ ...ELF, startingLxpAbilityId: 'accuracy' }, rs)).toEqual({
      type: 'createCharacter',
      characterName: 'Wren Ashby',
      playerName: 'Jo Park',
      ancestryId: 'elf',
      subtypeId: 'elf-windwalker',
      extraInfection: 0,
      age: 2,
      startingLxpAbilityId: 'accuracy',
    });
    expect(
      toCreateCommand({ ...ELF, playerEmail: ' jo@example.com ', age: '4' }, rs),
    ).toMatchObject({
      playerEmail: 'jo@example.com',
      age: 4,
    });
  });
});

describe('starting skills step', () => {
  const READY: WizardDraft = { ...ELF, startingLxpAbilityId: 'accuracy' };

  it('adds, raises, lowers, and removes picks', () => {
    let draft = setPickLevel(READY, 'assault', 'basic', 1);
    draft = setPickLevel(draft, 'bash', 'basic', 2);
    draft = setPickLevel(draft, 'assault', 'basic', 3);
    expect(draft.startingSkills).toEqual([
      { skillId: 'assault', part: 'basic', level: 3 },
      { skillId: 'bash', part: 'basic', level: 2 },
    ]);
    expect(pickLevel(draft, 'assault', 'basic')).toBe(3);
    expect(pickLevel(draft, 'assault', 'adept')).toBe(0);
    draft = setPickLevel(draft, 'assault', 'basic', 0);
    expect(draft.startingSkills).toEqual([{ skillId: 'bash', part: 'basic', level: 2 }]);
  });

  it('CXP left is 250 plus the infection bonus minus basic levels; AP per pool', () => {
    expect(pickTotals(READY, rs)).toEqual({ cxpTotal: 250, cxpSpent: 0, cxpLeft: 250, pools: [] });
    let draft = { ...READY, extraInfection: 2 };
    draft = setPickLevel(draft, 'assault', 'basic', 3); // 10 + 20 + 30 CXP, earns 1 + 2 + 3 AP
    draft = setPickLevel(draft, 'assault', 'adept', 1); // 3 Warrior AP
    draft = setPickLevel(draft, 'aimed-strike', 'basic', 1); // 10 CXP, 1 Rogue AP
    expect(pickTotals(draft, rs)).toEqual({
      cxpTotal: 270,
      cxpSpent: 70,
      cxpLeft: 200,
      pools: [
        { archetype: 'warrior', earned: 6, spent: 3, left: 3 },
        { archetype: 'rogue', earned: 1, spent: 0, left: 1 },
      ],
    });
  });

  it('passes the picks to createCharacter and validates them with a dry run', () => {
    const draft = setPickLevel(setPickLevel(READY, 'assault', 'basic', 2), 'assault', 'adept', 1);
    expect(toCreateCommand(draft, rs).startingSkills).toEqual([
      { skillId: 'assault', part: 'basic', level: 2 },
      { skillId: 'assault', part: 'adept', level: 1 },
    ]);
    expect(validate('skills', draft)).toEqual({});
    const dry = dryRunCreate(draft, rs);
    expect(dry.ok).toBe(true);
    if (dry.ok) expect(dry.sheet.points.cxp.available).toBe(220);

    // Removing the basic level that paid for the adept level is allowed, but blocks Next.
    const broken = setPickLevel(draft, 'assault', 'basic', 1);
    expect(errorMessages(validate('skills', broken))).toEqual([
      'Not enough Warrior AP: needs 3, 1 left.',
    ]);
    expect(validate('skills', setPickLevel(READY, 'assault', 'basic', 7))).toEqual({
      form: ['Not enough CXP: needs 280, 250 left.'],
    });
  });

  it('zero skills is allowed', () => {
    expect(validate('skills', READY)).toEqual({});
    expect(toCreateCommand(READY, rs)).not.toHaveProperty('startingSkills');
  });

  it('multi-archetype skills carry the chosen archetype; followers use the same one', () => {
    let draft = setPickLevel(READY, 'bardic-performance', 'basic', 1);
    expect(errorMessages(validate('skills', draft))[0]).toMatch(/^Choose the archetype/);
    draft = { ...draft, skillArchetypes: { 'bardic-performance': 'magic' } };
    draft = setPickLevel(draft, 'bardic-performance-memorization', 'main', 1);
    expect(toCreateCommand(draft, rs).startingSkills).toEqual([
      { skillId: 'bardic-performance', part: 'basic', level: 1, archetype: 'magic' },
      { skillId: 'bardic-performance-memorization', part: 'main', level: 1 },
    ]);
    expect(pickArchetype(draft, rs, 'bardic-performance-memorization')).toBe('magic');
    expect(pickTotals(draft, rs).pools).toEqual([
      { archetype: 'magic', earned: 1, spent: 1, left: 0 },
    ]);
    expect(validate('skills', draft)).toEqual({});
  });
});
