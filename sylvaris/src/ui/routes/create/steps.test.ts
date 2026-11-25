import { describe, expect, it } from 'vitest';
import { loadRuleset } from '../../../engine/index.ts';
import {
  EMPTY_DRAFT,
  WIZARD_STEPS,
  advancedReason,
  asDraft,
  choiceOptionLabel,
  dryRun,
  errorMessages,
  reviewHints,
  selectRace,
  setChoice,
  setExpert,
  setItemCount,
  setItemDetail,
  setSkillLevel,
  setTechnique,
  skillLimits,
  staffCommands,
  techniqueGivesText,
  toSubmission,
  xpTotals,
  type StepId,
  type WizardDraft,
} from './steps.ts';

const rs = loadRuleset();
const ctx = { playerLocked: false };
const step = (id: StepId) => {
  const found = WIZARD_STEPS.find((s) => s.id === id);
  if (!found) throw new Error(id);
  return found;
};
const messages = (id: StepId, draft: WizardDraft, playerLocked = false) =>
  errorMessages(step(id).validate(draft, rs, { playerLocked }));

/** Wren Ashby: a Human with Toughness 3 and the Expert Technique, a spell, and armor. */
function wren(): WizardDraft {
  let d: WizardDraft = { ...EMPTY_DRAFT, characterName: 'Wren Ashby', playerName: 'Sam Reed' };
  d = selectRace(d, 'human', rs);
  d = setSkillLevel(d, 'toughness', 3, rs);
  d = setExpert(d, 'toughness', true);
  d = setItemCount(d, 'basic-spell', 1);
  d = setItemDetail(d, 'basic-spell', 0, 'grant-life');
  d = setItemCount(d, 'basic-armor', 1);
  return { ...d, backstory: 'Raised by river folk.' };
}

describe('create wizard steps', () => {
  it('has six steps in order', () => {
    expect(WIZARD_STEPS.map((s) => s.title)).toEqual([
      'Concept and profile',
      'Race',
      'Skills',
      'Starting items',
      'Backstory',
      'Review',
    ]);
  });

  it('needs a character name, and a player name only from staff', () => {
    expect(messages('profile', EMPTY_DRAFT)).toEqual([
      'Enter the character name.',
      'Enter the player name.',
    ]);
    expect(messages('profile', { ...EMPTY_DRAFT, characterName: 'Wren' }, true)).toEqual([]);
    expect(
      messages('profile', {
        ...EMPTY_DRAFT,
        characterName: 'W',
        playerName: 'P',
        playerEmail: 'x',
      }),
    ).toEqual(['Enter an email address like name@example.com, or leave it blank.']);
  });

  it('needs a race and its required choices', () => {
    expect(messages('race', EMPTY_DRAFT)).toEqual(['Choose a race.']);
    const dragon = selectRace(EMPTY_DRAFT, 'dragonborn', rs);
    expect(messages('race', dragon)).toEqual([
      'Choose the element for Dragonborn.',
      'Choose the natural weapon for Dragonborn.',
    ]);
    const done = setChoice(setChoice(dragon, 'element', 'fire'), 'natural-weapon', 'bite');
    expect(messages('race', done)).toEqual([]);
    expect(choiceOptionLabel(rs, rs.racesById.dragonborn!, 'natural-weapon', 'bite')).toBe(
      'Bite (Greatclaw), base 3 damage',
    );
    expect(choiceOptionLabel(rs, rs.racesById.dragonborn!, 'element', 'fire')).toBe('Fire');
  });

  it('keeps the Elf extra language apart from the literacy language', () => {
    const elf = setChoice(selectRace(EMPTY_DRAFT, 'elf', rs), 'bonus-language', 'elven');
    expect(messages('race', elf)).toEqual([
      'Elven is already the language the character reads and writes. Choose another.',
    ]);
    expect(messages('race', { ...elf, literacy: 'common' })).toEqual([]);
  });

  it('needs size for Beast-Kin and Fae, and checks the age category', () => {
    const fae = selectRace(EMPTY_DRAFT, 'fae', rs);
    expect(messages('race', fae)).toEqual(['Choose the size for Fae.']);
    const human = selectRace(EMPTY_DRAFT, 'human', rs);
    expect(messages('race', { ...human, ageCategory: 1 })).toEqual([
      'Choose an age category from 2 to 10.',
    ]);
  });

  it('counts XP for levels and the Expert Technique', () => {
    expect(xpTotals(wren(), rs)).toEqual({ total: 150, spent: 35, left: 115 });
    // Below level 3 the Expert Technique is dropped.
    expect(setSkillLevel(wren(), 'toughness', 2, rs).skills).toEqual([
      { skillId: 'toughness', level: 2, expert: false },
    ]);
  });

  it('shows engine errors in words when the picks break the rules', () => {
    let d = selectRace(EMPTY_DRAFT, 'human', rs);
    d = setSkillLevel(d, 'toughness', 5, rs);
    d = setSkillLevel(d, 'aggression', 5, rs);
    expect(xpTotals(d, rs).left).toBe(0);
    d = setSkillLevel(d, 'evasion', 1, rs);
    const found = messages('skills', d);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]).toMatch(/XP/);
  });

  it('drops the old race racial skills when the race changes', () => {
    let d = selectRace(EMPTY_DRAFT, 'human', rs);
    d = setSkillLevel(d, 'quick-learner', 1, rs);
    d = setSkillLevel(d, 'toughness', 1, rs);
    expect(selectRace(d, 'elf', rs).skills.map((s) => s.skillId)).toEqual(['toughness']);
  });

  it('says why advanced skills are not available', () => {
    expect(advancedReason(rs, 'assassinate')).toBe(
      'Not available at creation. It needs Back Strike, and Nerve Pinch at the Master Technique, and a new character can only reach the Expert Technique.',
    );
  });

  it('asks which spell a Basic spell pick is, and refuses the same spell twice', () => {
    let d = setItemCount(wren(), 'basic-spell', 2);
    expect(messages('items', d)).toEqual(['Basic Spell in Spellbook 2: choose the spell.']);
    d = setItemDetail(d, 'basic-spell', 1, 'grant-life');
    expect(messages('items', d)[0]).toMatch(/already picked/);
    expect(messages('items', setItemCount(wren(), 'coin-5-copper', 9))).toEqual([
      'Choose at most 10 starting items; 11 chosen.',
    ]);
  });

  it('plans the whole character in a dry run', () => {
    const result = dryRun(wren(), rs);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sheet.stats.lifePoints.value).toBe(30);
    expect(result.sheet.points.xp.available).toBe(115);
    expect(result.sheet.journals.spellbook.map((e) => e.refId)).toEqual(['grant-life']);
    expect(result.sheet.profile.backstory).toBe('Raised by river folk.');
    expect(staffCommands(wren(), rs).map((c) => c.type)).toEqual([
      'createCharacter',
      'setStartingItems',
      'addJournal',
    ]);
    expect(staffCommands(wren(), rs)[0]).toMatchObject({ backstory: 'Raised by river folk.' });
  });

  it('builds the submission body the server accepts', () => {
    const body = toSubmission(wren(), rs, 'c-1', { name: 'Test Player', email: 'p@test.invalid' });
    expect(body.skills).toEqual([
      { type: 'learnSkill', skillId: 'toughness', step: { level: 3 } },
      { type: 'learnSkill', skillId: 'toughness', step: { technique: 'expert' } },
    ]);
    expect(body.items).toEqual({
      type: 'setStartingItems',
      picks: [{ optionId: 'basic-armor' }, { optionId: 'basic-spell', detail: 'grant-life' }],
    });
    expect(body.journals).toEqual([
      { type: 'addJournal', kind: 'spell', refId: 'grant-life', source: 'starting' },
    ]);
    expect(body.draft.backstory).toBe('Raised by river folk.');
    expect(body.create.backstory).toBe('Raised by river folk.');
  });

  it('reads a saved draft safely', () => {
    expect(asDraft(null)).toEqual(EMPTY_DRAFT);
    expect(asDraft(JSON.parse(JSON.stringify(wren())))).toEqual(wren());
    expect(asDraft({ skills: [{ skillId: 1 }], items: { a: [3] }, literacy: 'x' })).toEqual({
      ...EMPTY_DRAFT,
      items: { a: [''] },
    });
  });

  it('runs the review over every step', () => {
    expect(messages('review', EMPTY_DRAFT)[0]).toBe(
      'Concept and profile: Enter the character name.',
    );
    expect(messages('review', wren())).toEqual([]);
    void ctx;
  });
});

// Acceptance AC-7: what a Technique gives, and the Review hints.
describe('Technique labels and review hints', () => {
  it('says what the Expert Technique gives', () => {
    const skill = (id: string) => {
      const s = rs.skillsById[id];
      if (!s) throw new Error(id);
      return s;
    };
    expect(techniqueGivesText(skill('toughness'), 'expert')).toBe('+20 Life Points');
    expect(techniqueGivesText(skill('stun'), 'expert')).toBe('Expert ability, 2 uses');
  });

  it('warns about unspent XP and a skill at level 3 without its Expert Technique', () => {
    let d: WizardDraft = { ...EMPTY_DRAFT, characterName: 'Pell', playerName: 'Sam Reed' };
    d = selectRace(d, 'human', rs);
    d = setSkillLevel(d, 'toughness', 3, rs);
    const hints = reviewHints(d, rs);
    expect(hints[0]).toBe(
      '120 XP is not spent. It stays on the character, but check that no level or Technique was missed.',
    );
    expect(hints[1]).toBe(
      'Toughness is level 3 without its Expert Technique (+20 Life Points; 5 XP).',
    );
    expect(reviewHints(wren(), rs).some((h) => h.startsWith('Toughness'))).toBe(false);
  });
});

// AC-1: a character built from a retirement carry-over ([RET-REBUILD]).
describe('retirement rebuild', () => {
  const retirement = {
    characterId: 'char-old-bear',
    fromName: 'Old Bear',
    xp: 300,
    cxp: 50,
    axp: 5,
    coinCopper: 100,
  };
  function youngBear(): WizardDraft {
    let d: WizardDraft = {
      ...EMPTY_DRAFT,
      characterName: 'Young Bear',
      playerName: 'Sam Reed',
      retirement,
    };
    d = selectRace(d, 'human', rs);
    d = setSkillLevel(d, 'toughness', 6, rs);
    d = setTechnique(d, 'toughness', 'expert', true);
    d = setTechnique(d, 'toughness', 'master', true);
    return d;
  }

  it('starts with the carry-over and lifts the creation limits', () => {
    const d = youngBear();
    expect(skillLimits(d, rs)).toEqual({
      maxLevel: 10,
      techniques: ['expert', 'master', 'grandmaster'],
    });
    expect(skillLimits(EMPTY_DRAFT, rs).maxLevel).toBe(5);
    // hand-derived: levels 1..6 = 105, Expert 5, Master 10 = 120 of 300
    expect(xpTotals(d, rs)).toEqual({ total: 300, spent: 120, left: 180 });
    const result = dryRun(d, rs);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sheet.profile.retirementFrom).toMatchObject({ fromName: 'Old Bear', xp: 300 });
    expect(result.sheet.points.cxp.earned).toBe(50);
    expect(result.sheet.points.axp.earned).toBe(5);
    expect(result.sheet.owed.map((o) => o.text)).toEqual([
      '100 Copper, retirement carry-over from Old Bear',
    ]);
    // The same skills without the retirement break the creation limits.
    expect(dryRun({ ...d, retirement: null }, rs).ok).toBe(false);
  });

  it('records the carry on the creation and the coin as owed', () => {
    const commands = staffCommands(youngBear(), rs);
    expect(commands[0]).toMatchObject({
      type: 'createCharacter',
      retirement: { fromName: 'Old Bear', xp: 300, cxp: 50, axp: 5, coinCopper: 100 },
      startingSkills: [{ skillId: 'toughness', level: 6, techniques: ['expert', 'master'] }],
    });
    expect(commands.at(-1)).toMatchObject({ type: 'addOwed' });
  });

  it('drops higher Techniques with a lower level or a removed Expert', () => {
    let d = youngBear();
    d = setTechnique(d, 'toughness', 'expert', false);
    expect(d.skills[0]).toEqual({ skillId: 'toughness', level: 6, expert: false });
    d = setTechnique(
      setTechnique(youngBear(), 'toughness', 'expert', true),
      'toughness',
      'master',
      true,
    );
    d = setSkillLevel(d, 'toughness', 5, rs);
    expect(d.skills[0]).toEqual({ skillId: 'toughness', level: 5, expert: true });
  });

  it('keeps the retirement through a saved draft', () => {
    const back = asDraft(JSON.parse(JSON.stringify(youngBear())));
    expect(back.retirement).toEqual(retirement);
    expect(back.skills[0]).toMatchObject({ master: true });
    expect(asDraft({ retirement: { fromName: 'x' } }).retirement).toBeNull();
  });
});
