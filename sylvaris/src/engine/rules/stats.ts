// Sheet numbers from skill passives, derived numbers, race innates, the active Calling, and
// Artifact powers ([SKL-PASSIVES], [SKL-STATS], [PLAY-CAPS], [RACE-SHEET], Calling effects).
//
// How a number is built: the largest `base` (else the ruleset default), replaced by the largest
// `set`, plus every `add`. Sources with a `when` only apply sometimes: they are listed under
// `conditional` and left out of the totals. Caps come from ruleset.json.
//
// Readings applied here:
// - Q-SKL-5: Technique passives count toward the 100 Life and Armor caps.
// - Q-SKL-7: Knowledge and Research languages count per named level reached (`basis: "level"`).
// - Q-RACE-8: the Aeshu dual wield bonus applies when a skill already allows two long weapons.
// - Q-RACE-9 / Q-PLAY-8: Elf trees and the tavern count toward the 20 location maximum.
// - Q-CALL-8: "1 + your known techniques" counts Expert, Master, Grandmaster only.
// - Calling skills of a Calling the character left count for nothing ([CALL-CHANGE]).
import type { SyRuleset, SySkill } from '../../data/index.ts';
import type { NamedLevelId } from '../model.ts';
import type {
  Choices,
  GrantView,
  IncomeOption,
  IncomeSource,
  LanguagesSection,
  Literacy,
  NaturalWeaponView,
  OtherStat,
  PassiveDamageSection,
  StatLine,
  StatSource,
  StatSourceRef,
  StatsSection,
  UpkeepCover,
} from '../sheet.ts';
import {
  highestTechnique,
  label,
  namedLevelReached,
  namedLevelUnlocked,
  type OwnedSkill,
} from './skills.ts';

type Effect = NonNullable<SyRuleset['callings'][number]['effects']>[number];
type CheckInData = NonNullable<SySkill['checkIn']>;
type CheckInGrant = CheckInData['perLevel'];
type CheckInOption = NonNullable<CheckInGrant['alternative']>;

/** What the stats depend on. */
export interface StatsInput {
  readonly raceId: string | null;
  readonly raceChoices: Choices;
  readonly literacy: Literacy;
  /** Every skill owned, Calling skills of former Callings included. */
  readonly owned: ReadonlyMap<string, OwnedSkill>;
  readonly activeCalling: { readonly callingId: string; readonly choices: Choices } | null;
  readonly artifactPowers: readonly { readonly powerId: string; readonly choice: string | null }[];
  readonly familiarTricks: readonly { readonly id: string; readonly slots: number }[];
  readonly spirit: number;
  readonly ageCategory: number;
}

const DAMAGE_STATS = new Set([
  'passiveDamage1h',
  'passiveDamage2h',
  'passiveDamageWeapon',
  'passiveDamageMelee',
  'passiveDamageBehind',
  'passiveDamageRanged',
  'passiveDamageRelic',
  'passiveDamageDualWield',
  'passiveDamageBondedWeapon',
]);

/** Stats shown in their own section; every other stat goes to `other`. */
const SECTIONED = new Set([
  ...DAMAGE_STATS,
  'lifePoints',
  'armorPoints',
  'languages',
  'bleedOutSeconds',
  'deathCountMinutes',
  'attunementSlots',
  'attunementSlotsToolOnly',
  'lesserBoonSlots',
  'amplifiedLifeSlots',
  'amplifiedArmorSlots',
  'familiarLocations',
  'familiarTrees',
  'checkInSilver',
  'checkInBasicComponents',
  'upkeepCovered',
  'upkeepSilver',
]);

/** True when a skill counts: not a Calling skill, or a skill of the active Calling. */
export function skillCounts(skill: SySkill, activeCallingId: string | null): boolean {
  return skill.category !== 'calling' || skill.callingId === activeCallingId;
}

function choiceString(value: Choices[string] | undefined): string | null {
  if (value === undefined) return null;
  return typeof value === 'string' ? value : (value[0] ?? null);
}

/** Collects every contribution, then builds the sections. */
export function computeStats(ruleset: SyRuleset, input: StatsInput): StatsSection {
  const rs = ruleset.ruleset;
  const sources: StatSource[] = [];
  const values: { stat: string; value: string | boolean; source: StatSource }[] = [];
  const grants = new Map<string, { name: string; kind: StatSourceRef['kind'] }[]>();
  const naturalWeapons: NaturalWeaponView[] = [];
  const activeId = input.activeCalling?.callingId ?? null;
  const calling = activeId ? ruleset.callingsById[activeId] : undefined;

  const owned = (id: string): OwnedSkill => input.owned.get(id) ?? { level: 0, techniques: [] };
  const callingTechniques = calling
    ? calling.skills.reduce((n, s) => n + owned(s.id).techniques.length, 0)
    : 0;

  const addGrant = (grant: string, from: string, kind: StatSourceRef['kind']) => {
    const list = grants.get(grant) ?? [];
    if (!list.some((g) => g.name === from)) list.push({ name: from, kind });
    grants.set(grant, list);
  };

  const pushSource = (
    stat: string,
    amount: number,
    op: StatSource['op'],
    source: StatSourceRef,
    name: string,
    extra: { when?: string | undefined; pool?: string | undefined; note?: string | undefined } = {},
  ) => {
    sources.push({
      stat,
      amount,
      op,
      source,
      name,
      when: extra.when ?? null,
      pool: extra.pool ?? null,
      note: extra.note ?? null,
    });
  };

  const addEffect = (e: Effect, ref: StatSourceRef, name: string, choices: Choices) => {
    const base = {
      stat: e.stat,
      amount: 0,
      op: e.op ?? 'add',
      source: ref,
      name,
      when: e.when ?? null,
      pool: e.pool ?? null,
      note: e.note ?? null,
    } satisfies StatSource;
    if (e.value !== undefined) {
      values.push({ stat: e.stat, value: e.value, source: base });
      return;
    }
    if (e.fromChoice !== undefined) {
      const picked = choiceString(choices[e.fromChoice]);
      if (picked === null) return;
      let value = picked;
      if (e.via === 'opposites') {
        const def = (calling?.choices ?? []).find((c) => c.id === e.fromChoice);
        const opposites = def?.opposites as Readonly<Record<string, string>> | undefined;
        value = opposites?.[picked] ?? picked;
      }
      values.push({ stat: e.stat, value, source: base });
      return;
    }
    let amount = e.amount ?? 0;
    if (e.perCallingTechnique !== undefined) amount += e.perCallingTechnique * callingTechniques;
    if (e.perTechniqueInSkill !== undefined)
      amount += owned(e.perTechniqueInSkill).techniques.length;
    if (e.max !== undefined) amount = Math.min(amount, e.max);
    sources.push({ ...base, amount });
  };

  // Skills (the Distinctive's skills work as the racial skill they mirror).
  for (const [skillId, state] of input.owned) {
    const own = ruleset.skillsById[skillId];
    if (!own || !skillCounts(own, activeId) || state.level <= 0) continue;
    let skill: SySkill = own;
    let display = own.name;
    if (own.mirrorsChoice !== undefined && input.activeCalling) {
      const mirrored = choiceString(input.activeCalling.choices[own.mirrorsChoice]);
      const target = mirrored ? ruleset.skillsById[mirrored] : undefined;
      if (target) {
        skill = target;
        display = `${own.name} (as ${target.name})`;
      }
    }
    const at = (n: NamedLevelId) => `${display} (${label(n)})`;
    const ref = (n: NamedLevelId): StatSourceRef => ({ kind: 'skill', id: skillId, named: n });
    for (const p of skill.passives ?? []) {
      const on =
        p.basis === 'level'
          ? namedLevelReached(ruleset, state, p.at)
          : namedLevelUnlocked(state, p.at);
      if (on)
        pushSource(p.stat, p.amount, p.op ?? 'add', ref(p.at), at(p.at), {
          when: p.when,
          pool: p.pool,
        });
    }
    for (const d of skill.derived ?? []) {
      if (!namedLevelUnlocked(state, d.at)) continue;
      const amount = d.perLevel !== undefined ? d.perLevel * state.level : (d.amount ?? 0);
      pushSource(d.stat, amount, 'add', ref(d.at), at(d.at), { note: d.note });
    }
    for (const g of skill.grants ?? [])
      if (namedLevelUnlocked(state, g.at)) addGrant(g.grant, at(g.at), 'skill');
  }

  // Race innates.
  const race = input.raceId ? ruleset.racesById[input.raceId] : undefined;
  const addInnate = (innateId: string, choices: Choices, borrowed: boolean) => {
    const innate = ruleset.raceInnatesById[innateId];
    if (!innate) return;
    const owner = ruleset.races.find((r) => r.innate.some((i) => i.id === innateId));
    const name = `${owner?.name ?? innateId} innate${borrowed ? ' (The Distinctive)' : ''}`;
    for (const e of innate.effects ?? [])
      addEffect(e, { kind: 'race', id: innateId }, name, choices);
    for (const g of innate.grants ?? []) addGrant(g, name, 'race');
    const nw = innate.naturalWeapon;
    if (nw) {
      const pick = choiceString(choices[nw.choiceId]);
      const option = nw.options.find((o) => o.id === pick);
      if (option)
        naturalWeapons.push({
          id: option.id,
          baseDamage: option.baseDamage,
          greatclaw: option.greatclaw === true,
          source: name,
        });
    }
  };
  if (race) for (const innate of race.innate) addInnate(innate.id, input.raceChoices, false);

  // The active Calling.
  if (calling && input.activeCalling) {
    const name = `${calling.name} (${calling.innate.name})`;
    for (const e of calling.effects ?? [])
      addEffect(e, { kind: 'calling', id: calling.id }, name, input.activeCalling.choices);
    for (const choice of calling.choices ?? []) {
      if (choice.kind !== 'racial-passive') continue;
      const innateId = choiceString(input.activeCalling.choices[choice.id]);
      if (innateId) addInnate(innateId, input.raceChoices, true);
    }
  }

  // Artifact powers.
  const languageChoices: string[] = [];
  for (const p of input.artifactPowers) {
    const power = ruleset.artifactPowersById[p.powerId];
    if (!power) continue;
    const name = `Artifact: ${power.summary}`;
    for (const e of power.effects ?? []) addEffect(e, { kind: 'artifact', id: power.id }, name, {});
    if (power.naturalWeapon)
      naturalWeapons.push({
        id: power.id,
        baseDamage: power.naturalWeapon.baseDamage,
        greatclaw: false,
        source: name,
      });
    if (power.choice === 'language' && p.choice) {
      languageChoices.push(p.choice);
      pushSource('languages', 1, 'add', { kind: 'artifact', id: power.id }, name);
    }
  }

  // ---- Lines ----
  const unconditional = (stat: string) => sources.filter((s) => s.stat === stat && s.when === null);
  const conditional = (stats: readonly string[]) =>
    sources.filter((s) => stats.includes(s.stat) && s.when !== null);

  const statValue = (stat: string, defaultBase: number): number => {
    const list = unconditional(stat);
    const bases = list.filter((s) => s.op === 'base').map((s) => s.amount);
    const sets = list.filter((s) => s.op === 'set').map((s) => s.amount);
    let v = bases.length > 0 ? Math.max(...bases) : defaultBase;
    if (sets.length > 0) v = Math.max(...sets);
    for (const s of list) if (s.op === 'add') v += s.amount;
    return v;
  };

  const baseSource = (stat: string, amount: number, name: string): StatSource[] =>
    amount === 0
      ? []
      : [
          {
            stat,
            amount,
            op: 'base',
            source: { kind: 'base' },
            name,
            when: null,
            pool: null,
            note: null,
          },
        ];

  const line = (
    stat: string,
    defaultBase: number,
    cap: number | null,
    baseName: string,
  ): StatLine => {
    const list = unconditional(stat);
    const hasBase = list.some((s) => s.op === 'base');
    const total = statValue(stat, defaultBase);
    return {
      total,
      value: cap === null ? total : Math.min(total, cap),
      cap,
      sources: [...(hasBase ? [] : baseSource(stat, defaultBase, baseName)), ...list],
      conditional: conditional([stat]),
    };
  };

  const sumLine = (stats: readonly string[], cap: number): StatLine => {
    const list = sources.filter((s) => stats.includes(s.stat) && s.when === null && s.op === 'add');
    const total = list.reduce((n, s) => n + s.amount, 0);
    return {
      total,
      value: Math.min(total, cap),
      cap,
      sources: list,
      conditional: conditional(stats),
    };
  };

  const caps = rs.caps;
  const melee = ['passiveDamageWeapon', 'passiveDamageMelee'];
  // Q-RACE-8: the dual wield bonus (conditional in the data) counts once a skill already
  // allows two long weapons.
  const dualApplies = (grants.get('dual-wield-long-long') ?? []).some((g) => g.kind !== 'race');
  const dualSources = sources.filter((s) => s.stat === 'passiveDamageDualWield');
  const dualTotal = dualApplies ? dualSources.reduce((n, s) => n + s.amount, 0) : 0;
  const passiveDamage: PassiveDamageSection = {
    oneHanded: sumLine(['passiveDamage1h', ...melee], caps.passiveDamage),
    twoHanded: sumLine(['passiveDamage2h', ...melee], caps.passiveDamage),
    allWeapons: sumLine(['passiveDamageWeapon'], caps.passiveDamage),
    ranged: sumLine(['passiveDamageRanged', 'passiveDamageWeapon'], caps.passiveDamage),
    relic: sumLine(['passiveDamageRelic'], caps.passiveDamage),
    fromBehindOneHanded: sumLine(
      ['passiveDamage1h', ...melee, 'passiveDamageBehind'],
      caps.passiveDamageFromBehind,
    ),
    fromBehindTwoHanded: sumLine(
      ['passiveDamage2h', ...melee, 'passiveDamageBehind'],
      caps.passiveDamageFromBehind,
    ),
    dualWield: {
      total: dualTotal,
      value: Math.min(dualTotal, caps.passiveDamage),
      cap: caps.passiveDamage,
      sources: dualApplies ? dualSources : [],
      conditional: dualApplies ? [] : dualSources,
      applies: dualApplies,
    },
    bondedWeapon: sumLine(['passiveDamageBondedWeapon'], caps.passiveDamage),
  };

  // Languages: the literacy choice, plus every language effect.
  const raceLanguage = race?.language ?? 'common';
  const literacyId = input.literacy === 'common' ? 'common' : raceLanguage;
  const languageName = (id: string) => rs.languages.find((l) => l.id === id)?.name ?? id;
  const known: { id: string; name: string }[] = [
    { id: literacyId, name: languageName(literacyId) },
  ];
  for (const choice of race?.choices ?? []) {
    if (choice.kind !== 'language') continue;
    const id = choiceString(input.raceChoices[choice.id]);
    if (id && !known.some((k) => k.id === id)) known.push({ id, name: languageName(id) });
  }
  for (const id of languageChoices)
    if (!known.some((k) => k.id === id)) known.push({ id, name: languageName(id) });
  const languageCount = 1 + unconditional('languages').reduce((n, s) => n + s.amount, 0);
  const languages: LanguagesSection = {
    count: languageCount,
    known,
    unnamed: Math.max(0, languageCount - known.length),
    sources: unconditional('languages'),
  };

  // Locations.
  const fam = rs.familiarization;
  const portalSlots = statValue('familiarLocations', 0);
  const treeSlots = statValue('familiarTrees', 0);
  const fixed = fam.fixedLocationCountsTowardMax ? 1 : 0;

  // Upkeep.
  const covers: UpkeepCover[] = [];
  for (const m of rs.upkeep.modifiers) {
    const skill = ruleset.skillsById[m.id];
    if (!skill || !skillCounts(skill, activeId) || owned(m.id).level < 1) continue;
    if (m.coversAll) {
      const covered = unconditional('upkeepCovered').some(
        (s) => s.source.kind === 'skill' && s.source.id === m.id && s.amount > 0,
      );
      if (covered)
        covers.push({
          id: m.id,
          summary: m.summary,
          automatic: true,
          coversSilver: null,
          coversAll: true,
        });
      continue;
    }
    covers.push({
      id: m.id,
      summary: m.summary,
      automatic: false,
      coversSilver: m.coversSilver ?? null,
      coversAll: false,
    });
  }

  // Other numbers: every stat without its own section.
  const other: OtherStat[] = [];
  const otherStats = new Set<string>();
  for (const s of sources) if (!SECTIONED.has(s.stat) && s.when === null) otherStats.add(s.stat);
  for (const v of values) if (!SECTIONED.has(v.stat)) otherStats.add(v.stat);
  const defaults: Readonly<Record<string, number>> = { armorRefitCount: rs.body.refitCount };
  for (const stat of otherStats) {
    const vals = values.filter((v) => v.stat === stat);
    const last = vals[vals.length - 1];
    if (last) {
      other.push({ stat, value: last.value, sources: vals.map((v) => v.source) });
      continue;
    }
    other.push({ stat, value: statValue(stat, defaults[stat] ?? 0), sources: unconditional(stat) });
  }

  return {
    lifePoints: line(
      'lifePoints',
      rs.body.baseLifePoints,
      caps.healableLifePoints,
      'Base Life Points',
    ),
    armorPoints: line(
      'armorPoints',
      rs.body.baseArmorPoints,
      caps.refittableArmorPoints,
      'Base Armor Points',
    ),
    passiveDamage,
    slots: {
      enhancement: rs.slots.enhancement,
      attunement: rs.slots.attunement + statValue('attunementSlots', 0),
      attunementToolOnly: statValue('attunementSlotsToolOnly', 0),
      greaterBoon: rs.slots.greaterBoon,
      lesserBoon: rs.slots.lesserBoon + statValue('lesserBoonSlots', 0),
      amplifiedLife: statValue('amplifiedLifeSlots', 0),
      amplifiedArmor: statValue('amplifiedArmorSlots', 0),
    },
    languages,
    bleedOutSeconds: line('bleedOutSeconds', rs.body.bleedOutSeconds, null, 'Bleed out count'),
    deathCountMinutes: line('deathCountMinutes', rs.body.deathCountMinutes, null, 'Death count'),
    locations: {
      fixedLocation: fam.fixedLocation,
      portalSlots,
      treeSlots,
      capacity: Math.min(fam.maxLocations, fixed + portalSlots + treeSlots),
      max: fam.maxLocations,
    },
    grants: [...grants].map(([grant, from]): GrantView => ({
      grant,
      sources: from.map((g) => g.name),
    })),
    naturalWeapons,
    spiritFragments: { current: input.spirit, max: rs.body.spiritFragmentsMax },
    ageCategory: input.ageCategory,
    upkeep: {
      silverPerEvent: statValue('upkeepSilver', rs.upkeep.silverPerEvent),
      firstEventFree: rs.upkeep.firstEventFree,
      covers,
    },
    checkInIncome: checkInIncome(ruleset, input, sources),
    other,
  };
}

// ---- Check-in income ----

/** "10 Copper", "2 Basic Components", "Cover 2 Silver of your own upkeep". */
export function incomeText(o: Omit<IncomeOption, 'text'>): string {
  const parts: string[] = [];
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (o.copper) parts.push(`${o.copper} Copper`);
  if (o.silver) parts.push(`${o.silver} Silver`);
  if (o.basicComponents) parts.push(plural(o.basicComponents, 'Basic Component'));
  if (o.exoticComponents) parts.push(plural(o.exoticComponents, 'Exotic Component'));
  if (o.masterBuildingMaterials)
    parts.push(plural(o.masterBuildingMaterials, 'Master Building Material'));
  if (o.ownUpkeepSilver) parts.push(`cover ${o.ownUpkeepSilver} Silver of own upkeep`);
  if (o.tradeItem) parts.push(`1 ${label(o.tradeItem)} Trade Item`);
  if (o.mixCopperValue)
    parts.push(
      `a mix worth ${o.mixCopperValue} Copper${o.maxItems ? ` (at most ${plural(o.maxItems, 'item')})` : ''}`,
    );
  return parts.join(' and ');
}

function option(o: CheckInOption, times = 1): IncomeOption {
  const scaled: Omit<IncomeOption, 'text'> = {
    ...(o.basicComponents ? { basicComponents: o.basicComponents * times } : {}),
    ...(o.exoticComponents ? { exoticComponents: o.exoticComponents * times } : {}),
    ...(o.masterBuildingMaterials
      ? { masterBuildingMaterials: o.masterBuildingMaterials * times }
      : {}),
    ...(o.copper ? { copper: o.copper * times } : {}),
    ...(o.ownUpkeepSilver ? { ownUpkeepSilver: o.ownUpkeepSilver * times } : {}),
    ...(o.tradeItem ? { tradeItem: o.tradeItem } : {}),
    ...(o.mixCopperValue ? { mixCopperValue: o.mixCopperValue } : {}),
    ...(o.maxItems ? { maxItems: o.maxItems } : {}),
  };
  return { ...scaled, text: incomeText(scaled) };
}

function fixedPart(g: CheckInGrant, times = 1): IncomeOption | null {
  if (!g.basicComponents && !g.exoticComponents) return null;
  return option(
    {
      ...(g.basicComponents ? { basicComponents: g.basicComponents } : {}),
      ...(g.exoticComponents ? { exoticComponents: g.exoticComponents } : {}),
    },
    times,
  );
}

function checkInIncome(
  ruleset: SyRuleset,
  input: StatsInput,
  sources: readonly StatSource[],
): IncomeSource[] {
  const out: IncomeSource[] = [];
  const activeId = input.activeCalling?.callingId ?? null;
  for (const [skillId, state] of input.owned) {
    const skill = ruleset.skillsById[skillId];
    const data = skill?.checkIn;
    if (!skill || !data || !skillCounts(skill, activeId) || state.level < 1) continue;
    // Only the highest Technique's bonus counts (techniqueRule "highest-only").
    const top = highestTechnique(state);
    const tg = top ? data.byTechnique[top] : undefined;
    out.push({
      id: `skill:${skillId}`,
      name: skill.name,
      kind: 'skill',
      level: state.level,
      fixed: fixedPart(data.perLevel, state.level),
      choice: data.perLevel.choice ? data.perLevel.choice.map((o) => option(o, state.level)) : null,
      technique:
        top && tg
          ? {
              technique: top,
              fixed: fixedPart(tg),
              choice: tg.choice ? tg.choice.map((o) => option(o)) : null,
              alternative: tg.alternative ? option(tg.alternative) : null,
              trade: tg.trade ? { ...tg.trade } : null,
            }
          : null,
    });
  }
  for (const s of sources) {
    if (s.when !== null || s.amount <= 0) continue;
    if (s.stat !== 'checkInSilver' && s.stat !== 'checkInBasicComponents') continue;
    const grant: Omit<IncomeOption, 'text'> =
      s.stat === 'checkInSilver' ? { silver: s.amount } : { basicComponents: s.amount };
    const full: IncomeOption = { ...grant, text: incomeText(grant) };
    out.push({
      id: `${s.source.kind}:${'id' in s.source ? s.source.id : s.stat}:${s.stat}`,
      name: s.name,
      kind: s.source.kind === 'race' ? 'race' : 'stat',
      level: null,
      fixed: full,
      choice: null,
      technique: null,
    });
  }
  const fam = ruleset.familiars.rules;
  for (const special of fam.skillSpecials) {
    const slots = input.familiarTricks
      .filter((t) => t.id === special.skill)
      .reduce((n, t) => n + t.slots, 0);
    if (slots === 0) continue;
    const grant: Omit<IncomeOption, 'text'> = {
      ...(special.checkInCopperPerSlot ? { copper: special.checkInCopperPerSlot * slots } : {}),
      ...(special.checkInBasicComponentsPerSlot
        ? { basicComponents: special.checkInBasicComponentsPerSlot * slots }
        : {}),
    };
    if (!grant.copper && !grant.basicComponents) continue;
    out.push({
      id: `familiar:${special.skill}`,
      name: `Familiar trick: ${ruleset.skillsById[special.skill]?.name ?? special.skill}`,
      kind: 'familiar',
      level: slots,
      fixed: { ...grant, text: incomeText(grant) },
      choice: null,
      technique: null,
    });
  }
  return out;
}
