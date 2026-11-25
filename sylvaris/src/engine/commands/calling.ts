// startCalling, leaveCalling, setCallingChoices ([CALL-ELIGIBLE], [CALL-CHANGE], Calling
// choices).
// - Start: at an event the character checked in at, with at least 5 full events dated before
//   it (Q-CALL-11), 10 CXP for Basic in both skills (paid in CXP from the cost table), no active
//   Calling, a later event than leaving the last one, choices valid.
// - Going back to a former Calling (Q-CALL-14): the normal start rules; its locked skills
//   unlock again, and only skills the character no longer owns are bought.
// - Choices: picks from the options; The Distinctive borrows a racial passive and two different
//   racial skills the character does not own (Q-CALL-10); the Sorcerer's known spells are at
//   most 2 per magic type per spell level the character can cast (Q-CALL-9).
import { z } from 'zod';
import type { SyCalling, SyRuleset } from '../../data/index.ts';
import { ChoicesSchema, RefIdSchema } from '../actions/define.ts';
import { notice, ruleError, type RuleError } from '../errors.ts';
import { EventKeySchema, eventKeyDate } from '../model.ts';
import { fullEventsBefore } from '../rules/calling.ts';
import { stepCost } from '../rules/costs.ts';
import { namedLevelUnlocked } from '../rules/skills.ts';
import type { Choices, Sheet } from '../sheet.ts';
import { defineCommand, evaluation } from './define.ts';
import { OptionalShortText, OptionalText, ownedFromSheet, plural } from './helpers.ts';
import { evaluateLearn } from './learnSkill.ts';

/** Checks Calling choices against the data and the sheet. */
export function callingChoiceErrors(
  ruleset: SyRuleset,
  calling: SyCalling,
  sheet: Sheet,
  choices: Choices,
): RuleError[] {
  const errors: RuleError[] = [];
  const RULE = 'CALL-CHOICES';
  const defs = new Map((calling.choices ?? []).map((c) => [c.id, c]));
  for (const id of Object.keys(choices))
    if (!defs.has(id))
      errors.push(ruleError('CHOICE_INVALID', `${calling.name} has no choice "${id}".`, RULE));
  const race = sheet.race ? ruleset.racesById[sheet.race.raceId] : undefined;
  const ownInnates = new Set(race?.innate.map((i) => i.id) ?? []);
  const owned = ownedFromSheet(sheet);
  const pickedSkills: string[] = [];
  for (const def of calling.choices ?? []) {
    const value = choices[def.id];
    const values = value === undefined ? [] : typeof value === 'string' ? [value] : [...value];
    // Picks limited by a passive number (Reliquist permanent damage types) grow with Techniques.
    if (def.maxFromPassives) {
      const max = Number(sheet.stats.other.find((o) => o.stat === def.maxFromPassives)?.value ?? 0);
      if (values.length > max)
        errors.push(ruleError('CHOICE_INVALID', `${def.label}: at most ${max} so far.`, RULE));
    }
    if (value === undefined) {
      const required =
        (def.kind === 'pick' && !def.multi && !def.maxFromPassives) ||
        def.kind === 'racial-passive' ||
        def.kind === 'racial-skill';
      if (required) errors.push(ruleError('CHOICE_REQUIRED', `Choose ${def.label}.`, RULE));
      continue;
    }
    if (def.kind === 'pick') {
      if (!def.multi && values.length > 1)
        errors.push(ruleError('CHOICE_INVALID', `${def.label}: choose one.`, RULE));
      for (const v of values)
        if (!def.options?.includes(v))
          errors.push(ruleError('CHOICE_INVALID', `${def.label}: "${v}" is not an option.`, RULE));
    }
    if (def.kind === 'racial-passive')
      for (const v of values) {
        const innate = ruleset.raceInnatesById[v];
        if (!innate || innate.kind !== 'passive')
          errors.push(
            ruleError('CHOICE_INVALID', `${def.label}: "${v}" is not a racial passive.`, RULE),
          );
        else if (def.excludeOwned && ownInnates.has(v))
          errors.push(
            ruleError('CHOICE_INVALID', `${def.label}: the character already has it.`, RULE),
          );
      }
    if (def.kind === 'racial-skill')
      for (const v of values) {
        const skill = ruleset.skillsById[v];
        if (!skill || skill.category !== 'racial')
          errors.push(
            ruleError('CHOICE_INVALID', `${def.label}: "${v}" is not a racial skill.`, RULE),
          );
        else if (def.excludeOwned && (skill.raceId === race?.id || owned(v).level > 0))
          errors.push(
            ruleError(
              'CHOICE_INVALID',
              `${def.label}: the character already has ${skill.name}.`,
              RULE,
            ),
          );
        else if (pickedSkills.includes(v))
          errors.push(
            ruleError('CHOICE_INVALID', `${def.label}: choose two different racial skills.`, RULE),
          );
        pickedSkills.push(v);
      }
    if (def.kind === 'spell-list') {
      const per = def.perMagicTypePerLevel ?? Infinity;
      const counts = new Map<string, number>();
      for (const v of values) {
        const spell = ruleset.spellsById[v];
        const school = spell
          ? ruleset.ruleset.magicSchools.find((s) => s.id === spell.school)
          : undefined;
        if (!spell || !school) {
          errors.push(ruleError('CHOICE_INVALID', `${def.label}: unknown spell "${v}".`, RULE));
          continue;
        }
        if (!namedLevelUnlocked(owned(school.skill), spell.level))
          errors.push(
            ruleError(
              'CHOICE_INVALID',
              `${def.label}: ${spell.name} is a ${spell.level} ${school.name} spell the character cannot cast.`,
              RULE,
            ),
          );
        const key = `${spell.school}:${spell.level}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      for (const [key, n] of counts)
        if (n > per)
          errors.push(
            ruleError(
              'CHOICE_INVALID',
              `${def.label}: at most ${per} known spells per magic type and level (${key.replace(':', ' ')} has ${n}).`,
              RULE,
            ),
          );
    }
  }
  return errors;
}

/** [CALL-ELIGIBLE], [CALL-CHANGE]: the event a Calling starts at, after enough full events. */
function startEventErrors(ruleset: SyRuleset, sheet: Sheet, key: string | undefined): RuleError[] {
  const rules = ruleset.ruleset.calling;
  const errors: RuleError[] = [];
  if (key === undefined) {
    errors.push(
      ruleError('EVENT_REQUIRED', 'Choose the event the Calling starts at.', 'CALL-ELIGIBLE'),
    );
    return errors;
  }
  const eventKey = key;
  if (!sheet.events.some((e) => e.key === eventKey))
    errors.push(
      ruleError(
        'EVENT_NOT_ATTENDED',
        `A Calling starts at an event the character checked in at; ${eventKey} is not one.`,
        'CALL-ELIGIBLE',
      ),
    );
  const last = sheet.formerCallings.at(-1);
  if (last) {
    const leftDate = last.leftEventKey
      ? eventKeyDate(last.leftEventKey)
      : (last.leftAt ?? '').slice(0, 10);
    if (eventKeyDate(eventKey) <= leftDate || eventKey === last.leftEventKey)
      errors.push(
        ruleError(
          'CALLING_CHANGE_TOO_SOON',
          `A new Calling starts at an event after leaving ${last.name}.`,
          'CALL-CHANGE',
        ),
      );
  }
  const before = fullEventsBefore(sheet.events, eventKey);
  if (before < rules.minFullEvents)
    errors.push(
      ruleError(
        'NOT_ENOUGH_EVENTS',
        `A Calling needs ${plural(rules.minFullEvents, 'full event')} completed first; ${before} so far.`,
        'CALL-ELIGIBLE',
      ),
    );
  return errors;
}

export const StartCallingCommand = z.object({
  type: z.literal('startCalling'),
  callingId: RefIdSchema,
  choices: ChoicesSchema.default({}),
  /** The event the Calling starts at (needed for the Calling Technique rules). */
  eventKey: EventKeySchema.optional(),
  /** Who taught it, or "Calling book" (the Atheneum). */
  teacher: OptionalShortText,
  note: OptionalText,
});
export type StartCallingCommand = z.input<typeof StartCallingCommand>;

export const startCalling = defineCommand<z.output<typeof StartCallingCommand>>({
  type: 'startCalling',
  schema: StartCallingCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const rules = ruleset.ruleset.calling;
    const calling = ruleset.callingsById[cmd.callingId];
    if (!calling) {
      ev.errors.push(
        ruleError('UNKNOWN_CALLING', `Unknown Calling "${cmd.callingId}".`, 'CALL-ELIGIBLE'),
      );
      return ev;
    }
    if (sheet.calling)
      ev.errors.push(
        ruleError(
          'CALLING_ACTIVE',
          `The character is on ${sheet.calling.name}; leave it first (one Calling at a time).`,
          'CALL-CHANGE',
        ),
      );
    // The build playground starts a Calling with no event: no event, attendance, or wait rules.
    if (!builder.playground) ev.errors.push(...startEventErrors(ruleset, sheet, cmd.eventKey));
    ev.errors.push(...callingChoiceErrors(ruleset, calling, sheet, cmd.choices));
    const startStep = { level: rules.startLevelInBothSkills };
    const fullCost = calling.skills.reduce((n) => n + stepCost(ruleset, startStep), 0);
    // A former Calling's skills still on the sheet are not bought again (Q-CALL-14).
    const owned = ownedFromSheet(sheet);
    const toBuy = calling.skills.filter((s) => owned(s.id).level < rules.startLevelInBothSkills);
    const total = toBuy.reduce((n, s) => {
      let cost = 0;
      for (let lvl = owned(s.id).level + 1; lvl <= rules.startLevelInBothSkills; lvl++)
        cost += stepCost(ruleset, { level: lvl });
      return n + cost;
    }, 0);
    ev.cost = { currency: 'cxp', amount: total };
    if (fullCost !== rules.startCostCxp)
      ev.notices.push(
        notice(
          'START_COST_MISMATCH',
          `The cost table gives ${fullCost} CXP for the start; ruleset.calling says ${rules.startCostCxp}.`,
          'CALL-ELIGIBLE',
        ),
      );
    const cxp = sheet.points.cxp.available;
    if (total > cxp && !builder.playground)
      ev.errors.push(
        ruleError(
          'NOT_ENOUGH_CXP',
          `Not enough CXP: needs ${total}, ${cxp} left.`,
          'CALL-ELIGIBLE',
        ),
      );
    if (ev.errors.length > 0) return ev;

    const started = builder.add(
      'calling.started',
      { callingId: calling.id, choices: cmd.choices },
      { eventKey: cmd.eventKey, note: cmd.note },
    );
    for (const skill of toBuy) {
      const steps = [];
      for (let n = owned(skill.id).level + 1; n <= rules.startLevelInBothSkills; n++)
        steps.push({ level: n });
      const r = evaluateLearn(
        ruleset,
        sheet,
        { skillId: skill.id, steps, teacher: cmd.teacher },
        {
          atCreation: false,
          callingStarting: calling.id,
          causedBy: started.id,
          eventKey: cmd.eventKey,
        },
        builder,
      );
      ev.errors.push(...r.errors);
      ev.notices.push(...r.notices.filter((n) => !ev.notices.some((m) => m.message === n.message)));
    }
    return ev;
  },
});

export const LeaveCallingCommand = z.object({
  type: z.literal('leaveCalling'),
  reason: OptionalText,
  eventKey: EventKeySchema.optional(),
  note: OptionalText,
});
export type LeaveCallingCommand = z.input<typeof LeaveCallingCommand>;

export const leaveCalling = defineCommand<z.output<typeof LeaveCallingCommand>>({
  type: 'leaveCalling',
  schema: LeaveCallingCommand,
  evaluate(_ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    if (!sheet.calling)
      ev.errors.push(
        ruleError('NO_ACTIVE_CALLING', 'The character is on no Calling.', 'CALL-CHANGE'),
      );
    const reason = cmd.reason ?? '';
    if (reason === '')
      ev.errors.push(
        ruleError('REASON_REQUIRED', 'Leaving a Calling needs a reason.', 'CALL-CHANGE'),
      );
    if (ev.errors.length > 0) return ev;
    ev.notices.push(
      notice(
        'CALLING_SKILLS_LOCKED',
        `${sheet.calling?.name ?? 'The Calling'}'s skills stay on the sheet, locked; Unlearn refunds their CXP.`,
        'CALL-CHANGE',
      ),
    );
    builder.add('calling.left', { reason }, { eventKey: cmd.eventKey, note: cmd.note });
    return ev;
  },
});

export const SetCallingChoicesCommand = z.object({
  type: z.literal('setCallingChoices'),
  /** Replaces the active Calling's choices (Sorcerer known spells, Reliquist damage types...). */
  choices: ChoicesSchema,
  note: OptionalText,
});
export type SetCallingChoicesCommand = z.input<typeof SetCallingChoicesCommand>;

export const setCallingChoices = defineCommand<z.output<typeof SetCallingChoicesCommand>>({
  type: 'setCallingChoices',
  schema: SetCallingChoicesCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const calling = sheet.calling ? ruleset.callingsById[sheet.calling.callingId] : undefined;
    if (!calling) {
      ev.errors.push(
        ruleError('NO_ACTIVE_CALLING', 'The character is on no Calling.', 'CALL-CHANGE'),
      );
      return ev;
    }
    ev.errors.push(...callingChoiceErrors(ruleset, calling, sheet, cmd.choices));
    if (ev.errors.length > 0) return ev;
    builder.add('profile.updated', { callingChoices: cmd.choices }, { note: cmd.note });
    return ev;
  },
});
