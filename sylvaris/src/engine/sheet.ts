// The derived Sylvaris sheet: everything the UI shows, computed by deriveSheet() from the action
// log. See docs/SPEC.md "Derived sheet". Plain JSON-friendly data: no classes, maps, or functions.
import type { NamedLevelId, SkillStep, TechniqueId } from './model.ts';

/** Currencies that have a ledger: XP, Calling XP, Artifact XP, Mist Tokens. */
export type LedgerCurrency = 'xp' | 'cxp' | 'axp' | 'mt';
export const LEDGER_CURRENCIES: readonly LedgerCurrency[] = ['xp', 'cxp', 'axp', 'mt'];

/** Spend or earn amount in one currency. */
export interface Cost {
  readonly currency: LedgerCurrency;
  readonly amount: number;
}

/** A problem found on replay, with the action that caused it (null for whole-log problems). */
export interface SheetWarning {
  readonly actionId: string | null;
  readonly code: string;
  readonly message: string;
}

/** What a retired character passes on ([RET-TRANSFER]). */
export interface RetirementCarry {
  readonly xp: number;
  readonly cxp: number;
  readonly axp: number;
  /** Coin budget from the goods transfer, in Copper. */
  readonly coinCopper: number;
}

export interface RetirementFrom extends RetirementCarry {
  readonly fromName: string;
}

/** Race and Calling choices: an option id, a language id, free text, or a list (multi picks). */
export type ChoiceValue = string | readonly string[];
export type Choices = Readonly<Record<string, ChoiceValue>>;

export type Literacy = 'race-language' | 'common';

export interface Profile {
  readonly characterName: string;
  readonly playerName: string;
  readonly playerEmail: string | null;
  readonly concept: string;
  readonly backstory: string;
  readonly notes: string;
  /** Age category 2 to 10 ([RACE-AGE]). */
  readonly ageCategory: number;
  readonly ageYears: number | null;
  /** XP the character started with (150, or the retirement share). */
  readonly startingXp: number;
  /** Time the character.created action was recorded. */
  readonly createdAt: string | null;
  /** Set when this character was built from a retirement ([RET-REBUILD]). */
  readonly retirementFrom: RetirementFrom | null;
}

// ---- Stats ----

/** Where a sheet number comes from. */
export type StatSourceRef =
  | { readonly kind: 'base' }
  | { readonly kind: 'skill'; readonly id: string; readonly named: NamedLevelId }
  | { readonly kind: 'race'; readonly id: string }
  | { readonly kind: 'calling'; readonly id: string }
  | { readonly kind: 'artifact'; readonly id: string };

/** One contribution to a sheet number. */
export interface StatSource {
  readonly stat: string;
  readonly amount: number;
  /** add (most), set (replaces the base, the highest wins), base (starting value). */
  readonly op: 'add' | 'set' | 'base';
  readonly source: StatSourceRef;
  /** Display name of the source, for example "Toughness (Expert)". */
  readonly name: string;
  /** Set when it only applies sometimes; such amounts are not in the totals. */
  readonly when: string | null;
  readonly pool: string | null;
  readonly note: string | null;
}

/** A computed number with its cap and sources. */
export interface StatLine {
  /** Before the cap. */
  readonly total: number;
  /** After the cap (equal to total when there is none). */
  readonly value: number;
  readonly cap: number | null;
  readonly sources: readonly StatSource[];
  /** Sources that only apply sometimes (not in total). */
  readonly conditional: readonly StatSource[];
}

/** Passive damage by kind of attack, each with the caps applied ([PLAY-CAPS]). */
export interface PassiveDamageSection {
  readonly oneHanded: StatLine;
  readonly twoHanded: StatLine;
  /** The bonus every weapon attack gets (melee and ranged, not Relics). */
  readonly allWeapons: StatLine;
  readonly ranged: StatLine;
  readonly relic: StatLine;
  /** Melee from behind, one-handed and two-handed (cap 30). */
  readonly fromBehindOneHanded: StatLine;
  readonly fromBehindTwoHanded: StatLine;
  /** Extra while dual wielding (Aeshu); `applies` when another source already allows two long weapons. */
  readonly dualWield: StatLine & { readonly applies: boolean };
  /** Extra with the Warblade's bonded weapon (still under the cap). */
  readonly bondedWeapon: StatLine;
}

export interface SlotsSection {
  readonly enhancement: number;
  readonly attunement: number;
  /** Extra Attunement Slots for tools only (Gnome). */
  readonly attunementToolOnly: number;
  readonly greaterBoon: number;
  readonly lesserBoon: number;
  readonly amplifiedLife: number;
  readonly amplifiedArmor: number;
}

export interface LanguagesSection {
  /** Languages read and written. */
  readonly count: number;
  /** The ones named on the sheet (literacy choice, Elf extra language, Artifact power). */
  readonly known: readonly { readonly id: string; readonly name: string }[];
  /** Languages earned but not named yet (Knowledge, Research), chosen in play. */
  readonly unnamed: number;
  readonly sources: readonly StatSource[];
}

export interface GrantView {
  readonly grant: string;
  readonly sources: readonly string[];
}

export interface NaturalWeaponView {
  readonly id: string;
  readonly baseDamage: number;
  readonly greatclaw: boolean;
  readonly source: string;
}

/** A sheet number the generic effects produced (Calling numbers, slots, counts). */
export interface OtherStat {
  readonly stat: string;
  readonly value: number | string | boolean;
  readonly sources: readonly StatSource[];
}

/** One check-in grant option, already scaled by level. */
export interface IncomeOption {
  readonly copper?: number;
  readonly silver?: number;
  readonly basicComponents?: number;
  readonly exoticComponents?: number;
  readonly masterBuildingMaterials?: number;
  readonly ownUpkeepSilver?: number;
  readonly tradeItem?: NamedLevelId;
  readonly mixCopperValue?: number;
  readonly maxItems?: number;
  /** "10 Copper", "2 Basic Components". */
  readonly text: string;
}

/** Something the character collects at check-in ([SKL-CHECKIN], [EVT-CHECKIN-INCOME]). */
export interface IncomeSource {
  /** `skill:harvesting`, `race:human-innate-passive`, `familiar:merchanting`, `stat:checkInBasicComponents`. */
  readonly id: string;
  readonly name: string;
  readonly kind: 'skill' | 'race' | 'familiar' | 'stat';
  readonly level: number | null;
  /** Received in full. */
  readonly fixed: IncomeOption | null;
  /** Pick one (Merchanting per level). */
  readonly choice: readonly IncomeOption[] | null;
  /** Only the highest Technique's bonus counts. */
  readonly technique: {
    readonly technique: TechniqueId;
    readonly fixed: IncomeOption | null;
    readonly choice: readonly IncomeOption[] | null;
    /** May take this instead of `fixed`. */
    readonly alternative: IncomeOption | null;
    readonly trade: { readonly basicPerExotic: number; readonly maxExoticTotal: number } | null;
  } | null;
}

/** A way upkeep can be covered (ruleset upkeep modifiers the character has). */
export interface UpkeepCover {
  readonly id: string;
  readonly summary: string;
  /** Applied without a choice (Live off the Land). */
  readonly automatic: boolean;
  readonly coversSilver: number | null;
  readonly coversAll: boolean;
}

export interface UpkeepView {
  /** Silver per event after Calling effects (Fortune Favored pays none). */
  readonly silverPerEvent: number;
  readonly firstEventFree: boolean;
  readonly covers: readonly UpkeepCover[];
}

export interface LocationsCapacity {
  readonly fixedLocation: string;
  /** Slots from Blink, Rifting, Air Magic (per level). */
  readonly portalSlots: number;
  /** Elf Friend of the Forest trees (per level with the Master Technique). */
  readonly treeSlots: number;
  /** Locations allowed in total, the fixed tavern included, capped at the maximum. */
  readonly capacity: number;
  readonly max: number;
}

export interface StatsSection {
  readonly lifePoints: StatLine;
  readonly armorPoints: StatLine;
  readonly passiveDamage: PassiveDamageSection;
  readonly slots: SlotsSection;
  readonly languages: LanguagesSection;
  readonly bleedOutSeconds: StatLine;
  readonly deathCountMinutes: StatLine;
  readonly locations: LocationsCapacity;
  readonly grants: readonly GrantView[];
  readonly naturalWeapons: readonly NaturalWeaponView[];
  readonly spiritFragments: { readonly current: number; readonly max: number };
  readonly ageCategory: number;
  readonly upkeep: UpkeepView;
  readonly checkInIncome: readonly IncomeSource[];
  /** Every other number effects produced, by stat id. */
  readonly other: readonly OtherStat[];
}

// ---- Race and Calling ----

export interface InnateView {
  readonly id: string;
  readonly kind: 'passive' | 'active';
  readonly summary: string;
  readonly uses: number | null;
  readonly frequency: string | null;
  /** The active innate is one use of this skill's Basic ability (Q-RACE-6). */
  readonly grantsSkillUse: string | null;
}

export interface RaceSection {
  readonly raceId: string;
  readonly name: string;
  /** small, medium, large (the choice for Beast-Kin and Fae). */
  readonly size: string | null;
  readonly lifespan: string;
  readonly language: { readonly id: string; readonly name: string };
  readonly literacy: Literacy;
  readonly literacyLanguage: { readonly id: string; readonly name: string };
  readonly choices: Choices;
  readonly innates: readonly InnateView[];
  readonly naturalWeapon: NaturalWeaponView | null;
  /** Effects with a condition (Dwarf armor while wearing armor, Halfling Dex Armor...). */
  readonly conditionalEffects: readonly StatSource[];
  readonly racialSkillIds: readonly string[];
  readonly sheetFlags: {
    readonly healingImmune: boolean;
    readonly lifeRestoredByRefit: boolean;
    readonly separateArmorAndLifeRefit: boolean;
  } | null;
}

export interface CallingSection {
  readonly callingId: string;
  readonly name: string;
  readonly status: 'active' | 'left';
  readonly innate: { readonly name: string; readonly summary: string };
  readonly detriment: string | null;
  readonly choices: Choices;
  readonly startedAt: string;
  readonly startedEventKey: string | null;
  readonly leftAt: string | null;
  readonly leftEventKey: string | null;
  readonly leftReason: string | null;
  readonly skillIds: readonly string[];
  /** Technique tier per Calling skill (0 Basic only to 3 Grandmaster) and the balance rule. */
  readonly balance: {
    readonly tiers: Readonly<Record<string, number>>;
    readonly gap: number;
    readonly maxGap: number;
    readonly ok: boolean;
  };
  /** Calling Techniques by the event they were learned at ([CALL-TECH]). */
  readonly techniqueEvents: readonly {
    readonly skillId: string;
    readonly technique: TechniqueId;
    readonly eventKey: string | null;
  }[];
}

export interface CallingEligibility {
  readonly fullEvents: number;
  readonly needed: number;
  readonly eligible: boolean;
}

// ---- Points ----

export interface CappedPoints {
  /** Sum of the ledger (start, events, awards, purchases, adjustments). */
  readonly earned: number;
  readonly cap: number;
  /** Room left under the earned cap. */
  readonly capRemaining: number;
  readonly spent: number;
  readonly available: number;
}

export interface PointsSection {
  readonly xp: CappedPoints;
  readonly cxp: CappedPoints;
  /** `spent`: Artifact awakening and slots. */
  readonly axp: { readonly earned: number; readonly spent: number; readonly available: number };
  readonly mt: { readonly earned: number; readonly spent: number; readonly balance: number };
}

// ---- Skills ----

export interface AbilityView {
  readonly named: NamedLevelId;
  /** Uses one activation spends. */
  readonly uses: number;
  readonly kind: 'active' | 'passive' | 'both';
  readonly summary: string;
  /** Basic at level 1; the others only with their Technique. */
  readonly unlocked: boolean;
}

/** One Basic or Technique purchase in the Log of Learning ([SKL-LOG]). */
export interface TeachingRecord {
  readonly step: NamedLevelId;
  readonly teacher: string | null;
  /** The mt.spent teaching purchase used instead of a teacher. */
  readonly viaMt: string | null;
  readonly eventKey: string | null;
  readonly atCreation: boolean;
  /** Bought after creation with no teacher or MT teaching recorded (Q-SKL-4). */
  readonly unverified: boolean;
  readonly actionId: string;
}

export interface SheetSkill {
  readonly skillId: string;
  /** The rulebook name ("<Element>'s Gift"). */
  readonly name: string;
  /** The name to show, with race choices filled in ("Fire's Gift"). Ability summaries are filled in too. */
  readonly displayName: string;
  readonly category: string;
  readonly raceId: string | null;
  readonly callingId: string | null;
  readonly advanced: boolean;
  readonly level: number;
  readonly maxLevel: number;
  readonly techniques: readonly TechniqueId[];
  /** Max uses per re-pop: one per level ([SKL-USES]). */
  readonly maxUses: number;
  readonly currency: 'xp' | 'cxp';
  /** Paid for the levels and Techniques owned. */
  readonly spent: number;
  readonly nextLevelCost: number | null;
  /** The next Technique, its price, and whether the level allows it yet. */
  readonly nextTechnique: {
    readonly technique: TechniqueId;
    readonly cost: number;
    readonly needsLevel: number;
    readonly levelReached: boolean;
  } | null;
  readonly abilities: readonly AbilityView[];
  readonly teaching: readonly TeachingRecord[];
  /** A skill of a Calling the character left: kept, not usable, not advanced ([CALL-CHANGE]). */
  readonly locked: boolean;
  /** The Distinctive: the racial skill this Calling skill works as. */
  readonly mirrors: { readonly skillId: string; readonly name: string } | null;
  /** Steps a refund may take back now (top level, top Technique). */
  readonly refundable: readonly SkillStep[];
  readonly requirement: string | null;
}

export interface LearningLogEntry {
  readonly actionId: string;
  readonly at: string;
  readonly eventKey: string | null;
  readonly skillId: string;
  readonly step: SkillStep;
  readonly currency: 'xp' | 'cxp';
  readonly cost: number;
  readonly teacher: string | null;
  readonly viaMt: string | null;
  readonly atCreation: boolean;
}

export interface RefundRecord {
  readonly actionId: string;
  readonly at: string;
  readonly skillId: string;
  readonly step: SkillStep;
  readonly reason: string;
  readonly refund: Cost;
}

// ---- Journals ----

export type JournalKind = 'spell' | 'recipe' | 'performance' | 'ritual';
export type JournalSource = 'teacher' | 'research' | 'scroll' | 'starting' | 'other';

export interface JournalEntry {
  /** The journal.added action id. */
  readonly entryId: string;
  readonly kind: JournalKind;
  readonly refId: string;
  readonly name: string;
  readonly level: NamedLevelId;
  /** Spell school, recipe craft, `performance`, or `ritual`. */
  readonly group: string;
  readonly status: 'pending' | 'tagged';
  readonly source: JournalSource;
  readonly teacher: string | null;
  readonly addedAt: string;
  readonly eventKey: string | null;
  /** Owns the matching skill and the Technique for the entry's level. */
  readonly usableNow: boolean;
  /** Why it is not usable now, else null. */
  readonly reason: string | null;
}

export interface JournalsSection {
  readonly spellbook: readonly JournalEntry[];
  readonly craftingJournal: readonly JournalEntry[];
  readonly performanceRecord: readonly JournalEntry[];
  readonly rituals: readonly JournalEntry[];
  /** Sorcerer known spells (Calling choice), with whether each can be cast now. */
  readonly knownSpells: readonly {
    readonly spellId: string;
    readonly name: string;
    readonly school: string;
    readonly level: NamedLevelId;
    readonly usableNow: boolean;
  }[];
  /** True when the active Calling forbids casting from a spellbook (Sorcerer). */
  readonly spellbookCastingBlocked: boolean;
}

// ---- Events, ledger, purchases ----

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
  readonly extras: readonly string[];
  readonly awards: readonly Award[];
  /** Above the XP or CXP earned cap: recorded, not credited. */
  readonly notCredited: readonly Award[];
  readonly upkeep: { readonly dueSilver: number; readonly coveredBy: string | null };
  /** What the desk handed over, as text. */
  readonly handedOut: readonly string[];
}

/** A check-in taken back by event.checkInVoided. It no longer counts as attended. */
export interface VoidedCheckIn {
  readonly checkInActionId: string;
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

export interface MtPurchaseRecord {
  readonly actionId: string;
  readonly at: string;
  readonly purchaseId: string;
  readonly name: string;
  readonly qty: number;
  readonly mtCost: number;
  /** Event the purchase counts against (forEventKey, else the action's event). */
  readonly capKey: string | null;
  readonly eventKey: string | null;
  readonly forEventKey: string | null;
  readonly namedLevel: NamedLevelId | null;
  /** Teaching purchases: the skill taught. */
  readonly skillId: string | null;
  readonly grants: readonly { readonly currency: LedgerCurrency; readonly amount: number }[];
  readonly items: readonly string[];
  /** Teaching purchases: the skill.learned that used it, else null. */
  readonly usedBy: string | null;
}

// ---- Other records ----

export interface StartingItemPick {
  readonly optionId: string;
  readonly detail: string | null;
  readonly name: string;
}

export interface SpiritSection {
  readonly current: number;
  readonly max: number;
  readonly history: readonly {
    readonly actionId: string;
    readonly at: string;
    readonly delta: number;
    readonly reason: string;
    readonly after: number;
  }[];
}

export interface ArtifactPowerEntry {
  /** The artifact.powerSet action id. */
  readonly entryId: string;
  readonly powerId: string;
  readonly tier: number;
  readonly summary: string;
  readonly choice: string | null;
  readonly setAt: string;
}

export interface ArtifactSection {
  readonly name: string;
  readonly description: string;
  readonly awakenedAt: string;
  readonly slotsUnlocked: number;
  readonly maxSlots: number;
  readonly slotsUsed: number;
  readonly slotsFree: number;
  /** AXP for the next slot, or null at the maximum. */
  readonly nextSlotCost: number | null;
  readonly powers: readonly ArtifactPowerEntry[];
  readonly removals: readonly {
    readonly actionId: string;
    readonly at: string;
    readonly entryIds: readonly string[];
    readonly reason: string;
  }[];
}

export interface LocationEntry {
  /** The location.familiarized action id. */
  readonly entryId: string;
  readonly name: string;
  readonly kind: 'portal' | 'tree';
  readonly date: string;
}

export interface LocationsSection extends LocationsCapacity {
  readonly entries: readonly LocationEntry[];
  /** Locations familiarized, the fixed tavern included when it counts. */
  readonly used: number;
}

export interface BoonEntry {
  readonly actionId: string;
  readonly slot: 'greater' | 'lesser';
  readonly name: string;
  readonly recipeId: string | null;
  readonly addedAt: string;
}

export interface BoonsSection {
  readonly entries: readonly BoonEntry[];
  readonly greaterSlots: number;
  readonly lesserSlots: number;
  readonly greaterUsed: number;
  readonly lesserUsed: number;
}

export interface FamiliarTrick {
  readonly id: string;
  readonly name: string;
  readonly kind: 'skill' | 'special';
  readonly slots: number;
  /** Skill tricks: the named level the slots give (basic, or expert with the Technique). */
  readonly level: NamedLevelId | null;
  /** Uses per re-pop (equal to the slots for skill tricks). */
  readonly uses: number | null;
  readonly detail: string | null;
}

export interface FamiliarSection {
  readonly actionId: string;
  readonly name: string;
  readonly form: string | null;
  readonly quality: string;
  readonly stable: boolean;
  readonly trickSlots: number;
  readonly slotsUsed: number;
  readonly tricks: readonly FamiliarTrick[];
  readonly setAt: string;
}

export interface OwedEntry {
  readonly id: string;
  readonly text: string;
  readonly eventKey: string | null;
  readonly delivered: boolean;
  readonly deliveredAt: string | null;
}

export interface RetiredSection {
  readonly reason: string;
  readonly at: string;
  readonly goodsValueCopper: number;
  readonly carry: RetirementCarry;
  /** Set once the carry-over went to a character; it is then locked to it ([RET-ASSIGN]). */
  readonly assignedTo: RetirementAssignment | null;
}

/** Where a retirement's carry-over went ([RET-ASSIGN]). */
export interface RetirementAssignment {
  readonly characterId: string;
  readonly characterName: string;
  /** A character built from the carry-over, or an existing one of the same player. */
  readonly kind: 'new' | 'existing';
  readonly at: string;
}

/** A staff decision on a player request, from request.approved or request.rejected. */
export interface RequestDecision {
  readonly requestId: string;
  readonly status: 'approved' | 'rejected';
  readonly skillId: string;
  readonly step: SkillStep;
  readonly submittedAt: string;
  readonly teacher: string | null;
  readonly playerNote: string | null;
  readonly reason: string | null;
  readonly decidedAt: string;
  readonly actionId: string;
}

export interface RaceChangeRecord {
  readonly actionId: string;
  readonly at: string;
  readonly fromRaceId: string;
  readonly toRaceId: string;
  readonly reason: string;
  readonly refunds: readonly { readonly skillId: string; readonly amount: number }[];
}

export interface Sheet {
  readonly rulesetId: string;
  /** False until a valid character.created action has been replayed. */
  readonly created: boolean;
  readonly profile: Profile;
  readonly race: RaceSection | null;
  /** The active Calling, else null. */
  readonly calling: CallingSection | null;
  /** Callings the character left; their skills stay on the sheet, locked. */
  readonly formerCallings: readonly CallingSection[];
  readonly callingEligibility: CallingEligibility;
  readonly points: PointsSection;
  readonly skills: readonly SheetSkill[];
  /** Every skill.learned, in log order (the Log of Learning). */
  readonly learningLog: readonly LearningLogEntry[];
  readonly refunds: readonly RefundRecord[];
  readonly stats: StatsSection;
  readonly journals: JournalsSection;
  readonly events: readonly SheetEvent[];
  /** Events attended that count as full events (every check-in that was not voided). */
  readonly fullEvents: number;
  readonly voidedCheckIns: readonly VoidedCheckIn[];
  readonly ledger: readonly LedgerRow[];
  readonly mtPurchases: readonly MtPurchaseRecord[];
  readonly startingItems: readonly StartingItemPick[];
  readonly spirit: SpiritSection;
  readonly artifact: ArtifactSection | null;
  readonly locations: LocationsSection;
  readonly boons: BoonsSection;
  readonly familiar: FamiliarSection | null;
  readonly owed: readonly OwedEntry[];
  readonly retired: RetiredSection | null;
  readonly requestDecisions: readonly RequestDecision[];
  readonly raceChanges: readonly RaceChangeRecord[];
  readonly warnings: readonly SheetWarning[];
  /** Highest seq seen in the log (0 for an empty log). New actions start at lastSeq + 1. */
  readonly lastSeq: number;
}

/** One row for character lists. */
export interface SheetSummary {
  readonly characterName: string;
  readonly playerName: string;
  readonly raceName: string;
  readonly callingName: string;
  readonly xpAvailable: number;
  readonly events: number;
  readonly retired: boolean;
}

export function summarize(sheet: Sheet): SheetSummary {
  return {
    characterName: sheet.profile.characterName,
    playerName: sheet.profile.playerName,
    raceName: sheet.race?.name ?? '',
    callingName: sheet.calling?.name ?? '',
    xpAvailable: sheet.points.xp.available,
    events: sheet.events.length,
    retired: sheet.retired !== null,
  };
}

/** Level of a skill on a sheet (0 when not owned). */
export function skillLevel(sheet: Sheet, skillId: string): number {
  return sheet.skills.find((s) => s.skillId === skillId)?.level ?? 0;
}

/** Techniques of a skill on a sheet (empty when not owned). */
export function skillTechniques(sheet: Sheet, skillId: string): readonly TechniqueId[] {
  return sheet.skills.find((s) => s.skillId === skillId)?.techniques ?? [];
}
