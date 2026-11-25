// Calling rules ([CALL-ELIGIBLE], [CALL-TECH], [CALL-CHANGE], ruleset.calling).
// - Eligible after minFullEvents completed events: every check-in that was not voided and is
//   dated before the start event counts (Q-CALL-11: eligible from the 6th event).
// - Calling Techniques (Callings p.2-3): at an event the character checked in at, dated after
//   the start event; at most techniquesPerEvent per event (two keys on the same date are the
//   same event); the two Calling skills never more than maxTechniqueGap tiers apart, earlier
//   Techniques first.
import type { SyCalling, SyRuleset } from '../../data/index.ts';
import { eventKeyDate, type TechniqueId } from '../model.ts';
import { ruleError, type RuleError } from '../errors.ts';
import { applyStep, techniqueTier, type OwnedLookup } from './skills.ts';

/** Events completed before the event `key` (events dated strictly before it). */
export function fullEventsBefore(
  events: readonly { readonly key: string; readonly date: string }[],
  key: string | null,
): number {
  if (key === null) return events.length;
  const date = eventKeyDate(key);
  return events.filter((e) => e.key !== key && e.date < date).length;
}

/** True when two event keys name the same event: the same key, or the same date. */
export function sameEvent(a: string, b: string): boolean {
  return a === b || eventKeyDate(a) === eventKeyDate(b);
}

/** Technique tiers of a Calling's two skills after an optional purchase. */
export function callingTiers(
  calling: SyCalling,
  owned: OwnedLookup,
  buy?: { skillId: string; technique: TechniqueId },
): Record<string, number> {
  const tiers: Record<string, number> = {};
  for (const s of calling.skills) {
    let state = owned(s.id);
    if (buy && buy.skillId === s.id) state = applyStep(state, { technique: buy.technique });
    tiers[s.id] = techniqueTier(state);
  }
  return tiers;
}

/** Largest difference between the Calling skills' Technique tiers. */
export function tierGap(tiers: Readonly<Record<string, number>>): number {
  const list = Object.values(tiers);
  return list.length === 0 ? 0 : Math.max(...list) - Math.min(...list);
}

export interface CallingTechniqueInput {
  readonly calling: SyCalling;
  readonly startedEventKey: string | null;
  readonly skillId: string;
  readonly technique: TechniqueId;
  readonly eventKey: string | null;
  readonly owned: OwnedLookup;
  /** The character's check-ins (sheet.events). */
  readonly checkIns: readonly { readonly key: string; readonly date: string }[];
  /** The events this Calling's Techniques were already learned at (sheet techniqueEvents). */
  readonly techniqueEventKeys: readonly (string | null)[];
  /** The build playground: skip the event rules, keep the balance rule. */
  readonly playground?: boolean;
}

/** The [CALL-TECH] event rules: at an event attended after the start, one per event. */
function techniqueEventErrors(
  rules: SyRuleset['ruleset']['calling'],
  i: CallingTechniqueInput,
): RuleError[] {
  const errors: RuleError[] = [];
  if (i.eventKey === null) {
    errors.push(
      ruleError(
        'EVENT_REQUIRED',
        'A Calling Technique is learned at an event: choose the event.',
        'CALL-TECH',
      ),
    );
    return errors;
  }
  const eventKey = i.eventKey;
  if (!i.checkIns.some((e) => e.key === eventKey))
    errors.push(
      ruleError(
        'EVENT_NOT_ATTENDED',
        `A Calling Technique is learned at an event the character checked in at; ${eventKey} is not one.`,
        'CALL-TECH',
      ),
    );
  if (i.startedEventKey !== null) {
    if (sameEvent(i.startedEventKey, eventKey)) {
      if (rules.noTechniqueAtStartEvent)
        errors.push(
          ruleError(
            'CALLING_TECHNIQUE_START_EVENT',
            'No Calling Technique at the event the Calling started.',
            'CALL-TECH',
          ),
        );
    } else if (eventKeyDate(eventKey) < eventKeyDate(i.startedEventKey))
      errors.push(
        ruleError(
          'CALLING_TECHNIQUE_BEFORE_START',
          'A Calling Technique is learned at an event after the Calling started.',
          'CALL-TECH',
        ),
      );
  }
  const atEvent = i.techniqueEventKeys.filter((k) => k !== null && sameEvent(k, eventKey)).length;
  if (atEvent >= rules.techniquesPerEvent)
    errors.push(
      ruleError(
        'CALLING_TECHNIQUE_PER_EVENT',
        `Only ${rules.techniquesPerEvent} Calling Technique per event; one was already learned at this event.`,
        'CALL-TECH',
      ),
    );
  return errors;
}

/** The [CALL-TECH] rules for one Calling Technique purchase. */
export function callingTechniqueErrors(ruleset: SyRuleset, i: CallingTechniqueInput): RuleError[] {
  const rules = ruleset.ruleset.calling;
  const errors: RuleError[] = [];
  if (i.playground !== true) errors.push(...techniqueEventErrors(rules, i));
  const tiers = callingTiers(i.calling, i.owned, { skillId: i.skillId, technique: i.technique });
  const gap = tierGap(tiers);
  if (gap > rules.maxTechniqueGap) {
    const other = i.calling.skills.find((s) => s.id !== i.skillId);
    errors.push(
      ruleError(
        'CALLING_TECHNIQUE_BALANCE',
        `The two Calling skills must stay within ${rules.maxTechniqueGap} Technique of each other; ${other?.name ?? 'the other skill'} needs its next Technique first.`,
        'CALL-TECH',
      ),
    );
  }
  return errors;
}
