// startProfession / levelProfession ([PRO-ONE], [PRO-START], [PRO-COST], [PRO-PACE],
// [PTS-PXP-SPEND]).
// - One profession per character. Starting needs 3 events checked in before the start event
//   (Q-PRO-2) and buys level 1 of one or both skills (10 PXP each); the passive comes with it.
// - Level n costs 10 x n PXP from PXP available, max 5, at most one level per skill per event.
import { z } from 'zod';
import { RefIdSchema } from '../actions/define.ts';
import { ruleError } from '../errors.ts';
import { EventKeySchema } from '../model.ts';
import { eventsPlayedBefore, professionLevelCost, professionSkill } from '../rules/progression.ts';
import { defineCommand, evaluation } from './define.ts';
import { OptionalText, plural } from './helpers.ts';

export const StartProfessionCommand = z.object({
  type: z.literal('startProfession'),
  professionId: RefIdSchema,
  /** The event the profession is started at. */
  eventKey: EventKeySchema,
  /** Profession skill ids to buy at level 1 (one or both). */
  skills: z.array(RefIdSchema).min(1).max(2),
  note: OptionalText,
});
export type StartProfessionCommand = z.input<typeof StartProfessionCommand>;

export const LevelProfessionCommand = z.object({
  type: z.literal('levelProfession'),
  /** Profession skill id. */
  skillId: RefIdSchema,
  /** The event the level is bought at (one level per skill per event). */
  eventKey: EventKeySchema,
  note: OptionalText,
});
export type LevelProfessionCommand = z.input<typeof LevelProfessionCommand>;

export const startProfession = defineCommand<z.output<typeof StartProfessionCommand>>({
  type: 'startProfession',
  schema: StartProfessionCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const rules = ruleset.professions.rules;
    if (sheet.profession !== null) {
      ev.errors.push(
        ruleError(
          'PROFESSION_ALREADY_STARTED',
          `${sheet.profile.characterName} already has the ${sheet.profession.name} profession; a character has one profession.`,
          'PRO-ONE',
        ),
      );
      return ev;
    }
    const profession = ruleset.professionsById[cmd.professionId];
    if (!profession) {
      ev.errors.push(
        ruleError('UNKNOWN_PROFESSION', `Unknown profession "${cmd.professionId}".`, 'PRO-DEF'),
      );
      return ev;
    }
    const played = eventsPlayedBefore(sheet, cmd.eventKey);
    const needed = rules.start.eventsPlayedBefore;
    if (played < needed)
      ev.errors.push(
        ruleError(
          'NOT_ENOUGH_EVENTS',
          `Starting a profession needs ${plural(needed, 'event')} played before this one; ${played} so far.`,
          'PRO-START',
        ),
      );
    const ids = new Set<string>();
    for (const id of cmd.skills) {
      if (!professionSkill(profession, id))
        ev.errors.push(
          ruleError(
            'UNKNOWN_PROFESSION_SKILL',
            `"${id}" is not a ${profession.name} skill.`,
            'PRO-DEF',
          ),
        );
      else if (ids.has(id))
        ev.errors.push(
          ruleError('PROFESSION_PACE', 'Each skill goes up one level per event.', 'PRO-PACE'),
        );
      ids.add(id);
    }
    const cost = professionLevelCost(ruleset, 1) * cmd.skills.length;
    ev.cost = { currency: 'pxp', amount: cost };
    const available = sheet.points.pxp.available;
    if (cost > available)
      ev.errors.push(
        ruleError(
          'NOT_ENOUGH_PXP',
          `Not enough PXP: needs ${cost}, ${available} left.`,
          'PTS-PXP-SPEND',
        ),
      );
    if (ev.errors.length > 0) return ev;
    const started = builder.add(
      'profession.started',
      { professionId: profession.id, eventsPlayedBefore: played },
      { eventKey: cmd.eventKey, note: cmd.note },
    );
    for (const id of cmd.skills)
      builder.add(
        'profession.leveled',
        {
          abilityId: id,
          toLevel: 1,
          cost: { currency: 'pxp', amount: professionLevelCost(ruleset, 1) },
        },
        { eventKey: cmd.eventKey, causedBy: started.id },
      );
    return ev;
  },
});

export const levelProfession = defineCommand<z.output<typeof LevelProfessionCommand>>({
  type: 'levelProfession',
  schema: LevelProfessionCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const prof = sheet.profession;
    if (prof === null) {
      ev.errors.push(ruleError('NO_PROFESSION', 'Start a profession first.', 'PRO-START'));
      return ev;
    }
    const skill = prof.skills.find((s) => s.id === cmd.skillId);
    if (!skill) {
      ev.errors.push(
        ruleError(
          'UNKNOWN_PROFESSION_SKILL',
          `"${cmd.skillId}" is not a ${prof.name} skill.`,
          'PRO-DEF',
        ),
      );
      return ev;
    }
    if (skill.level >= skill.maxLevel) {
      ev.errors.push(
        ruleError(
          'MAX_LEVEL',
          `${skill.name} is at its maximum level ${skill.maxLevel}.`,
          'PRO-COST',
        ),
      );
      return ev;
    }
    if (prof.history.some((h) => h.skillId === skill.id && h.eventKey === cmd.eventKey))
      ev.errors.push(
        ruleError(
          'PROFESSION_PACE',
          `${skill.name} already went up a level at this event; one level per skill per event.`,
          'PRO-PACE',
        ),
      );
    const toLevel = skill.level + 1;
    const cost = professionLevelCost(ruleset, toLevel);
    ev.cost = { currency: 'pxp', amount: cost };
    const available = sheet.points.pxp.available;
    if (cost > available)
      ev.errors.push(
        ruleError(
          'NOT_ENOUGH_PXP',
          `Not enough PXP: needs ${cost}, ${available} left.`,
          'PTS-PXP-SPEND',
        ),
      );
    if (ev.errors.length > 0) return ev;
    builder.add(
      'profession.leveled',
      { abilityId: skill.id, toLevel, cost: { currency: 'pxp', amount: cost } },
      { eventKey: cmd.eventKey, note: cmd.note },
    );
    return ev;
  },
});
