// Plain-English text for a learn-skill request.
import type { Ruleset } from '../../../engine/index.ts';
import type { Request, RequestStatus } from '../../../engine/model.ts';
import type { BadgeKind } from '../../components/index.ts';
import { skillStepName } from '../../lib/names.ts';

/** "Toughness level 3", "Toughness Expert Technique". */
export function requestTitle(ruleset: Ruleset, request: Pick<Request, 'skillId' | 'step'>): string {
  return skillStepName(ruleset, request.skillId, request.step);
}

/** Badge for a status: draft and sent both read PENDING. */
export function statusBadge(status: RequestStatus): BadgeKind {
  return status === 'approved' || status === 'rejected' ? status : 'pending';
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
