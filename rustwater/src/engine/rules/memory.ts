// Memorization slot pools ([MAG-MEMORIZE], [CRF-MEMORIZE], [MULTI-BARD-MEMO], [MULTI-RIT]).
//
// - Spell and recipe pools: one per school or craft from its basic, adept, and advanced levels
//   (each part's `memorizationSlots` in the data), plus a universal pool from Spell or Recipe
//   Memorization levels (pool "any").
// - Performances: one pool. Every Bardic Performance level (basic, adept, advanced) gives a slot
//   (DECISIONS Q-MULTI-2), plus Bardic Performance Memorization levels.
// - Rituals: one pool. Ritualism grants Ritual Circle (no slot) and one chosen ritual (one slot),
//   plus Ritual Memorization levels.
import type { Ruleset, Skill } from '../../data/index.ts';
import type { SkillPart } from '../model.ts';
import type { MemorizedEntry, MemorySlotPool } from '../sheet.ts';
import { getLevel, isOwned, PART_ORDER, type LevelTable } from './levels.ts';

export type SlotKind = MemorySlotPool['kind'];

export interface PoolDef {
  readonly kind: SlotKind;
  readonly pool: string;
  readonly name: string;
  readonly universal: boolean;
  /** School or craft id for school and craft pools. */
  readonly area: string | null;
  readonly memorizationSkillId: string | null;
}

export const UNIVERSAL = 'universal';

export function poolId(kind: 'spell' | 'recipe', area: string): string {
  return `${kind}-${area}`;
}

function memorizationSkillFor(ruleset: Ruleset, kind: 'spell' | 'recipe'): string | null {
  for (const skill of ruleset.skills)
    for (const part of PART_ORDER) {
      const slots = skill.parts[part]?.memorizationSlots;
      if (slots?.kind === kind && slots.pool === 'any') return skill.id;
    }
  return null;
}

/** The skill whose parts unlock performance tiers (Bardic Performance). */
export function performanceSkill(ruleset: Ruleset): Skill | undefined {
  return ruleset.skills.find((s) => PART_ORDER.some((p) => s.parts[p]?.unlocks !== undefined));
}

/** The skill that grants rituals when learned (Ritualism). */
export function ritualSkill(ruleset: Ruleset): Skill | undefined {
  return ruleset.skills.find((s) => PART_ORDER.some((p) => s.parts[p]?.grants !== undefined));
}

/** The memorization skill that follows `skillId`'s archetype (for example Ritual Memorization). */
function memorizationSkillOf(ruleset: Ruleset, skillId: string | undefined): Skill | undefined {
  if (skillId === undefined) return undefined;
  return ruleset.skills.find(
    (s) =>
      s.type === 'memorization' &&
      s.archetypeRule?.kind === 'same-as-skill' &&
      s.archetypeRule.skill === skillId,
  );
}

/** Every slot pool in display order. */
export function poolDefs(ruleset: Ruleset): PoolDef[] {
  const defs: PoolDef[] = [];
  const spellMem = memorizationSkillFor(ruleset, 'spell');
  for (const s of ruleset.ruleset.magicSchools)
    defs.push({
      kind: 'spell',
      pool: poolId('spell', s.id),
      name: s.name,
      universal: false,
      area: s.id,
      memorizationSkillId: null,
    });
  defs.push({
    kind: 'spell',
    pool: poolId('spell', UNIVERSAL),
    name: 'Universal',
    universal: true,
    area: null,
    memorizationSkillId: spellMem,
  });
  const recipeMem = memorizationSkillFor(ruleset, 'recipe');
  for (const d of ruleset.ruleset.craftingDisciplines)
    defs.push({
      kind: 'recipe',
      pool: poolId('recipe', d.id),
      name: d.name,
      universal: false,
      area: d.id,
      memorizationSkillId: null,
    });
  defs.push({
    kind: 'recipe',
    pool: poolId('recipe', UNIVERSAL),
    name: 'Universal',
    universal: true,
    area: null,
    memorizationSkillId: recipeMem,
  });
  defs.push({
    kind: 'performance',
    pool: 'performance',
    name: 'Performances',
    universal: false,
    area: null,
    memorizationSkillId: memorizationSkillOf(ruleset, performanceSkill(ruleset)?.id)?.id ?? null,
  });
  defs.push({
    kind: 'ritual',
    pool: 'ritual',
    name: 'Rituals',
    universal: false,
    area: null,
    memorizationSkillId: memorizationSkillOf(ruleset, ritualSkill(ruleset)?.id)?.id ?? null,
  });
  return defs;
}

interface Breakdown {
  fromBasic: number;
  fromAdept: number;
  fromAdvanced: number;
  fromMemorization: number;
  fromGrant: number;
}

function addByPart(b: Breakdown, part: SkillPart, amount: number): void {
  if (part === 'basic') b.fromBasic += amount;
  else if (part === 'adept') b.fromAdept += amount;
  else if (part === 'advanced') b.fromAdvanced += amount;
  else b.fromMemorization += amount;
}

/** Slot pools with capacity from `table` and usage from `entries`. */
export function computePools(
  ruleset: Ruleset,
  table: LevelTable,
  entries: readonly Pick<MemorizedEntry, 'pool'>[],
): MemorySlotPool[] {
  const defs = poolDefs(ruleset);
  const breakdown = new Map<string, Breakdown>();
  for (const d of defs)
    breakdown.set(d.pool, {
      fromBasic: 0,
      fromAdept: 0,
      fromAdvanced: 0,
      fromMemorization: 0,
      fromGrant: 0,
    });

  for (const skill of ruleset.skills) {
    for (const part of PART_ORDER) {
      const def = skill.parts[part];
      const level = getLevel(table, skill.id, part);
      if (!def || level <= 0) continue;
      const slots = def.memorizationSlots;
      if (slots) {
        const id = poolId(slots.kind, slots.pool === 'any' ? UNIVERSAL : slots.pool);
        const b = breakdown.get(id);
        if (b) addByPart(b, slots.pool === 'any' ? 'main' : part, level * slots.perLevel);
      }
      if (def.unlocks?.performanceTier !== undefined) {
        const b = breakdown.get('performance');
        if (b) addByPart(b, part, level);
      }
      for (const g of def.grants ?? []) {
        const b = breakdown.get('ritual');
        if (b && 'chooseRituals' in g) b.fromGrant += g.chooseRituals;
      }
    }
  }
  for (const d of defs) {
    if ((d.kind === 'performance' || d.kind === 'ritual') && d.memorizationSkillId) {
      const b = breakdown.get(d.pool);
      if (b) b.fromMemorization += getLevel(table, d.memorizationSkillId, 'main');
    }
  }

  const used = new Map<string, number>();
  for (const e of entries) if (e.pool) used.set(e.pool, (used.get(e.pool) ?? 0) + 1);

  return defs.map((d) => {
    const b = breakdown.get(d.pool) ?? {
      fromBasic: 0,
      fromAdept: 0,
      fromAdvanced: 0,
      fromMemorization: 0,
      fromGrant: 0,
    };
    const slots = b.fromBasic + b.fromAdept + b.fromAdvanced + b.fromMemorization + b.fromGrant;
    const u = used.get(d.pool) ?? 0;
    return {
      kind: d.kind,
      pool: d.pool,
      name: d.name,
      total: slots,
      slots,
      used: u,
      free: slots - u,
      ...b,
      universal: d.universal,
      memorizationSkillId: d.memorizationSkillId,
    };
  });
}

/** Rituals known automatically while the ritual skill is owned (Ritual Circle). */
export function autoRituals(
  ruleset: Ruleset,
  table: LevelTable,
): { kind: 'ritual'; refId: string; name: string }[] {
  const skill = ritualSkill(ruleset);
  if (!skill || !isOwned(table.get(skill.id))) return [];
  const out: { kind: 'ritual'; refId: string; name: string }[] = [];
  for (const part of PART_ORDER)
    for (const g of skill.parts[part]?.grants ?? [])
      if ('ritual' in g) {
        const r = ruleset.ritualsById[g.ritual];
        if (r) out.push({ kind: 'ritual', refId: r.id, name: r.name });
      }
  return out;
}

export interface MemoryTarget {
  readonly kind: 'spell' | 'recipe' | 'performance' | 'ritual';
  readonly refId: string;
  readonly name: string;
  readonly rank: string | null;
  /** Pool ids this item may go in, preferred first (school or craft pool, then universal). */
  readonly pools: readonly string[];
  /** What the character must know, as a readable list; empty when met. */
  readonly unmet: readonly string[];
  /** Set when the item can never be memorized (mastery spell, automatic ritual). */
  readonly notMemorizable: string | null;
  /** The slot value written in the action for each pool id. */
  readonly slotOf: (pool: string) => string;
}

function rankLabel(rank: string): string {
  return rank === 'basic' ? '' : ` ${rank.charAt(0).toUpperCase()}${rank.slice(1)}`;
}

/**
 * What memorizing `refId` of `kind` needs: its pools, the knowledge required (the school or craft
 * at the item's rank, the performance tier, Ritualism), or why it cannot be memorized. Null when
 * the id is unknown.
 */
export function memoryTarget(
  ruleset: Ruleset,
  table: LevelTable,
  kind: 'spell' | 'recipe' | 'performance' | 'ritual',
  refId: string,
): MemoryTarget | null {
  const unmet: string[] = [];
  const need = (skillId: string, part: SkillPart, label: string): void => {
    if (getLevel(table, skillId, part) <= 0) unmet.push(label);
  };
  if (kind === 'spell') {
    const spell = ruleset.spellsById[refId];
    if (!spell) return null;
    if (spell.mastery)
      return {
        kind,
        refId,
        name: spell.name,
        rank: spell.rank,
        pools: [],
        unmet,
        notMemorizable: `${spell.name} is a mastery magic ability; there is nothing to memorize.`,
        slotOf: () => UNIVERSAL,
      };
    const school = ruleset.ruleset.magicSchools.find((s) => s.id === spell.school);
    const skillId = school?.skill ?? spell.school;
    const skillName = ruleset.skillsById[skillId]?.name ?? skillId;
    need(skillId, spell.rank, `${skillName}${rankLabel(spell.rank)}`);
    return {
      kind,
      refId,
      name: spell.name,
      rank: spell.rank,
      pools: [poolId('spell', spell.school), poolId('spell', UNIVERSAL)],
      unmet,
      notMemorizable: null,
      slotOf: (p) => (p === poolId('spell', UNIVERSAL) ? UNIVERSAL : spell.school),
    };
  }
  if (kind === 'recipe') {
    const recipe = ruleset.recipesById[refId];
    if (!recipe) return null;
    if (recipe.mastery) {
      const skill = ruleset.skillsById[recipe.masterySkill];
      if (!isOwned(table.get(recipe.masterySkill))) unmet.push(skill?.name ?? recipe.masterySkill);
      return {
        kind,
        refId,
        name: recipe.name,
        rank: 'mastery',
        pools: [poolId('recipe', UNIVERSAL)],
        unmet,
        notMemorizable: null,
        slotOf: () => UNIVERSAL,
      };
    }
    const craft = ruleset.ruleset.craftingDisciplines.find((d) => d.id === recipe.discipline);
    const skillId = craft?.skill ?? recipe.discipline;
    const skillName = ruleset.skillsById[skillId]?.name ?? skillId;
    need(skillId, recipe.rank, `${skillName}${rankLabel(recipe.rank)}`);
    return {
      kind,
      refId,
      name: recipe.name,
      rank: recipe.rank,
      pools: [poolId('recipe', recipe.discipline), poolId('recipe', UNIVERSAL)],
      unmet,
      notMemorizable: null,
      slotOf: (p) => (p === poolId('recipe', UNIVERSAL) ? UNIVERSAL : recipe.discipline),
    };
  }
  if (kind === 'performance') {
    const perf = ruleset.performancesById[refId];
    if (!perf) return null;
    const skill = performanceSkill(ruleset);
    const part = skill
      ? PART_ORDER.find((p) => skill.parts[p]?.unlocks?.performanceTier === perf.tier)
      : undefined;
    if (skill && part) need(skill.id, part, `${skill.name}${rankLabel(perf.tier)}`);
    return {
      kind,
      refId,
      name: perf.name,
      rank: perf.tier,
      pools: ['performance'],
      unmet,
      notMemorizable: null,
      slotOf: () => 'performance',
    };
  }
  const ritual = ruleset.ritualsById[refId];
  if (!ritual) return null;
  const skill = ritualSkill(ruleset);
  if (skill && !isOwned(table.get(skill.id))) unmet.push(skill.name);
  return {
    kind,
    refId,
    name: ritual.name,
    rank: null,
    pools: ['ritual'],
    unmet,
    notMemorizable:
      ritual.autoLearned === true
        ? `${ritual.name} is learned automatically with ${skill?.name ?? 'its skill'}.`
        : null,
    slotOf: () => 'ritual',
  };
}

/** Pool id for a stored entry's kind and slot, or null for knowledges. */
export function poolForSlot(kind: MemorizedEntry['kind'], slot: string): string | null {
  if (kind === 'knowledge') return null;
  if (kind === 'performance') return 'performance';
  if (kind === 'ritual') return 'ritual';
  return poolId(kind, slot);
}
