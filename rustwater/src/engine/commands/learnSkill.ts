// learnSkill: buy the next level(s) of one skill part ([SKL-COST], [SKL-PREREQ], [SKL-LEARN],
// [SKL-MASTERY], [MULTI-RULE], [PTS-CXP-SPEND], [PTS-AP-SPEND]). One skill.learned per level.
//
// Teacher rule (DECISIONS Q-SKL-4, Q-MULTI-6): outside creation a teacher is required for level 1
// of a basic or standalone skill, for every mastery or cognitive power, and for parts the data
// marks teacherRequired. Adept and advanced levels of a known skill may be self-taught.
import { z } from 'zod';
import type { Ruleset, Skill } from '../../data/index.ts';
import { RefIdSchema } from '../actions/define.ts';
import { ruleError, type RuleError } from '../errors.ts';
import { EventKeySchema, SkillPartSchema, type SkillPart } from '../model.ts';
import { currencyOf, levelCost, maxLevelOf } from '../rules/costs.ts';
import { getLevel, tableFromSheet, type LevelTable } from '../rules/levels.ts';
import { checkPrereqs, partName } from '../rules/prereqs.ts';
import type { Sheet } from '../sheet.ts';
import { defineCommand, evaluation, type Builder, type Evaluation } from './define.ts';
import { archetypeName, OptionalShortText, OptionalText, orList } from './helpers.ts';

export const LearnSkillCommand = z.object({
  type: z.literal('learnSkill'),
  skillId: RefIdSchema,
  part: SkillPartSchema,
  /** Defaults to the next level. Higher targets buy every level in between, in order. */
  toLevel: z.int().min(1).max(1000).optional(),
  /** Multi-archetype skills on first purchase: the archetype to buy it in. */
  archetype: RefIdSchema.optional(),
  teacher: OptionalShortText,
  eventKey: EventKeySchema.optional(),
  note: OptionalText,
});
export type LearnSkillCommand = z.input<typeof LearnSkillCommand>;

export interface LearnInput {
  readonly skillId: string;
  readonly part: SkillPart;
  readonly toLevel?: number | undefined;
  readonly archetype?: string | undefined;
  readonly teacher?: string | undefined;
}

export interface LearnOptions {
  readonly atCreation: boolean;
  readonly causedBy?: string | undefined;
  readonly eventKey?: string | undefined;
  readonly note?: string | undefined;
}

/** Rule id for mastery and cognitive-power checks, by skill family. */
export function masteryRuleId(skill: Skill): string {
  switch (skill.category) {
    case 'magic':
      return 'MAG-MASTERY';
    case 'crafting':
      return 'CRF-MASTERY';
    case 'multi':
      return 'MULTI-COG';
    default:
      return 'SKL-MASTERY';
  }
}

function resolveArchetype(
  ruleset: Ruleset,
  skill: Skill,
  table: LevelTable,
  requested: string | undefined,
): { archetype: string | null; error?: RuleError } {
  if (skill.archetype !== undefined) {
    if (requested !== undefined && requested !== skill.archetype)
      return {
        archetype: skill.archetype,
        error: ruleError(
          'ARCHETYPE_INVALID',
          `${skill.name} is a ${archetypeName(ruleset, skill.archetype)} skill.`,
          'SKL-ARCH',
        ),
      };
    return { archetype: skill.archetype };
  }
  const options = skill.archetypeOptions ?? [];
  const optionNames = orList(options.map((a) => archetypeName(ruleset, a)));
  const rule = skill.archetypeRule;
  const locked =
    table.get(skill.id)?.chosenArchetype ??
    (rule?.kind === 'same-as-skill' ? (table.get(rule.skill)?.chosenArchetype ?? null) : null);
  if (locked !== null) {
    if (requested !== undefined && requested !== locked) {
      const name = archetypeName(ruleset, locked);
      return {
        archetype: locked,
        error: ruleError(
          'ARCHETYPE_LOCKED',
          `${skill.name} was bought in ${name}; every later purchase uses ${name}.`,
          'MULTI-RULE',
        ),
      };
    }
    return { archetype: locked };
  }
  if (requested !== undefined && !options.includes(requested))
    return {
      archetype: null,
      error: ruleError(
        'ARCHETYPE_INVALID',
        `${skill.name} can be bought in ${optionNames}, not "${requested}".`,
        'MULTI-RULE',
      ),
    };
  if (requested === undefined) {
    // same-as-skill without the parent skill: the prerequisite error explains it.
    if (rule?.kind === 'same-as-skill') return { archetype: null };
    return {
      archetype: null,
      error: ruleError(
        'ARCHETYPE_REQUIRED',
        `Choose the archetype for ${skill.name}: ${optionNames}.`,
        'MULTI-RULE',
      ),
    };
  }
  return { archetype: requested };
}

/**
 * Validates buying `input` and, when allowed, adds one skill.learned per level to the builder.
 * Shared by learnSkill and createCharacter.
 */
export function evaluateLearn(
  ruleset: Ruleset,
  sheet: Sheet,
  input: LearnInput,
  options: LearnOptions,
  builder: Builder,
): Evaluation {
  const ev = evaluation();
  const skill = ruleset.skillsById[input.skillId];
  if (!skill) {
    ev.errors.push(ruleError('UNKNOWN_SKILL', `Unknown skill "${input.skillId}".`, 'SKL-LIST'));
    return ev;
  }
  const def = skill.parts[input.part];
  if (!def) {
    ev.errors.push(
      ruleError('UNKNOWN_PART', `${skill.name} has no ${input.part} part.`, 'SKL-TYPES'),
    );
    return ev;
  }
  const name = partName(ruleset, skill.id, input.part);
  const table = tableFromSheet(sheet);
  const current = getLevel(table, skill.id, input.part);
  const toLevel = input.toLevel ?? current + 1;
  if (toLevel <= current) {
    ev.errors.push(
      ruleError('ALREADY_AT_LEVEL', `${name} is already level ${current}.`, 'SKL-COST'),
    );
    return ev;
  }
  const max = maxLevelOf(ruleset, def.costKind);
  if (max !== null && toLevel > max) {
    ev.errors.push(
      ruleError(
        'MAX_LEVEL',
        current >= max
          ? `${name} is at its maximum level ${max}.`
          : `${name} only goes up to level ${max}.`,
        'SKL-COST',
      ),
    );
    return ev;
  }

  const { archetype, error } = resolveArchetype(ruleset, skill, table, input.archetype);
  if (error) ev.errors.push(error);

  const isMastery = def.costKind === 'mastery' || skill.cognitivePower === true;
  const prereq = checkPrereqs(ruleset, def.prereqs, table);
  const prereqRule = def.costKind === 'mastery' ? masteryRuleId(skill) : 'SKL-PREREQ';
  for (const u of prereq.unmet)
    ev.errors.push(ruleError('PREREQ_NOT_MET', `Needs ${u}.`, prereqRule));
  if (
    skill.archetypeRule?.kind === 'one-of-prereq-archetypes' &&
    prereq.ok &&
    archetype !== null &&
    !prereq.usable.has(archetype)
  ) {
    const usable = [...prereq.usable].map((a) => archetypeName(ruleset, a));
    ev.errors.push(
      ruleError(
        'ARCHETYPE_INVALID',
        `${skill.name} must be paid from an archetype used for its prerequisites: ${orList(usable)}.`,
        'MULTI-COG',
      ),
    );
  }

  if (options.atCreation && (def.notAtCreation === true || isMastery))
    ev.errors.push(
      ruleError(
        'NOT_AT_CREATION',
        `${name} cannot be learned at character creation.`,
        masteryRuleId(skill),
      ),
    );

  const teacherRequired =
    !options.atCreation &&
    (def.teacherRequired === true ||
      isMastery ||
      (current === 0 && (input.part === 'basic' || input.part === 'main')));
  const teacher = input.teacher?.trim() ?? '';
  ev.teacherRequired = teacherRequired;
  if (teacherRequired && teacher === '')
    ev.errors.push(
      ruleError(
        'TEACHER_REQUIRED',
        `A teacher is needed to learn ${name}${current === 0 && max !== 1 ? ' level 1' : ''}.`,
        'SKL-LEARN',
      ),
    );

  const currency = currencyOf(def.costKind);
  const steps: { level: number; cost: number }[] = [];
  let total = 0;
  for (let n = current + 1; n <= toLevel; n++) {
    const cost = levelCost(ruleset, def.costKind, n);
    steps.push({ level: n, cost });
    total += cost;
  }
  if (currency === 'cxp') {
    ev.cost = { currency, amount: total };
    const available = sheet.points.cxp.available;
    if (total > available)
      ev.errors.push(
        ruleError(
          'NOT_ENOUGH_CXP',
          `Not enough CXP: needs ${total}, ${available} left.`,
          'PTS-CXP-SPEND',
        ),
      );
  } else if (archetype !== null) {
    ev.cost = { currency, amount: total, archetype };
    const available = sheet.points.ap[archetype]?.available ?? 0;
    if (total > available)
      ev.errors.push(
        ruleError(
          'NOT_ENOUGH_AP',
          `Not enough ${archetypeName(ruleset, archetype)} AP: needs ${total}, ${available} left.`,
          'PTS-AP-SPEND',
        ),
      );
  } else {
    ev.cost = { currency, amount: total };
  }

  if (ev.errors.length > 0) return ev;
  if (archetype === null) {
    ev.errors.push(
      ruleError('ARCHETYPE_REQUIRED', `Choose the archetype for ${skill.name}.`, 'MULTI-RULE'),
    );
    return ev;
  }
  const multi = skill.archetype === undefined;
  for (const step of steps) {
    builder.add(
      'skill.learned',
      {
        skillId: skill.id,
        part: input.part,
        toLevel: step.level,
        cost: { currency, amount: step.cost },
        ...(teacher !== '' ? { teacher } : {}),
        atCreation: options.atCreation,
        ...(multi ? { archetype } : {}),
      },
      { causedBy: options.causedBy, eventKey: options.eventKey, note: options.note },
    );
  }
  return ev;
}

export const learnSkill = defineCommand<z.output<typeof LearnSkillCommand>>({
  type: 'learnSkill',
  schema: LearnSkillCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    return evaluateLearn(
      ruleset,
      sheet,
      cmd,
      { atCreation: false, eventKey: cmd.eventKey, note: cmd.note },
      builder,
    );
  },
});
