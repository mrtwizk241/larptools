// Sheet labels to rules-data ids. The reverse of tools/parity/sheetmap.py: skill, ancestry,
// profession, familiar, spell and recipe labels as the sheet's dropdowns spell them, built from
// the ruleset's sheetName fields and the same short alias table for the sheet's own spellings.
// A label that is not an exact dropdown value is still read when it differs only in case,
// spacing or punctuation, by up to two letters, or is an old name (DECISIONS Q-SKL-14); the
// caller reports those as warnings.
import type { Ruleset, Skill } from '../data/index.ts';
import type { SkillPart } from '../engine/model.ts';

export type SkillTab = 'standard' | 'magic' | 'crafting';
export type SkillBlock = 'basic' | 'archetype';

export interface SkillRef {
  readonly skill: string;
  readonly part: SkillPart;
  /** Pool of a multi-archetype skill (set only for those). */
  readonly archetype?: string;
}

export interface Match<T> {
  readonly value: T;
  /** exact: a dropdown value; alias: an old or alternative name; fuzzy: a typo or case change. */
  readonly how: 'exact' | 'alias' | 'fuzzy';
  /** The dropdown label it was read as. */
  readonly label: string;
}

export const STANDARD_ARCHETYPES = ['warrior', 'defender', 'rogue', 'utility'] as const;

function tabOf(archetype: string): SkillTab {
  if (archetype === 'magic') return 'magic';
  if (archetype === 'crafting') return 'crafting';
  return 'standard';
}

// Sheet labels that differ from the rules-data name and have no sheetName field in the data
// (same table as tools/parity/sheetmap.py).
const MAGIC_BASIC_LABEL: Readonly<Record<string, string>> = {
  'spell-manipulation': 'Manipulation',
};
const MAGIC_MAIN_LABEL: Readonly<Record<string, string>> = {
  'raw-magic-proficiency': 'Raw Magic Procifiency',
};
const SCHOOL_LABEL: Readonly<Record<string, string>> = {
  'elemental-magic': 'Elemental Magic',
  'life-magic': 'Life Magic',
  'death-magic': 'Death Magic',
  'tech-magic': 'Tech Magic',
};
const SPELL_LABEL: Readonly<Record<string, string>> = {
  'undead-marionette': 'Undead of Marionette',
  'chill-to-the-bone': 'Chill to the Bone',
};
const RECIPE_LABEL: Readonly<Record<string, string>> = {
  'definitely-not-chloroform': 'Definitely "Not" Chloroform',
  'futuristic-projectile-weapon': 'Advanced Projectile Weapon',
  'railroad-spike': 'Railraod Spike',
  'knockout-rounds': 'Knocking Rounds',
  'adept-enhancement-extension': 'Adept Enhacement Extension',
  'built-in-armor': 'Builting-In Armor',
  'magic-in-a-bottle': 'Magic In A Bottle',
  'breath-of-life': 'Breath of Life',
};
/**
 * Labels the sheet's dropdowns offer that are not a skill under the rulebook, with the reason
 * the import leaves them out (docs/RULES_DISCREPANCIES.md).
 */
export const SHEET_ONLY_SKILLS: Readonly<
  Record<string, { readonly tab: SkillTab; readonly block: SkillBlock; readonly why: string }>
> = {
  'Quick Crafting': {
    tab: 'crafting',
    block: 'archetype',
    why: 'the rulebook has one Quick Crafting skill, bought on the basic rows (D-34)',
  },
};

/** Old mastery names still in the sheet's dropdown (DECISIONS Q-SKL-14). */
const OLD_SKILL_LABELS: readonly { label: string; ref: SkillRef }[] = [
  { label: 'Lockpicking Mastery', ref: { skill: 'disarm-unlock-device', part: 'mastery' } },
  { label: 'Disarm Trap Mastery', ref: { skill: 'disarm-unlock-device', part: 'mastery' } },
];

/** Lowercase letters and digits only, for case, spacing and punctuation slips. */
export function normalizeLabel(text: string): string {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Levenshtein distance, giving up above `max`. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length] ?? max + 1;
}

/** One dropdown's labels, with alias and typo matching. */
export class LabelIndex<T> {
  private readonly exact = new Map<string, T>();
  private readonly aliases = new Map<string, { label: string; value: T }>();
  private readonly normalized = new Map<string, { label: string; value: T }>();

  add(label: string, value: T): void {
    if (!this.exact.has(label)) this.exact.set(label, value);
    const key = normalizeLabel(label);
    if (key !== '' && !this.normalized.has(key)) this.normalized.set(key, { label, value });
  }

  /** An alternative name, read as `label` with a warning. */
  alias(name: string, label: string, value: T): void {
    if (!this.exact.has(name) && !this.aliases.has(normalizeLabel(name)))
      this.aliases.set(normalizeLabel(name), { label, value });
  }

  find(text: string): Match<T> | undefined {
    const trimmed = text.trim();
    const hit = this.exact.get(trimmed);
    if (hit !== undefined) return { value: hit, how: 'exact', label: trimmed };
    const key = normalizeLabel(trimmed);
    if (key === '') return undefined;
    const alias = this.aliases.get(key);
    if (alias) return { value: alias.value, how: 'alias', label: alias.label };
    const near = this.normalized.get(key);
    if (near) return { value: near.value, how: 'fuzzy', label: near.label };
    if (key.length < 5) return undefined;
    let best: { label: string; value: T } | undefined;
    let bestDistance = 3;
    let tie = false;
    for (const [k, entry] of this.normalized) {
      const d = distance(key, k, 2);
      if (d < bestDistance) {
        best = entry;
        bestDistance = d;
        tie = false;
      } else if (d === bestDistance) tie = true;
    }
    return best && !tie ? { value: best.value, how: 'fuzzy', label: best.label } : undefined;
  }

  get size(): number {
    return this.exact.size;
  }

  labels(): string[] {
    return [...this.exact.keys()];
  }
}

export interface SheetLabels {
  /** Skill labels per tab and block (basic: columns A, archetype: K or J). */
  readonly skills: Readonly<Record<SkillTab, Readonly<Record<SkillBlock, LabelIndex<SkillRef>>>>>;
  /** Subtype label (PlayerCharacter Info B4) to ancestry and subtype ids. */
  readonly subtypes: LabelIndex<{ ancestry: string; subtype: string }>;
  readonly professions: LabelIndex<string>;
  readonly familiarSkills: LabelIndex<string>;
  readonly awakenedSkills: LabelIndex<string>;
  readonly spells: LabelIndex<string>;
  readonly recipes: LabelIndex<string>;
  readonly performances: LabelIndex<string>;
  readonly rituals: LabelIndex<string>;
  readonly boons: LabelIndex<string>;
  readonly startingItems: LabelIndex<string>;
}

/** The sheet label of one skill part bought in `archetype`, or undefined when it has none. */
export function skillLabel(skill: Skill, part: SkillPart, archetype: string): string | undefined {
  let label = skill.sheetNames[part];
  if (label?.includes('<Archetype>')) {
    label = (STANDARD_ARCHETYPES as readonly string[]).includes(archetype)
      ? label.replace('<Archetype>', archetype.charAt(0).toUpperCase() + archetype.slice(1))
      : label.replace('<Archetype> Meditation ', '');
  }
  if (label !== undefined) return label;
  // Standard skills always carry their labels; a missing one is not on the sheet.
  if (skill.archetype !== undefined && tabOf(skill.archetype) === 'standard') return undefined;
  const base = MAGIC_BASIC_LABEL[skill.id] ?? skill.name;
  if (part === 'basic') return base;
  if (part === 'adept' || part === 'advanced') {
    const pre = part === 'adept' ? 'Adept' : 'Advanced';
    const school = SCHOOL_LABEL[skill.id];
    return school ? `${pre} Cast ${school}` : `${pre} ${base}`;
  }
  return MAGIC_MAIN_LABEL[skill.id] ?? skill.name;
}

export function spellLabel(id: string, name: string): string {
  return SPELL_LABEL[id] ?? name;
}

export function recipeLabel(id: string, name: string): string {
  return RECIPE_LABEL[id] ?? name;
}

const cache = new WeakMap<Ruleset, SheetLabels>();

export function sheetLabels(rs: Ruleset): SheetLabels {
  const hit = cache.get(rs);
  if (hit) return hit;
  const block = () => ({
    basic: new LabelIndex<SkillRef>(),
    archetype: new LabelIndex<SkillRef>(),
  });
  const skills = { standard: block(), magic: block(), crafting: block() };
  for (const skill of rs.skills) {
    const archetypes = skill.archetype !== undefined ? [skill.archetype] : skill.archetypeOptions;
    for (const part of Object.keys(skill.parts) as SkillPart[]) {
      for (const archetype of archetypes ?? []) {
        const label = skillLabel(skill, part, archetype);
        if (label === undefined) continue;
        const ref: SkillRef =
          skill.archetype === undefined
            ? { skill: skill.id, part, archetype }
            : { skill: skill.id, part };
        skills[tabOf(archetype)][part === 'basic' ? 'basic' : 'archetype'].add(label, ref);
      }
    }
  }
  for (const old of OLD_SKILL_LABELS) {
    const skill = rs.skillsById[old.ref.skill];
    const archetype = skill?.archetype;
    if (!skill || archetype === undefined) continue;
    const current = skillLabel(skill, old.ref.part, archetype) ?? `${skill.name} Mastery`;
    skills[tabOf(archetype)].archetype.alias(old.label, current, old.ref);
  }

  const subtypes = new LabelIndex<{ ancestry: string; subtype: string }>();
  for (const a of rs.ancestries.ancestries)
    for (const st of a.subtypes) subtypes.add(st.sheetName, { ancestry: a.id, subtype: st.id });
  for (const a of rs.ancestries.ancestries)
    for (const st of a.subtypes) {
      const value = { ancestry: a.id, subtype: st.id };
      subtypes.alias(st.name, st.sheetName, value);
      for (const alias of st.aliases ?? []) subtypes.alias(alias, st.sheetName, value);
    }

  const professions = new LabelIndex<string>();
  for (const p of rs.professions.professions) professions.add(p.sheetName, p.id);
  for (const p of rs.professions.professions) professions.alias(p.name, p.sheetName, p.id);

  const familiarSkills = new LabelIndex<string>();
  for (const s of rs.familiar.skills) if (s.sheetName) familiarSkills.add(s.sheetName, s.id);
  for (const s of rs.familiar.skills) familiarSkills.alias(s.name, s.sheetName ?? s.name, s.id);
  const awakenedSkills = new LabelIndex<string>();
  for (const s of rs.familiar.awakenedSkills) awakenedSkills.add(s.name, s.id);

  const spells = new LabelIndex<string>();
  for (const s of rs.spells) spells.add(spellLabel(s.id, s.name), s.id);
  for (const s of rs.spells)
    if (SPELL_LABEL[s.id]) spells.alias(s.name, spellLabel(s.id, s.name), s.id);
  const recipes = new LabelIndex<string>();
  for (const r of rs.recipes) recipes.add(recipeLabel(r.id, r.name), r.id);
  for (const r of rs.recipes)
    if (RECIPE_LABEL[r.id]) recipes.alias(r.name, recipeLabel(r.id, r.name), r.id);

  const performances = new LabelIndex<string>();
  for (const p of rs.performances.performances) performances.add(p.name, p.id);
  const rituals = new LabelIndex<string>();
  for (const r of rs.performances.rituals) rituals.add(r.name, r.id);
  const boons = new LabelIndex<string>();
  for (const b of rs.boons.boons) boons.add(b.name, b.id);
  const startingItems = new LabelIndex<string>();
  for (const i of rs.startingItems.options) startingItems.add(i.name, i.id);

  const labels: SheetLabels = {
    skills,
    subtypes,
    professions,
    familiarSkills,
    awakenedSkills,
    spells,
    recipes,
    performances,
    rituals,
    boons,
    startingItems,
  };
  cache.set(rs, labels);
  return labels;
}
