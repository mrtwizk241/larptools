// Turns any stored action into a short label, a plain-English summary, and a filter group, using
// the ruleset for names. Pure: no React. Payloads it cannot read get a safe generic summary.
import {
  ACTION_REGISTRY,
  type ArtifactAwakenedPayload,
  type ArtifactPowerRemovedPayload,
  type ArtifactPowerSetPayload,
  type ArtifactSlotUnlockedPayload,
  type BoonAddedPayload,
  type BoonRemovedPayload,
  type CallingLeftPayload,
  type CallingStartedPayload,
  type CharacterCreatedPayload,
  type CharacterRetiredPayload,
  type RetirementAssignedPayload,
  type EventCheckedInPayload,
  type EventCheckInVoidedPayload,
  type FamiliarRemovedPayload,
  type FamiliarSetPayload,
  type ItemsStartingSetPayload,
  type JournalAddedPayload,
  type JournalRemovedPayload,
  type JournalTaggedPayload,
  type LocationFamiliarizedPayload,
  type LocationRemovedPayload,
  type MtSpentPayload,
  type OwedAddedPayload,
  type OwedDeliveredPayload,
  type PointsAdjustedPayload,
  type PointsAwardedPayload,
  type ProfileUpdatedPayload,
  type RaceChangedPayload,
  type RequestApprovedPayload,
  type RequestRejectedPayload,
  type Ruleset,
  type SkillLearnedPayload,
  type SkillRefundedPayload,
  type SpiritChangedPayload,
} from '../../engine/index.ts';
import type { Action, ActionType } from '../../engine/model.ts';
import { amountText, costText, ledgerKindName, signedTotals, skillStepName } from './names.ts';

export const ACTION_GROUPS = [
  'points',
  'check-ins',
  'skills',
  'journals',
  'calling',
  'artifact',
  'extras',
  'profile',
  'corrections',
  'requests',
  'other',
] as const;
export type ActionGroup = (typeof ACTION_GROUPS)[number];

export const GROUP_LABELS: Record<ActionGroup, string> = {
  points: 'Points',
  'check-ins': 'Check-ins',
  skills: 'Skills',
  journals: 'Journals',
  calling: 'Calling',
  artifact: 'Artifact',
  extras: 'Extras',
  profile: 'Profile',
  corrections: 'Corrections',
  requests: 'Requests',
  other: 'Other',
};

export interface ActionDescription {
  /** Short type badge text, for example "Check-in". */
  label: string;
  /** One plain-English sentence, for example "Checked in to Spring Thaw (Player): +60 XP". */
  summary: string;
  group: ActionGroup;
}

/** Other actions of the same character, for resolving references (boon removed, owed delivered). */
export type ActionLookup = ReadonlyMap<string, Action>;

export const ACTION_TYPE_INFO: Record<ActionType, { label: string; group: ActionGroup }> = {
  'character.created': { label: 'Created', group: 'profile' },
  'profile.updated': { label: 'Profile', group: 'profile' },
  'points.awarded': { label: 'Award', group: 'points' },
  'points.adjusted': { label: 'Adjustment', group: 'corrections' },
  'event.checkedIn': { label: 'Check-in', group: 'check-ins' },
  'event.checkInVoided': { label: 'Void', group: 'corrections' },
  'mt.spent': { label: 'Mist Tokens', group: 'points' },
  'skill.learned': { label: 'Skill', group: 'skills' },
  'skill.refunded': { label: 'Refund', group: 'corrections' },
  'journal.added': { label: 'Journal', group: 'journals' },
  'journal.tagged': { label: 'Tagged', group: 'journals' },
  'journal.removed': { label: 'Journal', group: 'journals' },
  'calling.started': { label: 'Calling', group: 'calling' },
  'calling.left': { label: 'Calling', group: 'calling' },
  'items.startingSet': { label: 'Items', group: 'extras' },
  'spirit.changed': { label: 'Spirit', group: 'other' },
  'request.approved': { label: 'Request', group: 'requests' },
  'request.rejected': { label: 'Request', group: 'requests' },
  'character.retired': { label: 'Retired', group: 'other' },
  'retirement.assigned': { label: 'Retired', group: 'other' },
  'artifact.awakened': { label: 'Artifact', group: 'artifact' },
  'artifact.slotUnlocked': { label: 'Artifact', group: 'artifact' },
  'artifact.powerSet': { label: 'Artifact', group: 'artifact' },
  'artifact.powerRemoved': { label: 'Artifact', group: 'artifact' },
  'location.familiarized': { label: 'Place', group: 'extras' },
  'location.removed': { label: 'Place', group: 'extras' },
  'boon.added': { label: 'Boon', group: 'extras' },
  'boon.removed': { label: 'Boon', group: 'extras' },
  'familiar.set': { label: 'Familiar', group: 'extras' },
  'familiar.removed': { label: 'Familiar', group: 'extras' },
  'owed.added': { label: 'Owed', group: 'extras' },
  'owed.delivered': { label: 'Delivered', group: 'extras' },
  'race.changed': { label: 'Race', group: 'profile' },
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

type Describer = (ruleset: Ruleset, payload: never, action: Action, lookup: ActionLookup) => string;

function raceName(ruleset: Ruleset, id: string): string {
  return ruleset.racesById[id]?.name ?? humanize(id);
}

function callingName(ruleset: Ruleset, id: string): string {
  return ruleset.callingsById[id]?.name ?? humanize(id);
}

const JOURNAL_WORD: Record<string, string> = {
  spell: 'spell',
  recipe: 'recipe',
  performance: 'performance note',
  ritual: 'ritual',
};

const JOURNAL_BOOK: Record<string, string> = {
  spell: 'spellbook',
  recipe: 'crafting journal',
  performance: 'performance record',
  ritual: 'rituals',
};

function journalName(ruleset: Ruleset, kind: string, refId: string): string {
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

/** The journal.added action an entry id points at, read. */
function journalEntry(lookup: ActionLookup, entryId: string): JournalAddedPayload | null {
  const source = lookup.get(entryId);
  return source?.type === 'journal.added'
    ? (readPayload(source) as JournalAddedPayload | null)
    : null;
}

function artifactPowerName(ruleset: Ruleset, powerId: string): string {
  const power = ruleset.artifactPowersById[powerId];
  return power ? `${power.summary.replace(/\.+$/, '')} (tier ${power.tier})` : humanize(powerId);
}

const PROFILE_FIELDS: readonly [keyof ProfileUpdatedPayload, string][] = [
  ['playerName', 'player name'],
  ['playerEmail', 'player email'],
  ['concept', 'concept'],
  ['backstory', 'backstory'],
  ['notes', 'notes'],
  ['ageCategory', 'age category'],
  ['ageYears', 'age'],
  ['choices', 'race choices'],
  ['literacy', 'literacy'],
  ['callingChoices', 'Calling choices'],
];

const DESCRIBE: Record<ActionType, Describer> = {
  'character.created': (rs, p: CharacterCreatedPayload) => {
    const carry = p.retirement ? `, carrying points over from ${p.retirement.fromName}` : '';
    return `Created ${p.characterName} (${raceName(rs, p.raceId)}), player ${p.playerName}, with ${amountText(rs, 'xp', p.startingXp)}${carry}`;
  },
  'profile.updated': (_rs, p: ProfileUpdatedPayload) => {
    const fields = PROFILE_FIELDS.filter(([key]) => p[key] !== undefined).map(([, name]) => name);
    if (p.characterName !== undefined)
      return `Renamed the character to ${p.characterName}${fields.length ? ' and updated the profile' : ''}`;
    return fields.length ? `Updated ${list(fields)}` : 'Updated the profile';
  },
  'points.awarded': (rs, p: PointsAwardedPayload) => {
    const capped =
      p.requested !== undefined && p.requested > p.amount
        ? ` (${p.requested} asked, the rest is over the cap)`
        : '';
    return `Awarded ${amountText(rs, p.currency, p.amount)} for ${ledgerKindName(rs, p.kind).toLowerCase()}${capped}`;
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
    const handed = (p.handedOut ?? []).length ? `. Handed over: ${list(p.handedOut ?? [])}` : '';
    return `Checked in to ${p.event.name} (${attendance})${totals ? `: ${totals}` : ''}${handed}`;
  },
  'event.checkInVoided': (_rs, p: EventCheckInVoidedPayload, _action, lookup) => {
    const source = lookup.get(p.checkInActionId);
    const checkIn =
      source?.type === 'event.checkedIn'
        ? (readPayload(source) as EventCheckedInPayload | null)
        : null;
    const what = checkIn ? `Voided the check-in to ${checkIn.event.name}` : 'Voided a check-in';
    return `${what}: ${p.reason.trim().replace(/\.+$/, '')}`;
  },
  'mt.spent': (rs, p: MtSpentPayload) => {
    const purchase = rs.mtPurchasesById[p.purchaseId]?.name ?? humanize(p.purchaseId);
    const got = [
      ...(p.grants ?? []).map((g) => amountText(rs, g.currency, g.amount)),
      ...(p.items ?? []),
    ];
    const what = got.length ? list(got) : `${p.qty} x ${purchase}`;
    const skill = p.skillId ? ` (${rs.skillsById[p.skillId]?.name ?? humanize(p.skillId)})` : '';
    return `Spent ${amountText(rs, 'mt', p.mtCost)} on ${purchase}${skill}: ${what}`;
  },
  'skill.learned': (rs, p: SkillLearnedPayload) => {
    const from = p.teacher ? ` from ${p.teacher}` : '';
    const when = p.atCreation ? ' at creation' : '';
    const cost = costText(rs, { currency: p.currency, amount: p.cost });
    return `Learned ${skillStepName(rs, p.skillId, p.step)}${from}${when} (${cost})`;
  },
  'skill.refunded': (rs, p: SkillRefundedPayload) => {
    const back = p.refund.amount > 0 ? ` (${costText(rs, p.refund)} back)` : '';
    return withReason(`Took back ${skillStepName(rs, p.skillId, p.step)}${back}`, p.reason);
  },
  'journal.added': (rs, p: JournalAddedPayload) => {
    const word = JOURNAL_WORD[p.kind] ?? p.kind;
    const book = JOURNAL_BOOK[p.kind] ?? 'journal';
    const from =
      p.source === 'teacher' && p.teacher
        ? ` from ${p.teacher}`
        : p.source === 'starting'
          ? ' as a starting pick'
          : p.source === 'other'
            ? ''
            : ` by ${p.source}`;
    return `Added the ${word} ${journalName(rs, p.kind, p.refId)} to the ${book}${from}`;
  },
  'journal.tagged': (rs, p: JournalTaggedPayload, _action, lookup) => {
    const entry = journalEntry(lookup, p.entryId);
    return entry
      ? `Tagged the ${JOURNAL_WORD[entry.kind] ?? entry.kind} ${journalName(rs, entry.kind, entry.refId)}`
      : 'Tagged a journal entry';
  },
  'journal.removed': (rs, p: JournalRemovedPayload, _action, lookup) => {
    const entry = journalEntry(lookup, p.entryId);
    const what = entry
      ? `Removed the ${JOURNAL_WORD[entry.kind] ?? entry.kind} ${journalName(rs, entry.kind, entry.refId)}`
      : 'Removed a journal entry';
    return withReason(what, p.reason);
  },
  'calling.started': (rs, p: CallingStartedPayload) =>
    `Started the Calling ${callingName(rs, p.callingId)}`,
  'calling.left': (_rs, p: CallingLeftPayload) => withReason('Left the Calling', p.reason),
  'items.startingSet': (rs, p: ItemsStartingSetPayload) => {
    if (p.picks.length === 0) return 'Cleared the starting items';
    const names = p.picks.map((pick) => {
      const name = rs.startingOptionsById[pick.optionId]?.name ?? humanize(pick.optionId);
      return pick.detail ? `${name} (${pick.detail})` : name;
    });
    return `Set the starting items: ${list(names)}`;
  },
  'spirit.changed': (_rs, p: SpiritChangedPayload) =>
    withReason(
      `${p.delta > 0 ? 'Gained' : 'Lost'} ${Math.abs(p.delta)} Spirit ${Math.abs(p.delta) === 1 ? 'Fragment' : 'Fragments'}`,
      p.reason,
    ),
  'request.approved': (rs, p: RequestApprovedPayload) =>
    `Approved the request for ${skillStepName(rs, p.skillId, p.step)}${p.teacher ? ` from ${p.teacher}` : ''}`,
  'request.rejected': (rs, p: RequestRejectedPayload) =>
    withReason(`Rejected the request for ${skillStepName(rs, p.skillId, p.step)}`, p.reason),
  'character.retired': (rs, p: CharacterRetiredPayload) => {
    const carry = [
      amountText(rs, 'xp', p.carry.xp),
      amountText(rs, 'cxp', p.carry.cxp),
      amountText(rs, 'axp', p.carry.axp),
      `${p.carry.coinCopper} Copper in goods`,
    ];
    return `${withReason('Retired', p.reason)}. Carries ${list(carry)}`;
  },
  'retirement.assigned': (_rs, p: RetirementAssignedPayload) =>
    p.kind === 'new'
      ? `Gave the carry-over to ${p.toName}, the new character built from it`
      : `Gave the carry-over to ${p.toName}`,
  'artifact.awakened': (rs, p: ArtifactAwakenedPayload) =>
    `Awakened the Artifact ${p.name} (${amountText(rs, 'axp', p.axpCost)})`,
  'artifact.slotUnlocked': (rs, p: ArtifactSlotUnlockedPayload) =>
    `Unlocked an Artifact slot (${amountText(rs, 'axp', p.axpCost)})`,
  'artifact.powerSet': (rs, p: ArtifactPowerSetPayload) =>
    `Set the Artifact power ${artifactPowerName(rs, p.powerId)}${p.choice ? `: ${p.choice}` : ''}`,
  'artifact.powerRemoved': (_rs, p: ArtifactPowerRemovedPayload) =>
    withReason(
      `Removed ${p.entryIds.length === 1 ? 'an Artifact power' : `${p.entryIds.length} Artifact powers`}`,
      p.reason,
    ),
  'location.familiarized': (_rs, p: LocationFamiliarizedPayload) =>
    `Familiarized ${p.name}${p.kind === 'tree' ? ' (a tree)' : ''}`,
  'location.removed': (_rs, p: LocationRemovedPayload, _action, lookup) => {
    const source = lookup.get(p.entryId);
    const added =
      source?.type === 'location.familiarized'
        ? (readPayload(source) as LocationFamiliarizedPayload | null)
        : null;
    return withReason(`Removed the familiarized place${added ? ` ${added.name}` : ''}`, p.reason);
  },
  'boon.added': (_rs, p: BoonAddedPayload) => `Added the ${p.slot} boon ${p.name}`,
  'boon.removed': (_rs, p: BoonRemovedPayload, _action, lookup) => {
    const added = lookup.get(p.boonActionId);
    const payload =
      added?.type === 'boon.added' ? (readPayload(added) as BoonAddedPayload | null) : null;
    return withReason(`Removed the boon${payload ? ` ${payload.name}` : ''}`, p.reason);
  },
  'familiar.set': (_rs, p: FamiliarSetPayload) => {
    const tricks = (p.tricks ?? []).length;
    return `Set the familiar ${p.name} (${humanize(p.quality)} quality${tricks ? `, ${tricks} ${tricks === 1 ? 'trick' : 'tricks'}` : ''})`;
  },
  'familiar.removed': (_rs, p: FamiliarRemovedPayload) =>
    withReason('Removed the familiar', p.reason),
  'owed.added': (_rs, p: OwedAddedPayload) => `Owed: ${p.text}`,
  'owed.delivered': (_rs, p: OwedDeliveredPayload, _action, lookup) => {
    const source = lookup.get(p.owedId);
    const owed =
      source?.type === 'owed.added' ? (readPayload(source) as OwedAddedPayload | null) : null;
    return owed ? `Handed over: ${owed.text}` : 'Handed over an owed item';
  },
  'race.changed': (rs, p: RaceChangedPayload) =>
    withReason(
      `Changed race from ${raceName(rs, p.fromRaceId)} to ${raceName(rs, p.toRaceId)}`,
      p.reason,
    ),
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
  const type = Object.hasOwn(ACTION_TYPE_INFO, action.type)
    ? ACTION_TYPE_INFO[action.type]
    : undefined;
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
