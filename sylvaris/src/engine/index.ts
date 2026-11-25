// Pure Sylvaris rules engine. No React, DOM, or storage imports (enforced by ESLint).
// Public API: deriveSheet (replay), plan (validate a command into actions), preview (button
// labels), summarize (list rows), checkRequest (staff inbox), the check-in plan helpers, cost
// helpers, and the model schemas.
export const ENGINE_VERSION = '0.1.0';

export {
  loadSylvarisRuleset as loadRuleset,
  loadSylvarisRuleset,
  type SyRuleset as Ruleset,
  type SyRuleset,
} from '../data/index.ts';

export { allowedForRole, deriveSheet, PLAYER_ACTION_TYPES } from './derive/deriveSheet.ts';
export { plan, preview } from './commands/plan.ts';
export type { PlanContext, PlanResult, PreviewResult } from './commands/define.ts';
export { COMMAND_TYPES, type Command, type CommandType } from './commands/registry.ts';
export { checkRequest, type RequestCheck } from './commands/checkRequest.ts';
export type {
  AwakenArtifactCommand,
  RemoveArtifactPowersCommand,
  SetArtifactPowerCommand,
  UnlockArtifactSlotCommand,
} from './commands/artifact.ts';
export type {
  LeaveCallingCommand,
  SetCallingChoicesCommand,
  StartCallingCommand,
} from './commands/calling.ts';
export type {
  ChangeRaceCommand,
  CreateCharacterCommand,
  AssignRetirementCommand,
  RetireCharacterCommand,
  UpdateProfileCommand,
} from './commands/character.ts';
export { upkeepDue, type CheckInCommand, type VoidCheckInCommand } from './commands/events.ts';
export type {
  AddJournalCommand,
  RemoveJournalCommand,
  TagJournalCommand,
} from './commands/journal.ts';
export { expandStep, type LearnSkillCommand } from './commands/learnSkill.ts';
export {
  MT_TEACHING,
  mtUnitPrice,
  type AdjustPointsCommand,
  type AwardPointsCommand,
  type SpendMtCommand,
} from './commands/points.ts';
export type {
  AddBoonCommand,
  AddOwedCommand,
  ChangeSpiritCommand,
  DeliverOwedCommand,
  FamiliarizeLocationCommand,
  RemoveBoonCommand,
  RemoveFamiliarCommand,
  RemoveLocationCommand,
  SetFamiliarCommand,
  SetStartingItemsCommand,
} from './commands/records.ts';
export type { RefundSkillCommand } from './commands/refundSkill.ts';
export type { ApproveRequestCommand, RejectRequestCommand } from './commands/requests.ts';

export { ACTION_REGISTRY, SUPPORTED_ACTION_TYPES } from './actions/registry.ts';
export type {
  ArtifactAwakenedPayload,
  ArtifactPowerRemovedPayload,
  ArtifactPowerSetPayload,
  ArtifactSlotUnlockedPayload,
} from './actions/artifact.ts';
export type { CallingLeftPayload, CallingStartedPayload } from './actions/calling.ts';
export type {
  CharacterCreatedPayload,
  CharacterRetiredPayload,
  ProfileUpdatedPayload,
  RaceChangedPayload,
  RetirementAssignedPayload,
} from './actions/character.ts';
export type { EventCheckedInPayload, EventCheckInVoidedPayload } from './actions/events.ts';
export type {
  JournalAddedPayload,
  JournalRemovedPayload,
  JournalTaggedPayload,
} from './actions/journal.ts';
export type {
  MtSpentPayload,
  PointsAdjustedPayload,
  PointsAwardedPayload,
} from './actions/points.ts';
export type {
  BoonAddedPayload,
  BoonRemovedPayload,
  FamiliarRemovedPayload,
  FamiliarSetPayload,
  ItemsStartingSetPayload,
  LocationFamiliarizedPayload,
  LocationRemovedPayload,
  OwedAddedPayload,
  OwedDeliveredPayload,
  SpiritChangedPayload,
} from './actions/records.ts';
export type { RequestApprovedPayload, RequestRejectedPayload } from './actions/requests.ts';
export type { SkillLearnedPayload, SkillRefundedPayload } from './actions/skills.ts';

export { summarize, skillLevel, skillTechniques, LEDGER_CURRENCIES } from './sheet.ts';
export type * from './sheet.ts';
export type { Notice, RuleError } from './errors.ts';

export {
  CheckInChoicesSchema,
  PlannedPurchaseSchema,
  PREREG_PURCHASES,
  RegistrationPlanSchema,
  checkInItems,
  checkInSources,
  checkRegistration,
  upkeepFor,
  type CheckInChoices,
  type CheckInSource,
  type PlannedPurchase,
  type PlannedPurchaseResult,
  type PullItem,
  type RegistrationCheck,
  type RegistrationPlan,
  type RegistrationPlanInput,
  type UpkeepInfo,
} from './checkin/checkInPlan.ts';

// Cost helpers.
export {
  cumulativeLevelCost,
  fullSkillCost,
  levelCost,
  nextLevelCost,
  skillCost,
  skillCurrency,
  stepCost,
  techniqueCost,
  techniqueRow,
  triangular,
} from './rules/costs.ts';
// Skill state, prerequisites, and abilities.
export {
  abilityStates,
  checkPrereqs,
  hasTechnique,
  highestTechnique,
  namedLevelUnlocked,
  refundableSteps,
  stepOrderProblem,
  stepsTo,
  techniqueTier,
  type AbilityState,
  type OwnedSkill,
} from './rules/skills.ts';
// Points, check-in, retirement, Calling, journals.
export { applyCaps, attendanceAwards, attendanceSilver, npcTimeRewards } from './rules/awards.ts';
export { incomeItems, type IncomeChoices } from './rules/income.ts';
export { retirementCarry, retirementStartingXp } from './rules/retirement.ts';
export { callingTiers, fullEventsBefore, tierGap } from './rules/calling.ts';
export { journalRef, journalUsability } from './rules/journal.ts';
export { computeStats, incomeText } from './rules/stats.ts';
export {
  displayContext,
  displayRuleText,
  displaySkillName,
  naturalWeaponText,
  NO_DISPLAY_CONTEXT,
  skillDisplayNameFor,
  type DisplayContext,
  type RaceChoiceContext,
} from './rules/displayName.ts';

export * from './model.ts';
