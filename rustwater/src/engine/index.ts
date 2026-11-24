// Pure rules engine. No React, DOM, or storage imports (enforced by ESLint).
// Public API: deriveSheet (replay), plan (validate a command into actions), preview (button
// labels), summarize (list rows). See docs/SPEC.md "Engine API".
export const ENGINE_VERSION = '0.1.0';

export { loadRuleset, type Ruleset } from '../data/index.ts';

export { deriveSheet } from './derive/deriveSheet.ts';
export { plan, preview } from './commands/plan.ts';
export type { PlanContext, PlanResult, PreviewResult } from './commands/define.ts';
export { COMMAND_TYPES, type Command, type CommandType } from './commands/registry.ts';
export type { AdjustPointsCommand } from './commands/adjustPoints.ts';
export type { AwardPointsCommand } from './commands/awardPoints.ts';
export type { ChangeInfectionCommand } from './commands/changeInfection.ts';
export { npcTimeRewards, type CheckInCommand } from './commands/checkIn.ts';
export type { VoidCheckInCommand } from './commands/voidCheckIn.ts';
export type { CreateCharacterCommand } from './commands/createCharacter.ts';
export type { LearnSkillCommand } from './commands/learnSkill.ts';
export type { LevelAncestryAbilityCommand } from './commands/levelAncestryAbility.ts';
export type { RefundSkillCommand } from './commands/refundSkill.ts';
export type { SpendShiniesCommand } from './commands/spendShinies.ts';
export type { UpdateProfileCommand } from './commands/updateProfile.ts';
export type { MemorizeCommand, ForgetMemorizedCommand } from './commands/memorize.ts';
export type { StartProfessionCommand, LevelProfessionCommand } from './commands/profession.ts';
export type {
  AwakenFamiliarCommand,
  BondFamiliarCommand,
  BreakFamiliarBondCommand,
  ForgetFamiliarSkillCommand,
  LearnFamiliarSkillCommand,
  LevelFamiliarCommand,
  UnlockFamiliarSlotCommand,
} from './commands/familiar.ts';
export type {
  AddBoonCommand,
  AddOwedCommand,
  DeliverOwedCommand,
  RemoveBoonCommand,
  SetStartingItemsCommand,
} from './commands/records.ts';
export type { RetireCharacterCommand } from './commands/retire.ts';
export type { ApproveRequestCommand, RejectRequestCommand } from './commands/requests.ts';
export type {
  AddStoryNoteCommand,
  AddTraumaCommand,
  EditStoryNoteCommand,
  EditTraumaCommand,
  RemoveStoryNoteCommand,
  RemoveTraumaCommand,
} from './commands/notes.ts';
export { STORY_NOTE_MAX, TRAUMA_MAX } from './commands/notes.ts';
export { checkRequest, type RequestCheck } from './commands/checkRequest.ts';

export { ACTION_REGISTRY, SUPPORTED_ACTION_TYPES } from './actions/registry.ts';
export type { CharacterCreatedPayload } from './actions/characterCreated.ts';
export type { ProfileUpdatedPayload } from './actions/profileUpdated.ts';
export type { PointsAwardedPayload } from './actions/pointsAwarded.ts';
export type { PointsAdjustedPayload } from './actions/pointsAdjusted.ts';
export type { EventCheckedInPayload } from './actions/eventCheckedIn.ts';
export type { EventCheckInVoidedPayload } from './actions/eventCheckInVoided.ts';
export type { ShiniesSpentPayload } from './actions/shiniesSpent.ts';
export type { AncestryLeveledPayload } from './actions/ancestryLeveled.ts';
export type { InfectionChangedPayload } from './actions/infectionChanged.ts';
export type { SkillLearnedPayload } from './actions/skillLearned.ts';
export type { SkillRefundedPayload } from './actions/skillRefunded.ts';
export type { MemorizedAddedPayload, MemorizedRemovedPayload } from './actions/memorized.ts';
export type { ProfessionLeveledPayload, ProfessionStartedPayload } from './actions/profession.ts';
export type {
  FamiliarAwakenedPayload,
  FamiliarBondBrokenPayload,
  FamiliarRenamedPayload,
  FamiliarBondedPayload,
  FamiliarLeveledPayload,
  FamiliarSkillForgottenPayload,
  FamiliarSkillLearnedPayload,
  FamiliarSlotUnlockedPayload,
} from './actions/familiar.ts';
export type { BoonAddedPayload, BoonRemovedPayload } from './actions/boons.ts';
export type { ItemsStartingSetPayload } from './actions/startingItems.ts';
export type { OwedAddedPayload, OwedDeliveredPayload } from './actions/owed.ts';
export type { RequestApprovedPayload, RequestRejectedPayload } from './actions/requests.ts';
export type { CharacterRetiredPayload } from './actions/characterRetired.ts';
export type {
  TraumaAddedPayload,
  TraumaEditedPayload,
  TraumaRemovedPayload,
} from './actions/traumas.ts';
export type {
  StoryNoteAddedPayload,
  StoryNoteEditedPayload,
  StoryNoteRemovedPayload,
} from './actions/storyNotes.ts';
export { AGE_STEP_MAX, AGE_STEP_MIN, AGE_STEP_START_MIN, ageStepFromYears } from './rules/age.ts';

export { summarize, skillLevel, LEDGER_CURRENCIES } from './sheet.ts';
export {
  CheckInChoicesSchema,
  PAYMENT_TEXT,
  PREREG_PURCHASES,
  RARITIES,
  RegistrationPlanSchema,
  checkInItems,
  checkInSources,
  checkRegistration,
  gatherTiers,
  playerFormProblems,
  scavengingTiers,
  upkeepFor,
  type CheckInChoices,
  type EventPayment,
  type CheckInSource,
  type PlannedPurchase,
  type PullItem,
  type Rarity,
  type RegistrationCheck,
  type RegistrationPlan,
  type RegistrationPlanInput,
} from './checkin/checkInPlan.ts';
export type * from './sheet.ts';
export type { Notice, RuleError } from './errors.ts';

export {
  apEarnedByBasic,
  cumulativeCost,
  levelCost,
  maxLevelOf,
  nextLevelCost,
  triangular,
} from './rules/costs.ts';

export {
  essenceTotal,
  eventsPlayedBefore,
  familiarLevelFp,
  professionCumulativeCost,
  professionLevelCost,
  professionUses,
  retirementCarry,
  type RetirementCarryAmounts,
} from './rules/progression.ts';
export { computePools, memoryTarget, poolDefs } from './rules/memory.ts';
