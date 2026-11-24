// Which log actions staff can "Correct this", and their payloads.
import {
  skillLevel,
  type PointsAwardedPayload,
  type Sheet,
  type SheetEvent,
  type SkillLearnedPayload,
} from '../../../../engine/index.ts';
import type { Action } from '../../../../engine/model.ts';
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

/**
 * True when staff can correct this action: any point award, a skill level still owned, or a
 * check-in that has not been voided.
 */
export function correctable(sheet: Sheet, action: Action): boolean {
  if (awardPayload(action)) return true;
  if (activeCheckIn(sheet, action)) return true;
  const p = learnedPayload(action);
  return p !== null && skillLevel(sheet, p.skillId, p.part) >= p.toLevel;
}
