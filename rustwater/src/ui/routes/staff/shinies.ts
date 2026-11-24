// Shiny manager data: every player with the Shinies across their characters, and the standard
// reasons staff add Shinies for (Rulebook p.13). Pure, so it is unit tested.
import type { CharacterEntry, UserInfo } from '../../../api/contract.ts';
import { deriveSheet, summarize, type Ruleset } from '../../../engine/index.ts';
import { rulesetFor } from '../../data/rulesetContext.ts';

export interface ShinyCharacter {
  readonly id: string;
  readonly name: string;
  readonly balance: number;
  readonly retired: boolean;
}

export interface ShinyPlayer {
  /** Account id, or `none` for characters without a player. */
  readonly key: string;
  readonly name: string;
  readonly total: number;
  readonly characters: readonly ShinyCharacter[];
}

/** Active characters per player account, players by name; characters without a player last. */
export function shinyPlayers(
  entries: readonly CharacterEntry[],
  users: readonly UserInfo[],
): ShinyPlayer[] {
  const byOwner = new Map<string, ShinyCharacter[]>();
  for (const entry of entries) {
    if (entry.meta.status !== 'active') continue;
    const ruleset = rulesetFor(entry.character.rulesetId);
    if (!ruleset) continue;
    const sheet = deriveSheet(ruleset, entry.character.actions);
    const list = byOwner.get(entry.meta.ownerId ?? 'none') ?? [];
    list.push({
      id: entry.meta.id,
      name: summarize(sheet).characterName || 'Unnamed character',
      balance: sheet.points.shinies.balance,
      retired: sheet.retired !== null,
    });
    byOwner.set(entry.meta.ownerId ?? 'none', list);
  }
  const players: ShinyPlayer[] = users
    .filter((u) => u.role === 'player' || byOwner.has(u.id))
    .map((u) => {
      const characters = (byOwner.get(u.id) ?? []).sort((a, b) => a.name.localeCompare(b.name));
      return {
        key: u.id,
        name: u.name,
        total: characters.reduce((sum, c) => sum + c.balance, 0),
        characters,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const none = byOwner.get('none');
  if (none && none.length > 0)
    players.push({
      key: 'none',
      name: 'No player',
      total: none.reduce((sum, c) => sum + c.balance, 0),
      characters: none.sort((a, b) => a.name.localeCompare(b.name)),
    });
  return players;
}

export interface ShinyReason {
  readonly id: string;
  readonly label: string;
  /** Ledger kind the award is recorded under. */
  readonly kind: string;
  /** "50 per hour, needs GM approval". */
  readonly hint: string | null;
  /** Free text: what the Shinies are for (required). */
  readonly needsDetail: boolean;
}

const PER: Record<string, string> = {
  'plot-run': 'plot run',
  dollar: 'dollar',
  packet: 'packet',
  hour: 'hour',
  grade: 'grade',
};

/** The rulebook's other Shiny sources, then a misc donation and a staff-approved amount. */
export function shinyReasons(ruleset: Ruleset): ShinyReason[] {
  const standard = ruleset.awards.otherShinySources.map((s) => {
    const cap = s.cap ? `, up to ${s.cap.amount}` : '';
    const approval = s.requiresGmApproval ? ', needs GM approval' : '';
    const receipt = s.requiresReceipt ? ', with a receipt' : '';
    return {
      id: s.id,
      label: s.name,
      kind: s.kind,
      hint: `${s.shiniesPerUnit} per ${PER[s.per] ?? s.per}${cap}${approval}${receipt}`,
      needsDetail: false,
    };
  });
  return [
    ...standard,
    {
      id: 'misc-donation',
      label: 'Misc donation',
      kind: 'donation',
      hint: 'Say what was donated.',
      needsDetail: true,
    },
    {
      id: 'staff-approved',
      label: 'Staff-approved amount',
      kind: 'other-award',
      hint: 'Say what it is for.',
      needsDetail: true,
    },
  ];
}
