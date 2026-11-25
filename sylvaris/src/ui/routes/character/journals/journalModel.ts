// Magic screen model: journal entries with their rules data, grouping, search, and the staff
// picker. Pure, so it is unit tested.
import {
  journalRef,
  journalUsability,
  type JournalEntry,
  type JournalKind,
  type JournalSource,
  type Ruleset,
  type Sheet,
} from '../../../../engine/index.ts';
import { NAMED_LEVELS, type NamedLevelId, type TechniqueId } from '../../../../engine/model.ts';
import { eventLabel, levelName, plural } from './events.ts';

export interface KindInfo {
  kind: JournalKind;
  /** Tab id and label. */
  tab: string;
  label: string;
  /** "spell", used in button text. */
  noun: string;
  entries: (sheet: Sheet) => readonly JournalEntry[];
}

export const KINDS: readonly KindInfo[] = [
  {
    kind: 'spell',
    tab: 'spellbook',
    label: 'Spellbook',
    noun: 'spell',
    entries: (s) => s.journals.spellbook,
  },
  {
    kind: 'recipe',
    tab: 'crafting',
    label: 'Crafting Journal',
    noun: 'recipe',
    entries: (s) => s.journals.craftingJournal,
  },
  {
    kind: 'performance',
    tab: 'performance',
    label: 'Performance Record',
    noun: 'performance note',
    entries: (s) => s.journals.performanceRecord,
  },
  {
    kind: 'ritual',
    tab: 'rituals',
    label: 'Rituals',
    noun: 'ritual',
    entries: (s) => s.journals.rituals,
  },
];

export const SOURCES: readonly { id: JournalSource; label: string }[] = [
  { id: 'teacher', label: 'A teacher' },
  { id: 'research', label: 'Research Notes' },
  { id: 'scroll', label: 'A scroll' },
  { id: 'starting', label: 'Starting item' },
  { id: 'other', label: 'Other' },
];

/** Rules data shown with an entry: uses per activation, our summary, and the page reference. */
export interface RefDetails {
  name: string;
  level: NamedLevelId;
  uses: number;
  summary: string;
  page: string;
  group: string;
}

export function refDetails(ruleset: Ruleset, kind: JournalKind, refId: string): RefDetails | null {
  const ref = journalRef(ruleset, kind, refId);
  const data =
    kind === 'spell'
      ? ruleset.spellsById[refId]
      : kind === 'recipe'
        ? ruleset.recipesById[refId]
        : kind === 'performance'
          ? ruleset.performancesById[refId]
          : ruleset.ritualsById[refId];
  if (!ref || !data) return null;
  return {
    name: ref.name,
    level: ref.level,
    uses: data.uses,
    summary: data.summary,
    page: data.source,
    group: ref.group,
  };
}

/** "Fire Magic", "Alchemy", "Performances", "Rituals". */
export function groupName(ruleset: Ruleset, kind: JournalKind, group: string): string {
  if (kind === 'performance') return 'Performances';
  if (kind === 'ritual') return 'Rituals';
  if (kind === 'spell') {
    const school = ruleset.ruleset.magicSchools.find((s) => s.id === group);
    return school ? (ruleset.skillsById[school.skill]?.name ?? school.name) : group;
  }
  return ruleset.skillsById[group]?.name ?? group;
}

/** Order of the groups: magic schools as in the data, crafts by name. */
function groupOrder(ruleset: Ruleset, kind: JournalKind, group: string): number {
  if (kind === 'spell') return ruleset.ruleset.magicSchools.findIndex((s) => s.id === group);
  return 0;
}

const levelIndex = (level: NamedLevelId) => NAMED_LEVELS.indexOf(level);

/** "Pending tag" or "Tagged". */
export function statusText(status: JournalEntry['status']): string {
  return status === 'tagged' ? 'Tagged' : 'Pending tag';
}

/** "Taught by Sister Wren at Midsummer Fair (2026-06-20)", "Starting item". */
export function sourceText(sheet: Sheet, entry: JournalEntry): string {
  const base =
    entry.source === 'teacher'
      ? `Taught by ${entry.teacher ?? 'a teacher'}`
      : entry.source === 'research'
        ? 'From Research Notes'
        : entry.source === 'scroll'
          ? 'From a scroll'
          : entry.source === 'starting'
            ? 'Starting item'
            : 'Other';
  const at = eventLabel(sheet, entry.eventKey);
  return at ? `${base} at ${at}` : base;
}

/** "Can use now", or "Cannot use yet. Needs Fire Magic (Expert Technique)." */
export function canUseText(entry: { usableNow: boolean; reason: string | null }): string {
  if (entry.usableNow) return 'Can use now';
  return `Cannot use yet. ${entry.reason ?? ''}`.trim();
}

/** "Basic. Costs 1 use. Rulebook p.118." */
export function metaText(details: RefDetails): string {
  return `${levelName(details.level)}. Costs ${plural(details.uses, 'use')}. ${details.page}.`;
}

export interface EntryGroup<T> {
  id: string;
  name: string;
  items: T[];
}

/** Groups items by school or craft, each sorted by level then name. */
export function groupItems<T extends { group: string; level: NamedLevelId; name: string }>(
  ruleset: Ruleset,
  kind: JournalKind,
  items: readonly T[],
): EntryGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(item.group, [...(map.get(item.group) ?? []), item]);
  return [...map.entries()]
    .map(([id, list]) => ({
      id,
      name: groupName(ruleset, kind, id),
      items: [...list].sort(
        (a, b) => levelIndex(a.level) - levelIndex(b.level) || a.name.localeCompare(b.name),
      ),
    }))
    .sort(
      (a, b) =>
        groupOrder(ruleset, kind, a.id) - groupOrder(ruleset, kind, b.id) ||
        a.name.localeCompare(b.name),
    );
}

/** Lowercase words of a search; every word must match the name, group, or level. */
export function matches(query: string, ...fields: string[]): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = fields.join(' ').toLowerCase();
  return words.every((w) => text.includes(w));
}

/** Entries matching a search, by name, school or craft, level, status, or teacher. */
export function filterEntries(
  ruleset: Ruleset,
  kind: JournalKind,
  entries: readonly JournalEntry[],
  query: string,
): JournalEntry[] {
  if (query.trim() === '') return [...entries];
  return entries.filter((e) =>
    matches(
      query,
      e.name,
      groupName(ruleset, kind, e.group),
      e.level,
      statusText(e.status),
      e.teacher ?? '',
    ),
  );
}

/** What the character owns of each skill, with a left Calling's skills counting as none. */
function journalContext(sheet: Sheet) {
  const skills = new Map(sheet.skills.filter((s) => !s.locked).map((s) => [s.skillId, s] as const));
  return {
    owned: (id: string): { level: number; techniques: readonly TechniqueId[] } => {
      const s = skills.get(id);
      return { level: s?.level ?? 0, techniques: s?.techniques ?? [] };
    },
    spellbookBlocked: sheet.journals.spellbookCastingBlocked,
    blockedSchools: sheet.stats.other
      .filter((o) => o.stat === 'blockedMagicSchool' && typeof o.value === 'string')
      .map((o) => String(o.value)),
  };
}

export interface PickerItem {
  refId: string;
  name: string;
  level: NamedLevelId;
  group: string;
  groupName: string;
  usableNow: boolean;
  reason: string | null;
}

/** Every entry of a kind the character has not recorded yet, matching the search. */
export function pickerItems(
  ruleset: Ruleset,
  sheet: Sheet,
  kind: JournalKind,
  query: string,
): PickerItem[] {
  const info = KINDS.find((k) => k.kind === kind);
  const have = new Set((info?.entries(sheet) ?? []).map((e) => e.refId));
  const all: readonly { id: string }[] =
    kind === 'spell'
      ? ruleset.spells
      : kind === 'recipe'
        ? ruleset.recipes
        : kind === 'performance'
          ? ruleset.performances
          : ruleset.rituals.rituals;
  const ctx = journalContext(sheet);
  const items: PickerItem[] = [];
  for (const { id } of all) {
    if (have.has(id)) continue;
    const ref = journalRef(ruleset, kind, id);
    if (!ref) continue;
    const gName = groupName(ruleset, kind, ref.group);
    if (!matches(query, ref.name, gName, ref.level)) continue;
    const use = journalUsability(ruleset, kind, id, ctx);
    items.push({
      refId: id,
      name: ref.name,
      level: ref.level,
      group: ref.group,
      groupName: gName,
      usableNow: use.usable,
      reason: use.reason,
    });
  }
  return items.sort(
    (a, b) =>
      groupOrder(ruleset, kind, a.group) - groupOrder(ruleset, kind, b.group) ||
      a.groupName.localeCompare(b.groupName) ||
      levelIndex(a.level) - levelIndex(b.level) ||
      a.name.localeCompare(b.name),
  );
}

/** How many picker options are drawn at once; a search narrows the rest. */
export const PICKER_LIMIT = 40;

/** "3 tagged, 1 pending tag, 2 usable now." */
export function summaryText(entries: readonly JournalEntry[]): string {
  const tagged = entries.filter((e) => e.status === 'tagged').length;
  const usable = entries.filter((e) => e.usableNow).length;
  return `${tagged} tagged, ${entries.length - tagged} pending tag, ${usable} usable now.`;
}
