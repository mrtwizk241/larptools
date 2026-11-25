// Journals: spellbook, crafting journal, performance record, rituals ([MAG-CAST], [CRF-JOURNAL],
// [PERF-LEARN], [MAG-RIT]). An entry can be used now when the character owns the matching skill
// and the Technique for the entry's level (Basic only needs the skill).
// - Q-MAG-3, Q-CRF-5: entries the character cannot use yet are allowed, shown as not usable.
// - Q-SKL-9: performing or learning a performance note of a level needs that Technique.
// - Q-MAG-2: rituals above Basic need the Ritualism Technique, plus every required magic at the
//   ritual's required Technique (Expert).
// - Calling effects from the data: `canCastFromSpellbook: false` (Sorcerer) blocks spellbook
//   casting; `blockedMagicSchool` (Elemental Mage) blocks the opposing element.
import type { SyRuleset } from '../../data/index.ts';
import type { NamedLevelId } from '../model.ts';
import type { JournalKind } from '../sheet.ts';
import { hasTechnique, label, namedLevelUnlocked, type OwnedLookup } from './skills.ts';

/** Skill ids the data does not name for performances and rituals. */
export const PERFORMANCE_SKILL_ID = 'performance';
export const RITUAL_SKILL_ID = 'ritualism';

export interface JournalRef {
  readonly name: string;
  readonly level: NamedLevelId;
  /** Spell school, recipe craft, `performance`, or `ritual`. */
  readonly group: string;
  /** The skill whose Technique the entry's level needs. */
  readonly skillId: string;
}

/** Looks up a journal entry's rules data, or null when the id is unknown. */
export function journalRef(
  ruleset: SyRuleset,
  kind: JournalKind,
  refId: string,
): JournalRef | null {
  switch (kind) {
    case 'spell': {
      const spell = ruleset.spellsById[refId];
      const school = spell
        ? ruleset.ruleset.magicSchools.find((s) => s.id === spell.school)
        : undefined;
      return spell && school
        ? { name: spell.name, level: spell.level, group: spell.school, skillId: school.skill }
        : null;
    }
    case 'recipe': {
      const recipe = ruleset.recipesById[refId];
      return recipe
        ? { name: recipe.name, level: recipe.level, group: recipe.craft, skillId: recipe.craft }
        : null;
    }
    case 'performance': {
      const perf = ruleset.performancesById[refId];
      return perf
        ? {
            name: perf.name,
            level: perf.level,
            group: 'performance',
            skillId: PERFORMANCE_SKILL_ID,
          }
        : null;
    }
    case 'ritual': {
      const ritual = ruleset.ritualsById[refId];
      return ritual
        ? { name: ritual.name, level: ritual.level, group: 'ritual', skillId: RITUAL_SKILL_ID }
        : null;
    }
  }
}

export interface JournalContext {
  readonly owned: OwnedLookup;
  /** The active Calling forbids casting from a spellbook. */
  readonly spellbookBlocked: boolean;
  /** Element ids the active Calling blocks. */
  readonly blockedSchools: readonly string[];
}

/** "Fire Magic", "Fire Magic (Expert Technique)". */
function needs(ruleset: SyRuleset, skillId: string, level: NamedLevelId): string {
  const name = ruleset.skillsById[skillId]?.name ?? skillId;
  return level === 'basic' ? name : `${name} (${label(level)} Technique)`;
}

/** Whether a journal entry can be used now, and why not. */
export function journalUsability(
  ruleset: SyRuleset,
  kind: JournalKind,
  refId: string,
  ctx: JournalContext,
): { usable: boolean; reason: string | null } {
  const ref = journalRef(ruleset, kind, refId);
  if (!ref) return { usable: false, reason: 'Unknown entry.' };
  if (kind === 'spell') {
    if (ctx.spellbookBlocked)
      return { usable: false, reason: 'The active Calling cannot cast from a spellbook.' };
    if (ctx.blockedSchools.includes(ref.group))
      return { usable: false, reason: 'The active Calling blocks this element.' };
  }
  if (!namedLevelUnlocked(ctx.owned(ref.skillId), ref.level))
    return { usable: false, reason: `Needs ${needs(ruleset, ref.skillId, ref.level)}.` };
  if (kind === 'ritual') {
    const ritual = ruleset.ritualsById[refId];
    const missing = (ritual?.requiredMagic ?? []).filter(
      (m) => !hasTechnique(ctx.owned(m), ritual?.requiredTechnique ?? 'expert'),
    );
    if (ritual && missing.length > 0)
      return {
        usable: false,
        reason: `Needs ${missing.map((m) => needs(ruleset, m, ritual.requiredTechnique)).join(' and ')}.`,
      };
  }
  return { usable: true, reason: null };
}
