// Sheet views for memory, profession, familiar, and owed rewards, built from the replay Draft.
// Called by finalize().
import { checkInOwedId } from '../actions/owed.ts';
import { autoRituals, computePools } from '../rules/memory.ts';
import {
  essenceTotal,
  familiarLevelFp,
  professionCumulativeCost,
  professionLevelCost,
  professionUses,
} from '../rules/progression.ts';
import type {
  FamiliarSection,
  MemorySection,
  OwedEntry,
  ProfessionSection,
  ProfessionSkillView,
  SheetWarning,
} from '../sheet.ts';
import type { UsePeriod } from '../sheet.ts';
import type { Draft } from './draft.ts';

function professionPeriod(frequency: string): UsePeriod {
  if (frequency === 'per-encounter') return 'encounter';
  if (frequency === 'per-event') return 'event';
  return 'repop';
}

/** Memory entries and slot pools; adds a warning for each pool over capacity. */
export function buildMemory(draft: Draft, warnings: SheetWarning[]): MemorySection {
  const rs = draft.ruleset;
  const slots = computePools(rs, draft.skills, draft.memory);
  for (const pool of slots)
    if (pool.free < 0)
      warnings.push({
        actionId: null,
        code: 'MEMORY_OVER_CAPACITY',
        message: `${pool.kind === 'spell' || pool.kind === 'recipe' ? `${pool.name} ${pool.kind}` : pool.name} slots: ${pool.used} used, only ${pool.slots} available.`,
      });
  return {
    entries: draft.memory.map((e) => ({ ...e })),
    slots,
    autoLearned: autoRituals(rs, draft.skills),
  };
}

export function buildProfession(draft: Draft): ProfessionSection | null {
  const prof = draft.profession;
  if (prof === null) return null;
  const rs = draft.ruleset;
  const profession = rs.professionsById[prof.professionId];
  if (!profession) return null;
  const max = rs.professions.rules.maxLevel;
  const skills: ProfessionSkillView[] = profession.skills.map((s) => {
    const level = prof.levels[s.id] ?? 0;
    const uses = professionUses(rs, s.slot, level);
    const last = [...prof.history].reverse().find((h) => h.skillId === s.id);
    const tiers = s.tiers
      ? (['basic', 'adept', 'advanced'] as const).map((tier) => ({
          tier,
          minLevel: s.tiers?.[tier].minLevel ?? 1,
          unlocked: level >= (s.tiers?.[tier].minLevel ?? 1),
          text: s.tiers?.[tier].text ?? '',
        }))
      : [];
    return {
      id: s.id,
      name: s.name,
      sheetName: s.sheetName,
      slot: s.slot,
      frequency: s.frequency,
      level,
      maxLevel: max,
      pxpSpent: professionCumulativeCost(rs, level),
      nextCost: level >= max ? null : professionLevelCost(rs, level + 1),
      uses: { count: uses.basic, per: professionPeriod(s.frequency) },
      adeptUpgrades: uses.adeptUpgrades,
      advancedUpgrades: uses.advancedUpgrades,
      text: s.text ?? null,
      tiers,
      lastEventKey: last?.eventKey ?? null,
    };
  });
  return {
    professionId: profession.id,
    name: profession.name,
    levels: { ...prof.levels },
    kind: profession.kind,
    passive: {
      id: profession.passive.id,
      name: profession.passive.name,
      sheetName: profession.passive.sheetName,
      text: profession.passive.text,
    },
    skills,
    startedAt: prof.startedAt,
    startedEventKey: prof.startedEventKey,
    history: prof.history.map((h) => ({ ...h })),
  };
}

export function buildFamiliar(draft: Draft): FamiliarSection | null {
  const fam = draft.familiar;
  if (fam === null) return null;
  const rs = draft.ruleset;
  const ess = rs.familiar.essence;
  const total = essenceTotal(rs, fam.level);
  const slotsTotal = ess.baseSkillSlots + fam.extraSlots;
  const awakened = fam.awakenedSkillId ? rs.awakenedSkillsById[fam.awakenedSkillId] : undefined;
  return {
    name: fam.name,
    creature: fam.creature,
    level: fam.level,
    awakened: fam.awakenedSkillId !== null,
    awakenedSkill: awakened ? { id: awakened.id, name: awakened.name, text: awakened.text } : null,
    skills: fam.learned.map((l) => l.skillId),
    learned: fam.learned.map((l) => ({ ...l })),
    essence: { total, spent: fam.essenceSpent, available: total - fam.essenceSpent },
    slots: {
      base: ess.baseSkillSlots,
      extra: fam.extraSlots,
      maxExtra: ess.maxExtraSlots,
      total: slotsTotal,
      used: fam.learned.length,
      free: slotsTotal - fam.learned.length,
    },
    nextLevelFp: fam.level >= rs.familiar.levels.max ? null : familiarLevelFp(rs, fam.level + 1),
    bondedAt: fam.bondedAt,
  };
}

/**
 * Check-in item rewards first (in event order), then delivered rewards from voided check-ins,
 * then manual owed rewards.
 */
export function buildOwed(draft: Draft): OwedEntry[] {
  const out: OwedEntry[] = [];
  const entry = (
    id: string,
    text: string,
    eventKey: string | null,
    source: OwedEntry['source'],
  ): OwedEntry => {
    const at = draft.owedDelivered.get(id) ?? null;
    return { id, text, eventKey, delivered: at !== null, source, deliveredAt: at };
  };
  for (const e of draft.events)
    e.owed.forEach((text, i) =>
      out.push(entry(checkInOwedId(e.actionId, i), text, e.key, 'check-in')),
    );
  for (const o of draft.voidedOwed) out.push(entry(o.id, o.text, o.eventKey, 'check-in'));
  for (const o of draft.owed) out.push(entry(o.id, o.text, o.eventKey, 'manual'));
  return out;
}
