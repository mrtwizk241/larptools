// Turns any stored action into a short label, a plain-English summary, and a filter group, using
// the ruleset for names. Pure: no React. Payloads it cannot read get a safe generic summary.
import {
  ACTION_REGISTRY,
  type AncestryLeveledPayload,
  type BoonAddedPayload,
  type BoonRemovedPayload,
  type CharacterCreatedPayload,
  type CharacterRetiredPayload,
  type EventCheckedInPayload,
  type EventCheckInVoidedPayload,
  type FamiliarAwakenedPayload,
  type FamiliarBondBrokenPayload,
  type FamiliarRenamedPayload,
  type FamiliarBondedPayload,
  type FamiliarLeveledPayload,
  type FamiliarSkillForgottenPayload,
  type FamiliarSkillLearnedPayload,
  type FamiliarSlotUnlockedPayload,
  type InfectionChangedPayload,
  type ItemsStartingSetPayload,
  type MemorizedAddedPayload,
  type MemorizedRemovedPayload,
  type OwedAddedPayload,
  type OwedDeliveredPayload,
  type PointsAdjustedPayload,
  type PointsAwardedPayload,
  type ProfessionLeveledPayload,
  type ProfessionStartedPayload,
  type ProfileUpdatedPayload,
  type RequestApprovedPayload,
  type RequestRejectedPayload,
  type Ruleset,
  type ShiniesSpentPayload,
  type SkillLearnedPayload,
  type SkillRefundedPayload,
  type StoryNoteAddedPayload,
  type StoryNoteEditedPayload,
  type StoryNoteRemovedPayload,
  type TraumaAddedPayload,
  type TraumaEditedPayload,
  type TraumaRemovedPayload,
} from '../../engine/index.ts';
import type { Action, ActionType } from '../../engine/model.ts';
import { requestTitle } from '../routes/requests/requestText.ts';
import { amountText, ledgerKindName, signedTotals, skillPartName } from './names.ts';

export const ACTION_GROUPS = [
  'points',
  'check-ins',
  'skills',
  'ancestry',
  'profile',
  'corrections',
  'memory',
  'profession',
  'familiar',
  'items',
  'requests',
  'other',
] as const;
export type ActionGroup = (typeof ACTION_GROUPS)[number];

export const GROUP_LABELS: Record<ActionGroup, string> = {
  points: 'Points',
  'check-ins': 'Check-ins',
  skills: 'Skills',
  ancestry: 'Ancestry',
  profile: 'Profile',
  corrections: 'Corrections',
  memory: 'Memory',
  profession: 'Profession',
  familiar: 'Familiar',
  items: 'Items',
  requests: 'Requests',
  other: 'Other',
};

export interface ActionDescription {
  /** Short type badge text, for example "Check-in". */
  label: string;
  /** One plain-English sentence, for example "Checked in to Spring Thaw (Player): +75 CXP". */
  summary: string;
  group: ActionGroup;
}

/** Other actions of the same character, for resolving references (boon removed, owed delivered). */
export type ActionLookup = ReadonlyMap<string, Action>;

const TYPES: Record<ActionType, { label: string; group: ActionGroup }> = {
  'character.created': { label: 'Created', group: 'profile' },
  'profile.updated': { label: 'Profile', group: 'profile' },
  'points.awarded': { label: 'Award', group: 'points' },
  'points.adjusted': { label: 'Adjustment', group: 'corrections' },
  'event.checkedIn': { label: 'Check-in', group: 'check-ins' },
  'event.checkInVoided': { label: 'Void', group: 'corrections' },
  'shinies.spent': { label: 'Shinies', group: 'points' },
  'ancestry.leveled': { label: 'Ancestry', group: 'ancestry' },
  'infection.changed': { label: 'Infection', group: 'ancestry' },
  'skill.learned': { label: 'Skill', group: 'skills' },
  'skill.refunded': { label: 'Refund', group: 'corrections' },
  'memorized.added': { label: 'Memorized', group: 'memory' },
  'memorized.removed': { label: 'Forgotten', group: 'memory' },
  'profession.started': { label: 'Profession', group: 'profession' },
  'profession.leveled': { label: 'Profession', group: 'profession' },
  'familiar.bonded': { label: 'Familiar', group: 'familiar' },
  'familiar.awakened': { label: 'Familiar', group: 'familiar' },
  'familiar.leveled': { label: 'Familiar', group: 'familiar' },
  'familiar.skillLearned': { label: 'Familiar', group: 'familiar' },
  'familiar.skillForgotten': { label: 'Familiar', group: 'familiar' },
  'familiar.slotUnlocked': { label: 'Familiar', group: 'familiar' },
  'familiar.bondBroken': { label: 'Familiar', group: 'familiar' },
  'familiar.renamed': { label: 'Familiar', group: 'familiar' },
  'boon.added': { label: 'Boon', group: 'items' },
  'boon.removed': { label: 'Boon', group: 'items' },
  'items.startingSet': { label: 'Items', group: 'items' },
  'owed.added': { label: 'Owed', group: 'items' },
  'owed.delivered': { label: 'Delivered', group: 'items' },
  'request.approved': { label: 'Request', group: 'requests' },
  'request.rejected': { label: 'Request', group: 'requests' },
  'character.retired': { label: 'Retired', group: 'other' },
  'trauma.added': { label: 'Trauma', group: 'ancestry' },
  'trauma.edited': { label: 'Trauma', group: 'ancestry' },
  'trauma.removed': { label: 'Trauma', group: 'ancestry' },
  'storyNote.added': { label: 'Story note', group: 'profile' },
  'storyNote.edited': { label: 'Story note', group: 'profile' },
  'storyNote.removed': { label: 'Story note', group: 'profile' },
};

/** Readable text for a kebab-case id the ruleset does not name: "from-legends" -> "From legends". */
function humanize(id: string): string {
  const text = id.replace(/[-_.]+/g, ' ').trim();
  return text === '' ? id : text.charAt(0).toUpperCase() + text.slice(1);
}

function withReason(text: string, reason: string | undefined): string {
  const trimmed = reason?.trim().replace(/\.+$/, '');
  return trimmed ? `${text}. Reason: ${trimmed}` : text;
}

function list(items: readonly string[]): string {
  return items.join(', ');
}

/** What a request decision was for: "Assault level 2", "Fire Bolt (spell)", "Bionic Arms (boon)". */
function decisionText(rs: Ruleset, p: RequestApprovedPayload): string {
  if (p.kind === 'memorize' && p.memoryKind && p.refId)
    return requestTitle(rs, { kind: 'memorize', memoryKind: p.memoryKind, refId: p.refId });
  if (p.kind === 'boon' && p.boonId) return requestTitle(rs, { kind: 'boon', boonId: p.boonId });
  if (p.skillId && p.part) return `${skillPartName(rs, p.skillId, p.part)} level ${p.toLevel ?? 1}`;
  return 'a request';
}

type Describer = (ruleset: Ruleset, payload: never, action: Action, lookup: ActionLookup) => string;

function memoryName(ruleset: Ruleset, kind: string, refId: string | undefined): string {
  if (refId === undefined) return humanize(kind);
  const table =
    kind === 'spell'
      ? ruleset.spellsById
      : kind === 'recipe'
        ? ruleset.recipesById
        : kind === 'performance'
          ? ruleset.performancesById
          : kind === 'ritual'
            ? ruleset.ritualsById
            : undefined;
  return table?.[refId]?.name ?? humanize(refId);
}

function familiarSkillName(ruleset: Ruleset, id: string): string {
  return ruleset.familiarSkillsById[id]?.name ?? humanize(id);
}

function cost(ruleset: Ruleset, c: { currency: string; amount: number }, archetype?: string) {
  if (c.amount === 0) return 'free';
  const pool = archetype && c.currency === 'ap' ? ruleset.archetypesById[archetype]?.name : '';
  return pool ? `${c.amount} ${pool} AP` : amountText(ruleset, c.currency, c.amount);
}

function owedText(lookup: ActionLookup, owedId: string): string | null {
  const [actionId, index] = owedId.split('#');
  const source = actionId ? lookup.get(actionId) : undefined;
  if (!source) return null;
  if (index === undefined) {
    const p = readPayload(source) as OwedAddedPayload | null;
    return source.type === 'owed.added' && p ? p.text : null;
  }
  if (source.type !== 'event.checkedIn') return null;
  const p = readPayload(source) as EventCheckedInPayload | null;
  return p?.owed[Number(index)] ?? null;
}

const DESCRIBE: Record<ActionType, Describer> = {
  'character.created': (rs, p: CharacterCreatedPayload) => {
    const entry = rs.subtypesById[p.subtypeId];
    const ancestry = entry
      ? `${entry.ancestry.name}, ${entry.subtype.name}`
      : (rs.ancestriesById[p.ancestryId]?.name ?? humanize(p.ancestryId));
    const carry = p.retirement ? `, carrying points from ${p.retirement.fromName}` : '';
    return `Created ${p.characterName} (${ancestry}), player ${p.playerName}${carry}`;
  },
  'profile.updated': (_rs, p: ProfileUpdatedPayload) => {
    if (p.characterName !== undefined) {
      const others = Object.entries(p).filter(
        ([k, v]) => k !== 'characterName' && v !== undefined,
      ).length;
      return `Renamed the character to ${p.characterName}${others ? ' and updated the profile' : ''}`;
    }
    const fields: string[] = [];
    if (p.playerName !== undefined) fields.push('player name');
    if (p.playerEmail !== undefined) fields.push('player email');
    if (p.age !== undefined || p.ageStep !== undefined) fields.push('age');
    if (p.effects !== undefined) fields.push('effects');
    if (p.notes !== undefined) fields.push('notes');
    return `Updated ${list(fields)}`;
  },
  'points.awarded': (rs, p: PointsAwardedPayload) => {
    const capped =
      p.requested !== undefined && p.requested > p.amount ? ` (${p.requested} asked, capped)` : '';
    return `Awarded ${amountText(rs, p.currency, p.amount)} for ${ledgerKindName(rs, p.kind)}${capped}`;
  },
  'points.adjusted': (rs, p: PointsAdjustedPayload) => {
    const what = p.kind === 'penalty' ? 'Penalty' : 'Correction';
    return withReason(
      `${what}: ${p.amount > 0 ? '+' : ''}${amountText(rs, p.currency, p.amount)}`,
      p.reason,
    );
  },
  'event.checkedIn': (rs, p: EventCheckedInPayload) => {
    const attendance = rs.attendanceById[p.attendance]?.name ?? humanize(p.attendance);
    const totals = signedTotals(rs, p.awards);
    const owed = p.owed.length ? `. Items owed: ${list(p.owed)}` : '';
    return `Checked in to ${p.event.name} (${attendance})${totals ? `: ${totals}` : ''}${owed}`;
  },
  'event.checkInVoided': (_rs, p: EventCheckInVoidedPayload, _action, lookup) => {
    const source = lookup.get(p.checkInActionId);
    const checkIn =
      source?.type === 'event.checkedIn'
        ? (readPayload(source) as EventCheckedInPayload | null)
        : null;
    const what = checkIn ? `Voided check-in to ${checkIn.event.name}` : 'Voided a check-in';
    return `${what}: ${p.reason.trim().replace(/\.+$/, '')}`;
  },
  'shinies.spent': (rs, p: ShiniesSpentPayload) => {
    const got = [
      ...p.grants.map((g) =>
        g.kind === 'event' && g.currency === 'cxp'
          ? `${g.amount} Event CXP`
          : amountText(rs, g.currency, g.amount),
      ),
      ...p.items,
    ];
    const purchase = rs.shinyPurchasesById[p.purchaseId]?.name ?? humanize(p.purchaseId);
    const what = got.length ? list(got) : `${p.qty} x ${purchase}`;
    const missed = p.forEvent ? ` for the missed event ${p.forEvent.name}` : '';
    return `Spent ${amountText(rs, 'shinies', p.shiniesCost)}: ${what}${missed}`;
  },
  'ancestry.leveled': (rs, p: AncestryLeveledPayload) => {
    const name = rs.ancestryAbilitiesById[p.abilityId]?.ability.name ?? humanize(p.abilityId);
    const when = p.atCreation ? ' at creation' : '';
    return `Raised ${name} to level ${p.toLevel}${when} (${rs.ruleset.lxp.costPerLevel} LXP)`;
  },
  'infection.changed': (_rs, p: InfectionChangedPayload) => {
    const track = p.track === 'connection' ? 'Connection' : 'Infection';
    const from = p.fromLevel !== undefined ? ` (was ${p.fromLevel})` : '';
    return withReason(`${track} set to ${p.toLevel}${from}`, p.reason);
  },
  'skill.learned': (rs, p: SkillLearnedPayload) => {
    const name = skillPartName(rs, p.skillId, p.part);
    const from = p.teacher ? ` from ${p.teacher}` : '';
    const when = p.atCreation ? ' at creation' : '';
    return `Learned ${name} level ${p.toLevel}${from}${when} (${cost(rs, p.cost, p.archetype)})`;
  },
  'skill.refunded': (rs, p: SkillRefundedPayload) => {
    const name = skillPartName(rs, p.skillId, p.part);
    const to = p.toLevel === 0 ? `Removed ${name}` : `Lowered ${name} to level ${p.toLevel}`;
    const back = p.refund && p.refund.amount > 0 ? ` (${cost(rs, p.refund)} back)` : '';
    return withReason(`${to}${back}`, p.reason);
  },
  'memorized.added': (rs, p: MemorizedAddedPayload) =>
    p.kind === 'knowledge'
      ? `Added knowledge: ${p.text ?? ''}`
      : `Memorized ${memoryName(rs, p.kind, p.refId)} (${p.kind})`,
  'memorized.removed': (rs, p: MemorizedRemovedPayload) => {
    const name =
      p.kind === 'knowledge' ? (p.text ?? 'a knowledge') : memoryName(rs, p.kind, p.refId);
    return withReason(`Forgot ${name}${p.kind === 'knowledge' ? '' : ` (${p.kind})`}`, p.reason);
  },
  'profession.started': (rs, p: ProfessionStartedPayload) =>
    `Started the ${rs.professionsById[p.professionId]?.name ?? humanize(p.professionId)} profession`,
  'profession.leveled': (rs, p: ProfessionLeveledPayload) => {
    const name = rs.professionAbilitiesById[p.abilityId]?.ability.name ?? humanize(p.abilityId);
    return `Raised ${name} to level ${p.toLevel} (${cost(rs, p.cost)})`;
  },
  'familiar.bonded': (_rs, p: FamiliarBondedPayload) =>
    `Bonded the familiar ${p.name}${p.creature ? ` (${p.creature})` : ''}`,
  'familiar.awakened': (rs, p: FamiliarAwakenedPayload) => {
    const name = rs.awakenedSkillsById[p.awakenedSkillId]?.name ?? humanize(p.awakenedSkillId);
    return `Awakened the familiar with ${name} (${cost(rs, { currency: 'fp', amount: p.fpCost })})`;
  },
  'familiar.leveled': (rs, p: FamiliarLeveledPayload) =>
    `Raised the familiar to level ${p.toLevel} (${cost(rs, { currency: 'fp', amount: p.fpCost })})`,
  'familiar.skillLearned': (rs, p: FamiliarSkillLearnedPayload) => {
    const choice = p.choice ? `: ${p.choice}` : '';
    return `Familiar learned ${familiarSkillName(rs, p.skillId)}${choice} (${cost(rs, { currency: 'essence', amount: p.essenceCost })})`;
  },
  'familiar.skillForgotten': (rs, p: FamiliarSkillForgottenPayload) =>
    `Familiar forgot ${familiarSkillName(rs, p.skillId)} (${cost(rs, { currency: 'fp', amount: p.fpCost })})`,
  'familiar.slotUnlocked': (rs, p: FamiliarSlotUnlockedPayload) =>
    `Unlocked a familiar skill slot (${cost(rs, { currency: 'essence', amount: p.essenceCost })})`,
  'familiar.bondBroken': (rs, p: FamiliarBondBrokenPayload) =>
    withReason(
      `Broke the familiar bond (${cost(rs, { currency: 'fp', amount: p.fpCost })})`,
      p.reason,
    ),
  'familiar.renamed': (_rs, p: FamiliarRenamedPayload) => `Named the familiar ${p.name}`,
  'boon.added': (_rs, p: BoonAddedPayload) =>
    `Added the boon ${p.name}${p.expires ? ` (expires ${p.expires})` : ''}`,
  'boon.removed': (_rs, p: BoonRemovedPayload, _action, lookup) => {
    const added = lookup.get(p.boonActionId);
    const payload =
      added?.type === 'boon.added' ? (readPayload(added) as BoonAddedPayload | null) : null;
    return withReason(`Removed the boon${payload ? ` ${payload.name}` : ''}`, p.reason);
  },
  'items.startingSet': (rs, p: ItemsStartingSetPayload) => {
    if (p.picks.length === 0) return 'Cleared the starting items';
    const names = p.picks.map((pick) => {
      const name = rs.startingItemsById[pick.optionId]?.name ?? humanize(pick.optionId);
      return pick.detail ? `${name} (${pick.detail})` : name;
    });
    return `Set the starting items: ${list(names)}`;
  },
  'owed.added': (_rs, p: OwedAddedPayload) => `Owed: ${p.text}`,
  'trauma.added': (_rs, p: TraumaAddedPayload) => `Added trauma: ${p.text}`,
  'trauma.edited': (_rs, p: TraumaEditedPayload) => `Changed trauma to: ${p.text}`,
  'trauma.removed': (_rs, p: TraumaRemovedPayload) =>
    withReason(p.text ? `Removed trauma: ${p.text}` : 'Removed a trauma', p.reason),
  'storyNote.added': (_rs, p: StoryNoteAddedPayload) => `Added story note: ${p.text}`,
  'storyNote.edited': (_rs, p: StoryNoteEditedPayload) => `Changed story note to: ${p.text}`,
  'storyNote.removed': (_rs, p: StoryNoteRemovedPayload) =>
    withReason(p.text ? `Removed story note: ${p.text}` : 'Removed a story note', p.reason),
  'owed.delivered': (_rs, p: OwedDeliveredPayload, _action, lookup) => {
    const text = owedText(lookup, p.owedId);
    return text ? `Handed over: ${text}` : 'Handed over an owed reward';
  },
  'request.approved': (rs, p: RequestApprovedPayload) =>
    `Approved the request for ${decisionText(rs, p)}${p.teacher ? ` from ${p.teacher}` : ''}`,
  'request.rejected': (rs, p: RequestRejectedPayload) =>
    withReason(`Rejected the request for ${decisionText(rs, p)}`, p.reason),
  'character.retired': (rs, p: CharacterRetiredPayload) => {
    const kind = p.kind ? ` (${p.kind})` : '';
    const carry = [
      amountText(rs, 'cxp', p.carry.cxp),
      amountText(rs, 'fp', p.carry.fp),
      amountText(rs, 'shinies', p.carry.shinies),
    ];
    return `${withReason(`Retired${kind}`, p.reason)}. Carries ${list(carry)}`;
  },
};

/** The action's payload if it matches its type's schema, otherwise null. */
export function readPayload(action: Action): unknown {
  const def = Object.hasOwn(ACTION_REGISTRY, action.type)
    ? ACTION_REGISTRY[action.type]
    : undefined;
  if (!def) return null;
  const result = def.payload.safeParse(action.payload);
  return result.success ? result.data : null;
}

/** Ends the text with a full stop unless it already ends a sentence. */
function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** Map of actions by id, for {@link describeAction}'s lookup. */
export function actionLookup(actions: readonly Action[]): ActionLookup {
  return new Map(actions.map((a) => [a.id, a]));
}

/**
 * Label, summary, and group for one action. `lookup` resolves references to other actions of the
 * same character (pass {@link actionLookup} of the whole log).
 */
export function describeAction(
  ruleset: Ruleset,
  action: Action,
  lookup: ActionLookup = new Map(),
): ActionDescription {
  const type = Object.hasOwn(TYPES, action.type) ? TYPES[action.type] : undefined;
  if (!type) {
    return {
      label: 'Other',
      summary: `Recorded "${humanize(String(action.type))}".`,
      group: 'other',
    };
  }
  const payload = readPayload(action);
  if (payload === null) {
    return {
      ...type,
      summary: `Recorded ${humanize(action.type).toLowerCase()}; the details could not be read.`,
    };
  }
  try {
    const describe = DESCRIBE[action.type] as (
      rs: Ruleset,
      p: unknown,
      a: Action,
      l: ActionLookup,
    ) => string;
    return { ...type, summary: sentence(describe(ruleset, payload, action, lookup)) };
  } catch {
    return { ...type, summary: `Recorded ${humanize(action.type).toLowerCase()}.` };
  }
}
