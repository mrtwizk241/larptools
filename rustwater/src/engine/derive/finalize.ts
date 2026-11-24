// Turns the replay Draft into the read-only Sheet: skill views with uses, ancestry views,
// stats from effects, and point totals.
import type { AncestryAbility } from '../../data/index.ts';
import type { SkillPart } from '../model.ts';
import {
  apEarnedByBasic,
  cumulativeCost,
  currencyOf,
  maxLevelOf,
  nextLevelCost,
} from '../rules/costs.ts';
import { effectAmount, TOTALLED_STATS } from '../rules/effects.ts';
import { PART_ORDER } from '../rules/levels.ts';
import type {
  AncestryAbilityView,
  AncestryPassiveView,
  AncestrySection,
  CheckInGrantView,
  ExtraUses,
  InfectionSection,
  PointsSection,
  Pool,
  Sheet,
  SheetSkill,
  SheetSkillPart,
  StatContribution,
  StatsSection,
  UsePeriod,
  Uses,
} from '../sheet.ts';
import { lxpTotal, type Draft } from './draft.ts';
import { buildFamiliar, buildMemory, buildOwed, buildProfession } from './sections.ts';

/** Maps a data frequency to the tracker period, or null for passive and unusual frequencies. */
export function periodOf(frequency: string, timing?: string): UsePeriod | null {
  switch (frequency) {
    case 'per-repop':
      return 'repop';
    case 'per-encounter':
      return 'encounter';
    case 'per-event':
      return 'event';
    case 'other':
      return timing === 'check-in' ? 'event' : null;
    default:
      return null;
  }
}

interface UsesGrant {
  amount: number;
  per: UsePeriod | null;
  fromSkillId: string;
  fromPart: SkillPart;
}

function buildSkills(draft: Draft): SheetSkill[] {
  const rs = draft.ruleset;
  const table = draft.skills;

  // Uses granted by effects (mastery "+1 basic use each encounter", "+1 use at level 5").
  const grants = new Map<string, UsesGrant[]>();
  for (const skill of rs.skills) {
    const entry = table.get(skill.id);
    if (!entry) continue;
    for (const part of PART_ORDER) {
      const level = entry.levels[part] ?? 0;
      const def = skill.parts[part];
      if (level <= 0 || !def?.effects) continue;
      for (const e of def.effects) {
        if (e.stat !== 'uses') continue;
        const amount = effectAmount(e, level, table);
        if (!amount) continue;
        const key = `${e.skill ?? skill.id}:${e.part ?? part}`;
        const list = grants.get(key) ?? [];
        list.push({
          amount,
          per: e.per === 'encounter' ? 'encounter' : null,
          fromSkillId: skill.id,
          fromPart: part,
        });
        grants.set(key, list);
      }
    }
  }

  const views: SheetSkill[] = [];
  for (const skill of rs.skills) {
    const entry = table.get(skill.id);
    if (!entry) continue;
    const parts: SheetSkillPart[] = [];
    for (const part of PART_ORDER) {
      const level = entry.levels[part] ?? 0;
      const def = skill.parts[part];
      if (level <= 0 || !def) continue;
      const period = periodOf(def.frequency, def.timing);
      let uses: Uses | null = period ? { count: def.usesPerRepop ?? level, per: period } : null;
      const extraUses: ExtraUses[] = [];
      for (const g of grants.get(`${skill.id}:${part}`) ?? []) {
        const per = g.per ?? uses?.per ?? null;
        if (per === null) continue;
        if (uses && uses.per === per) uses = { count: uses.count + g.amount, per };
        else
          extraUses.push({
            count: g.amount,
            per,
            fromSkillId: g.fromSkillId,
            fromPart: g.fromPart,
          });
      }
      parts.push({
        part,
        level,
        maxLevel: maxLevelOf(rs, def.costKind),
        costKind: def.costKind,
        currency: currencyOf(def.costKind),
        spent: cumulativeCost(rs, def.costKind, level),
        apEarned: def.costKind === 'basic' ? apEarnedByBasic(rs, level) : 0,
        nextCost: nextLevelCost(rs, def.costKind, level),
        frequency: def.frequency,
        timing: def.timing ?? null,
        uses,
        extraUses,
        teacher: draft.teachers.get(`${skill.id}:${part}`) ?? null,
      });
    }
    if (parts.length === 0) continue;
    const multi = skill.archetype === undefined;
    views.push({
      skillId: skill.id,
      name: skill.name,
      category: skill.category,
      type: skill.type,
      archetype: skill.archetype ?? entry.chosenArchetype,
      archetypeChosen: multi,
      parts,
    });
  }
  return views;
}

function checkInView(ability: AncestryAbility, level: number): CheckInGrantView | null {
  const g = ability.checkInGrant;
  if (!g) return null;
  const rarity = g.rarity ?? 'common';
  let resources: CheckInGrantView['resources'] = null;
  if (g.resources !== undefined) resources = { qty: g.resources, rarity };
  else if (g.resourcesPerLevel !== undefined)
    resources = { qty: g.resourcesPerLevel * level, rarity };
  return {
    resources,
    orBits: g.orBits ?? (g.orBitsPerLevel !== undefined ? g.orBitsPerLevel * level : null),
    randomDraws: g.randomDrawsPerLevel !== undefined ? g.randomDrawsPerLevel * level : null,
    stackForHigherRarity: g.stackForHigherRarity === true,
  };
}

function passiveView(a: AncestryAbility): AncestryPassiveView {
  return {
    id: a.id,
    name: a.name,
    sheetName: a.sheetName,
    frequency: a.frequency,
    checkIn: checkInView(a, 1),
    text: a.text,
  };
}

function ancestryPassives(draft: Draft): AncestryAbility[] {
  const rs = draft.ruleset;
  const ancestry = draft.ancestryId ? rs.ancestriesById[draft.ancestryId] : undefined;
  const subtype = draft.subtypeId ? rs.subtypesById[draft.subtypeId]?.subtype : undefined;
  if (!ancestry) return [];
  const list: AncestryAbility[] = [];
  if (subtype?.passive) {
    if (!rs.ancestries.rules.subtypePassiveOverridesAncestryPassive && ancestry.passive)
      list.push(ancestry.passive);
    list.push(subtype.passive);
  } else if (ancestry.passive) list.push(ancestry.passive);
  return list;
}

function buildAncestry(draft: Draft): AncestrySection | null {
  const rs = draft.ruleset;
  const ancestry = draft.ancestryId ? rs.ancestriesById[draft.ancestryId] : undefined;
  const subtype = draft.subtypeId ? rs.subtypesById[draft.subtypeId]?.subtype : undefined;
  if (!ancestry || !subtype) return null;
  const usesPerLevel = rs.ancestries.rules.usesPerLevel;

  const abilityView = (
    slot: 'shared' | 'subtype',
    a: AncestryAbility,
    level: number,
  ): AncestryAbilityView => {
    let frequency: string = a.frequency;
    let timing: string | undefined = a.timing;
    let copied: AncestryAbilityView['copied'] = null;
    if (a.choice && draft.fromLegendsChoice) {
      const chosen = rs.ancestryAbilitiesById[draft.fromLegendsChoice]?.ability;
      if (chosen) {
        frequency = chosen.frequency;
        timing = chosen.timing;
        copied = { id: chosen.id, name: chosen.name, text: chosen.text };
      }
    }
    const period = periodOf(frequency, timing);
    return {
      slot,
      id: a.id,
      name: a.name,
      sheetName: a.sheetName,
      level,
      frequency,
      uses: period ? { count: level * usesPerLevel, per: period } : null,
      copied,
      checkIn: checkInView(a, level),
      text: a.text,
    };
  };

  return {
    ancestryId: ancestry.id,
    ancestryName: ancestry.name,
    subtypeId: subtype.id,
    subtypeName: subtype.name,
    passives: ancestryPassives(draft).map(passiveView),
    abilities: [
      abilityView('shared', ancestry.sharedAbility, draft.abilityLevels.shared),
      abilityView('subtype', subtype.ability, draft.abilityLevels.subtype),
    ],
    fromLegendsChoice: draft.fromLegendsChoice,
    maxAge: ancestry.maxAge,
    ages: ancestry.ages,
  };
}

function buildStats(draft: Draft): StatsSection {
  const rs = draft.ruleset;
  const base = rs.ruleset.baseStats;
  const contributions: StatContribution[] = [
    {
      stat: 'maxHealth',
      amount: base.maxHealth,
      source: { kind: 'base' },
      condition: null,
      note: null,
    },
    { stat: 'armor', amount: base.armor, source: { kind: 'base' }, condition: null, note: null },
  ];

  const ancestryEffects: { a: AncestryAbility; level: number }[] = ancestryPassives(draft).map(
    (a) => ({ a, level: 1 }),
  );
  const ancestry = draft.ancestryId ? rs.ancestriesById[draft.ancestryId] : undefined;
  const subtype = draft.subtypeId ? rs.subtypesById[draft.subtypeId]?.subtype : undefined;
  if (ancestry)
    ancestryEffects.push({ a: ancestry.sharedAbility, level: draft.abilityLevels.shared });
  if (subtype) ancestryEffects.push({ a: subtype.ability, level: draft.abilityLevels.subtype });
  for (const { a, level } of ancestryEffects) {
    for (const e of a.effects ?? []) {
      if (!TOTALLED_STATS.has(e.stat) || e.skill !== undefined) continue;
      const amount = effectAmount(e, level);
      if (!amount) continue;
      contributions.push({
        stat: e.stat,
        amount,
        source: { kind: 'ancestry', id: a.id },
        condition: e.condition ?? null,
        note: e.note ?? null,
      });
    }
  }

  for (const skill of rs.skills) {
    const entry = draft.skills.get(skill.id);
    if (!entry) continue;
    for (const part of PART_ORDER) {
      const level = entry.levels[part] ?? 0;
      const def = skill.parts[part];
      if (level <= 0 || !def?.effects) continue;
      for (const e of def.effects) {
        if (!TOTALLED_STATS.has(e.stat) || e.skill !== undefined) continue;
        const amount = effectAmount(e, level, draft.skills);
        if (!amount) continue;
        contributions.push({
          stat: e.stat,
          amount,
          source: { kind: 'skill', id: skill.id, part },
          condition: e.condition ?? null,
          note: e.note ?? null,
        });
      }
    }
  }

  const totals: Record<string, number> = {};
  for (const c of contributions)
    if (c.condition === null) totals[c.stat] = (totals[c.stat] ?? 0) + c.amount;
  return {
    maxHealth: totals['maxHealth'] ?? 0,
    armor: totals['armor'] ?? 0,
    totals,
    contributions,
  };
}

function buildInfection(draft: Draft): InfectionSection | null {
  const inf = draft.infection;
  if (!inf) return null;
  const def = draft.ruleset.infection.tracks.find((t) => t.id === inf.track);
  const max = def?.max ?? 10;
  return {
    track: inf.track,
    label: def?.name ?? inf.track,
    base: inf.base,
    extra: inf.extra,
    current: inf.current,
    max,
    reachedMax: inf.current >= max,
  };
}

function buildPoints(draft: Draft): PointsSection {
  const rs = draft.ruleset;
  const ap: Record<string, Pool> = {};
  const poolIds = new Set([
    ...rs.archetypes.map((a) => a.id),
    ...Object.keys(draft.apEarned),
    ...Object.keys(draft.apSpent),
  ]);
  for (const id of poolIds) {
    const earned = draft.apEarned[id] ?? 0;
    const spent = draft.apSpent[id] ?? 0;
    ap[id] = { earned, spent, available: earned - spent };
  }
  const total = draft.ledgerTotals.cxp;
  const lxp = draft.created ? lxpTotal(draft) : 0;
  return {
    cxp: {
      total,
      earned: draft.cxpEarned,
      capRemaining: Math.max(0, rs.ruleset.earnedCxpCap.amount - draft.cxpEarned),
      spent: draft.cxpSpent,
      available: total - draft.cxpSpent,
    },
    ap,
    lxp: { total: lxp, spent: draft.lxpSpent, available: lxp - draft.lxpSpent },
    pxp: {
      total: draft.ledgerTotals.pxp,
      spent: draft.pxpSpent,
      available: draft.ledgerTotals.pxp - draft.pxpSpent,
    },
    fp: {
      total: draft.ledgerTotals.fp,
      spent: draft.fpSpent,
      available: draft.ledgerTotals.fp - draft.fpSpent,
    },
    shinies: { balance: draft.ledgerTotals.shinies },
  };
}

export function finalize(draft: Draft): Sheet {
  const rs = draft.ruleset;
  const p = draft.profile;
  const legacyNotes = draft.storyNotes.find((n) => n.id === draft.legacyNotesId)?.text ?? '';
  const warnings = [...draft.warnings];
  const memory = buildMemory(draft, warnings);
  return {
    rulesetId: rs.id,
    created: draft.created,
    profile: { ...p, notes: legacyNotes },
    ancestry: buildAncestry(draft),
    infection: buildInfection(draft),
    points: buildPoints(draft),
    skills: buildSkills(draft),
    stats: buildStats(draft),
    events: draft.events,
    voidedCheckIns: draft.voidedCheckIns,
    ledger: draft.ledger,
    shinyPurchases: draft.shinyPurchases,
    memory,
    profession: buildProfession(draft),
    familiar: buildFamiliar(draft),
    boons: draft.boons,
    startingItems: draft.startingItems,
    owed: buildOwed(draft),
    retired: draft.retired,
    requestDecisions: draft.requestDecisions,
    traumas: draft.traumas,
    storyNotes: draft.storyNotes,
    warnings,
    lastSeq: draft.lastSeq,
  };
}
