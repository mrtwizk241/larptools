// Compact text for the printed character sheet. Pure, so it is unit tested.
import type {
  JournalEntry,
  Ruleset,
  Sheet,
  SheetSkill,
  StatLine,
} from '../../../../engine/index.ts';
import type { TechniqueId } from '../../../../engine/model.ts';
import { currencyAbbr } from '../../../lib/names.ts';
import { choiceText } from '../calling/callingModel.ts';
import { statusText } from '../journals/journalModel.ts';
import { raceChoiceRows } from '../overview/overviewModel.ts';
import { NAMED_LABELS } from '../play/usage.ts';

export const PLAYER_TOOL_FOOTER =
  'Unofficial fan tool, not affiliated with Sylvaris LARP or Sylvaris Games, LLC.';

export interface PointsRow {
  label: string;
  earned: number;
  spent: number;
  available: number;
}

/** XP, CXP, AXP, MT: earned, spent, and what is left (the balance for Mist Tokens). */
export function pointsRows(ruleset: Ruleset, sheet: Sheet): PointsRow[] {
  const { xp, cxp, axp, mt } = sheet.points;
  return [
    { label: currencyAbbr(ruleset, 'xp'), ...pick(xp) },
    { label: currencyAbbr(ruleset, 'cxp'), ...pick(cxp) },
    { label: currencyAbbr(ruleset, 'axp'), ...pick(axp) },
    {
      label: currencyAbbr(ruleset, 'mt'),
      earned: mt.earned,
      spent: mt.spent,
      available: mt.balance,
    },
  ];
}

function pick(p: { earned: number; spent: number; available: number }) {
  return { earned: p.earned, spent: p.spent, available: p.available };
}

/** "Active, 1 per encounter: One "Charm - Ignore Me"." One line per race innate. */
export function innateLines(sheet: Sheet): string[] {
  return (sheet.race?.innates ?? []).map((innate) => {
    if (innate.kind === 'passive') return `Passive: ${innate.summary}`;
    const freq = innate.frequency ? innate.frequency.replace(/^per-/, 'per ') : null;
    const uses = innate.uses ? `${innate.uses}${freq ? ` ${freq}` : ''}` : freq;
    return `Active${uses ? `, ${uses}` : ''}: ${innate.summary}`;
  });
}

/** Passive damage lines worth printing (a value other than 0), as label and value. */
export function passiveDamageLines(sheet: Sheet): { label: string; value: number }[] {
  const pd = sheet.stats.passiveDamage;
  const lines: [string, StatLine][] = [
    ['One-handed', pd.oneHanded],
    ['Two-handed', pd.twoHanded],
    ['All weapons', pd.allWeapons],
    ['Ranged', pd.ranged],
    ['Relic', pd.relic],
    ['From behind, one-handed', pd.fromBehindOneHanded],
    ['From behind, two-handed', pd.fromBehindTwoHanded],
    ['Dual wield', pd.dualWield],
    ['Bonded weapon', pd.bondedWeapon],
  ];
  return lines
    .filter(([, line]) => line.value !== 0)
    .map(([label, line]) => ({ label, value: line.value }));
}

/** "Enhancement 4, Attunement 6, Greater Boon 4, Lesser Boon 4". Zero slots are left out. */
export function slotsText(sheet: Sheet): string {
  const s = sheet.stats.slots;
  const parts: [string, number][] = [
    ['Enhancement', s.enhancement],
    ['Attunement', s.attunement],
    ['Attunement (tools only)', s.attunementToolOnly],
    ['Greater Boon', s.greaterBoon],
    ['Lesser Boon', s.lesserBoon],
    ['Amplified Life', s.amplifiedLife],
    ['Amplified Armor', s.amplifiedArmor],
  ];
  return parts
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `${label} ${n}`)
    .join(', ');
}

/** "Common, Elvish, 1 more to choose". */
export function languagesText(sheet: Sheet): string {
  const { known, unnamed } = sheet.stats.languages;
  const names = known.map((l) => l.name);
  if (unnamed > 0) names.push(`${unnamed} more to choose`);
  return names.join(', ');
}

/** "1 Silver per event (first event free)". */
export function upkeepText(sheet: Sheet): string {
  const { silverPerEvent, firstEventFree } = sheet.stats.upkeep;
  const base = silverPerEvent === 0 ? 'None' : `${silverPerEvent} Silver per event`;
  return firstEventFree && silverPerEvent > 0 ? `${base} (first event free)` : base;
}

export const CATEGORY_LABELS: Record<string, string> = {
  offensive: 'Offensive',
  defensive: 'Defensive',
  utility: 'Utility',
  magic: 'Magic',
  crafting: 'Crafting',
  racial: 'Racial',
  calling: 'Calling',
};

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

export interface SkillGroup {
  id: string;
  name: string;
  skills: SheetSkill[];
}

/** Owned skills grouped by category in rulebook order; unknown categories last. */
export function skillGroups(sheet: Sheet): SkillGroup[] {
  const owned = sheet.skills.filter((s) => s.level > 0);
  const ids = [
    ...CATEGORY_ORDER,
    ...[...new Set(owned.map((s) => s.category))].filter((c) => !CATEGORY_ORDER.includes(c)),
  ];
  return ids
    .map((id) => ({
      id,
      name: CATEGORY_LABELS[id] ?? id,
      skills: owned.filter((s) => s.category === id),
    }))
    .filter((g) => g.skills.length > 0);
}

/** "Expert, Master", or "None". */
export function techniquesText(techniques: readonly TechniqueId[]): string {
  return techniques.length === 0 ? 'None' : techniques.map((t) => NAMED_LABELS[t]).join(', ');
}

/** "3/re-pop: B1 E2" (unlocked active abilities and their use cost), or "Passive". */
export function skillUsesText(skill: SheetSkill): string {
  if (skill.locked) return 'Locked';
  const costs = skill.abilities
    .filter((a) => a.unlocked && a.uses > 0 && a.kind !== 'passive')
    .map((a) => `${NAMED_LABELS[a.named].charAt(0)}${a.uses}`);
  if (skill.maxUses <= 0 || costs.length === 0) return 'Passive';
  return `${skill.maxUses}/re-pop: ${costs.join(' ')}`;
}

export interface JournalGroup {
  title: string;
  entries: readonly JournalEntry[];
}

/** Journals with entries: spellbook, crafting journal, performance record, rituals. */
export function journalGroups(sheet: Sheet): JournalGroup[] {
  const j = sheet.journals;
  return [
    { title: 'Spellbook', entries: j.spellbook },
    { title: 'Crafting journal', entries: j.craftingJournal },
    { title: 'Performance record', entries: j.performanceRecord },
    { title: 'Rituals', entries: j.rituals },
  ].filter((g) => g.entries.length > 0);
}

/** "Life", "Tinkering": the spell school or craft of a journal entry. */
export function journalGroupName(ruleset: Ruleset, group: string): string {
  return (
    ruleset.ruleset.magicSchools.find((s) => s.id === group)?.name ??
    ruleset.skillsById[group]?.name ??
    group.charAt(0).toUpperCase() + group.slice(1)
  );
}

/** "Grant Life (Basic, Life), Tagged" or "..., Pending tag". */
export function journalLine(ruleset: Ruleset, entry: JournalEntry): string {
  const status = statusText(entry.status);
  const group = journalGroupName(ruleset, entry.group);
  return `${entry.name} (${NAMED_LABELS[entry.level]}, ${group}), ${status}`;
}

/** "Basic Weapon: Longsword", "Basic Spell in Spellbook: Grant Life" (ids shown by name). */
export function startingItemText(
  ruleset: Ruleset,
  item: { name: string; detail: string | null },
): string {
  if (!item.detail) return item.name;
  const detail = ruleset.spellsById[item.detail]?.name ?? ruleset.recipesById[item.detail]?.name;
  return `${item.name}: ${detail ?? item.detail}`;
}

/** "Element: Fire. Natural weapon: Bite (Greatclaw), base 3 damage", or "" without choices. */
export function raceChoicesText(ruleset: Ruleset, sheet: Sheet): string {
  return raceChoiceRows(ruleset, sheet)
    .map((row) => `${row.label}: ${row.value}`)
    .join('. ');
}

/** "Aligned element: Fire. Blocked magic school: Water", or "" without choices. */
export function callingChoicesText(ruleset: Ruleset, sheet: Sheet): string {
  const calling = sheet.calling;
  if (!calling) return '';
  const data = ruleset.callingsById[calling.callingId];
  return Object.entries(calling.choices)
    .map(([id, value]) => {
      const label = data?.choices?.find((c) => c.id === id)?.label ?? id;
      return `${label}: ${choiceText(ruleset, value)}`;
    })
    .join('. ');
}
