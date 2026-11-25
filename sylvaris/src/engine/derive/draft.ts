// Mutable replay state. Action handlers (src/engine/actions) write into a Draft; finalize()
// turns it into the read-only Sheet. Running totals are kept here so replay stays O(actions).
import type { SyRuleset } from '../../data/index.ts';
import type { Action, NamedLevelId, SkillStep, TechniqueId } from '../model.ts';
import { skillCost, skillCurrency } from '../rules/costs.ts';
import { NOT_OWNED, type OwnedSkill } from '../rules/skills.ts';
import type {
  ArtifactPowerEntry,
  BoonEntry,
  ChoiceValue,
  LearningLogEntry,
  LedgerCurrency,
  LedgerRow,
  Literacy,
  LocationEntry,
  RaceChangeRecord,
  RefundRecord,
  RequestDecision,
  RetiredSection,
  RetirementFrom,
  SheetEvent,
  SheetWarning,
  StartingItemPick,
  VoidedCheckIn,
  FamiliarTrick,
  Cost,
} from '../sheet.ts';

export interface DraftProfile {
  characterName: string;
  playerName: string;
  playerEmail: string | null;
  concept: string;
  backstory: string;
  notes: string;
  ageCategory: number;
  ageYears: number | null;
  startingXp: number;
  createdAt: string | null;
  retirementFrom: RetirementFrom | null;
}

export interface DraftTeaching {
  teacher: string | null;
  viaMt: string | null;
  eventKey: string | null;
  atCreation: boolean;
  actionId: string;
}

export interface DraftSkill {
  level: number;
  techniques: TechniqueId[];
  /** XP or CXP paid for what is owned, at the prices stored in the log. */
  spent: number;
  /** Basic and Technique purchases (the Log of Learning). */
  teaching: Map<NamedLevelId, DraftTeaching>;
}

export interface DraftCalling {
  callingId: string;
  choices: Record<string, ChoiceValue>;
  startedAt: string;
  startedEventKey: string | null;
  leftAt: string | null;
  leftEventKey: string | null;
  leftReason: string | null;
}

export interface DraftJournalEntry {
  entryId: string;
  kind: 'spell' | 'recipe' | 'performance' | 'ritual';
  refId: string;
  source: 'teacher' | 'research' | 'scroll' | 'starting' | 'other';
  teacher: string | null;
  status: 'pending' | 'tagged';
  addedAt: string;
  eventKey: string | null;
}

export interface DraftMtPurchase {
  actionId: string;
  at: string;
  purchaseId: string;
  name: string;
  qty: number;
  mtCost: number;
  capKey: string | null;
  eventKey: string | null;
  forEventKey: string | null;
  namedLevel: NamedLevelId | null;
  skillId: string | null;
  grants: { currency: LedgerCurrency; amount: number }[];
  items: string[];
  usedBy: string | null;
}

export interface DraftArtifact {
  name: string;
  description: string;
  awakenedAt: string;
  slotsUnlocked: number;
  powers: ArtifactPowerEntry[];
  removals: { actionId: string; at: string; entryIds: string[]; reason: string }[];
}

export interface DraftFamiliar {
  actionId: string;
  name: string;
  form: string | null;
  quality: string;
  stable: boolean;
  tricks: FamiliarTrick[];
  setAt: string;
}

export interface Draft {
  readonly ruleset: SyRuleset;
  created: boolean;
  profile: DraftProfile;
  raceId: string | null;
  raceChoices: Record<string, ChoiceValue>;
  literacy: Literacy;
  skills: Map<string, DraftSkill>;

  // Running totals.
  ledgerTotals: Record<LedgerCurrency, number>;
  /** XP credited with the `starting` kind (left out of the earned cap when the data says so). */
  xpStartCredited: number;
  xpSpent: number;
  cxpSpent: number;
  axpSpent: number;
  mtSpent: number;

  ledger: LedgerRow[];
  events: SheetEvent[];
  eventKeys: Set<string>;
  voidedCheckIns: VoidedCheckIn[];
  mtPurchases: DraftMtPurchase[];
  learningLog: LearningLogEntry[];
  refunds: RefundRecord[];
  journal: DraftJournalEntry[];
  callings: DraftCalling[];
  startingItems: StartingItemPick[];
  spirit: number;
  spiritHistory: { actionId: string; at: string; delta: number; reason: string; after: number }[];
  artifact: DraftArtifact | null;
  locations: LocationEntry[];
  boons: BoonEntry[];
  familiar: DraftFamiliar | null;
  owed: { id: string; text: string; eventKey: string | null }[];
  owedDelivered: Map<string, string>;
  retired: RetiredSection | null;
  requestDecisions: RequestDecision[];
  raceChanges: RaceChangeRecord[];
  warnings: SheetWarning[];
  /** Balances currently below zero, so each crossing warns once. */
  negatives: Set<string>;
  lastSeq: number;
}

export function createDraft(ruleset: SyRuleset): Draft {
  const c = ruleset.ruleset.creation;
  return {
    ruleset,
    created: false,
    profile: {
      characterName: '',
      playerName: '',
      playerEmail: null,
      concept: '',
      backstory: '',
      notes: '',
      ageCategory: c.defaultAgeCategory,
      ageYears: null,
      startingXp: 0,
      createdAt: null,
      retirementFrom: null,
    },
    raceId: null,
    raceChoices: {},
    literacy: 'race-language',
    skills: new Map(),
    ledgerTotals: { xp: 0, cxp: 0, axp: 0, mt: 0 },
    xpStartCredited: 0,
    xpSpent: 0,
    cxpSpent: 0,
    axpSpent: 0,
    mtSpent: 0,
    ledger: [],
    events: [],
    eventKeys: new Set(),
    voidedCheckIns: [],
    mtPurchases: [],
    learningLog: [],
    refunds: [],
    journal: [],
    callings: [],
    startingItems: [],
    spirit: ruleset.ruleset.body.spiritFragmentsStart,
    spiritHistory: [],
    artifact: null,
    locations: [],
    boons: [],
    familiar: null,
    owed: [],
    owedDelivered: new Map(),
    retired: null,
    requestDecisions: [],
    raceChanges: [],
    warnings: [],
    negatives: new Set(),
    lastSeq: 0,
  };
}

export function warn(draft: Draft, actionId: string | null, code: string, message: string): void {
  draft.warnings.push({ actionId, code, message });
}

/** Adds one ledger row and updates the running totals. Zero amounts are ignored. */
export function credit(
  draft: Draft,
  action: Action,
  currency: LedgerCurrency,
  amount: number,
  kind: string,
  eventKey: string | null,
  note: string | null = null,
): void {
  if (amount === 0) return;
  draft.ledgerTotals[currency] += amount;
  if (currency === 'xp' && kind === 'starting') draft.xpStartCredited += amount;
  draft.ledger.push({
    actionId: action.id,
    seq: action.seq,
    date: action.at,
    currency,
    amount,
    kind,
    eventKey,
    runningTotal: draft.ledgerTotals[currency],
    note,
  });
}

/** What the draft owns of a skill. */
export function ownedOf(draft: Draft, skillId: string): OwnedSkill {
  const s = draft.skills.get(skillId);
  return s ? { level: s.level, techniques: s.techniques } : NOT_OWNED;
}

/**
 * Sets a skill's level and Techniques and moves XP or CXP spent, so a refund gives the points
 * back. `stored` is the change in points spent as the log recorded it (a cost, or minus a
 * refund); replay uses it so history keeps the prices paid. Without it the current table is
 * used. Returns the change the current table gives. Removes the skill when nothing is left.
 */
export function setSkill(draft: Draft, skillId: string, next: OwnedSkill, stored?: number): number {
  const rs = draft.ruleset;
  const skill = rs.skillsById[skillId];
  const before = ownedOf(draft, skillId);
  const diff =
    skillCost(rs, next.level, next.techniques) - skillCost(rs, before.level, before.techniques);
  const change = stored ?? diff;
  if (skill && skillCurrency(skill) === 'cxp') draft.cxpSpent += change;
  else draft.xpSpent += change;
  if (next.level <= 0 && next.techniques.length === 0) {
    draft.skills.delete(skillId);
    return diff;
  }
  const entry = draft.skills.get(skillId) ?? {
    level: 0,
    techniques: [],
    spent: 0,
    teaching: new Map(),
  };
  entry.level = next.level;
  entry.techniques = [...next.techniques];
  entry.spent += change;
  draft.skills.set(skillId, entry);
  return diff;
}

/** Warns when a stored price differs from the current table (the stored one is kept). */
export function warnPriceDiffers(
  draft: Draft,
  action: Action,
  what: string,
  stored: number,
  table: number,
  currency: string,
): void {
  if (stored === table) return;
  const unit = currency.toUpperCase();
  warn(
    draft,
    action.id,
    'STORED_PRICE_DIFFERS',
    `${action.type} (${what}): the log has ${stored} ${unit}, the current table ${table} ${unit}; the logged amount is used.`,
  );
}

/** The named level a purchase step is recorded under, or null for levels 2 to 10. */
export function teachingKey(step: SkillStep): NamedLevelId | null {
  if ('technique' in step) return step.technique;
  return step.level === 1 ? 'basic' : null;
}

/** XP earned toward the cap (the start counts when the data says so, Q-PTS-7). */
export function xpEarnedForCap(draft: Draft): number {
  const x = draft.ruleset.ruleset.xp;
  return draft.ledgerTotals.xp - (x.earnedCapIncludesStart ? 0 : draft.xpStartCredited);
}

/** The active Calling (started and not left), or null. */
export function activeCalling(draft: Draft): DraftCalling | null {
  const last = draft.callings[draft.callings.length - 1];
  return last && last.leftAt === null ? last : null;
}

/** Warns once each time a balance crosses below zero or above a cap. Called after every action. */
export function checkBalances(draft: Draft, actionId: string): void {
  const rs = draft.ruleset;
  const check = (key: string, bad: boolean, code: string, message: () => string): void => {
    if (bad) {
      if (!draft.negatives.has(key)) {
        draft.negatives.add(key);
        warn(draft, actionId, code, message());
      }
    } else draft.negatives.delete(key);
  };
  const xp = draft.ledgerTotals.xp - draft.xpSpent;
  check('xp', xp < 0, 'NEGATIVE_XP', () => `XP available is ${xp} after this action.`);
  const cxp = draft.ledgerTotals.cxp - draft.cxpSpent;
  check('cxp', cxp < 0, 'NEGATIVE_CXP', () => `CXP available is ${cxp} after this action.`);
  const axp = draft.ledgerTotals.axp - draft.axpSpent;
  check('axp', axp < 0, 'NEGATIVE_AXP', () => `AXP available is ${axp} after this action.`);
  const mt = draft.ledgerTotals.mt;
  check('mt', mt < 0, 'NEGATIVE_MT', () => `Mist Token balance is ${mt} after this action.`);
  const xpCap = rs.ruleset.xp.earnedCap;
  const xpEarned = xpEarnedForCap(draft);
  check(
    'xp-cap',
    xpEarned > xpCap,
    'XP_CAP_EXCEEDED',
    () => `Earned XP is ${xpEarned}, above the ${xpCap} cap.`,
  );
  const cxpCap = rs.ruleset.cxp.earnedCap;
  const cxpEarned = draft.ledgerTotals.cxp;
  check(
    'cxp-cap',
    cxpEarned > cxpCap,
    'CXP_CAP_EXCEEDED',
    () => `Earned CXP is ${cxpEarned}, above the ${cxpCap} cap.`,
  );
}

/** Cost record helper. */
export function cost(currency: LedgerCurrency, amount: number): Cost {
  return { currency, amount };
}
