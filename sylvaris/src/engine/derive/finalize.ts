// Turns the replay Draft into the read-only Sheet: skill views with abilities and teaching
// records, race and Calling sections, stats, journals, points, and the record lists.
import type { SyRuleset, SySkill } from '../../data/index.ts';
import { NAMED_LEVELS, TECHNIQUES } from '../model.ts';
import { callingTiers, tierGap } from '../rules/calling.ts';
import { nextLevelCost, skillCurrency, techniqueRow } from '../rules/costs.ts';
import { journalRef, journalUsability } from '../rules/journal.ts';
import {
  abilityStates,
  namedLevelUnlocked,
  NOT_OWNED,
  refundableSteps,
  techniqueTier,
  type OwnedSkill,
} from '../rules/skills.ts';
import {
  displayContext,
  displayRuleText,
  displaySkillName,
  naturalWeaponText,
} from '../rules/displayName.ts';
import { computeStats, skillCounts } from '../rules/stats.ts';
import type {
  CallingSection,
  ChoiceValue,
  Choices,
  JournalEntry,
  JournalsSection,
  PointsSection,
  RaceSection,
  Sheet,
  SheetSkill,
  StatsSection,
  TeachingRecord,
} from '../sheet.ts';
import { activeCalling, ownedOf, xpEarnedForCap, type Draft, type DraftCalling } from './draft.ts';

function choiceString(value: ChoiceValue | undefined): string | null {
  if (value === undefined) return null;
  return typeof value === 'string' ? value : (value[0] ?? null);
}

function choiceList(value: ChoiceValue | undefined): string[] {
  if (value === undefined) return [];
  return typeof value === 'string' ? [value] : [...value];
}

function buildSkills(draft: Draft, activeId: string): SheetSkill[] {
  const rs = draft.ruleset;
  const callingChoices = (callingId: string | undefined): Choices =>
    draft.callings.filter((c) => c.callingId === callingId).at(-1)?.choices ?? {};
  const views: SheetSkill[] = [];
  const display = displayContext(
    rs,
    draft.raceId ? { raceId: draft.raceId, choices: draft.raceChoices } : null,
  );
  for (const skill of Object.values(rs.skillsById)) {
    const entry = draft.skills.get(skill.id);
    if (!entry) continue;
    const owned: OwnedSkill = { level: entry.level, techniques: entry.techniques };
    let mirror: SySkill | undefined;
    if (skill.mirrorsChoice !== undefined && skill.category === 'calling') {
      const id = choiceString(callingChoices(skill.callingId)[skill.mirrorsChoice]);
      mirror = id ? rs.skillsById[id] : undefined;
    }
    const tier = techniqueTier(owned);
    const next = TECHNIQUES[tier];
    const row = next ? techniqueRow(rs, next) : undefined;
    const teaching: TeachingRecord[] = [];
    for (const named of NAMED_LEVELS) {
      const t = entry.teaching.get(named);
      if (!t) continue;
      teaching.push({
        step: named,
        teacher: t.teacher,
        viaMt: t.viaMt,
        eventKey: t.eventKey,
        atCreation: t.atCreation,
        unverified: !t.atCreation && t.teacher === null && t.viaMt === null,
        actionId: t.actionId,
      });
    }
    views.push({
      skillId: skill.id,
      name: skill.name,
      displayName: displaySkillName(skill.name, display),
      category: skill.category,
      raceId: skill.category === 'racial' ? skill.raceId : null,
      callingId: skill.category === 'calling' ? skill.callingId : null,
      advanced: skill.advanced,
      level: owned.level,
      maxLevel: rs.ruleset.skills.maxLevel,
      techniques: [...owned.techniques],
      maxUses: owned.level,
      currency: skillCurrency(skill),
      spent: entry.spent,
      nextLevelCost: nextLevelCost(rs, owned.level),
      nextTechnique:
        next && row
          ? {
              technique: next,
              cost: row.cost,
              needsLevel: row.level,
              levelReached: owned.level >= row.level,
            }
          : null,
      abilities: abilityStates(mirror ?? skill, owned).map((a) => ({
        ...a,
        summary: displayRuleText(a.summary, display),
      })),
      teaching,
      locked: skill.category === 'calling' && skill.callingId !== activeId,
      mirrors: mirror ? { skillId: mirror.id, name: displaySkillName(mirror.name, display) } : null,
      refundable: refundableSteps(rs, owned),
      requirement: skill.requirement ?? null,
    });
  }
  return views;
}

function buildRace(draft: Draft, stats: StatsSection): RaceSection | null {
  const rs = draft.ruleset;
  const race = draft.raceId ? rs.racesById[draft.raceId] : undefined;
  if (!race) return null;
  const languageName = (id: string) => rs.ruleset.languages.find((l) => l.id === id)?.name ?? id;
  const literacyId = draft.literacy === 'common' ? 'common' : race.language;
  const sizeChoice = race.size === 'choice' ? choiceString(draft.raceChoices.size) : race.size;
  const innateIds = new Set(race.innate.map((i) => i.id));
  const conditional: StatsSection['lifePoints']['conditional'][number][] = [];
  for (const line of [stats.lifePoints, stats.armorPoints])
    for (const s of line.conditional) conditional.push(s);
  for (const s of stats.passiveDamage.dualWield.conditional) conditional.push(s);
  return {
    raceId: race.id,
    name: race.name,
    size: sizeChoice,
    lifespan: race.lifespan,
    language: { id: race.language, name: languageName(race.language) },
    literacy: draft.literacy,
    literacyLanguage: { id: literacyId, name: languageName(literacyId) },
    choices: { ...draft.raceChoices },
    innates: race.innate.map((i) => ({
      id: i.id,
      kind: i.kind,
      summary: displayRuleText(
        naturalWeaponText(i, draft.raceChoices),
        displayContext(rs, { raceId: race.id, choices: draft.raceChoices }),
      ),
      uses: i.uses ?? null,
      frequency: i.frequency ?? null,
      grantsSkillUse: i.grantsSkillUse ?? null,
    })),
    naturalWeapon: stats.naturalWeapons.find((w) => w.source === `${race.name} innate`) ?? null,
    conditionalEffects: conditional.filter((s) => {
      const src = s.source;
      if (src.kind === 'race') return innateIds.has(src.id);
      return src.kind === 'skill' && race.skills.some((k) => k.id === src.id);
    }),
    racialSkillIds: race.skills.map((s) => s.id),
    sheetFlags: race.sheetFlags ? { ...race.sheetFlags } : null,
  };
}

function buildCalling(draft: Draft, c: DraftCalling): CallingSection | null {
  const rs = draft.ruleset;
  const calling = rs.callingsById[c.callingId];
  if (!calling) return null;
  const owned = (id: string) => ownedOf(draft, id);
  const tiers = callingTiers(calling, owned);
  const gap = tierGap(tiers);
  const maxGap = rs.ruleset.calling.maxTechniqueGap;
  const techniqueEvents: CallingSection['techniqueEvents'][number][] = [];
  for (const s of calling.skills)
    for (const t of TECHNIQUES) {
      const rec = draft.skills.get(s.id)?.teaching.get(t);
      if (rec) techniqueEvents.push({ skillId: s.id, technique: t, eventKey: rec.eventKey });
    }
  return {
    callingId: calling.id,
    name: calling.name,
    status: c.leftAt === null ? 'active' : 'left',
    innate: { name: calling.innate.name, summary: calling.innate.summary },
    detriment: calling.detriment?.summary ?? null,
    choices: { ...c.choices },
    startedAt: c.startedAt,
    startedEventKey: c.startedEventKey,
    leftAt: c.leftAt,
    leftEventKey: c.leftEventKey,
    leftReason: c.leftReason,
    skillIds: calling.skills.map((s) => s.id),
    balance: { tiers, gap, maxGap, ok: gap <= maxGap },
    techniqueEvents,
  };
}

function buildPoints(draft: Draft): PointsSection {
  const rs = draft.ruleset.ruleset;
  const t = draft.ledgerTotals;
  const xpEarned = xpEarnedForCap(draft);
  return {
    xp: {
      earned: t.xp,
      cap: rs.xp.earnedCap,
      capRemaining: Math.max(0, rs.xp.earnedCap - xpEarned),
      spent: draft.xpSpent,
      available: t.xp - draft.xpSpent,
    },
    cxp: {
      earned: t.cxp,
      cap: rs.cxp.earnedCap,
      capRemaining: Math.max(0, rs.cxp.earnedCap - t.cxp),
      spent: draft.cxpSpent,
      available: t.cxp - draft.cxpSpent,
    },
    axp: { earned: t.axp, spent: draft.axpSpent, available: t.axp - draft.axpSpent },
    mt: { earned: t.mt + draft.mtSpent, spent: draft.mtSpent, balance: t.mt },
  };
}

function buildJournals(
  draft: Draft,
  stats: StatsSection,
  counting: (id: string) => OwnedSkill,
  active: DraftCalling | null,
): JournalsSection {
  const rs = draft.ruleset;
  const spellbookBlocked = stats.other.some(
    (o) => o.stat === 'canCastFromSpellbook' && o.value === false,
  );
  const blockedSchools = stats.other
    .filter((o) => o.stat === 'blockedMagicSchool' && typeof o.value === 'string')
    .map((o) => String(o.value));
  const ctx = { owned: counting, spellbookBlocked, blockedSchools };
  const entries: JournalEntry[] = [];
  for (const e of draft.journal) {
    const ref = journalRef(rs, e.kind, e.refId);
    if (!ref) continue;
    const use = journalUsability(rs, e.kind, e.refId, ctx);
    entries.push({
      entryId: e.entryId,
      kind: e.kind,
      refId: e.refId,
      name: ref.name,
      level: ref.level,
      group: ref.group,
      status: e.status,
      source: e.source,
      teacher: e.teacher,
      addedAt: e.addedAt,
      eventKey: e.eventKey,
      usableNow: use.usable,
      reason: use.reason,
    });
  }
  const calling = active ? rs.callingsById[active.callingId] : undefined;
  const known: JournalsSection['knownSpells'][number][] = [];
  for (const choice of calling?.choices ?? []) {
    if (choice.kind !== 'spell-list' || !active) continue;
    for (const id of choiceList(active.choices[choice.id])) {
      const spell = rs.spellsById[id];
      const school = spell ? rs.ruleset.magicSchools.find((s) => s.id === spell.school) : undefined;
      if (!spell || !school) continue;
      known.push({
        spellId: spell.id,
        name: spell.name,
        school: spell.school,
        level: spell.level,
        usableNow: namedLevelUnlocked(counting(school.skill), spell.level),
      });
    }
  }
  return {
    spellbook: entries.filter((e) => e.kind === 'spell'),
    craftingJournal: entries.filter((e) => e.kind === 'recipe'),
    performanceRecord: entries.filter((e) => e.kind === 'performance'),
    rituals: entries.filter((e) => e.kind === 'ritual'),
    knownSpells: known,
    spellbookCastingBlocked: spellbookBlocked,
  };
}

export function finalize(draft: Draft): Sheet {
  const rs: SyRuleset = draft.ruleset;
  const active = activeCalling(draft);
  const activeId = active?.callingId ?? '';
  const counting = (id: string): OwnedSkill => {
    const skill = rs.skillsById[id];
    return skill && skillCounts(skill, active?.callingId ?? null) ? ownedOf(draft, id) : NOT_OWNED;
  };
  const owned = new Map<string, OwnedSkill>();
  for (const [id, s] of draft.skills) owned.set(id, { level: s.level, techniques: s.techniques });
  const stats = computeStats(rs, {
    raceId: draft.raceId,
    raceChoices: draft.raceChoices,
    literacy: draft.literacy,
    owned,
    activeCalling: active ? { callingId: active.callingId, choices: active.choices } : null,
    artifactPowers: (draft.artifact?.powers ?? []).map((p) => ({
      powerId: p.powerId,
      choice: p.choice,
    })),
    familiarTricks: (draft.familiar?.tricks ?? []).map((t) => ({ id: t.id, slots: t.slots })),
    spirit: draft.spirit,
    ageCategory: draft.profile.ageCategory,
  });

  const fullEvents = draft.events.length;
  const needed = rs.ruleset.calling.minFullEvents;
  const fixed = rs.ruleset.familiarization.fixedLocationCountsTowardMax ? 1 : 0;
  const artifact = draft.artifact;
  const artifactRules = rs.ruleset.artifact;
  const slotsUsed = artifact?.powers.reduce((n, p) => n + p.tier, 0) ?? 0;
  const familiar = draft.familiar;

  return {
    rulesetId: rs.id,
    created: draft.created,
    profile: { ...draft.profile },
    race: buildRace(draft, stats),
    calling: active ? buildCalling(draft, active) : null,
    formerCallings: draft.callings
      .filter((c) => c.leftAt !== null)
      .map((c) => buildCalling(draft, c))
      .filter((c): c is CallingSection => c !== null),
    callingEligibility: { fullEvents, needed, eligible: fullEvents >= needed },
    points: buildPoints(draft),
    skills: buildSkills(draft, activeId),
    learningLog: [...draft.learningLog],
    refunds: [...draft.refunds],
    stats,
    journals: buildJournals(draft, stats, counting, active),
    events: draft.events.map((e) => ({ ...e })),
    fullEvents,
    voidedCheckIns: [...draft.voidedCheckIns],
    ledger: [...draft.ledger],
    mtPurchases: draft.mtPurchases.map((m) => ({ ...m })),
    startingItems: [...draft.startingItems],
    spirit: {
      current: draft.spirit,
      max: rs.ruleset.body.spiritFragmentsMax,
      history: [...draft.spiritHistory],
    },
    artifact: artifact
      ? {
          name: artifact.name,
          description: artifact.description,
          awakenedAt: artifact.awakenedAt,
          slotsUnlocked: artifact.slotsUnlocked,
          maxSlots: artifactRules.maxSlots,
          slotsUsed,
          slotsFree: artifact.slotsUnlocked - slotsUsed,
          nextSlotCost:
            artifact.slotsUnlocked < artifactRules.maxSlots ? artifactRules.slotCostAxp : null,
          powers: [...artifact.powers],
          removals: [...artifact.removals],
        }
      : null,
    locations: {
      ...stats.locations,
      entries: [...draft.locations],
      used: fixed + draft.locations.length,
    },
    boons: {
      entries: [...draft.boons],
      greaterSlots: stats.slots.greaterBoon,
      lesserSlots: stats.slots.lesserBoon,
      greaterUsed: draft.boons.filter((b) => b.slot === 'greater').length,
      lesserUsed: draft.boons.filter((b) => b.slot === 'lesser').length,
    },
    familiar: familiar
      ? {
          actionId: familiar.actionId,
          name: familiar.name,
          form: familiar.form,
          quality: familiar.quality,
          stable: familiar.stable,
          trickSlots:
            (rs.familiars.rules.trickSlotsByQuality as Readonly<Record<string, number>>)[
              familiar.quality
            ] ?? 0,
          slotsUsed: familiar.tricks.reduce((n, t) => n + t.slots, 0),
          tricks: [...familiar.tricks],
          setAt: familiar.setAt,
        }
      : null,
    owed: draft.owed.map((o) => ({
      id: o.id,
      text: o.text,
      eventKey: o.eventKey,
      delivered: draft.owedDelivered.has(o.id),
      deliveredAt: draft.owedDelivered.get(o.id) ?? null,
    })),
    retired: draft.retired,
    requestDecisions: [...draft.requestDecisions],
    raceChanges: [...draft.raceChanges],
    warnings: [...draft.warnings],
    lastSeq: draft.lastSeq,
  };
}
