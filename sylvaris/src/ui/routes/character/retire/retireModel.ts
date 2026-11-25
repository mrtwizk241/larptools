// Pure helpers for the retirement screen ([RET-CHOICE], [RET-TRANSFER], [RET-ASSIGN]): what the
// carry-over is and how it is worked out, the warning when the new starting XP is low (Q-RET-2),
// the same player's other characters, and the commands that give the carry-over to one of them.
import {
  deriveSheet,
  retirementStartingXp,
  type Command,
  type Ruleset,
  type Sheet,
} from '../../../../engine/index.ts';
import type { StoredCharacter } from '../../../../engine/model.ts';
import { UNNAMED_CHARACTER } from '../../../data/summary.ts';
import { amountText } from '../../../lib/names.ts';

export interface Carry {
  readonly xp: number;
  readonly cxp: number;
  readonly axp: number;
  readonly coinCopper: number;
}

export interface CarryRow {
  /** "XP", "Coin". */
  label: string;
  /** "300 XP", "100 Copper". */
  value: string;
  /** How it is worked out, with the character's numbers. */
  how: string;
}

function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** The carry-over with the working, from the ruleset's retirement fractions (rounded down). */
export function carryRows(
  ruleset: Ruleset,
  sheet: Sheet,
  carry: Carry,
  goodsValueCopper: number,
): CarryRow[] {
  const r = ruleset.ruleset.retirement;
  const { xp, cxp, axp } = sheet.points;
  const minus = (n: number | undefined) => (n ? ` minus ${n}` : '');
  return [
    {
      label: 'XP',
      value: amountText(ruleset, 'xp', carry.xp),
      how: `${percent(r.xp.fraction)} of ${xp.earned} XP earned${minus(r.xp.deduct)}, rounded down`,
    },
    {
      label: 'CXP',
      value: amountText(ruleset, 'cxp', carry.cxp),
      how: `${percent(r.cxp.fraction)} of ${cxp.earned} CXP earned, rounded down`,
    },
    {
      label: 'AXP',
      value: amountText(ruleset, 'axp', carry.axp),
      how: `${percent(r.axp.fraction)} of ${axp.earned} AXP earned, rounded down`,
    },
    {
      label: 'Coin',
      value: `${carry.coinCopper} Copper`,
      how: `${percent(r.goods.fraction)} of ${goodsValueCopper} Copper in goods, minus ${r.goods.deductCopper} Copper for the new starting items`,
    },
  ];
}

/** Starting XP of a character built from this carry-over (Q-RET-2: the share alone). */
export function newStartingXp(ruleset: Ruleset, carry: Carry): number {
  return retirementStartingXp(ruleset, carry.xp);
}

/** The Q-RET-2 warning when a new character would start below the usual starting XP. */
export function lowStartWarning(ruleset: Ruleset, carry: Carry): string | null {
  const start = newStartingXp(ruleset, carry);
  const floor = ruleset.ruleset.retirement.warnBelowXp;
  return start < floor
    ? `A new character built from this carry-over starts with ${start} XP, below the ${floor} XP a new character usually gets. This follows the rulebook formula (owner question Q-RET-2).`
    : null;
}

function same(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = a?.trim().toLowerCase() ?? '';
  return x !== '' && x === (b?.trim().toLowerCase() ?? '');
}

export interface Candidate {
  id: string;
  name: string;
  sheet: Sheet;
}

/**
 * The same player's other characters that can take the carry-over ([RET-ASSIGN]): not retired,
 * and with the same player name or email as the retired character.
 */
export function samePlayerCharacters(
  ruleset: Ruleset,
  retired: { id: string; sheet: Sheet },
  characters: readonly StoredCharacter[],
): Candidate[] {
  const p = retired.sheet.profile;
  return characters
    .filter((c) => c.id !== retired.id && c.rulesetId === ruleset.id)
    .map((c) => ({ c, sheet: deriveSheet(ruleset, c.actions) }))
    .filter(
      ({ sheet }) =>
        sheet.retired === null &&
        (same(sheet.profile.playerName, p.playerName) ||
          same(sheet.profile.playerEmail, p.playerEmail)),
    )
    .map(({ c, sheet }) => ({
      id: c.id,
      name: sheet.profile.characterName.trim() || UNNAMED_CHARACTER,
      sheet,
    }));
}

/** The items-owed line for the coin, handed over by Logistics. */
export function coinOwedText(fromName: string, coinCopper: number): string {
  return `${coinCopper} Copper, retirement carry-over from ${fromName}`;
}

/**
 * Commands on an existing character: the XP, CXP, and AXP as awards of kind `retirement` (the
 * earned caps apply, Q-RET-4), and the coin as an item owed.
 */
export function existingCharacterCommands(carry: Carry, fromName: string): Command[] {
  const note = `Retirement carry-over from ${fromName}`;
  const commands: Command[] = [];
  for (const currency of ['xp', 'cxp', 'axp'] as const)
    if (carry[currency] > 0)
      commands.push({
        type: 'awardPoints',
        currency,
        amount: carry[currency],
        kind: 'retirement',
        note,
      });
  if (carry.coinCopper > 0)
    commands.push({ type: 'addOwed', text: coinOwedText(fromName, carry.coinCopper), note });
  return commands;
}
