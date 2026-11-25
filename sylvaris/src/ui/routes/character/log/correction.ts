// Which log actions staff can "Correct this", and their payloads.
import type {
  PointsAwardedPayload,
  Sheet,
  SheetEvent,
  SkillLearnedPayload,
} from '../../../../engine/index.ts';
import type { Action, SkillStep } from '../../../../engine/model.ts';
import { readPayload } from '../../../lib/describeAction.ts';

export function awardPayload(action: Action): PointsAwardedPayload | null {
  return action.type === 'points.awarded'
    ? (readPayload(action) as PointsAwardedPayload | null)
    : null;
}

export function learnedPayload(action: Action): SkillLearnedPayload | null {
  return action.type === 'skill.learned'
    ? (readPayload(action) as SkillLearnedPayload | null)
    : null;
}

/** A check-in that still counts (not voided), or null. */
export function activeCheckIn(sheet: Sheet, action: Action): SheetEvent | null {
  if (action.type !== 'event.checkedIn') return null;
  return sheet.events.find((e) => e.actionId === action.id) ?? null;
}

function sameStep(a: SkillStep, b: SkillStep): boolean {
  if ('level' in a) return 'level' in b && a.level === b.level;
  return 'technique' in b && a.technique === b.technique;
}

/** True when this skill step is one the refund may take back now (the top level or Technique). */
export function refundableNow(sheet: Sheet, payload: SkillLearnedPayload): boolean {
  const skill = sheet.skills.find((s) => s.skillId === payload.skillId);
  return skill?.refundable.some((s) => sameStep(s, payload.step)) ?? false;
}

/**
 * True when staff can correct this action: any point award, a skill step that is still the top
 * one, or a check-in that has not been voided.
 */
export function correctable(sheet: Sheet, action: Action): boolean {
  if (awardPayload(action)) return true;
  if (activeCheckIn(sheet, action)) return true;
  const p = learnedPayload(action);
  return p !== null && refundableNow(sheet, p);
}
