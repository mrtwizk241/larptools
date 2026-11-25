// Plain-English race text, shared by the create wizard and the overview.
import type { SyRace } from '../../../data/index.ts';
import type { Ruleset } from '../../../engine/index.ts';

const FREQUENCY: Record<string, string> = {
  passive: 'always on',
  'per-encounter': 'per encounter',
  'per-repop': 'per re-pop',
  'per-event': 'per event',
  'per-year': 'per year',
  other: '',
};

/** "1 use per encounter". */
export function usesText(
  uses: number | null | undefined,
  frequency: string | null | undefined,
): string {
  if (!uses) return '';
  const per = frequency ? (FREQUENCY[frequency] ?? frequency.replace(/-/g, ' ')) : '';
  return `${uses} ${uses === 1 ? 'use' : 'uses'}${per ? ` ${per}` : ''}`;
}

const SIZE: Record<SyRace['size'], string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  choice: 'Chosen at creation',
};

/** "Size: Medium. Lifespan: long. Language: Elven." */
export function raceFactsText(ruleset: Ruleset, race: SyRace): string {
  const language =
    ruleset.ruleset.languages.find((l) => l.id === race.language)?.name ?? race.language;
  return `Size: ${SIZE[race.size]}. Lifespan: ${race.lifespan.replace('-', ' ')}. Language: ${language}.`;
}

/** "Wearing physical armor" becomes "only while wearing physical armor". */
export function whenText(when: string): string {
  const text = when.trim();
  if (/^(only|while|when|if|with|during|against|after|before)\b/i.test(text))
    return text.charAt(0).toLowerCase() + text.slice(1);
  if (/^wearing\b/i.test(text)) return `only while ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  return `only when ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}
