// Pre-registration for an event: what the character collects at check-in (Harvesting,
// Merchanting, Human silver, Totemic components, Familiar tricks), the upkeep due and how it is
// covered, and the Mist Token purchases planned, each checked through the engine. Pure TS.
// Rules: [EVT-CHECKIN], [EVT-UPKEEP], [SKL-CHECKIN], [EVT-CHECKIN-INCOME], [PTS-MT-SPEND].
import { z } from 'zod';
import type { SyRuleset } from '../../data/index.ts';
import { RefIdSchema } from '../actions/define.ts';
import { AttendanceSchema } from '../actions/events.ts';
import { upkeepDue } from '../commands/events.ts';
import { plan } from '../commands/plan.ts';
import { mtUnitPrice } from '../commands/points.ts';
import { deriveSheet } from '../derive/deriveSheet.ts';
import { NamedLevelSchema, type Action, type GameEvent } from '../model.ts';
import { attendanceSilver } from '../rules/awards.ts';
import { incomeItems, upkeepOptionIndex, type PullItem } from '../rules/income.ts';
import type { IncomeSource, Sheet, UpkeepCover } from '../sheet.ts';

export type { PullItem } from '../rules/income.ts';

/** A check-in income source the character has (same shape as sheet.stats.checkInIncome). */
export type CheckInSource = IncomeSource;

const Count = z.int().min(0).max(1000);

export const CheckInChoicesSchema = z.object({
  /** Per income source id: index of the per-level option (Merchanting: 0 Copper, 1 upkeep). */
  perLevel: z.record(z.string().min(1).max(100), Count).optional(),
  /** Per income source id: index of the Technique option, or `alternative`. */
  technique: z
    .record(z.string().min(1).max(100), z.union([Count, z.literal('alternative')]))
    .optional(),
  /** Per income source id: Exotic Components taken by trading Basic Components. */
  tradeExotics: z.record(z.string().min(1).max(100), Count).optional(),
  /** How upkeep is covered when due: `paid`, or an upkeep modifier the character has. */
  upkeep: RefIdSchema.optional(),
  /** Paid NPC: skill use or silver. */
  paidChoice: z.enum(['skills', 'silver']).optional(),
});
export type CheckInChoices = z.infer<typeof CheckInChoicesSchema>;

export const PlannedPurchaseSchema = z.object({
  purchaseId: RefIdSchema,
  qty: z.int().min(1).max(1000),
  namedLevel: NamedLevelSchema.optional(),
});
export type PlannedPurchase = z.infer<typeof PlannedPurchaseSchema>;

export const RegistrationPlanSchema = z.object({
  /** Attendance the player plans (staff confirm at check-in). */
  attendance: AttendanceSchema.default('player'),
  purchases: z.array(PlannedPurchaseSchema).max(20).default([]),
  choices: CheckInChoicesSchema.default({}),
  note: z.string().trim().max(2000).default(''),
});
export type RegistrationPlan = z.output<typeof RegistrationPlanSchema>;
export type RegistrationPlanInput = z.input<typeof RegistrationPlanSchema>;

/** Mist Token purchases a player may make when pre-registering; the rest stay with staff. */
export const PREREG_PURCHASES = [
  'xp',
  'cxp',
  'basic-component',
  'exotic-component',
  'uncut-gem',
  'copper',
  'spell-enhancement',
] as const;

/** Every check-in income source this character has. */
export function checkInSources(_ruleset: SyRuleset, sheet: Sheet): CheckInSource[] {
  return [...sheet.stats.checkInIncome];
}

export interface UpkeepInfo {
  /** Silver due at this event (0 when nothing is due). */
  dueSilver: number;
  due: boolean;
  /** Why it is not due, for example "first event". */
  reason: string | null;
  /** Ways the character can cover it. */
  covers: readonly UpkeepCover[];
}

/** Upkeep for this event: 1 Silver unless it is the first event or the Calling pays none. */
export function upkeepFor(_ruleset: SyRuleset, sheet: Sheet, eventKey: string): UpkeepInfo {
  const due = upkeepDue(sheet, eventKey);
  const covers = sheet.stats.upkeep.covers;
  if (due > 0) return { dueSilver: due, due: true, reason: null, covers };
  const first = sheet.events.filter((e) => e.key !== eventKey).length === 0;
  return {
    dueSilver: 0,
    due: false,
    reason:
      first && sheet.stats.upkeep.firstEventFree
        ? 'first event: no upkeep'
        : 'no upkeep for this Calling',
    covers,
  };
}

/** Items a character collects from its check-in sources with these choices. */
export function checkInItems(
  _ruleset: SyRuleset,
  sources: readonly CheckInSource[],
  choices: CheckInChoices,
): { items: PullItem[]; picks: string[]; problems: string[] } {
  const perLevel: Record<string, number> = { ...(choices.perLevel ?? {}) };
  const picks: string[] = [];
  if (choices.upkeep && choices.upkeep !== 'paid') {
    const source = sources.find((s) => s.id === `skill:${choices.upkeep ?? ''}`);
    const index = source ? upkeepOptionIndex(source) : -1;
    if (source && index >= 0) perLevel[source.id] = index;
  }
  const { items, problems } = incomeItems(sources, {
    perLevel,
    ...(choices.technique ? { technique: choices.technique } : {}),
    ...(choices.tradeExotics ? { tradeExotics: choices.tradeExotics } : {}),
  });
  return { items, picks, problems };
}

export interface PlannedPurchaseResult {
  purchaseId: string;
  name: string;
  qty: number;
  cost: number;
}

export interface RegistrationCheck {
  /** Readable problems; empty when the plan can be saved. */
  errors: string[];
  sources: CheckInSource[];
  upkeep: UpkeepInfo & { coveredBy: string | null };
  purchases: PlannedPurchaseResult[];
  mtCost: number;
  mtBalance: number;
  /** Everything staff hand over, in order: attendance, check-in income, purchases. */
  items: PullItem[];
  /** Choices and notes, as text. */
  picks: string[];
  /** The engine commands staff run at check-in, before the check-in itself. */
  purchaseCommands: {
    purchaseId: string;
    qty: number;
    namedLevel?: PlannedPurchase['namedLevel'];
  }[];
  /**
   * The sheet after the purchases that pass, as the check-in itself will see it (XP bought with
   * Mist Tokens counts toward the earned cap). The current sheet when there are none.
   */
  sheetAfterPurchases: Sheet;
}

/**
 * Checks a pre-registration against the rules: the choices, every Mist Token purchase in order
 * (price, per-event cap, balance), and upkeep. Returns the pull list staff use at check-in.
 */
export function checkRegistration(
  ruleset: SyRuleset,
  actions: readonly Action[],
  event: GameEvent,
  input: RegistrationPlanInput,
): RegistrationCheck {
  const parsed = RegistrationPlanSchema.safeParse(input);
  const sheet = deriveSheet(ruleset, actions);
  const sources = checkInSources(ruleset, sheet);
  const upkeepBase = upkeepFor(ruleset, sheet, event.key);
  const empty: RegistrationCheck = {
    errors: ['The registration is not valid.'],
    sources,
    upkeep: { ...upkeepBase, coveredBy: null },
    purchases: [],
    mtCost: 0,
    mtBalance: sheet.points.mt.balance,
    items: [],
    picks: [],
    purchaseCommands: [],
    sheetAfterPurchases: sheet,
  };
  if (!parsed.success) return empty;
  const reg = parsed.data;
  const errors: string[] = [];
  const bundle = ruleset.attendanceById[reg.attendance];
  if (sheet.events.some((e) => e.key === event.key))
    errors.push(`${sheet.profile.characterName} is already checked in to ${event.name}.`);

  // Upkeep.
  let coveredBy: string | null = null;
  const picks: string[] = [];
  if (upkeepBase.due) {
    const auto = upkeepBase.covers.find((c) => c.automatic)?.id;
    coveredBy = reg.choices.upkeep ?? auto ?? null;
    if (coveredBy === null) errors.push('Choose how upkeep is paid.');
    else if (coveredBy !== 'paid' && !upkeepBase.covers.some((c) => c.id === coveredBy))
      errors.push('That upkeep cover is not available to this character.');
    else
      picks.push(
        coveredBy === 'paid'
          ? `Upkeep: paying ${upkeepBase.dueSilver} Silver`
          : `Upkeep: covered by ${ruleset.skillsById[coveredBy]?.name ?? coveredBy}`,
      );
  }

  // Attendance silver and check-in income.
  const items: PullItem[] = [];
  if (bundle) {
    if (reg.choices.paidChoice && !bundle.paidChoice)
      errors.push(`${bundle.name} has no paid choice.`);
    const silver = attendanceSilver(bundle, reg.choices.paidChoice, sheet.points.xp.earned);
    if (silver > 0)
      items.push({
        from: 'attendance',
        source: bundle.name,
        what: 'silver',
        qty: silver,
        text: `${silver} Silver (${bundle.name})`,
      });
  }
  const income = checkInItems(ruleset, sources, {
    ...reg.choices,
    ...(coveredBy !== null ? { upkeep: coveredBy } : {}),
  });
  items.push(...income.items);
  errors.push(...income.problems);

  // Mist Token purchases, planned one by one on the running sheet, like staff would at the desk.
  const commands: RegistrationCheck['purchaseCommands'] = [];
  const results: PlannedPurchaseResult[] = [];
  const seen = new Set<string>();
  for (const p of reg.purchases) {
    const def = ruleset.mtPurchasesById[p.purchaseId];
    if (!def || !(PREREG_PURCHASES as readonly string[]).includes(p.purchaseId)) {
      errors.push(`${def?.name ?? p.purchaseId} cannot be bought when pre-registering.`);
      continue;
    }
    if (seen.has(p.purchaseId)) {
      errors.push(`${def.name} is listed twice.`);
      continue;
    }
    seen.add(p.purchaseId);
    commands.push({
      purchaseId: p.purchaseId,
      qty: p.qty,
      ...(p.namedLevel ? { namedLevel: p.namedLevel } : {}),
    });
    results.push({
      purchaseId: p.purchaseId,
      name: def.name,
      qty: p.qty,
      cost: (mtUnitPrice(def, p.namedLevel) ?? 0) * p.qty,
    });
  }

  let running = [...actions];
  let n = 0;
  for (const c of commands) {
    const current = deriveSheet(ruleset, running);
    const result = plan(
      ruleset,
      current,
      { type: 'spendMt', ...c, eventKey: event.key },
      {
        actor: { role: 'staff' },
        now: () => '2000-01-01T00:00:00.000Z',
        newId: () => `registration-check-${++n}`,
        nextSeq: current.lastSeq + 1,
      },
    );
    const name = ruleset.mtPurchasesById[c.purchaseId]?.name ?? c.purchaseId;
    if (!result.ok) {
      for (const e of result.errors)
        errors.push(e.message.startsWith(name) ? e.message : `${name}: ${e.message}`);
      continue;
    }
    running = [...running, ...result.actions];
    for (const a of result.actions) {
      const payload = a.payload as { items?: string[] };
      for (const text of payload.items ?? [])
        items.push({
          from: 'purchase',
          source: `Mist Tokens: ${name}`,
          what: 'item',
          qty: c.qty,
          text,
        });
    }
  }

  return {
    errors,
    sources,
    upkeep: { ...upkeepBase, coveredBy },
    purchases: results,
    mtCost: results.reduce((sum, r) => sum + r.cost, 0),
    mtBalance: sheet.points.mt.balance,
    items,
    picks,
    purchaseCommands: commands,
    sheetAfterPurchases: running.length === actions.length ? sheet : deriveSheet(ruleset, running),
  };
}
