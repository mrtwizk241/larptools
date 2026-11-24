// The derived sheet: everything the UI shows, computed by deriveSheet() from the action log.
// See docs/SPEC.md "Derived sheet". Plain JSON-friendly data: no classes, maps, or functions.
import type { SkillPart } from './model.ts';

/** Currencies that have a ledger. AP and LXP are derived from purchases and never ledgered. */
export type LedgerCurrency = 'cxp' | 'pxp' | 'shinies' | 'fp';
export const LEDGER_CURRENCIES: readonly LedgerCurrency[] = ['cxp', 'pxp', 'shinies', 'fp'];

/** How often uses come back. `event` covers check-in abilities and per-event skills. */
export type UsePeriod = 'encounter' | 'repop' | 'event';

export interface Uses {
  readonly count: number;
  readonly per: UsePeriod;
}

/** Extra uses on another period, for example a mastery's "+1 basic use each encounter". */
export interface ExtraUses extends Uses {
  /** Skill and part whose effect grants these uses. */
  readonly fromSkillId: string;
  readonly fromPart: SkillPart;
}

/** Spend or earn amount in one currency. AP costs name the archetype pool. */
export interface Cost {
  /** essence: a familiar's Essence (AE). */
  readonly currency: 'cxp' | 'ap' | 'lxp' | 'pxp' | 'shinies' | 'fp' | 'essence';
  readonly amount: number;
  readonly archetype?: string;
}

/** A problem found on replay, with the action that caused it (null for whole-log problems). */
export interface SheetWarning {
  readonly actionId: string | null;
  readonly code: string;
  readonly message: string;
}

export interface RetirementCarry {
  readonly fromName: string;
  readonly cxp: number;
  readonly fp: number;
  readonly shinies: number;
}

export interface Profile {
  readonly characterName: string;
  readonly playerName: string;
  readonly playerEmail: string | null;
  /**
   * Age step 1 to 10 ([ANC-AGE]): each step is 10% of a full life. Old logs that stored years are
   * converted on replay. null when not set or not convertible.
   */
  readonly age: number | null;
  /** "Character or infection effects" free text. */
  readonly effects: string;
  /**
   * @deprecated Old single notes field: the current text of the story note it became ('' when
   * none). Read `Sheet.storyNotes` instead.
   */
  readonly notes: string;
  /** Time the character.created action was recorded. */
  readonly createdAt: string | null;
  /** Set when this character started with a retirement carry-over. */
  readonly retirementFrom: RetirementCarry | null;
}

/** What a check-in ability hands out at its current level. */
export interface CheckInGrantView {
  readonly resources: { readonly qty: number; readonly rarity: string } | null;
  /** Bits the player may take instead of the resources. */
  readonly orBits: number | null;
  readonly randomDraws: number | null;
  readonly stackForHigherRarity: boolean;
}

export interface AncestryPassiveView {
  readonly id: string;
  readonly name: string;
  readonly sheetName: string;
  readonly frequency: string;
  readonly checkIn: CheckInGrantView | null;
  readonly text: string;
}

export interface AncestryAbilityView {
  /** Shared by the whole ancestry, or specific to the subtype. */
  readonly slot: 'shared' | 'subtype';
  readonly id: string;
  readonly name: string;
  readonly sheetName: string;
  readonly level: number;
  /** Frequency used for uses (From Legends takes the copied ability's). */
  readonly frequency: string;
  readonly uses: Uses | null;
  /** Cryptid From Legends: the ability it copies. */
  readonly copied: { readonly id: string; readonly name: string; readonly text: string } | null;
  readonly checkIn: CheckInGrantView | null;
  readonly text: string;
}

export interface AncestrySection {
  readonly ancestryId: string;
  readonly ancestryName: string;
  readonly subtypeId: string;
  readonly subtypeName: string;
  readonly passives: readonly AncestryPassiveView[];
  /** Always two entries: shared, then subtype. */
  readonly abilities: readonly AncestryAbilityView[];
  readonly fromLegendsChoice: string | null;
  readonly maxAge: number | null;
  readonly ages: boolean;
}

export interface InfectionSection {
  /** `connection` for Aware (Connection Damage), else `infection`. */
  readonly track: 'infection' | 'connection';
  readonly label: string;
  readonly base: number;
  readonly extra: number;
  readonly current: number;
  readonly max: number;
  /** At the track maximum: Risen (or Restless for Aware). */
  readonly reachedMax: boolean;
}

export interface CxpPoints {
  /** Sum of the CXP ledger: start, infection bonus, carry-over, awards, adjustments. */
  readonly total: number;
  /** CXP ledger minus the starting kinds; capped by ruleset.earnedCxpCap. */
  readonly earned: number;
  readonly capRemaining: number;
  /** Spent on basic skill levels. */
  readonly spent: number;
  readonly available: number;
}

export interface Pool {
  readonly earned: number;
  readonly spent: number;
  readonly available: number;
}

export interface PointsSection {
  readonly cxp: CxpPoints;
  /** One pool per archetype id (warrior, defender, rogue, utility, magic, crafting). */
  readonly ap: Readonly<Record<string, Pool>>;
  readonly lxp: { readonly total: number; readonly spent: number; readonly available: number };
  /** `spent`: profession levels, 10 x T(level) per skill ([PRO-COST]). */
  readonly pxp: { readonly total: number; readonly spent: number; readonly available: number };
  /** `spent`: awakening, familiar levels, forgotten skills, broken bonds ([FAM-FP]). Never refunded. */
  readonly fp: { readonly total: number; readonly spent: number; readonly available: number };
  readonly shinies: { readonly balance: number };
}

export interface SheetSkillPart {
  readonly part: SkillPart;
  readonly level: number;
  /** null: no limit (memorization). */
  readonly maxLevel: number | null;
  /** Ruleset cost line: basic, adept, advanced, encounter, passive, memorization, mastery. */
  readonly costKind: string;
  readonly currency: 'cxp' | 'ap';
  /** Cumulative cost of the levels owned. */
  readonly spent: number;
  /** AP earned in the skill's archetype (basic parts only). */
  readonly apEarned: number;
  /** Cost of the next level, or null at the maximum. */
  readonly nextCost: number | null;
  readonly frequency: string;
  readonly timing: 'check-in' | null;
  /** Uses per period from the level plus same-period effects; null for passive parts. */
  readonly uses: Uses | null;
  /** Uses on a different period granted by effects (mastery extra uses). */
  readonly extraUses: readonly ExtraUses[];
  /** Teacher recorded for the latest level, if any. */
  readonly teacher: string | null;
}

export interface SheetSkill {
  readonly skillId: string;
  readonly name: string;
  readonly category: string;
  readonly type: string;
  /** Archetype whose AP the skill earns and spends (chosen one for multi-archetype skills). */
  readonly archetype: string | null;
  /** True for multi-archetype skills, whose archetype was chosen on first purchase. */
  readonly archetypeChosen: boolean;
  /** Parts with level > 0, in rules data order. */
  readonly parts: readonly SheetSkillPart[];
}

export interface StatContribution {
  readonly stat: string;
  readonly amount: number;
  readonly source:
    | { readonly kind: 'base' }
    | { readonly kind: 'skill'; readonly id: string; readonly part: SkillPart }
    | { readonly kind: 'ancestry'; readonly id: string };
  /** Set when the bonus applies only sometimes; such amounts are not in the totals. */
  readonly condition: string | null;
  readonly note: string | null;
}

export interface StatsSection {
  readonly maxHealth: number;
  readonly armor: number;
  /** Every unconditional additive stat, including maxHealth and armor. */
  readonly totals: Readonly<Record<string, number>>;
  readonly contributions: readonly StatContribution[];
}

export interface Award {
  readonly currency: LedgerCurrency;
  readonly amount: number;
  readonly kind: string;
}

export interface SheetEvent {
  readonly key: string;
  readonly name: string;
  readonly date: string;
  readonly attendance: string;
  readonly actionId: string;
  readonly npcHours: number;
  readonly preSignedShift: boolean;
  readonly extras: readonly string[];
  readonly awards: readonly Award[];
  /** Item rewards handed out at check-in, as text. */
  readonly owed: readonly string[];
  /** Check-in skill items handed over at the desk, as text. */
  readonly handedOut: readonly string[];
  /** Start-of-event choices and how upkeep was paid, as text. */
  readonly picks: readonly string[];
}

/** A check-in taken back by event.checkInVoided. It no longer counts as attended. */
export interface VoidedCheckIn {
  /** The event.checkedIn action that was voided. */
  readonly checkInActionId: string;
  /** The event.checkInVoided action. */
  readonly actionId: string;
  readonly key: string;
  readonly name: string;
  readonly date: string;
  readonly reason: string;
}

export interface LedgerRow {
  readonly actionId: string;
  readonly seq: number;
  /** Time the action was recorded (ISO). */
  readonly date: string;
  readonly currency: LedgerCurrency;
  readonly amount: number;
  /** Ledger kind id from ruleset.ledgerKinds. */
  readonly kind: string;
  readonly eventKey: string | null;
  /** Running total of this currency after this row. */
  readonly runningTotal: number;
  readonly note: string | null;
}

export interface ShinyPurchaseRecord {
  readonly actionId: string;
  readonly purchaseId: string;
  readonly qty: number;
  readonly shiniesCost: number;
  /** Event the purchase was made at (per-event caps count against it). */
  readonly eventKey: string | null;
  /** Missed-event purchase: the event credited. */
  readonly forEventKey: string | null;
  /** Alt-character purchase: who received the Event CXP. */
  readonly altCharacterName: string | null;
  readonly items: readonly string[];
}

// ---- Memory, profession, familiar, boons, starting items, owed rewards, retirement. ----

/** What a memorized entry is. `knowledge` is free text and uses no slot. */
export type MemoryKind = 'spell' | 'recipe' | 'performance' | 'ritual' | 'knowledge';

export interface MemorizedEntry {
  readonly kind: MemoryKind;
  /** Spell, recipe, performance, or ritual id; null for free-text knowledges. */
  readonly refId: string | null;
  /** Display name: the rules data name, or the free text. */
  readonly name: string;
  /** basic, adept, advanced, or mastery; null for knowledges and rituals. */
  readonly rank: string | null;
  /** Free text (knowledges), else null. */
  readonly text: string | null;
  /** School or craft id, `universal`, `performance`, `ritual`, or `none` (knowledges). */
  readonly slot: string;
  /** Slot pool id such as `spell-death` or `recipe-universal`; null for knowledges. */
  readonly pool: string | null;
  /** The memorized.added action; forget it by this id. */
  readonly actionId: string;
}

/**
 * One memorization slot pool. Pool ids: `spell-<school>`, `spell-universal`, `recipe-<craft>`,
 * `recipe-universal`, `performance`, `ritual`.
 */
export interface MemorySlotPool {
  readonly kind: 'spell' | 'recipe' | 'performance' | 'ritual';
  readonly pool: string;
  /** School or craft name, "Universal", "Performances", or "Rituals". */
  readonly name: string;
  /** Same as `slots` (kept for older callers). */
  readonly total: number;
  readonly slots: number;
  readonly used: number;
  /** slots - used; negative when over capacity (a warning is added). */
  readonly free: number;
  /** Slots from basic, adept, and advanced levels of the school, craft, or Bardic Performance. */
  readonly fromBasic: number;
  readonly fromAdept: number;
  readonly fromAdvanced: number;
  /** Slots from memorization levels (Spell, Recipe, Bardic Performance, Ritual Memorization). */
  readonly fromMemorization: number;
  /** Slots granted when a skill is learned (the ritual Ritualism grants). */
  readonly fromGrant: number;
  /** True for pools that hold any item of the kind (universal spell and recipe pools). */
  readonly universal: boolean;
  /** Memorization skill whose next level (1 AP) adds a slot to this pool, if any. */
  readonly memorizationSkillId: string | null;
}

export interface MemorySection {
  readonly entries: readonly MemorizedEntry[];
  readonly slots: readonly MemorySlotPool[];
  /** Rituals known automatically (Ritual Circle with Ritualism); they use no slot. */
  readonly autoLearned: readonly {
    readonly kind: 'ritual';
    readonly refId: string;
    readonly name: string;
  }[];
}

export interface ProfessionSkillView {
  readonly id: string;
  readonly name: string;
  readonly sheetName: string;
  readonly slot: 'skill-1' | 'skill-2';
  readonly frequency: string;
  readonly level: number;
  readonly maxLevel: number;
  /** PXP paid for the levels owned: 10 x T(level). */
  readonly pxpSpent: number;
  /** PXP for the next level, or null at the maximum. */
  readonly nextCost: number | null;
  /** Uses per period (level 0 gives 0 uses). */
  readonly uses: Uses;
  /** Basic uses that may be upgraded to adept or advanced (tiered skill only). */
  readonly adeptUpgrades: number;
  readonly advancedUpgrades: number;
  readonly text: string | null;
  /** Tier texts with the level each unlocks (tiered skill only). */
  readonly tiers: readonly {
    readonly tier: 'basic' | 'adept' | 'advanced';
    readonly minLevel: number;
    readonly unlocked: boolean;
    readonly text: string;
  }[];
  /** Event key the last level was bought at. */
  readonly lastEventKey: string | null;
}

export interface ProfessionLevelRecord {
  readonly skillId: string;
  readonly toLevel: number;
  readonly eventKey: string | null;
  readonly actionId: string;
}

export interface ProfessionSection {
  readonly professionId: string;
  readonly name: string;
  /** Level per profession skill id (both skills, 0 when not bought). */
  readonly levels: Readonly<Record<string, number>>;
  readonly kind: 'standard' | 'patron';
  readonly passive: {
    readonly id: string;
    readonly name: string;
    readonly sheetName: string;
    readonly text: string;
  };
  /** Skill 1 (per encounter), then skill 2 (per repop). */
  readonly skills: readonly ProfessionSkillView[];
  readonly startedAt: string;
  readonly startedEventKey: string | null;
  /** Every profession.leveled, in log order (the one-level-per-event rule reads this). */
  readonly history: readonly ProfessionLevelRecord[];
}

export interface FamiliarSkillView {
  readonly skillId: string;
  readonly name: string;
  readonly tier: number;
  readonly essence: number;
  readonly frequency: string;
  /** Recipe, craft, or skill chosen when learned. */
  readonly choice: string | null;
  /** The familiar.skillLearned action; forget it by this id. */
  readonly actionId: string;
}

export interface FamiliarSection {
  readonly name: string;
  readonly creature: string | null;
  readonly level: number;
  readonly awakened: boolean;
  readonly awakenedSkill: {
    readonly id: string;
    readonly name: string;
    readonly text: string;
  } | null;
  /** Ids of the skills in the slots (one entry per learned copy). */
  readonly skills: readonly string[];
  readonly learned: readonly FamiliarSkillView[];
  /** total = L(L+1)/2; spent includes forgotten skills (no refund) and extra slots. */
  readonly essence: { readonly total: number; readonly spent: number; readonly available: number };
  readonly slots: {
    readonly base: number;
    readonly extra: number;
    readonly maxExtra: number;
    readonly total: number;
    readonly used: number;
    readonly free: number;
  };
  /** FP for the next level (awakening or leveling), or null at level 10. */
  readonly nextLevelFp: number | null;
  readonly bondedAt: string;
}

export interface BoonEntry {
  readonly boonId: string | null;
  readonly name: string;
  /** Expiry text (the boon's own expiry kind, the default, or what staff typed). */
  readonly expires: string | null;
  /** What it does: the rules text, or what staff typed for a custom boon. */
  readonly text: string | null;
  /** Stats it changes, for example +10 max Health. */
  readonly effects: readonly { readonly stat: string; readonly add: number }[];
  readonly actionId: string;
}

export interface StartingItemPick {
  readonly optionId: string;
  readonly detail: string | null;
  /** Option name from the rules data. */
  readonly name: string;
}

export interface OwedEntry {
  /** owed.added action id, or `<check-in action id>#<index>` for check-in rewards. */
  readonly id: string;
  readonly text: string;
  readonly eventKey: string | null;
  readonly delivered: boolean;
  readonly source: 'manual' | 'check-in';
  readonly deliveredAt: string | null;
}

export interface RetiredSection {
  readonly reason: string;
  readonly at: string;
  /** planned or unplanned, when given. */
  readonly kind: string | null;
  readonly carry: { readonly cxp: number; readonly fp: number; readonly shinies: number };
}

/** A staff decision on a player request, from request.approved or request.rejected. */
export interface RequestDecision {
  readonly requestId: string;
  readonly status: 'approved' | 'rejected';
  readonly kind: 'learn-skill' | 'memorize' | 'boon';
  /** Skill requests. */
  readonly skillId: string | null;
  readonly part: SkillPart | null;
  readonly toLevel: number | null;
  /** Memorize requests. */
  readonly memoryKind: 'spell' | 'recipe' | 'performance' | 'ritual' | null;
  readonly refId: string | null;
  /** Boon requests. */
  readonly boonId: string | null;
  readonly submittedAt: string;
  readonly teacher: string | null;
  readonly playerNote: string | null;
  readonly reason: string | null;
  readonly decidedAt: string;
  readonly actionId: string;
}

/** Who recorded a story note. */
export interface NoteAuthor {
  readonly role: 'staff' | 'player' | 'system';
  readonly name: string | null;
}

/**
 * A visible story note. `note`: added as a story note (or the old profile notes
 * field). `knowledge`: a free-text knowledge recorded with memorized.added.
 */
export interface StoryNote {
  /** The action that added it (storyNote.added, profile.updated, or memorized.added). */
  readonly id: string;
  readonly text: string;
  readonly source: 'note' | 'knowledge';
  readonly addedAt: string;
  readonly by: NoteAuthor;
}

/** A trauma tied to infection ([PLAY-TRAUMA]). Staff only; players read it. */
export interface Trauma {
  /** The trauma.added action. */
  readonly id: string;
  readonly text: string;
  readonly addedAt: string;
}

export interface Sheet {
  readonly rulesetId: string;
  /** False until a valid character.created action has been replayed. */
  readonly created: boolean;
  readonly profile: Profile;
  readonly ancestry: AncestrySection | null;
  readonly infection: InfectionSection | null;
  readonly points: PointsSection;
  readonly skills: readonly SheetSkill[];
  readonly stats: StatsSection;
  readonly events: readonly SheetEvent[];
  /** Check-ins voided by staff, in log order. They are not in `events`. */
  readonly voidedCheckIns: readonly VoidedCheckIn[];
  readonly ledger: readonly LedgerRow[];
  readonly shinyPurchases: readonly ShinyPurchaseRecord[];
  readonly memory: MemorySection;
  readonly profession: ProfessionSection | null;
  readonly familiar: FamiliarSection | null;
  readonly boons: readonly BoonEntry[];
  readonly startingItems: readonly StartingItemPick[];
  readonly owed: readonly OwedEntry[];
  readonly retired: RetiredSection | null;
  /** Player requests staff approved or rejected, in log order. */
  readonly requestDecisions: readonly RequestDecision[];
  /** Traumas in the order they were added. */
  readonly traumas: readonly Trauma[];
  /** Story notes and knowledges in the order they were added. */
  readonly storyNotes: readonly StoryNote[];
  readonly warnings: readonly SheetWarning[];
  /** Highest seq seen in the log (0 for an empty log). New actions start at lastSeq + 1. */
  readonly lastSeq: number;
}

/** One row for character lists. */
export interface SheetSummary {
  readonly characterName: string;
  readonly playerName: string;
  readonly ancestryName: string;
  readonly subtypeName: string;
  readonly cxpTotal: number;
  readonly retired: boolean;
}

export function summarize(sheet: Sheet): SheetSummary {
  return {
    characterName: sheet.profile.characterName,
    playerName: sheet.profile.playerName,
    ancestryName: sheet.ancestry?.ancestryName ?? '',
    subtypeName: sheet.ancestry?.subtypeName ?? '',
    cxpTotal: sheet.points.cxp.total,
    retired: sheet.retired !== null,
  };
}

/** Level of one skill part on a sheet (0 when not owned). */
export function skillLevel(sheet: Sheet, skillId: string, part: SkillPart): number {
  const skill = sheet.skills.find((s) => s.skillId === skillId);
  return skill?.parts.find((p) => p.part === part)?.level ?? 0;
}
