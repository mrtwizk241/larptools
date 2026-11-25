// learnSkill: buy levels and Techniques of one skill ([SKL-LEVELS], [SKL-COST], [SKL-TECH],
// [SKL-ADV], [SKL-TEACH], [SKL-CREATE-LIMIT], [CALL-TECH], [RACE-COMMON]). One skill.learned per
// step. Shared by createCharacter, startCalling, and approveRequest through evaluateLearn().
//
// Rules:
// - Levels in order 1 to 10 (a level above the next buys every level in between); Techniques
//   tiered with their level gates. Level n costs 5n; Techniques 5, 10, 15 (ruleset.json).
// - Calling skills cost CXP and only on the active Calling, with the [CALL-TECH] rules.
// - Racial skills only for the character's race (Q-RACE-11); a skill a racial skill replaces
//   (Clockwork Armor Plating replaces Wear Armor) cannot be bought.
// - The active Calling's blocked magic school (Elemental Mage detriment) cannot be bought.
// - Advanced skills need every prerequisite group at the Master Technique.
// - Creation: levels up to 5 and Techniques up to Expert, unless a retirement rebuild.
// - Teacher: Basic and each Technique after creation. Staff may leave it blank (unverified,
//   Q-SKL-4); player requests must name one. A Mist Token teaching purchase counts as the teacher.
// - The build playground (PlanContext.playground) asks for no teacher and skips the Calling
//   Technique rules about events.
import { z } from 'zod';
import type { SyRuleset } from '../../data/index.ts';
import { RefIdSchema } from '../actions/define.ts';
import { notice, ruleError } from '../errors.ts';
import { EventKeySchema, IdSchema, SkillStepSchema, stepLabel, type SkillStep } from '../model.ts';
import { callingTechniqueErrors } from '../rules/calling.ts';
import { skillCurrency, stepCost } from '../rules/costs.ts';
import {
  applyStep,
  checkPrereqs,
  label,
  stepOrderProblem,
  tierOf,
  type OwnedSkill,
} from '../rules/skills.ts';
import type { Sheet } from '../sheet.ts';
import { teachingKey } from '../derive/draft.ts';
import { defineCommand, evaluation, type Builder, type Evaluation } from './define.ts';
import { available, OptionalShortText, OptionalText, ownedFromSheet } from './helpers.ts';

export const LearnSkillCommand = z.object({
  type: z.literal('learnSkill'),
  skillId: RefIdSchema,
  /** One Technique, or a level (every level up to it is bought, in order). */
  step: SkillStepSchema,
  teacher: OptionalShortText,
  /** An mt.spent teaching purchase (action id) used instead of a teacher. */
  viaMt: IdSchema.optional(),
  /** Needed for Calling Techniques; recorded in the Log of Learning. */
  eventKey: EventKeySchema.optional(),
  note: OptionalText,
});
export type LearnSkillCommand = z.input<typeof LearnSkillCommand>;

export interface LearnInput {
  readonly skillId: string;
  /** Steps in purchase order. */
  readonly steps: readonly SkillStep[];
  readonly teacher?: string | undefined;
  readonly viaMt?: string | undefined;
}

export interface LearnOptions {
  readonly atCreation: boolean;
  /** Creation from a retirement: the creation limits do not apply ([RET-REBUILD]). */
  readonly retirementRebuild?: boolean | undefined;
  /** Player requests must name a teacher for Basic and Techniques. */
  readonly requireTeacher?: boolean | undefined;
  /** Skip the active-Calling check (startCalling buys the Basics with the start). */
  readonly callingStarting?: string | undefined;
  readonly causedBy?: string | undefined;
  readonly eventKey?: string | undefined;
  readonly note?: string | undefined;
}

/** Expands a learnSkill step: a level above the next one buys every level in between. */
export function expandStep(current: OwnedSkill, step: SkillStep): SkillStep[] {
  if (!('level' in step) || step.level <= current.level + 1) return [step];
  const steps: SkillStep[] = [];
  for (let n = current.level + 1; n <= step.level; n++) steps.push({ level: n });
  return steps;
}

function blockedSchoolSkill(ruleset: SyRuleset, sheet: Sheet): string[] {
  return sheet.stats.other
    .filter((o) => o.stat === 'blockedMagicSchool' && typeof o.value === 'string')
    .map((o) => ruleset.ruleset.magicSchools.find((s) => s.id === o.value)?.skill ?? '')
    .filter((id) => id !== '');
}

/**
 * Validates buying `input.steps` and, when allowed, adds one skill.learned per step to the
 * builder.
 */
export function evaluateLearn(
  ruleset: SyRuleset,
  sheet: Sheet,
  input: LearnInput,
  options: LearnOptions,
  builder: Builder,
): Evaluation {
  const ev = evaluation();
  const skill = ruleset.skillsById[input.skillId];
  if (!skill) {
    ev.errors.push(ruleError('UNKNOWN_SKILL', `Unknown skill "${input.skillId}".`, 'SKL-LEVELS'));
    return ev;
  }
  const owned = ownedFromSheet(sheet);
  const start = owned(skill.id);

  // Order: each step must come next on the running state.
  let state = start;
  for (const step of input.steps) {
    const problem = stepOrderProblem(ruleset, state, step);
    if (problem) {
      ev.errors.push(
        ruleError(problem.code, `${skill.name} ${stepLabel(step)}: ${problem.message}`, 'SKL-TECH'),
      );
      return ev;
    }
    state = applyStep(state, step);
  }
  if (input.steps.length === 0) {
    ev.errors.push(ruleError('NOTHING_TO_BUY', `Nothing to buy for ${skill.name}.`, 'SKL-LEVELS'));
    return ev;
  }

  // Who may buy it.
  const raceId = sheet.race?.raceId ?? null;
  if (skill.category === 'racial' && skill.raceId !== raceId)
    ev.errors.push(
      ruleError(
        'RACIAL_SKILL_OTHER_RACE',
        `${skill.name} is a ${ruleset.racesById[skill.raceId]?.name ?? skill.raceId} racial skill.`,
        'RACE-COMMON',
      ),
    );
  const race = raceId ? ruleset.racesById[raceId] : undefined;
  const replacer = race?.skills.find((s) => s.replacesSkill === skill.id);
  if (replacer)
    ev.errors.push(
      ruleError(
        'SKILL_REPLACED',
        `${race?.name ?? 'This race'} uses ${replacer.name} instead of ${skill.name}.`,
        'RACE-SHEET',
      ),
    );
  if (blockedSchoolSkill(ruleset, sheet).includes(skill.id))
    ev.errors.push(
      ruleError(
        'MAGIC_SCHOOL_BLOCKED',
        `The ${sheet.calling?.name ?? 'active Calling'} cannot learn ${skill.name} (its opposing element).`,
        'CALL-ELEMENTAL-MAGE',
      ),
    );

  const techniques = input.steps.filter(
    (s): s is { technique: 'expert' | 'master' | 'grandmaster' } => 'technique' in s,
  );
  if (skill.category === 'calling') {
    const active = sheet.calling?.callingId ?? options.callingStarting ?? null;
    if (skill.callingId !== active) {
      const former = sheet.formerCallings.some((c) => c.callingId === skill.callingId);
      ev.errors.push(
        former
          ? ruleError(
              'CALLING_SKILL_LOCKED',
              `${skill.name} belongs to a Calling the character left; it is locked.`,
              'CALL-CHANGE',
            )
          : ruleError(
              'CALLING_NOT_ACTIVE',
              `${skill.name} is a ${ruleset.callingsById[skill.callingId]?.name ?? skill.callingId} skill; start that Calling first.`,
              'CALL-SKILLS',
            ),
      );
    } else if (techniques.length > 0 && sheet.calling) {
      const calling = ruleset.callingsById[skill.callingId];
      const eventKey = options.eventKey ?? null;
      if (calling)
        for (const t of techniques)
          ev.errors.push(
            ...callingTechniqueErrors(ruleset, {
              calling,
              startedEventKey: sheet.calling.startedEventKey,
              skillId: skill.id,
              technique: t.technique,
              eventKey,
              owned,
              checkIns: sheet.events,
              techniqueEventKeys: sheet.calling.techniqueEvents.map((e) => e.eventKey),
              playground: builder.playground,
            }),
          );
    }
  }

  // Advanced skill prerequisites.
  const prereq = checkPrereqs(ruleset, skill, owned);
  for (const u of prereq.unmet)
    ev.errors.push(ruleError('PREREQ_NOT_MET', `${skill.name} needs ${u}.`, 'SKL-ADV'));

  // Creation limits.
  const c = ruleset.ruleset.creation;
  if (options.atCreation && !options.retirementRebuild) {
    if (state.level > c.maxSkillLevel)
      ev.errors.push(
        ruleError(
          'CREATION_LEVEL_LIMIT',
          `At creation skills go up to level ${c.maxSkillLevel}; ${skill.name} would be level ${state.level}.`,
          'SKL-CREATE-LIMIT',
        ),
      );
    for (const t of techniques)
      if (tierOf(t.technique) > tierOf(c.maxTechnique))
        ev.errors.push(
          ruleError(
            'CREATION_TECHNIQUE_LIMIT',
            `At creation Techniques go up to ${label(c.maxTechnique)}; ${skill.name} ${label(t.technique)} is not allowed.`,
            'SKL-CREATE-LIMIT',
          ),
        );
  }
  if (options.atCreation && options.retirementRebuild) {
    const coinPaid: readonly string[] = ruleset.ruleset.retirement.coinPaidTechniques;
    for (const t of techniques)
      if (coinPaid.includes(t.technique))
        ev.notices.push(
          notice(
            'COIN_PAID_TEACHING',
            `${skill.name} ${label(t.technique)} Technique: the teaching is paid in coin from the retirement goods.`,
            'RET-REBUILD',
          ),
        );
  }

  // Teacher for Basic and Techniques (or a Mist Token teaching). Not in the build playground.
  const taught = input.steps.filter((s) => teachingKey(s) !== null);
  const teacher = input.teacher?.trim() ?? '';
  const teacherRequired = !options.atCreation && taught.length > 0 && !builder.playground;
  ev.teacherRequired = teacherRequired;
  let viaMtStep: SkillStep | null = null;
  if (input.viaMt !== undefined) {
    const purchase = sheet.mtPurchases.find((m) => m.actionId === input.viaMt);
    const first = taught[0];
    const key = first ? teachingKey(first) : null;
    if (!purchase || purchase.skillId === null)
      ev.errors.push(
        ruleError(
          'MT_TEACHING_INVALID',
          'That is not a Mist Token teaching purchase.',
          'PTS-MT-SPEND',
        ),
      );
    else if (purchase.usedBy !== null)
      ev.errors.push(
        ruleError(
          'MT_TEACHING_INVALID',
          'That Mist Token teaching was already used.',
          'PTS-MT-SPEND',
        ),
      );
    else if (purchase.skillId !== skill.id || taught.length !== 1 || purchase.namedLevel !== key)
      ev.errors.push(
        ruleError(
          'MT_TEACHING_INVALID',
          `That Mist Token teaching is for ${ruleset.skillsById[purchase.skillId]?.name ?? purchase.skillId} ${label(purchase.namedLevel ?? 'basic')}.`,
          'PTS-MT-SPEND',
        ),
      );
    else viaMtStep = first ?? null;
  } else if (teacherRequired && teacher === '') {
    const what = taught.map((s) => `${skill.name} ${'level' in s ? 'Basic' : label(s.technique)}`);
    if (options.requireTeacher)
      ev.errors.push(
        ruleError('TEACHER_REQUIRED', `Name the teacher for ${what.join(' and ')}.`, 'SKL-TEACH'),
      );
    else
      ev.notices.push(
        notice(
          'TEACHER_MISSING',
          `No teacher recorded for ${what.join(' and ')}; it is marked unverified.`,
          'SKL-LOG',
        ),
      );
  }

  // Cost.
  const currency = skillCurrency(skill);
  const costs = input.steps.map((s) => stepCost(ruleset, s));
  const total = costs.reduce((n, x) => n + x, 0);
  ev.cost = { currency, amount: total };
  const left = available(sheet, currency);
  // The build playground spends past its points budget (the UI counts the events needed).
  if (total > left && !builder.playground)
    ev.errors.push(
      ruleError(
        currency === 'cxp' ? 'NOT_ENOUGH_CXP' : 'NOT_ENOUGH_XP',
        `Not enough ${currency.toUpperCase()}: needs ${total}, ${left} left.`,
        currency === 'cxp' ? 'CALL-COST' : 'SKL-COST',
      ),
    );

  if (ev.errors.length > 0) return ev;
  input.steps.forEach((step, i) => {
    const isTaught = teachingKey(step) !== null;
    builder.add(
      'skill.learned',
      {
        skillId: skill.id,
        step,
        currency,
        cost: costs[i] ?? 0,
        ...(isTaught && teacher !== '' ? { teacher } : {}),
        ...(viaMtStep === step && input.viaMt ? { viaMt: input.viaMt } : {}),
        atCreation: options.atCreation,
      },
      { causedBy: options.causedBy, eventKey: options.eventKey, note: options.note },
    );
  });
  return ev;
}

export const learnSkill = defineCommand<z.output<typeof LearnSkillCommand>>({
  type: 'learnSkill',
  schema: LearnSkillCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const current = ownedFromSheet(sheet)(cmd.skillId);
    return evaluateLearn(
      ruleset,
      sheet,
      {
        skillId: cmd.skillId,
        steps: expandStep(current, cmd.step),
        teacher: cmd.teacher,
        viaMt: cmd.viaMt,
      },
      { atCreation: false, eventKey: cmd.eventKey, note: cmd.note },
      builder,
    );
  },
});
