// Plain data for the overview cards, kept apart from the components so it can be unit tested.
import type {
  GrantView,
  IncomeOption,
  IncomeSource,
  InnateView,
  LedgerCurrency,
  Ruleset,
  Sheet,
  SheetSkill,
  StatLine,
  StatSource,
} from '../../../../engine/index.ts';
import { signed } from '../../../lib/names.ts';
import { choiceOptionLabel, languageName } from '../../create/steps.ts';
import { usesText, whenText } from '../../create/raceText.ts';

export interface PointsRow {
  currency: LedgerCurrency;
  earned: number;
  spent: number;
  /** Left to spend (the balance for Mist Tokens). */
  available: number;
  /** The earned cap (XP and CXP), else null. */
  cap: number | null;
}

/** XP, CXP, AXP, and Mist Tokens: earned, spent, and what is left (and the earned cap). */
export function pointsRows(sheet: Sheet): PointsRow[] {
  const { xp, cxp, axp, mt } = sheet.points;
  return [
    { currency: 'xp', earned: xp.earned, spent: xp.spent, available: xp.available, cap: xp.cap },
    {
      currency: 'cxp',
      earned: cxp.earned,
      spent: cxp.spent,
      available: cxp.available,
      cap: cxp.cap,
    },
    { currency: 'axp', earned: axp.earned, spent: axp.spent, available: axp.available, cap: null },
    { currency: 'mt', earned: mt.earned, spent: mt.spent, available: mt.balance, cap: null },
  ];
}

/** "Base 10, Toughness (Expert) +20": where a number comes from. */
export function sourcesText(sources: readonly StatSource[]): string {
  return sources
    .map((s, i) =>
      s.op === 'add' && i > 0 ? `${s.name} ${signed(s.amount)}` : `${s.name} ${s.amount}`,
    )
    .join(', ');
}

/** "Dwarf armor +5 (while wearing armor)": sources that only apply sometimes. */
export function conditionalText(sources: readonly StatSource[]): string {
  return sources
    .map((s) => `${s.name} ${signed(s.amount)}${s.when ? ` (${s.when})` : ''}`)
    .join(', ');
}

/** "Capped at 20 (before the cap: 24)", or "Cap 20" when under it, or null without a cap. */
export function capText(line: StatLine): string | null {
  if (line.cap === null) return null;
  if (line.total > line.value) return `Capped at ${line.cap} (before the cap: ${line.total})`;
  return `Cap ${line.cap}`;
}

export interface DamageRow {
  id: string;
  label: string;
  line: StatLine;
}

/** Passive damage by kind of attack, in the order the rulebook lists them. */
export function damageRows(sheet: Sheet): DamageRow[] {
  const d = sheet.stats.passiveDamage;
  const rows: DamageRow[] = [
    { id: 'one-handed', label: 'One-handed weapons', line: d.oneHanded },
    { id: 'two-handed', label: 'Two-handed weapons', line: d.twoHanded },
    { id: 'all-weapons', label: 'All weapons', line: d.allWeapons },
    { id: 'behind-one', label: 'From behind, one-handed', line: d.fromBehindOneHanded },
    { id: 'behind-two', label: 'From behind, two-handed', line: d.fromBehindTwoHanded },
    { id: 'ranged', label: 'Ranged', line: d.ranged },
    { id: 'relic', label: 'Relic', line: d.relic },
  ];
  if (d.bondedWeapon.sources.length > 0)
    rows.push({ id: 'bonded', label: 'Bonded weapon', line: d.bondedWeapon });
  return rows;
}

const GRANTS: Record<string, string> = {
  'dual-wield-long-short': 'Dual wield a long and a short weapon',
  'dual-wield-long-long': 'Dual wield two long weapons',
  'immune-aging': 'Immune to aging',
  'speak-with-animals': 'Speak with animals',
  'speak-with-monsters': 'Speak with monsters',
  'claws-or-bite': 'Claws or bite',
  hideout: 'Hideout',
  lair: 'Lair',
};

/** "Dual wield two long weapons (Aeshu innate)". */
export function grantText(grant: GrantView): string {
  const name = GRANTS[grant.grant] ?? grant.grant.replace(/-/g, ' ');
  return grant.sources.length > 0 ? `${name} (from ${grant.sources.join(', ')})` : name;
}

/** Dual wield lines: what the character may wield, and the extra damage while doing it. */
export function dualWieldLines(sheet: Sheet): string[] {
  const lines = sheet.stats.grants
    .filter((g) => g.grant.startsWith('dual-wield'))
    .map((g) => grantText(g));
  const extra = sheet.stats.passiveDamage.dualWield;
  if (extra.applies && extra.value > 0)
    lines.push(`+${extra.value} damage while dual wielding (${sourcesText(extra.sources)})`);
  else if (extra.conditional.length > 0)
    lines.push(
      `${conditionalText(extra.conditional)}; not now, as the character cannot already dual wield two long weapons from another source`,
    );
  return lines;
}

export interface FactRow {
  label: string;
  value: string;
}

/** Enhancement, Attunement (with the Gnome tool slot), and Boon Slots. */
export function slotRows(sheet: Sheet): FactRow[] {
  const s = sheet.stats.slots;
  return [
    { label: 'Enhancement Slots', value: String(s.enhancement) },
    {
      label: 'Attunement Slots',
      value:
        s.attunementToolOnly > 0
          ? `${s.attunement}, plus ${s.attunementToolOnly} for tools only`
          : String(s.attunement),
    },
    { label: 'Greater Boon Slots', value: String(s.greaterBoon) },
    { label: 'Lesser Boon Slots', value: String(s.lesserBoon) },
  ];
}

/** "2: Elven, Common, plus 1 to name in play". */
export function languagesText(sheet: Sheet): string {
  const l = sheet.stats.languages;
  const names = l.known.map((k) => k.name).join(', ');
  const unnamed = l.unnamed > 0 ? `${names ? ', plus ' : ''}${l.unnamed} to name in play` : '';
  return `${l.count}${names || unnamed ? `: ${names}${unnamed}` : ''}`;
}

/** "60 seconds", "2 minutes", "1 minute 30 seconds". */
export function durationText(seconds: number): string {
  if (seconds < 60 || seconds % 30 !== 0) return `${seconds} seconds`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const m = `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  return rest > 0 ? `${m} ${rest} seconds` : m;
}

/** "1 Silver per event, the first event free". */
export function upkeepText(sheet: Sheet): string {
  const u = sheet.stats.upkeep;
  if (u.silverPerEvent === 0) return 'None';
  return `${u.silverPerEvent} Silver per event${u.firstEventFree ? ', the first event free' : ''}`;
}

function optionsText(options: readonly IncomeOption[]): string {
  return `one of ${options.map((o) => o.text).join(', or ')}`;
}

/** "Harvesting 3: 2 Basic Components. Expert Technique: 1 Exotic Component". */
export function incomeLine(source: IncomeSource): string {
  const parts: string[] = [];
  if (source.fixed) parts.push(source.fixed.text);
  if (source.choice) parts.push(optionsText(source.choice));
  const t = source.technique;
  if (t) {
    const bits: string[] = [];
    if (t.fixed) bits.push(t.fixed.text);
    if (t.choice) bits.push(optionsText(t.choice));
    if (t.alternative) bits.push(`or instead ${t.alternative.text}`);
    if (bits.length > 0)
      parts.push(
        `${t.technique.charAt(0).toUpperCase()}${t.technique.slice(1)} Technique: ${bits.join(' ')}`,
      );
  }
  const name = source.level !== null ? `${source.name} ${source.level}` : source.name;
  return `${name}: ${parts.join('. ') || 'nothing yet'}`;
}

/** Race choices in words: "Element: Fire", "Natural weapon: Bite (Greatclaw), base 3 damage". */
export function raceChoiceRows(ruleset: Ruleset, sheet: Sheet): FactRow[] {
  const race = sheet.race;
  const def = race ? ruleset.racesById[race.raceId] : undefined;
  if (!race || !def) return [];
  return def.choices.flatMap((choice) => {
    const raw = race.choices[choice.id];
    if (raw === undefined) return [];
    const values = typeof raw === 'string' ? [raw] : [...raw];
    const text = values
      .map((v) =>
        choice.kind === 'pick'
          ? choiceOptionLabel(ruleset, def, choice.id, v)
          : choice.kind === 'language'
            ? languageName(ruleset, v)
            : v,
      )
      .join(', ');
    return [{ label: choice.label, value: text }];
  });
}

/** "Passive", "Active, 1 use per encounter, one use of Evasion". */
export function innateHeading(ruleset: Ruleset, innate: InnateView): string {
  if (innate.kind === 'passive') return 'Innate passive';
  const uses = usesText(innate.uses, innate.frequency);
  const skill = innate.grantsSkillUse ? ruleset.skillsById[innate.grantsSkillUse]?.name : undefined;
  return ['Innate active', uses, skill ? `one use of ${skill}` : ''].filter(Boolean).join(', ');
}

/** "Armor Points +10, only while wearing physical armor". */
export function conditionalEffectText(source: StatSource): string {
  const stat = STAT_NAMES[source.stat] ?? source.stat;
  return `${stat} ${signed(source.amount)}${source.when ? `, ${whenText(source.when)}` : ''}`;
}

const STAT_NAMES: Record<string, string> = {
  lifePoints: 'Life Points',
  armorPoints: 'Armor Points',
  passiveDamageDualWield: 'Damage while dual wielding',
  passiveDamageWeapon: 'Weapon damage',
  passiveDamageMelee: 'Melee damage',
};

/** "Level 3. Expert Technique. 3 uses per re-pop", "Level 2. Passive", or "Locked" for a left Calling. */
export function ownedSkillLine(skill: SheetSkill): string {
  const parts = [`Level ${skill.level}`];
  if (skill.techniques.length > 0) {
    const names = skill.techniques.map((t) => `${t.charAt(0).toUpperCase()}${t.slice(1)}`);
    parts.push(`${names.join(', ')} ${names.length === 1 ? 'Technique' : 'Techniques'}`);
  }
  if (skill.locked) parts.push('Locked, Calling left');
  else {
    const active = skill.abilities.some((a) => a.unlocked && a.uses > 0 && a.kind !== 'passive');
    parts.push(
      active && skill.maxUses > 0
        ? `${skill.maxUses} ${skill.maxUses === 1 ? 'use' : 'uses'} per re-pop`
        : 'Passive',
    );
  }
  return parts.join('. ');
}

/** "short-claws" becomes "Short Claws". */
export function weaponName(id: string): string {
  return id
    .split('-')
    .map((w) => `${w.charAt(0).toUpperCase()}${w.slice(1)}`)
    .join(' ');
}
