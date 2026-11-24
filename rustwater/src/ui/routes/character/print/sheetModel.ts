// Data for the printed character sheet (I-16). Pure, so it is unit tested. Group titles, points
// left, and skill names come from the Sheet screen (sheetSections.ts), so the paper and the
// screen agree.
import type {
  ExtraUses,
  MemoryKind,
  MemorySlotPool,
  Ruleset,
  Sheet,
  SheetSkill,
  SheetSkillPart,
  UsePeriod,
  Uses,
} from '../../../../engine/index.ts';
import { frequencyText } from '../format.ts';
import type { SavedDamageLine } from '../play/combat.ts';
import { ancestryAbilityLine, skillGroupViews } from '../sheetSections.ts';
import { partTitle } from '../skills/skillInfo.ts';

/** What a skill costs: CP (CXP, basic parts), AP (every other part), LXP (ancestry abilities). */
export type CostMark = 'CP' | 'AP' | 'LXP';

export function costMark(currency: 'cxp' | 'ap' | 'lxp'): CostMark {
  if (currency === 'cxp') return 'CP';
  if (currency === 'ap') return 'AP';
  return 'LXP';
}

const PERIOD: Record<UsePeriod, string> = {
  repop: 'per repop',
  encounter: 'per encounter',
  event: 'per event',
};

/** "per repop". */
export function periodText(per: UsePeriod): string {
  return PERIOD[per];
}

/**
 * One row under a skill: an empty box per use for one period. A row with no uses (a passive
 * mastery, say) has `count` 0 and `period` null and prints its label only.
 */
export interface BoxRow {
  key: string;
  /** Part title for Adept, Advanced, and other upgrades; null for the skill's own uses. */
  part: string | null;
  /** Cost mark of an upgrade part; null on the skill's own uses (the skill carries its mark). */
  mark: CostMark | null;
  count: number;
  period: UsePeriod | null;
  /** Shown when there are no uses, for example "Passive". */
  note: string | null;
}

export interface PrintSkill {
  key: string;
  /** "Assault 3", the same name as the Sheet screen. */
  name: string;
  mark: CostMark | null;
  /** Shown after the name when the skill itself has no uses, for example "Passive". */
  note: string | null;
  rows: BoxRow[];
}

export interface PrintSkillGroup {
  id: string;
  title: string;
  /** "3 AP left", as on the Sheet screen. */
  left: string | null;
  skills: PrintSkill[];
}

function usesOf(part: SheetSkillPart): (Uses | ExtraUses)[] {
  return [part.uses, ...part.extraUses].filter(
    (u): u is Uses | ExtraUses => u !== null && u.count > 0,
  );
}

function isLead(part: SheetSkillPart): boolean {
  return part.part === 'basic' || part.part === 'main';
}

/** The skill's own uses first, then a row per upgrade part (Adept, Advanced, Mastery). */
export function skillRows(ruleset: Ruleset, skill: SheetSkill): PrintSkill['rows'] {
  const def = ruleset.skillsById[skill.skillId];
  const rows: BoxRow[] = [];
  for (const part of skill.parts) {
    if (part.level <= 0) continue;
    const lead = isLead(part);
    const title = lead ? null : def ? partTitle(def, part.part) : part.part;
    const mark = lead ? null : costMark(part.currency);
    const uses = usesOf(part);
    if (uses.length === 0) {
      // The skill line itself says "Passive"; upgrades without uses still get a labelled row.
      if (!lead)
        rows.push({
          key: part.part,
          part: title,
          mark,
          count: 0,
          period: null,
          note: frequencyText(part.frequency),
        });
      continue;
    }
    uses.forEach((u, i) =>
      rows.push({
        key: `${part.part}-${i}`,
        part: title,
        mark,
        count: u.count,
        period: u.per,
        note: null,
      }),
    );
  }
  return rows;
}

function printSkill(ruleset: Ruleset, skill: SheetSkill, name: string): PrintSkill {
  const lead = skill.parts.find((p) => p.level > 0 && isLead(p)) ?? skill.parts[0];
  return {
    key: skill.skillId,
    name,
    mark: lead ? costMark(lead.currency) : null,
    note: lead && isLead(lead) && usesOf(lead).length === 0 ? frequencyText(lead.frequency) : null,
    rows: skillRows(ruleset, skill),
  };
}

/** Skill groups to print, in order: Ancestry, then archetypes in rules order, then Other. */
export function printSkillGroups(ruleset: Ruleset, sheet: Sheet): PrintSkillGroup[] {
  const groups: PrintSkillGroup[] = [];
  const { ancestry } = sheet;
  const owned = ancestry?.abilities.filter((a) => a.level > 0) ?? [];
  if (owned.length > 0) {
    const lxp = sheet.points.lxp.available;
    groups.push({
      id: 'ancestry',
      title: 'Ancestry',
      left: lxp < 0 ? `${-lxp} LXP overspent` : `${lxp} LXP left`,
      skills: owned.map((a) => ({
        key: a.id,
        name: ancestryAbilityLine(a).name,
        mark: 'LXP',
        note: a.uses ? null : frequencyText(a.frequency),
        rows: a.uses
          ? [
              {
                key: 'uses',
                part: null,
                mark: null,
                count: a.uses.count,
                period: a.uses.per,
                note: null,
              },
            ]
          : [],
      })),
    });
  }
  const bySkill = new Map(sheet.skills.map((s) => [s.skillId, s]));
  for (const group of skillGroupViews(ruleset, sheet)) {
    if (group.id === 'profession' || group.id === 'familiar') continue;
    const skills = group.lines.flatMap((line) => {
      const skill = line.skillId ? bySkill.get(line.skillId) : undefined;
      return skill ? [printSkill(ruleset, skill, line.name)] : [];
    });
    if (skills.length > 0)
      groups.push({ id: group.id, title: group.title, left: group.left, skills });
  }
  return groups;
}

/** A damage line on paper; blank lines have an empty name and call, to write in by hand. */
export interface DamageRow {
  key: string;
  name: string;
  call: string;
}

/** The saved damage lines, then blank lines up to `min` so there is room to write. */
export function damageRows(lines: readonly SavedDamageLine[], min = 3): DamageRow[] {
  const rows: DamageRow[] = lines.map((l) => ({ key: l.id, name: l.name, call: l.call }));
  for (let i = rows.length; i < min; i += 1) rows.push({ key: `blank-${i}`, name: '', call: '' });
  return rows;
}

/** One memorized kind on page 2: "Spells", slots "Life 2 of 2", and the names. */
export interface MemoryList {
  kind: Exclude<MemoryKind, 'knowledge'>;
  title: string;
  /** "Life 2 of 2, Universal 0 of 1"; empty when the kind has no slots. */
  slots: string;
  names: string[];
}

const MEMORY_KINDS: { kind: MemoryList['kind']; title: string }[] = [
  { kind: 'spell', title: 'Spells' },
  { kind: 'recipe', title: 'Recipes' },
  { kind: 'performance', title: 'Performances' },
  { kind: 'ritual', title: 'Rituals' },
];

const RANKS: Record<string, string> = {
  basic: 'B',
  adept: 'A',
  advanced: 'Adv',
  mastery: 'M',
};

/** Memory pools worth printing: ones with slots or entries. */
export function usedPools(sheet: Sheet): MemorySlotPool[] {
  return sheet.memory.slots.filter((p) => p.slots > 0 || p.used > 0);
}

/**
 * Spells, Recipes, Performances, and Rituals memorized, with their slots. Knowledges are story
 * notes now and are left out. Kinds with no slots and nothing memorized are left out.
 */
export function memoryLists(sheet: Sheet): MemoryList[] {
  const pools = usedPools(sheet);
  const { entries, autoLearned } = sheet.memory;
  return MEMORY_KINDS.map(({ kind, title }) => ({
    kind,
    title,
    slots: pools
      .filter((p) => p.kind === kind)
      .map((p) => `${p.name} ${p.used} of ${p.slots}`)
      .join(', '),
    names: [
      ...entries
        .filter((e) => e.kind === kind)
        .map((e) => (e.rank ? `${e.name} (${RANKS[e.rank] ?? e.rank})` : e.name)),
      ...(kind === 'ritual' ? autoLearned.map((r) => `${r.name} (auto)`) : []),
    ],
  })).filter((l) => l.slots !== '' || l.names.length > 0);
}

/** First sentence of a rule text, cut to `max` characters. */
export function oneLine(text: string, max = 110): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const sentence = /^(.+?[.!?])(\s|$)/.exec(clean)?.[1] ?? clean;
  return sentence.length <= max ? sentence : `${sentence.slice(0, max - 1).trimEnd()}…`;
}
