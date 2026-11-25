// Display names and texts that depend on a race choice: the Dragonborn element fills in
// "<Element>'s Gift" and the "your element" wording of Breath Weapon and the innate ([RACE-DRAGONBORN]).
// Skill ids never change; only what is shown does. Without a chosen element the generic text stays.
import type { SyRuleset } from '../../data/index.ts';
import type { ChoiceValue, Choices } from '../sheet.ts';

/** The race and its choices, as on the sheet (`sheet.race`) or in a draft. */
export interface RaceChoiceContext {
  readonly raceId: string;
  readonly choices: Choices;
}

/** What display texts can fill in. */
export interface DisplayContext {
  /** The chosen element, for example `{ id: 'fire', name: 'Fire', effect: 'Fire', ... }`. */
  readonly element: {
    readonly id: string;
    readonly name: string;
    readonly effect: string;
    readonly advancedEffect: string;
    readonly secondNumber: boolean;
  } | null;
}

export const NO_DISPLAY_CONTEXT: DisplayContext = { element: null };

function first(value: ChoiceValue | undefined): string | null {
  if (value === undefined) return null;
  return typeof value === 'string' ? value : (value[0] ?? null);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The display context for a character's race choices (null race: nothing to fill in). */
export function displayContext(
  rs: SyRuleset,
  race: RaceChoiceContext | null | undefined,
): DisplayContext {
  if (!race) return NO_DISPLAY_CONTEXT;
  const elementId = first(race.choices.element);
  const row = elementId
    ? rs.racesById[race.raceId]?.elements?.find((e) => e.id === elementId)
    : undefined;
  if (!row) return NO_DISPLAY_CONTEXT;
  return {
    element: {
      id: row.id,
      name: rs.ruleset.magicSchools.find((s) => s.id === row.id)?.name ?? capitalize(row.id),
      effect: row.effect,
      advancedEffect: row.advancedEffect,
      secondNumber: row.breathUsesSecondNumber === true,
    },
  };
}

/** "<Element>'s Gift" becomes "Fire's Gift"; other names are returned as they are. */
export function displaySkillName(name: string, ctx: DisplayContext): string {
  if (!ctx.element) return name;
  return name.replace(/<Element>/g, ctx.element.name);
}

/** "25 Fire" or "25 Ice (Water)": an amount of the element's effect, naming the element. */
function effectAmount(
  amount: string,
  effect: string,
  ctx: DisplayContext,
  advanced: boolean,
): string {
  const el = ctx.element;
  if (!el) return `${amount} ${effect}`;
  if (advanced) return `${amount} ${effect} (${el.name} advanced effect)`;
  return effect === el.name ? `${amount} ${effect}` : `${amount} ${effect} (${el.name})`;
}

/**
 * A rule text with the element filled in: "25 of your element's effect (10 for Fire and Life, ...)"
 * becomes "10 Fire" for a Fire Dragonborn, "a Basic spell of your element" becomes "a Basic Fire
 * spell". Texts without element wording are returned as they are.
 */
export function displayRuleText(text: string, ctx: DisplayContext): string {
  const el = ctx.element;
  if (!el) return text;
  let out = text.replace(
    /(\d+) of your element's (advanced )?effect \((\d+) for Fire and Life[^)]*\)/g,
    (_m, n1: string, adv: string | undefined, n2: string) =>
      effectAmount(
        el.secondNumber ? n2 : n1,
        adv ? el.advancedEffect : el.effect,
        ctx,
        adv !== undefined,
      ),
  );
  out = out.replace(
    /(\d+) \((\d+) for Fire and Life\) of effect or advanced effect/g,
    (_m, n1: string, n2: string) =>
      `${el.secondNumber ? n2 : n1} ${el.effect} or ${el.advancedEffect} (${el.name})`,
  );
  out = out.replace(
    /\b(Basic|Expert|Master|Grandmaster) spell of your element\b/g,
    `$1 ${el.name} spell`,
  );
  out = out.replace(/\byour element\b(?! \()/g, `your element (${el.name})`);
  out = out.replace(/<Element>/g, el.name);
  return out;
}

/** Display name of any skill (owned or not) for a character's race choices. */
export function skillDisplayNameFor(
  rs: SyRuleset,
  skillId: string,
  race: RaceChoiceContext | null | undefined,
): string {
  const name = rs.skillsById[skillId]?.name ?? skillId;
  return displaySkillName(name, displayContext(rs, race));
}

/** "Short Claws or Bite, chosen at creation" becomes "Bite (Greatclaw), base 3 damage" once chosen. */
export function naturalWeaponText(
  innate: {
    readonly summary: string;
    readonly naturalWeapon?:
      | {
          readonly choiceId: string;
          readonly options: readonly {
            readonly id: string;
            readonly baseDamage: number;
            readonly greatclaw?: boolean | undefined;
          }[];
        }
      | undefined;
  },
  choices: Choices,
): string {
  const weapon = innate.naturalWeapon;
  if (!weapon) return innate.summary;
  const chosen = first(choices[weapon.choiceId]);
  const option = weapon.options.find((o) => o.id === chosen);
  if (!option) return innate.summary;
  const name = option.id.split('-').map(capitalize).join(' ');
  return `Natural weapon: ${name}${option.greatclaw ? ' (Greatclaw)' : ''}, base ${option.baseDamage} damage.`;
}
