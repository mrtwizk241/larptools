// Calling screen model: eligibility text, Calling numbers, the Technique rules state, and choice
// labels. Pure, so it is unit tested.
import type {
  CallingSection,
  ChoiceValue,
  OtherStat,
  Ruleset,
  Sheet,
  SheetSkill,
} from '../../../../engine/index.ts';
import { eventLabel, levelName, plural } from '../journals/events.ts';

export interface Eligibility {
  eligible: boolean;
  /** One line per requirement, met or not. */
  lines: { met: boolean; text: string }[];
  /** What is missing, in plain words. Empty when eligible. */
  missing: string[];
}

/**
 * Full events and CXP against what a Calling needs ([CALL-ELIGIBLE]). The build playground needs
 * only the CXP.
 */
export function eligibility(ruleset: Ruleset, sheet: Sheet, playground = false): Eligibility {
  const rules = ruleset.ruleset.calling;
  const { fullEvents, needed } = sheet.callingEligibility;
  const cxp = sheet.points.cxp.available;
  const cost = rules.startCostCxp;
  const eventsMet = playground || fullEvents >= needed;
  const cxpMet = cxp >= cost;
  const missing: string[] = [];
  if (!eventsMet) missing.push(`${plural(needed - fullEvents, 'more full event')}`);
  if (!cxpMet) missing.push(`${cost - cxp} more CXP`);
  return {
    eligible: eventsMet && cxpMet,
    lines: [
      ...(playground
        ? []
        : [
            {
              met: eventsMet,
              text: `Full events attended: ${fullEvents}. A Calling needs ${needed} before its start event.`,
            },
          ]),
      { met: cxpMet, text: `CXP available: ${cxp} (needs ${cost} for Basic in both skills).` },
    ],
    missing,
  };
}

/** "Can start a Calling now." or "Missing: 2 more full events and 4 more CXP." */
export function eligibilityText(e: Eligibility): string {
  if (e.eligible) return 'Can start a Calling.';
  return `Missing: ${e.missing.join(' and ')}.`;
}

const STAT_LABELS: Readonly<Record<string, string>> = {
  armorRefitCount: 'Armor refit count',
  blockedMagicSchool: 'Blocked magic school',
  canCastFromSpellbook: 'Can cast from a spellbook',
  focusedChargeCap: 'Focused charge cap',
  infiltrationGroupSize: 'Infiltration group size',
  luckyItemsRequired: 'Lucky items needed',
  passiveDamageBondedWeapon: 'Bonded weapon damage',
  planarAsylum: 'Planar asylum',
  protectionStackMax: 'Protection stacks',
  relicPermanentDamageTypes: 'Relic damage types',
  researchCostReductionSpecialization: 'Research cost reduction',
  selfResistFearMax: 'Extra resist fears',
  upkeepSilver: 'Upkeep in Silver',
  wardInterceptSlots: 'Ward intercept slots',
  wardsMax: 'Wards at once',
};

/** "Ward intercept slots" for `wardInterceptSlots`; other ids become words. */
export function statLabel(stat: string): string {
  const known = STAT_LABELS[stat];
  if (known) return known;
  const words = stat.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return `${words[0]?.toUpperCase() ?? ''}${words.slice(1)}`;
}

/** "3", "Yes", "No", "Fire" (ids such as `water` or `blunt-force` become capitalised words). */
export function statValue(value: OtherStat['value']): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  return value
    .split(/[-s]+/)
    .map((w) => `${w.charAt(0).toUpperCase()}${w.slice(1)}`)
    .join(' ');
}

/** Sheet numbers the Calling sets (sources of kind `calling`), plus the upkeep it changes. */
export function callingNumbers(sheet: Sheet): { label: string; value: string }[] {
  const rows = sheet.stats.other
    .filter((o) => o.sources.some((s) => s.source.kind === 'calling'))
    .map((o) => ({ label: statLabel(o.stat), value: statValue(o.value) }));
  const upkeep = sheet.stats.upkeep;
  if (sheet.calling && upkeep.covers.length > 0)
    rows.push({
      label: 'Upkeep covered',
      value: upkeep.covers.map((c) => c.summary).join(' '),
    });
  return rows;
}

const TIER_NAMES = ['Basic only', 'Expert', 'Master', 'Grandmaster'];

/**
 * Technique rules state ([CALL-TECH]): start event, last Technique event, balance. The build
 * playground has no events: balance only.
 */
export function techniqueState(
  ruleset: Ruleset,
  sheet: Sheet,
  calling: CallingSection,
  playground = false,
): { label: string; value: string }[] {
  const started = eventLabel(sheet, calling.startedEventKey) ?? calling.startedAt.slice(0, 10);
  const last = [...calling.techniqueEvents].reverse().find((t) => t.eventKey !== null);
  const tiers = calling.skillIds
    .map(
      (id) =>
        `${ruleset.skillsById[id]?.name ?? id}: ${TIER_NAMES[calling.balance.tiers[id] ?? 0] ?? ''}`,
    )
    .join(', ');
  const per = ruleset.ruleset.calling.techniquesPerEvent;
  const balance = {
    label: 'Balance',
    value: `${tiers}. ${
      calling.balance.ok
        ? `Within ${plural(calling.balance.maxGap, 'Technique')} of each other.`
        : `More than ${plural(calling.balance.maxGap, 'Technique')} apart.`
    }`,
  };
  if (playground) return [balance];
  return [
    { label: 'Started at', value: started },
    {
      label: 'Last Technique',
      value: last
        ? `${levelName(last.technique)} in ${ruleset.skillsById[last.skillId]?.name ?? last.skillId} at ${eventLabel(sheet, last.eventKey) ?? ''}`
        : 'None yet',
    },
    balance,
    {
      label: 'Rules',
      value: `${plural(per, 'Calling Technique')} per event, none at the start event.`,
    },
  ];
}

/** A choice value in words: spell, racial skill, and racial passive ids become names. */
export function choiceText(ruleset: Ruleset, value: ChoiceValue): string {
  const one = (id: string) =>
    ruleset.spellsById[id]?.name ??
    ruleset.skillsById[id]?.name ??
    racialPassiveLabel(ruleset, id) ??
    levelName(id);
  return typeof value === 'string' ? one(value) : value.map(one).join(', ');
}

/** "Elf passive: ..." for a racial innate id, else null. */
export function racialPassiveLabel(ruleset: Ruleset, innateId: string): string | null {
  const race = ruleset.races.find((r) => r.innate.some((i) => i.id === innateId));
  const innate = ruleset.raceInnatesById[innateId];
  return race && innate ? `${race.name} passive: ${innate.summary}` : null;
}

/** "Level 2 of 10. Techniques: Expert. 15 CXP spent." */
export function skillFacts(skill: SheetSkill): string {
  const techs =
    skill.techniques.length > 0 ? skill.techniques.map(levelName).join(', ') : 'none yet';
  return `Level ${skill.level} of ${skill.maxLevel}. Techniques: ${techs}. ${skill.spent} CXP spent.`;
}

/** The Calling's skills on the sheet (locked ones too for a former Calling). */
export function callingSkills(sheet: Sheet, callingId: string): SheetSkill[] {
  return sheet.skills.filter((s) => s.callingId === callingId);
}
