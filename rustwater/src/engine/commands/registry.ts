// Command registry. To add a command, add a file that calls defineCommand() and list it here
// (and in the Command union below).
import { adjustPoints, type AdjustPointsCommand } from './adjustPoints.ts';
import { awardPoints, type AwardPointsCommand } from './awardPoints.ts';
import { changeInfection, type ChangeInfectionCommand } from './changeInfection.ts';
import { checkIn, type CheckInCommand } from './checkIn.ts';
import { createCharacter, type CreateCharacterCommand } from './createCharacter.ts';
import type { RegisteredCommand } from './define.ts';
import {
  awakenFamiliar,
  bondFamiliar,
  breakFamiliarBond,
  forgetFamiliarSkill,
  learnFamiliarSkill,
  levelFamiliar,
  renameFamiliar,
  unlockFamiliarSlot,
  type AwakenFamiliarCommand,
  type BondFamiliarCommand,
  type BreakFamiliarBondCommand,
  type ForgetFamiliarSkillCommand,
  type LearnFamiliarSkillCommand,
  type LevelFamiliarCommand,
  type RenameFamiliarCommand,
  type UnlockFamiliarSlotCommand,
} from './familiar.ts';
import { learnSkill, type LearnSkillCommand } from './learnSkill.ts';
import { levelAncestryAbility, type LevelAncestryAbilityCommand } from './levelAncestryAbility.ts';
import {
  forgetMemorized,
  memorize,
  type ForgetMemorizedCommand,
  type MemorizeCommand,
} from './memorize.ts';
import {
  levelProfession,
  startProfession,
  type LevelProfessionCommand,
  type StartProfessionCommand,
} from './profession.ts';
import {
  addBoon,
  addOwed,
  deliverOwed,
  removeBoon,
  setStartingItems,
  type AddBoonCommand,
  type AddOwedCommand,
  type DeliverOwedCommand,
  type RemoveBoonCommand,
  type SetStartingItemsCommand,
} from './records.ts';
import {
  addStoryNote,
  addTrauma,
  editStoryNote,
  editTrauma,
  removeStoryNote,
  removeTrauma,
  type AddStoryNoteCommand,
  type AddTraumaCommand,
  type EditStoryNoteCommand,
  type EditTraumaCommand,
  type RemoveStoryNoteCommand,
  type RemoveTraumaCommand,
} from './notes.ts';
import { refundSkill, type RefundSkillCommand } from './refundSkill.ts';
import {
  approveRequest,
  rejectRequest,
  type ApproveRequestCommand,
  type RejectRequestCommand,
} from './requests.ts';
import { retireCharacter, type RetireCharacterCommand } from './retire.ts';
import { spendShinies, type SpendShiniesCommand } from './spendShinies.ts';
import { updateProfile, type UpdateProfileCommand } from './updateProfile.ts';
import { transferShinies, type TransferShiniesCommand } from './transferShinies.ts';
import { voidCheckIn, type VoidCheckInCommand } from './voidCheckIn.ts';

/** Every command plan() accepts. Optional fields with defaults may be left out. */
export type Command =
  | CreateCharacterCommand
  | UpdateProfileCommand
  | AwardPointsCommand
  | AdjustPointsCommand
  | CheckInCommand
  | VoidCheckInCommand
  | SpendShiniesCommand
  | LevelAncestryAbilityCommand
  | ChangeInfectionCommand
  | LearnSkillCommand
  | RefundSkillCommand
  | MemorizeCommand
  | ForgetMemorizedCommand
  | StartProfessionCommand
  | LevelProfessionCommand
  | BondFamiliarCommand
  | AwakenFamiliarCommand
  | LevelFamiliarCommand
  | LearnFamiliarSkillCommand
  | ForgetFamiliarSkillCommand
  | UnlockFamiliarSlotCommand
  | BreakFamiliarBondCommand
  | RenameFamiliarCommand
  | TransferShiniesCommand
  | AddBoonCommand
  | RemoveBoonCommand
  | SetStartingItemsCommand
  | AddOwedCommand
  | DeliverOwedCommand
  | RetireCharacterCommand
  | ApproveRequestCommand
  | RejectRequestCommand
  | AddTraumaCommand
  | EditTraumaCommand
  | RemoveTraumaCommand
  | AddStoryNoteCommand
  | EditStoryNoteCommand
  | RemoveStoryNoteCommand;

export type CommandType = Command['type'];

const DEFINITIONS: readonly RegisteredCommand[] = [
  createCharacter,
  updateProfile,
  awardPoints,
  adjustPoints,
  checkIn,
  voidCheckIn,
  spendShinies,
  levelAncestryAbility,
  changeInfection,
  learnSkill,
  refundSkill,
  memorize,
  forgetMemorized,
  startProfession,
  levelProfession,
  bondFamiliar,
  awakenFamiliar,
  levelFamiliar,
  learnFamiliarSkill,
  forgetFamiliarSkill,
  unlockFamiliarSlot,
  breakFamiliarBond,
  renameFamiliar,
  transferShinies,
  addBoon,
  removeBoon,
  setStartingItems,
  addOwed,
  deliverOwed,
  retireCharacter,
  approveRequest,
  rejectRequest,
  addTrauma,
  editTrauma,
  removeTrauma,
  addStoryNote,
  editStoryNote,
  removeStoryNote,
];

const REGISTRY: ReadonlyMap<string, RegisteredCommand> = new Map(
  DEFINITIONS.map((d) => [d.type, d]),
);

export function getCommandDefinition(type: unknown): RegisteredCommand | undefined {
  return typeof type === 'string' ? REGISTRY.get(type) : undefined;
}

export const COMMAND_TYPES: readonly string[] = DEFINITIONS.map((d) => d.type);
