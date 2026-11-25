// What a character collects at check-in, from the income sources on the sheet ([SKL-CHECKIN],
// [EVT-CHECKIN-INCOME]) and the player's choices: which per-level option (Merchanting: Copper or
// upkeep), which Technique option, the Harvesting Grandmaster alternative and Exotic trade.
// Q-SKL-13: one Merchanting choice per check-in for all levels.
import type { IncomeOption, IncomeSource } from '../sheet.ts';
import { incomeText } from './stats.ts';

/** The player's check-in income choices, keyed by income source id. */
export interface IncomeChoices {
  /** Index of the per-level option (default 0). */
  readonly perLevel?: Readonly<Record<string, number>>;
  /** Index of the Technique option (default 0), or `alternative`. */
  readonly technique?: Readonly<Record<string, number | 'alternative'>>;
  /** Harvesting Grandmaster: Exotics taken by trading Basic Components. */
  readonly tradeExotics?: Readonly<Record<string, number>>;
}

/** One line of the pull list: what staff hand over at check-in. */
export interface PullItem {
  readonly from: 'check-in' | 'purchase' | 'attendance';
  /** Where it comes from, for example "Harvesting" or "Mist Tokens: Basic Component". */
  readonly source: string;
  readonly what:
    | 'copper'
    | 'silver'
    | 'basic-component'
    | 'exotic-component'
    | 'master-building-material'
    | 'trade-item'
    | 'mix'
    | 'upkeep'
    | 'item';
  readonly qty: number;
  /** "10 Copper (Merchanting)". */
  readonly text: string;
}

function itemsOf(source: string, o: IncomeOption): PullItem[] {
  const out: PullItem[] = [];
  const push = (what: PullItem['what'], qty: number, text: string) =>
    out.push({ from: 'check-in', source, what, qty, text: `${text} (${source})` });
  if (o.copper) push('copper', o.copper, incomeText({ copper: o.copper }));
  if (o.silver) push('silver', o.silver, incomeText({ silver: o.silver }));
  if (o.basicComponents)
    push('basic-component', o.basicComponents, incomeText({ basicComponents: o.basicComponents }));
  if (o.exoticComponents)
    push(
      'exotic-component',
      o.exoticComponents,
      incomeText({ exoticComponents: o.exoticComponents }),
    );
  if (o.masterBuildingMaterials)
    push(
      'master-building-material',
      o.masterBuildingMaterials,
      incomeText({ masterBuildingMaterials: o.masterBuildingMaterials }),
    );
  if (o.ownUpkeepSilver)
    push('upkeep', o.ownUpkeepSilver, `Covers ${o.ownUpkeepSilver} Silver of own upkeep`);
  if (o.tradeItem) push('trade-item', 1, incomeText({ tradeItem: o.tradeItem }));
  if (o.mixCopperValue)
    push(
      'mix',
      o.mixCopperValue,
      incomeText({
        mixCopperValue: o.mixCopperValue,
        ...(o.maxItems ? { maxItems: o.maxItems } : {}),
      }),
    );
  return out;
}

function pick(
  options: readonly IncomeOption[] | null,
  index: number | undefined,
  name: string,
  problems: string[],
): IncomeOption | null {
  if (!options || options.length === 0) return null;
  const i = index ?? 0;
  const option = options[i];
  if (!option) {
    problems.push(`${name}: choose one of the ${options.length} options.`);
    return options[0] ?? null;
  }
  return option;
}

/** Index of the per-level option that covers own upkeep (Merchanting), or -1. */
export function upkeepOptionIndex(source: IncomeSource): number {
  return (source.choice ?? []).findIndex((o) => (o.ownUpkeepSilver ?? 0) > 0);
}

/** The pull list for `sources` with `choices`, and any problems with the choices. */
export function incomeItems(
  sources: readonly IncomeSource[],
  choices: IncomeChoices = {},
): { items: PullItem[]; problems: string[] } {
  const items: PullItem[] = [];
  const problems: string[] = [];
  for (const s of sources) {
    let basic = 0;
    let exotic = 0;
    const lines: PullItem[] = [];
    const take = (o: IncomeOption | null) => {
      if (!o) return;
      for (const item of itemsOf(s.name, o)) {
        if (item.what === 'basic-component') basic += item.qty;
        else if (item.what === 'exotic-component') exotic += item.qty;
        else lines.push(item);
      }
    };
    take(s.fixed);
    take(pick(s.choice, choices.perLevel?.[s.id], s.name, problems));
    const t = s.technique;
    if (t) {
      const chosen = choices.technique?.[s.id];
      if (chosen === 'alternative') {
        if (t.alternative) take(t.alternative);
        else problems.push(`${s.name}: there is no alternative to choose.`);
      } else {
        take(t.fixed);
        take(pick(t.choice, chosen, s.name, problems));
      }
      const trade = choices.tradeExotics?.[s.id] ?? 0;
      if (trade > 0) {
        if (!t.trade) problems.push(`${s.name}: no trade is allowed.`);
        else {
          const most = Math.min(
            Math.floor(basic / t.trade.basicPerExotic),
            Math.max(0, t.trade.maxExoticTotal - exotic),
          );
          if (trade > most) problems.push(`${s.name}: at most ${most} Exotic Components by trade.`);
          const n = Math.min(trade, most);
          basic -= n * t.trade.basicPerExotic;
          exotic += n;
        }
      }
    }
    if (basic > 0)
      items.push({
        from: 'check-in',
        source: s.name,
        what: 'basic-component',
        qty: basic,
        text: `${incomeText({ basicComponents: basic })} (${s.name})`,
      });
    if (exotic > 0)
      items.push({
        from: 'check-in',
        source: s.name,
        what: 'exotic-component',
        qty: exotic,
        text: `${incomeText({ exoticComponents: exotic })} (${s.name})`,
      });
    items.push(...lines);
  }
  return { items, problems };
}
