// Command registry. To add a command, add a file that calls defineCommand() and list it here
// (and in the Command union below).
import {
  awakenArtifact,
  removeArtifactPowers,
  setArtifactPower,
  unlockArtifactSlot,
  type AwakenArtifactCommand,
  type RemoveArtifactPowersCommand,
  type SetArtifactPowerCommand,
  type UnlockArtifactSlotCommand,
} from './artifact.ts';
import {
  leaveCalling,
  setCallingChoices,
  startCalling,
  type LeaveCallingCommand,
  type SetCallingChoicesCommand,
  type StartCallingCommand,
} from './calling.ts';
import {
  assignRetirement,
  changeRace,
  createCharacter,
  retireCharacter,
  updateProfile,
  type AssignRetirementCommand,
  type ChangeRaceCommand,
  type CreateCharacterCommand,
  type RetireCharacterCommand,
  type UpdateProfileCommand,
} from './character.ts';
import type { RegisteredCommand } from './define.ts';
import { checkIn, voidCheckIn, type CheckInCommand, type VoidCheckInCommand } from './events.ts';
import {
  addJournal,
  removeJournal,
  tagJournal,
  type AddJournalCommand,
  type RemoveJournalCommand,
  type TagJournalCommand,
} from './journal.ts';
import { learnSkill, type LearnSkillCommand } from './learnSkill.ts';
import {
  adjustPoints,
  awardPoints,
  spendMt,
  type AdjustPointsCommand,
  type AwardPointsCommand,
  type SpendMtCommand,
} from './points.ts';
import {
  addBoon,
  addOwed,
  changeSpirit,
  deliverOwed,
  familiarizeLocation,
  removeBoon,
  removeFamiliar,
  removeLocation,
  setFamiliar,
  setStartingItems,
  type AddBoonCommand,
  type AddOwedCommand,
  type ChangeSpiritCommand,
  type DeliverOwedCommand,
  type FamiliarizeLocationCommand,
  type RemoveBoonCommand,
  type RemoveFamiliarCommand,
  type RemoveLocationCommand,
  type SetFamiliarCommand,
  type SetStartingItemsCommand,
} from './records.ts';
import { refundSkill, type RefundSkillCommand } from './refundSkill.ts';
import {
  approveRequest,
  rejectRequest,
  type ApproveRequestCommand,
  type RejectRequestCommand,
} from './requests.ts';

/** Every command plan() accepts. Optional fields with defaults may be left out. */
export type Command =
  | CreateCharacterCommand
  | UpdateProfileCommand
  | AwardPointsCommand
  | AdjustPointsCommand
  | CheckInCommand
  | VoidCheckInCommand
  | SpendMtCommand
  | LearnSkillCommand
  | RefundSkillCommand
  | AddJournalCommand
  | TagJournalCommand
  | RemoveJournalCommand
  | StartCallingCommand
  | LeaveCallingCommand
  | SetCallingChoicesCommand
  | SetStartingItemsCommand
  | ChangeSpiritCommand
  | ApproveRequestCommand
  | RejectRequestCommand
  | RetireCharacterCommand
  | AssignRetirementCommand
  | AwakenArtifactCommand
  | UnlockArtifactSlotCommand
  | SetArtifactPowerCommand
  | RemoveArtifactPowersCommand
  | FamiliarizeLocationCommand
  | RemoveLocationCommand
  | AddBoonCommand
  | RemoveBoonCommand
  | SetFamiliarCommand
  | RemoveFamiliarCommand
  | AddOwedCommand
  | DeliverOwedCommand
  | ChangeRaceCommand;

export type CommandType = Command['type'];

const DEFINITIONS: readonly RegisteredCommand[] = [
  createCharacter,
  updateProfile,
  awardPoints,
  adjustPoints,
  checkIn,
  voidCheckIn,
  spendMt,
  learnSkill,
  refundSkill,
  addJournal,
  tagJournal,
  removeJournal,
  startCalling,
  leaveCalling,
  setCallingChoices,
  setStartingItems,
  changeSpirit,
  approveRequest,
  rejectRequest,
  retireCharacter,
  assignRetirement,
  awakenArtifact,
  unlockArtifactSlot,
  setArtifactPower,
  removeArtifactPowers,
  familiarizeLocation,
  removeLocation,
  addBoon,
  removeBoon,
  setFamiliar,
  removeFamiliar,
  addOwed,
  deliverOwed,
  changeRace,
];

const REGISTRY: ReadonlyMap<string, RegisteredCommand> = new Map(
  DEFINITIONS.map((d) => [d.type, d]),
);

export function getCommandDefinition(type: unknown): RegisteredCommand | undefined {
  return typeof type === 'string' ? REGISTRY.get(type) : undefined;
}

export const COMMAND_TYPES: readonly string[] = DEFINITIONS.map((d) => d.type);
