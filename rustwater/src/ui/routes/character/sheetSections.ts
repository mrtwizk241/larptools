// Text for the Sheet screen's Skills and Passive Abilities cards (I-8, I-15). Pure, so it is unit
// tested.
import type {
  AncestryAbilityView,
  ExtraUses,
  Ruleset,
  Sheet,
  SheetSkill,
  SheetSkillPart,
  StatContribution,
  Uses,
} from '../../../engine/index.ts';
import { oneLine } from './print/sheetModel.ts';
import { partTitle, skillDisplayName } from './skills/skillInfo.ts';
import { frequencyText } from './format.ts';

const PER: Record<Uses['per'], string> = {
  encounter: 'per encounter',
  repop: 'per repop',
  event: 'per event',
};

/** "3 per repop". */
export function perText(uses: Uses | ExtraUses): string {
  return `${uses.count} ${PER[uses.per]}`;
}

/** One owned skill: "Assault 3" and "3 per repop; Adept 1 per encounter". */
export interface SkillLine {
  key: string;
  /** Skill id for a link to its Skills row; null for ancestry, profession, familiar lines. */
  skillId: string | null;
  /** Name with the level, for example "Assault 3". */
  name: string;
  /** Uses and parts, for example "3 per repop; Adept 1 per encounter". Empty when none. */
  detail: string;
}

export interface SkillGroupView {
  id: string;
  title: string;
  /** What is left to spend, for example "12 AP left". Null when the group has no points. */
  left: string | null;
  /** A line under the heading, for example the profession or familiar name. */
  note: string | null;
  lines: SkillLine[];
}

function leftText(available: number, currency: string): string {
  return available < 0 ? `${-available} ${currency} overspent` : `${available} ${currency} left`;
}

/** Uses on one part: "3 per repop", "3 per repop and 1 per encounter". */
function partUses(part: SheetSkillPart): string {
  return [part.uses, ...part.extraUses]
    .filter((u): u is Uses | ExtraUses => u !== null && u.count > 0)
    .map(perText)
    .join(' and ');
}

/** "Assault 3", "Toughness (Warrior) 2", or the bare name for a one-level skill. */
function skillName(ruleset: Ruleset, skill: SheetSkill): string {
  const def = ruleset.skillsById[skill.skillId];
  const name = def ? skillDisplayName(ruleset, def) : skill.name;
  const lead =
    skill.parts.find((p) => p.part === 'basic') ?? skill.parts.find((p) => p.part === 'main');
  if (!lead || lead.maxLevel === 1) return name;
  return `${name} ${lead.level}`;
}

/** "3 per repop; Adept 1 per encounter; Mastery", or "Passive" for a passive skill. */
function skillDetail(ruleset: Ruleset, skill: SheetSkill): string {
  const def = ruleset.skillsById[skill.skillId];
  const parts = skill.parts.filter((p) => p.level > 0);
  return parts
    .map((part) => {
      const uses = partUses(part);
      if (part.part === 'basic' || part.part === 'main')
        return uses || (part.frequency === 'passive' ? 'Passive' : frequencyText(part.frequency));
      const title = def ? partTitle(def, part.part) : part.part;
      if (uses) return `${title} ${uses}`;
      return part.maxLevel === 1 ? title : `${title} ${part.level}`;
    })
    .join('; ');
}

function skillLine(ruleset: Ruleset, skill: SheetSkill): SkillLine {
  return {
    key: skill.skillId,
    skillId: skill.skillId,
    name: skillName(ruleset, skill),
    detail: skillDetail(ruleset, skill),
  };
}

/**
 * Archetype, profession, and familiar groups for the Skills card, in that order (the Ancestry
 * group is drawn by the card, since staff level it there). A group with nothing owned is left out,
 * unless it has points to spend: then only its heading line shows.
 */
export function skillGroupViews(ruleset: Ruleset, sheet: Sheet): SkillGroupView[] {
  const owned = sheet.skills.filter((s) => s.parts.some((p) => p.level > 0));
  const known = new Set(ruleset.archetypes.map((a) => a.id));
  const groups: SkillGroupView[] = ruleset.archetypes.map((archetype) => {
    const pool = sheet.points.ap[archetype.id];
    return {
      id: archetype.id,
      title: archetype.name,
      left: pool ? leftText(pool.available, 'AP') : null,
      note: null,
      lines: owned.filter((s) => s.archetype === archetype.id).map((s) => skillLine(ruleset, s)),
    };
  });
  const other = owned.filter((s) => s.archetype === null || !known.has(s.archetype));
  if (other.length > 0)
    groups.push({
      id: 'other',
      title: 'Other',
      left: null,
      note: null,
      lines: other.map((s) => skillLine(ruleset, s)),
    });

  const { profession, familiar, points } = sheet;
  groups.push({
    id: 'profession',
    title: 'Profession',
    left: leftText(points.pxp.available, 'PXP'),
    note: profession ? profession.name : null,
    lines: (profession?.skills ?? [])
      .filter((s) => s.level > 0)
      .map((s) => ({
        key: s.id,
        skillId: null,
        name: `${s.name} ${s.level}`,
        detail: s.uses.count > 0 ? perText(s.uses) : frequencyText(s.frequency),
      })),
  });

  groups.push({
    id: 'familiar',
    title: 'Familiar',
    left: familiar
      ? `${familiar.essence.available} Essence, ${points.fp.available} FP left`
      : leftText(points.fp.available, 'FP'),
    note: familiar ? `${familiar.name}, level ${familiar.level}` : null,
    lines: (familiar?.learned ?? []).map((s) => ({
      key: s.actionId,
      skillId: null,
      name: s.choice ? `${s.name}: ${s.choice}` : s.name,
      detail: frequencyText(s.frequency),
    })),
  });

  return groups.filter((g) => g.lines.length > 0 || hasPoints(g, sheet));
}

/** True when the group has points to spend, so its heading shows even with nothing owned. */
function hasPoints(group: SkillGroupView, sheet: Sheet): boolean {
  if (group.id === 'profession') return sheet.points.pxp.available > 0 || sheet.profession !== null;
  if (group.id === 'familiar')
    return sheet.points.fp.available > 0 || (sheet.familiar?.essence.available ?? 0) > 0;
  return (sheet.points.ap[group.id]?.available ?? 0) > 0;
}

/** "Quick Reflexes 2" plus uses, for one ancestry ability. */
export function ancestryAbilityLine(ability: AncestryAbilityView): SkillLine {
  const name = ability.copied ? `${ability.name}: ${ability.copied.name}` : ability.name;
  return {
    key: ability.id,
    skillId: null,
    name: `${name} ${ability.level}`,
    detail: ability.uses ? perText(ability.uses) : frequencyText(ability.frequency),
  };
}

// ---- Passive abilities (I-15) ----

/** Stats shown as totals on the Sheet (Stats card) and the Play Tracker (damage). */
const SHOWN_TOTALS: ReadonlySet<string> = new Set([
  'maxHealth',
  'armor',
  'reflexArmor',
  'weaponDamage',
  'damage',
  'packetDamage',
]);

export interface PassiveView {
  key: string;
  name: string;
  /** First sentence of the rule text. */
  text: string;
  /** True when it adds to a total the app shows (Health, Armor, damage). */
  counted: boolean;
}

function counts(
  contributions: readonly StatContribution[],
  match: (source: StatContribution['source']) => boolean,
): boolean {
  return contributions.some(
    (c) => c.condition === null && SHOWN_TOTALS.has(c.stat) && match(c.source),
  );
}

/**
 * Every passive ability the character has: ancestry passives, passive skill parts (passive skills
 * and masteries; memorization skills are slot counts and stay on Spells and Recipes), and the
 * profession passive.
 */
export function passiveAbilities(ruleset: Ruleset, sheet: Sheet): PassiveView[] {
  const { contributions } = sheet.stats;
  const list: PassiveView[] = [];
  for (const passive of sheet.ancestry?.passives ?? [])
    list.push({
      key: `ancestry-${passive.id}`,
      name: passive.sheetName || passive.name,
      text: oneLine(passive.text),
      counted: counts(contributions, (s) => s.kind === 'ancestry' && s.id === passive.id),
    });
  for (const skill of sheet.skills) {
    const def = ruleset.skillsById[skill.skillId];
    if (!def || def.type === 'memorization') continue;
    for (const part of skill.parts) {
      if (part.level <= 0 || part.frequency !== 'passive') continue;
      const base = skillDisplayName(ruleset, def);
      const label =
        part.part === 'main' || part.part === 'basic'
          ? base
          : `${base} ${partTitle(def, part.part)}`;
      list.push({
        key: `skill-${skill.skillId}-${part.part}`,
        name: part.maxLevel === 1 ? label : `${label} ${part.level}`,
        text: oneLine(def.parts[part.part]?.text ?? ''),
        counted: counts(
          contributions,
          (s) => s.kind === 'skill' && s.id === skill.skillId && s.part === part.part,
        ),
      });
    }
  }
  if (sheet.profession)
    list.push({
      key: `profession-${sheet.profession.passive.id}`,
      name: sheet.profession.passive.name,
      text: oneLine(sheet.profession.passive.text),
      counted: false,
    });
  return list;
}
