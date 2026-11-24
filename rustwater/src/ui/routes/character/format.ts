// Plain-English labels for sheet values.
import type { Ruleset, StatContribution, Uses } from '../../../engine/index.ts';

const PERIODS: Record<Uses['per'], string> = {
  encounter: 'per encounter',
  repop: 'per repop',
  event: 'per event',
};

/** "2 uses per repop". */
export function usesText(uses: Uses): string {
  return `${uses.count} ${uses.count === 1 ? 'use' : 'uses'} ${PERIODS[uses.per]}`;
}

const FREQUENCIES: Record<string, string> = {
  passive: 'Passive',
  'per-encounter': 'Per encounter',
  'per-repop': 'Per repop',
  'per-event': 'Per event',
  other: 'Special',
};

/** "Per repop" for a rules data frequency id. */
export function frequencyText(frequency: string): string {
  return FREQUENCIES[frequency] ?? frequency;
}

/** "Elf, Windwalker". */
export function ancestryLine(ancestry: string, subtype: string): string {
  return subtype ? `${ancestry}, ${subtype}` : ancestry;
}

/** "+1", "-2", "3" for the first entry (the base). */
export function signed(amount: number): string {
  return amount > 0 ? `+${amount}` : String(amount);
}

/** Where a stat contribution comes from, for example "Base" or "Toughness (adept)". */
export function contributionSource(ruleset: Ruleset, c: StatContribution): string {
  switch (c.source.kind) {
    case 'base':
      return 'Base';
    case 'skill': {
      const name = ruleset.skillsById[c.source.id]?.name ?? c.source.id;
      return c.source.part === 'basic' || c.source.part === 'main'
        ? name
        : `${name} (${c.source.part})`;
    }
    case 'ancestry':
      return ruleset.ancestryAbilitiesById[c.source.id]?.ability.name ?? c.source.id;
  }
}
