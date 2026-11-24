// Action registry: every action type the engine can replay. To add a type, add a file that
// calls defineAction() and list it here. Replay and validation pick it up from this table.
import type { ActionType } from '../model.ts';
import { ancestryLeveled } from './ancestryLeveled.ts';
import { boonAdded, boonRemoved } from './boons.ts';
import { characterRetired } from './characterRetired.ts';
import { characterCreated } from './characterCreated.ts';
import type { RegisteredAction } from './define.ts';
import { eventCheckedIn } from './eventCheckedIn.ts';
import { eventCheckInVoided } from './eventCheckInVoided.ts';
import {
  familiarAwakened,
  familiarBondBroken,
  familiarBonded,
  familiarLeveled,
  familiarRenamed,
  familiarSkillForgotten,
  familiarSkillLearned,
  familiarSlotUnlocked,
} from './familiar.ts';
import { infectionChanged } from './infectionChanged.ts';
import { memorizedAdded, memorizedRemoved } from './memorized.ts';
import { owedAdded, owedDelivered } from './owed.ts';
import { pointsAdjusted } from './pointsAdjusted.ts';
import { pointsAwarded } from './pointsAwarded.ts';
import { professionLeveled, professionStarted } from './profession.ts';
import { profileUpdated } from './profileUpdated.ts';
import { requestApproved, requestRejected } from './requests.ts';
import { shiniesSpent } from './shiniesSpent.ts';
import { skillLearned } from './skillLearned.ts';
import { skillRefunded } from './skillRefunded.ts';
import { itemsStartingSet } from './startingItems.ts';
import { storyNoteAdded, storyNoteEdited, storyNoteRemoved } from './storyNotes.ts';
import { traumaAdded, traumaEdited, traumaRemoved } from './traumas.ts';

const DEFINITIONS: readonly RegisteredAction[] = [
  characterCreated,
  profileUpdated,
  pointsAwarded,
  pointsAdjusted,
  eventCheckedIn,
  eventCheckInVoided,
  shiniesSpent,
  ancestryLeveled,
  infectionChanged,
  skillLearned,
  skillRefunded,
  memorizedAdded,
  memorizedRemoved,
  professionStarted,
  professionLeveled,
  familiarBonded,
  familiarAwakened,
  familiarLeveled,
  familiarSkillLearned,
  familiarSkillForgotten,
  familiarSlotUnlocked,
  familiarBondBroken,
  familiarRenamed,
  boonAdded,
  boonRemoved,
  itemsStartingSet,
  owedAdded,
  owedDelivered,
  requestApproved,
  requestRejected,
  characterRetired,
  traumaAdded,
  traumaEdited,
  traumaRemoved,
  storyNoteAdded,
  storyNoteEdited,
  storyNoteRemoved,
];

export const ACTION_REGISTRY: Readonly<Partial<Record<ActionType, RegisteredAction>>> =
  Object.freeze(Object.fromEntries(DEFINITIONS.map((d) => [d.type, d])));

export function getActionDefinition(type: string): RegisteredAction | undefined {
  return Object.hasOwn(ACTION_REGISTRY, type) ? ACTION_REGISTRY[type as ActionType] : undefined;
}

/** Action types this engine version can replay. */
export const SUPPORTED_ACTION_TYPES: readonly ActionType[] = DEFINITIONS.map((d) => d.type);
