// Plain-English text for a player's request: a skill level, something to memorize, or a boon.
import { maxLevelOf, type Ruleset } from '../../../engine/index.ts';
import type { RequestMemoryKind, RequestStatus, SkillPart } from '../../../engine/model.ts';
import type { BadgeKind } from '../../components/index.ts';
import { partLabel } from '../character/skills/skillInfo.ts';

/** The fields that say what a request is for (a request or a decision in the log). */
export type RequestSubject =
  | { kind: 'learn-skill'; skillId: string; part: SkillPart; toLevel: number }
  | { kind: 'memorize'; memoryKind: RequestMemoryKind; refId: string }
  | { kind: 'boon'; boonId: string };

export const MEMORY_WORD: Record<RequestMemoryKind, string> = {
  spell: 'spell',
  recipe: 'recipe',
  performance: 'performance',
  ritual: 'ritual',
};

/** Name of a spell, recipe, performance, or ritual. */
export function memoryItemName(ruleset: Ruleset, kind: RequestMemoryKind, refId: string): string {
  switch (kind) {
    case 'spell':
      return ruleset.spellsById[refId]?.name ?? refId;
    case 'recipe':
      return ruleset.recipesById[refId]?.name ?? refId;
    case 'performance':
      return ruleset.performancesById[refId]?.name ?? refId;
    case 'ritual':
      return ruleset.ritualsById[refId]?.name ?? refId;
  }
}

/** "Assault level 2", "Assault Mastery", "Fire Bolt (spell)", "Bionic Arms (boon)". */
export function requestTitle(ruleset: Ruleset, request: RequestSubject): string {
  if (request.kind === 'memorize')
    return `${memoryItemName(ruleset, request.memoryKind, request.refId)} (${MEMORY_WORD[request.memoryKind]})`;
  if (request.kind === 'boon')
    return `${ruleset.boonsById[request.boonId]?.name ?? request.boonId} (boon)`;
  const skill = ruleset.skillsById[request.skillId];
  if (!skill) return `${request.skillId} level ${request.toLevel}`;
  const def = skill.parts[request.part];
  const name = partLabel(ruleset, skill, request.part);
  const single = def !== undefined && maxLevelOf(ruleset, def.costKind) === 1;
  return single ? name : `${name} level ${request.toLevel}`;
}

/** What a request kind is called in lists: learnings (skills, spells, recipes) or boons. */
export function isLearning(request: { kind: RequestSubject['kind'] }): boolean {
  return request.kind !== 'boon';
}

/** Badge for a status: draft and sent both read PENDING. */
export function statusBadge(status: RequestStatus): BadgeKind {
  return status === 'approved' || status === 'rejected' ? status : 'pending';
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
