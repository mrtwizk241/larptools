// Action registry: every action type the engine can replay. To add a type, add a
// defineAction() call in an action family file and list it here. Replay and validation pick it
// up from this table.
import type { ActionType } from '../model.ts';
import {
  artifactAwakened,
  artifactPowerRemoved,
  artifactPowerSet,
  artifactSlotUnlocked,
} from './artifact.ts';
import { callingLeft, callingStarted } from './calling.ts';
import {
  characterCreated,
  characterRetired,
  profileUpdated,
  raceChanged,
  retirementAssigned,
} from './character.ts';
import type { RegisteredAction } from './define.ts';
import { eventCheckedIn, eventCheckInVoided } from './events.ts';
import { journalAdded, journalRemoved, journalTagged } from './journal.ts';
import { mtSpent, pointsAdjusted, pointsAwarded } from './points.ts';
import {
  boonAdded,
  boonRemoved,
  familiarRemoved,
  familiarSet,
  itemsStartingSet,
  locationFamiliarized,
  locationRemoved,
  owedAdded,
  owedDelivered,
  spiritChanged,
} from './records.ts';
import { requestApproved, requestRejected } from './requests.ts';
import { skillLearned, skillRefunded } from './skills.ts';

const DEFINITIONS: readonly RegisteredAction[] = [
  characterCreated,
  profileUpdated,
  pointsAwarded,
  pointsAdjusted,
  eventCheckedIn,
  eventCheckInVoided,
  mtSpent,
  skillLearned,
  skillRefunded,
  journalAdded,
  journalTagged,
  journalRemoved,
  callingStarted,
  callingLeft,
  itemsStartingSet,
  spiritChanged,
  requestApproved,
  requestRejected,
  characterRetired,
  retirementAssigned,
  artifactAwakened,
  artifactSlotUnlocked,
  artifactPowerSet,
  artifactPowerRemoved,
  locationFamiliarized,
  locationRemoved,
  boonAdded,
  boonRemoved,
  familiarSet,
  familiarRemoved,
  owedAdded,
  owedDelivered,
  raceChanged,
];

export const ACTION_REGISTRY: Readonly<Partial<Record<ActionType, RegisteredAction>>> =
  Object.freeze(Object.fromEntries(DEFINITIONS.map((d) => [d.type, d])));

export function getActionDefinition(type: string): RegisteredAction | undefined {
  return Object.hasOwn(ACTION_REGISTRY, type) ? ACTION_REGISTRY[type as ActionType] : undefined;
}

/** Action types this engine version can replay. */
export const SUPPORTED_ACTION_TYPES: readonly ActionType[] = DEFINITIONS.map((d) => d.type);
