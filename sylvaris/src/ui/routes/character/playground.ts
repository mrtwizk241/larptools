// The Character Playground and the public site's test builds (the no-login builds): points added
// and removed with the test build banner, skill levels and Techniques bought and taken back in one
// tap, each with an Undo. No events, teachers, reasons, or confirmation dialogs (ADR 0007). Pure
// helpers plus hooks.
//
// The engine lets these builds spend past the points they have: the header tiles go red, a toast
// says how far over, and a line says about how many events would earn the rest.
import type { Command, Ruleset, Sheet, SheetSkill } from '../../../engine/index.ts';
import type { SkillStep } from '../../../engine/model.ts';
import { useToast } from '../../components/index.ts';
import { useCommand } from '../../data/engineHooks.ts';

/** The reason recorded on playground adjustments and refunds (the engine wants one). */
export const PLAYGROUND_REASON = 'Build playground';

export type BudgetCurrency = 'xp' | 'cxp' | 'axp';
export const BUDGET_CURRENCIES: readonly BudgetCurrency[] = ['xp', 'cxp', 'axp'];

/** The choices for the banner's points control, XP first (the default). */
export const POINTS_CHOICES: readonly { id: BudgetCurrency; label: string }[] = [
  { id: 'xp', label: 'XP' },
  { id: 'cxp', label: 'CXP' },
  { id: 'axp', label: 'AXP' },
];

/** A signed whole number other than 0 ("50", "+50", "-20", "1,000"), or null when it is not one. */
export function parsePointsChange(text: string): number | null {
  const value = text.trim().replace(/^\+/, '').replace(/,/g, '');
  if (!/^-?\d{1,7}$/.test(value)) return null;
  const amount = Number(value);
  return amount === 0 || Math.abs(amount) > 1_000_000 ? null : amount;
}

/** The points adjustment that adds (positive) or removes (negative) XP, CXP, or AXP. */
export function pointsChangeCommand(currency: BudgetCurrency, amount: number): Command {
  return { type: 'adjustPoints', currency, amount, reason: PLAYGROUND_REASON };
}

function number(n: number): string {
  return n.toLocaleString('en-US');
}

function plural(n: number, one: string, many: string): string {
  return `${number(n)} ${n === 1 ? one : many}`;
}

/** Toast text after the change: "Added 50 XP." or "Removed 20 XP." */
export function pointsChangeText(currency: BudgetCurrency, amount: number): string {
  const name = currency.toUpperCase();
  return amount > 0 ? `Added ${number(amount)} ${name}.` : `Removed ${number(-amount)} ${name}.`;
}

export interface BudgetLine {
  readonly currency: BudgetCurrency;
  /** Points left (below zero when overspent). */
  readonly available: number;
  /** Points earned: the 150 starting XP plus points added. */
  readonly earned: number;
  /** Spent past what was earned, or 0. */
  readonly over: number;
  /** Points one event gives (ruleset.json). */
  readonly perEvent: number;
}

/** Left, earned, and overspent for XP, CXP, and AXP. */
export function budgetLines(ruleset: Ruleset, sheet: Sheet): BudgetLine[] {
  return BUDGET_CURRENCIES.map((currency) => {
    const p = sheet.points[currency];
    return {
      currency,
      available: p.available,
      earned: p.earned,
      over: Math.max(0, -p.available),
      perEvent: ruleset.ruleset[currency].perEvent,
    };
  });
}

/** Events that would earn `short` points at `perEvent` each (0 when nothing is short). */
function eventsFor(short: number, perEvent: number): number {
  return short > 0 && perEvent > 0 ? Math.ceil(short / perEvent) : 0;
}

/**
 * About how many events would earn what the build spends past its points: the most any one
 * currency needs at its points per event (60 XP, 5 CXP, 1 AXP). 0 when nothing is over.
 */
export function eventsNeeded(lines: readonly BudgetLine[]): number {
  return lines.reduce((most, l) => Math.max(most, eventsFor(l.over, l.perEvent)), 0);
}

/**
 * The pop-up after a build spends more XP, CXP, or AXP than it has. `short` is how far below
 * zero the balance is. "You have spent 25 more XP than you have. Earning it takes 1 event
 * (60 XP an event)."
 */
export function overspendText(ruleset: Ruleset, currency: BudgetCurrency, short: number): string {
  const name = currency.toUpperCase();
  const perEvent = ruleset.ruleset[currency].perEvent;
  return (
    `You have spent ${number(short)} more ${name} than you have. ` +
    `Earning it takes ${plural(eventsFor(short, perEvent), 'event', 'events')} ` +
    `(${number(perEvent)} ${name} an event).`
  );
}

/** "60 XP", "60 XP and 5 CXP", "60 XP, 5 CXP, and 1 AXP". */
function listText(items: readonly string[]): string {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1) ?? ''}`;
}

/**
 * The line under the points while any is below zero, or null: "Over: about 3 more events would
 * earn this build (60 XP, 5 CXP, and 1 AXP an event)." It names only the currencies that are
 * over and counts the events for the one that needs the most.
 */
export function eventsEstimateText(ruleset: Ruleset, sheet: Sheet): string | null {
  const lines = budgetLines(ruleset, sheet).filter((l) => l.over > 0);
  if (lines.length === 0) return null;
  const n = eventsNeeded(lines);
  const rates = listText(lines.map((l) => `${number(l.perEvent)} ${l.currency.toUpperCase()}`));
  return `Over: about ${plural(n, 'more event', 'more events')} would earn this build (${rates} an event).`;
}

/** The step a quick "remove" takes back: the top level when it can go, else the top Technique. */
export function removableStep(skill: SheetSkill | undefined): SkillStep | null {
  if (!skill || skill.level === 0) return null;
  return (
    skill.refundable.find((s) => 'level' in s) ??
    skill.refundable.find((s) => 'technique' in s) ??
    null
  );
}

export function learnCommand(skillId: string, step: SkillStep): Command {
  return { type: 'learnSkill', skillId, step };
}

export function refundCommand(skillId: string, step: SkillStep): Command {
  return { type: 'refundSkill', skillId, step, reason: PLAYGROUND_REASON };
}

/**
 * Runs a playground change and offers Undo (the opposite change). Refusals (prerequisites, step
 * order) show as a message.
 */
export function usePlayground(characterId: string) {
  const command = useCommand(characterId);
  const toast = useToast();

  async function change(cmd: Command, done: string, undo: Command | null): Promise<boolean> {
    const outcome = await command.run(cmd);
    if (!outcome.ok) {
      // A tap while the last one saves is simply dropped.
      if (!outcome.errors.every((e) => e.code === 'BUSY'))
        toast.show(outcome.errors.map((e) => e.message).join(' '));
      return false;
    }
    toast.show(
      done,
      undo
        ? {
            onUndo: () => {
              void command.run(undo).then((o) => {
                if (!o.ok && !o.errors.every((e) => e.code === 'BUSY'))
                  toast.show(o.errors.map((e) => e.message).join(' '));
              });
            },
          }
        : {},
    );
    return true;
  }

  return { change, running: command.running };
}

/** "Toughness level 4", "Toughness Expert Technique". */
export function stepWhat(name: string, step: SkillStep): string {
  return `${name} ${'level' in step ? `level ${step.level}` : `${step.technique.charAt(0).toUpperCase()}${step.technique.slice(1)} Technique`}`;
}

/** Learn or take back one step of a skill, with Undo. `name` is the skill's display name. */
export function usePlaygroundSkill(characterId: string) {
  const { change, running } = usePlayground(characterId);
  return {
    running,
    learn: (skillId: string, name: string, step: SkillStep) =>
      change(
        learnCommand(skillId, step),
        `Learned ${stepWhat(name, step)}.`,
        refundCommand(skillId, step),
      ),
    takeBack: (skillId: string, name: string, step: SkillStep) =>
      change(
        refundCommand(skillId, step),
        `Took back ${stepWhat(name, step)}.`,
        learnCommand(skillId, step),
      ),
  };
}
