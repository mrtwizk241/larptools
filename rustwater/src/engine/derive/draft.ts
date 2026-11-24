// Mutable replay state. Action handlers (src/engine/actions) write into a Draft; finalize()
// turns it into the read-only Sheet. Running totals are kept here so replay stays O(actions).
import type { Ruleset } from '../../data/index.ts';
import type { Action, SkillPart } from '../model.ts';
import { apEarnedByBasic, cumulativeCost, type CostKind } from '../rules/costs.ts';
import { archetypeOf, setLevel, type LevelTable, getLevel } from '../rules/levels.ts';
import type {
  BoonEntry,
  FamiliarSkillView,
  LedgerCurrency,
  LedgerRow,
  MemorizedEntry,
  ProfessionLevelRecord,
  RequestDecision,
  RetiredSection,
  RetirementCarry,
  SheetEvent,
  SheetWarning,
  ShinyPurchaseRecord,
  StartingItemPick,
  StoryNote,
  Trauma,
  VoidedCheckIn,
} from '../sheet.ts';

export interface DraftProfile {
  characterName: string;
  playerName: string;
  playerEmail: string | null;
  /** Age step 1 to 10, or null. */
  age: number | null;
  effects: string;
  createdAt: string | null;
  retirementFrom: RetirementCarry | null;
}

export interface DraftInfection {
  track: 'infection' | 'connection';
  base: number;
  extra: number;
  current: number;
}

export interface Draft {
  readonly ruleset: Ruleset;
  created: boolean;
  profile: DraftProfile;
  ancestryId: string | null;
  subtypeId: string | null;
  fromLegendsChoice: string | null;
  abilityLevels: { shared: number; subtype: number };
  infection: DraftInfection | null;
  skills: LevelTable;
  /** Teacher recorded for the latest level of each skill part, keyed `skillId:part`. */
  teachers: Map<string, string>;

  // Running totals.
  ledgerTotals: Record<LedgerCurrency, number>;
  /** CXP ledger minus the kinds excluded from the earned cap. */
  cxpEarned: number;
  cxpSpent: number;
  apEarned: Record<string, number>;
  apSpent: Record<string, number>;
  lxpSpent: number;

  ledger: LedgerRow[];
  events: SheetEvent[];
  eventKeys: Set<string>;
  voidedCheckIns: VoidedCheckIn[];
  shinyPurchases: ShinyPurchaseRecord[];
  warnings: SheetWarning[];
  /** Balances currently below zero, so each crossing warns once. */
  negatives: Set<string>;
  lastSeq: number;

  /** Memorized spells, recipes, performances, rituals, knowledges, in log order. */
  memory: MemorizedEntry[];
  profession: DraftProfession | null;
  familiar: DraftFamiliar | null;
  /** PXP spent on profession levels (running, from levels). */
  pxpSpent: number;
  /** FP spent on the familiar (awakening, levels, forgetting, breaking a bond). Never refunded. */
  fpSpent: number;
  boons: BoonEntry[];
  startingItems: StartingItemPick[];
  /** Manually added owed rewards (check-in rewards come from `events`). */
  owed: DraftOwed[];
  /** Check-in rewards already delivered when their check-in was voided; they stay listed. */
  voidedOwed: DraftOwed[];
  /** Owed id -> time delivered. */
  owedDelivered: Map<string, string>;
  retired: RetiredSection | null;
  requestDecisions: RequestDecision[];
  traumas: Trauma[];
  /** Story notes and knowledges, in the order added. */
  storyNotes: StoryNote[];
  /** Story note id that holds the old profile `notes` text, while it exists. */
  legacyNotesId: string | null;
}

export interface DraftProfession {
  professionId: string;
  startedAt: string;
  startedEventKey: string | null;
  levels: Record<string, number>;
  history: ProfessionLevelRecord[];
}

export interface DraftFamiliar {
  name: string;
  creature: string | null;
  level: number;
  awakenedSkillId: string | null;
  learned: FamiliarSkillView[];
  extraSlots: number;
  /** Essence spent on skills (forgotten ones included) and extra slots. */
  essenceSpent: number;
  bondedAt: string;
}

export interface DraftOwed {
  id: string;
  text: string;
  eventKey: string | null;
}

export function createDraft(ruleset: Ruleset): Draft {
  const pools: Record<string, number> = {};
  for (const a of ruleset.archetypes) pools[a.id] = 0;
  return {
    ruleset,
    created: false,
    profile: {
      characterName: '',
      playerName: '',
      playerEmail: null,
      age: null,
      effects: '',
      createdAt: null,
      retirementFrom: null,
    },
    ancestryId: null,
    subtypeId: null,
    fromLegendsChoice: null,
    abilityLevels: { shared: 0, subtype: 0 },
    infection: null,
    skills: new Map(),
    teachers: new Map(),
    ledgerTotals: { cxp: 0, pxp: 0, shinies: 0, fp: 0 },
    cxpEarned: 0,
    cxpSpent: 0,
    apEarned: { ...pools },
    apSpent: { ...pools },
    lxpSpent: 0,
    ledger: [],
    events: [],
    eventKeys: new Set(),
    voidedCheckIns: [],
    shinyPurchases: [],
    warnings: [],
    negatives: new Set(),
    lastSeq: 0,
    memory: [],
    profession: null,
    familiar: null,
    pxpSpent: 0,
    fpSpent: 0,
    boons: [],
    startingItems: [],
    owed: [],
    voidedOwed: [],
    owedDelivered: new Map(),
    retired: null,
    requestDecisions: [],
    traumas: [],
    storyNotes: [],
    legacyNotesId: null,
  };
}

/** The author of a story note recorded by `action`. */
export function noteAuthor(action: Action): StoryNote['by'] {
  return { role: action.actor.role, name: action.actor.name ?? null };
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
  if (currency === 'cxp' && !draft.ruleset.ruleset.earnedCxpCap.excludedKinds.includes(kind))
    draft.cxpEarned += amount;
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

/**
 * Sets a skill part's level and updates CXP spent, AP earned, and AP spent by the difference.
 * `archetype` is the pool the skill uses (needed for multi-archetype skills on first purchase).
 */
export function setSkillLevel(
  draft: Draft,
  skillId: string,
  part: SkillPart,
  costKind: CostKind,
  newLevel: number,
  archetype: string | null,
): void {
  const rs = draft.ruleset;
  const skill = rs.skillsById[skillId];
  const oldLevel = getLevel(draft.skills, skillId, part);
  const pool = archetypeOf(rs, draft.skills, skillId) ?? archetype;
  const costDiff = cumulativeCost(rs, costKind, newLevel) - cumulativeCost(rs, costKind, oldLevel);
  if (costKind === 'basic') {
    draft.cxpSpent += costDiff;
    if (pool !== null)
      draft.apEarned[pool] =
        (draft.apEarned[pool] ?? 0) + apEarnedByBasic(rs, newLevel) - apEarnedByBasic(rs, oldLevel);
  } else if (pool !== null) {
    draft.apSpent[pool] = (draft.apSpent[pool] ?? 0) + costDiff;
  }
  const chosen = skill?.archetype === undefined ? pool : null;
  setLevel(draft.skills, skillId, part, newLevel, chosen);
}

/** Warns once each time a balance crosses below zero. Called after every action. */
export function checkBalances(draft: Draft, actionId: string): void {
  const rs = draft.ruleset;
  const check = (key: string, value: number, message: () => string, code: string): void => {
    if (value < 0) {
      if (!draft.negatives.has(key)) {
        draft.negatives.add(key);
        warn(draft, actionId, code, message());
      }
    } else draft.negatives.delete(key);
  };
  const cxpAvailable = draft.ledgerTotals.cxp - draft.cxpSpent;
  check(
    'cxp',
    cxpAvailable,
    () => `CXP available is ${cxpAvailable} after this action.`,
    'NEGATIVE_CXP',
  );
  for (const pool of Object.keys(draft.apEarned)) {
    const available = (draft.apEarned[pool] ?? 0) - (draft.apSpent[pool] ?? 0);
    const name = rs.archetypesById[pool]?.name ?? pool;
    check(
      `ap:${pool}`,
      available,
      () => `${name} AP available is ${available} after this action.`,
      'NEGATIVE_AP',
    );
  }
  if (draft.created) {
    const lxpAvailable = lxpTotal(draft) - draft.lxpSpent;
    check(
      'lxp',
      lxpAvailable,
      () =>
        `LXP available is ${lxpAvailable} after this action. Staff should review the ancestry levels.`,
      'NEGATIVE_LXP',
    );
  }
  const pxpAvailable = draft.ledgerTotals.pxp - draft.pxpSpent;
  check(
    'pxp',
    pxpAvailable,
    () => `PXP available is ${pxpAvailable} after this action.`,
    'NEGATIVE_PXP',
  );
  const fpAvailable = draft.ledgerTotals.fp - draft.fpSpent;
  check(
    'fp',
    fpAvailable,
    () => `FP available is ${fpAvailable} after this action.`,
    'NEGATIVE_FP',
  );
  const shinies = draft.ledgerTotals.shinies;
  check(
    'shinies',
    shinies,
    () => `Shinies balance is ${shinies} after this action.`,
    'NEGATIVE_SHINIES',
  );
  const cap = rs.ruleset.earnedCxpCap.amount;
  check(
    'cxp-cap',
    cap - draft.cxpEarned,
    () => `Earned CXP is ${draft.cxpEarned}, above the ${cap} cap.`,
    'CXP_CAP_EXCEEDED',
  );
}

/** LXP_total = atCreation + floor(CXP counted / perCxp) ([PTS-LXP-TOTAL]). */
export function lxpTotal(draft: Draft): number {
  const lxp = draft.ruleset.ruleset.lxp;
  let counted = draft.ledgerTotals.cxp;
  if (!lxp.countsStartingCxp) {
    const start = draft.ledger
      .filter((r) => r.currency === 'cxp' && r.kind === 'start')
      .reduce((sum, r) => sum + r.amount, 0);
    counted -= start;
  }
  return lxp.atCreation + Math.floor(Math.max(0, counted) / lxp.perCxp);
}
