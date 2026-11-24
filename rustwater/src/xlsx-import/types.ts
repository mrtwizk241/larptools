// The domain-level character: what the character sheet records, with rules-data ids instead of
// sheet labels. Same shape as the parity fixtures (tests/fixtures/parity/README.md "Character
// format"), so one translator serves both the parity tests and the .xlsx import.
import type { SkillPart } from '../engine/model.ts';

export interface LedgerEntry {
  readonly date: string;
  /** Ledger kind id (start, infection-bonus, event, npc, staff, shiny-purchase, familiar, ...). */
  readonly kind: string;
  readonly reason: string;
  /** Event id such as E3; rows of the same event share it. */
  readonly event?: string;
  readonly cxp?: number;
  readonly pxp?: number;
  readonly fp?: number;
  readonly shinies?: number;
}

export interface SkillEntry {
  readonly skill: string;
  readonly part: SkillPart;
  readonly level: number;
  /** Pool of a multi-archetype skill. */
  readonly archetype?: string;
}

/** Performances and rituals by id, or a free-text knowledge. */
export interface OtherKnowledge {
  readonly performance?: string;
  readonly ritual?: string;
  readonly name?: string;
  readonly type?: string;
  readonly rank?: string;
}

export interface FamiliarEntry {
  readonly name: string;
  readonly level: number;
  readonly awakenedSkill?: string;
  /** Familiar skill ids in slot order. */
  readonly slots: readonly string[];
  readonly extraSlots: number;
}

/** A boon by id, or typed as free text on the sheet. */
export interface BoonEntry {
  readonly boon?: string;
  readonly name?: string;
}

/** A starting item option by id (with its detail), or free text the import could not match. */
export interface StartingItemEntry {
  readonly item?: string;
  readonly detail?: string;
  readonly text?: string;
}

export interface SheetCharacter {
  readonly name: string;
  readonly player: string;
  /** PlayerCharacter Info B2. Not in the parity fixtures. */
  readonly email?: string;
  readonly covers?: readonly string[];
  readonly ancestry: {
    readonly id: string;
    readonly subtype: string;
    readonly abilityLevels: Readonly<Record<string, number>>;
    readonly extraInfection: number;
    readonly infectionGained?: number;
    readonly age?: number;
  };
  readonly ledger: readonly LedgerEntry[];
  readonly skills?: readonly SkillEntry[];
  readonly spells?: readonly { readonly spell: string; readonly slot: string }[];
  readonly recipes?: readonly { readonly recipe: string; readonly slot: string }[];
  readonly otherKnowledges?: readonly OtherKnowledge[];
  readonly profession?: { readonly id: string; readonly levels: Readonly<Record<string, number>> };
  readonly familiar?: FamiliarEntry;
  readonly boons?: readonly BoonEntry[];
  readonly startingItems?: readonly StartingItemEntry[];
  readonly effectsNotes?: readonly string[];
  /** Kept in the parity fixtures for the sheet harness; the translator ignores it. */
  readonly checkInReceipt?: unknown;
}
