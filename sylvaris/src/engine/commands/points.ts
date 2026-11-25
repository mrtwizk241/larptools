// awardPoints, adjustPoints, spendMt ([PTS-XP-MAX], [PTS-CXP-MAX], [PTS-MT-SPEND],
// [PTS-MT-MISSED], [PTS-MT-ALT]).
// - Awards: XP and CXP stop at their earned caps; the excess is recorded as not credited.
// - Adjustments: corrections and penalties with a reason; never clamped.
// - Mist Token purchases: prices and per-event and per-year caps from awards.json; teaching is
//   one per event (shared cap group); XP and CXP bought count as earned, so a purchase the cap
//   cannot credit in full is blocked. Q-PTS-1: no total spend cap unless the data sets one.
// - Back-buys (Rulebook p.12): need the event they are bought at; the event they count for is
//   one the character checked in at, in the same calendar year, not after the purchase. The
//   per-event caps count against that real event, so made-up keys open no new allowance.
// - Missed Event XP (p.13): a known event (the events registry in the plan context) of the
//   current year that the character has no credit for. Alternate Character Event XP: one use
//   per event the player attended that year (staff give the count, else this character's).
//   Mist Tokens are per character (Q-PTS-6). The engine sees one character: the player's
//   events in a year default to this character's, and staff may pass the real count.
import { z } from 'zod';
import type { SyMtPurchase, SyRuleset } from '../../data/index.ts';
import { LedgerCurrencySchema, RefIdSchema } from '../actions/define.ts';
import type { MtSpentPayload } from '../actions/points.ts';
import { notice, ruleError } from '../errors.ts';
import { EventKeySchema, eventKeyDate, NamedLevelSchema, type NamedLevelId } from '../model.ts';
import { label } from '../rules/skills.ts';
import type { LedgerCurrency } from '../sheet.ts';
import { defineCommand, evaluation } from './define.ts';
import {
  available,
  currencyName,
  eventsInYear,
  hasEventXp,
  netCredited,
  OptionalText,
  plural,
  RESERVED_KINDS,
} from './helpers.ts';

export const AwardPointsCommand = z.object({
  type: z.literal('awardPoints'),
  currency: LedgerCurrencySchema,
  amount: z.int().min(1).max(1_000_000),
  /** Ledger kind id from ruleset.ledgerKinds, for example "donation" or "gm-award". */
  kind: RefIdSchema,
  eventKey: EventKeySchema.optional(),
  note: OptionalText,
});
export type AwardPointsCommand = z.input<typeof AwardPointsCommand>;

export const awardPoints = defineCommand<z.output<typeof AwardPointsCommand>>({
  type: 'awardPoints',
  schema: AwardPointsCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    if (!ruleset.ruleset.ledgerKinds.some((k) => k.id === cmd.kind)) {
      ev.errors.push(
        ruleError('INVALID_KIND', `Unknown ledger kind "${cmd.kind}".`, 'PTS-MT-EARN'),
      );
      return ev;
    }
    if (RESERVED_KINDS.has(cmd.kind)) {
      ev.errors.push(
        ruleError(
          'INVALID_KIND',
          `Kind "${cmd.kind}" is recorded by another command, not as an award.`,
          'PTS-MT-EARN',
        ),
      );
      return ev;
    }
    if (cmd.kind === 'event') {
      if (cmd.eventKey === undefined)
        ev.errors.push(
          ruleError('EVENT_REQUIRED', 'Event awards need the event they are for.', 'PTS-XP-EVENT'),
        );
      else if (netCredited(sheet, cmd.currency, ['event'], cmd.eventKey) > 0)
        ev.errors.push(
          ruleError(
            'EVENT_ALREADY_CREDITED',
            `Event ${currencyName(ruleset, cmd.currency)} for ${cmd.eventKey} is already credited.`,
            'PTS-XP-EVENT',
          ),
        );
    }
    let amount = cmd.amount;
    if (cmd.currency === 'xp' || cmd.currency === 'cxp') {
      const pts = sheet.points[cmd.currency];
      const name = currencyName(ruleset, cmd.currency);
      const code = cmd.currency === 'xp' ? 'XP' : 'CXP';
      if (pts.capRemaining <= 0)
        ev.errors.push(
          ruleError(
            `${code}_CAP_REACHED`,
            `${name} cap reached: this character has earned ${pts.cap} ${name}.`,
            cmd.currency === 'xp' ? 'PTS-XP-MAX' : 'PTS-CXP-MAX',
          ),
        );
      else if (pts.capRemaining < amount) {
        ev.notices.push(
          notice(
            `${code}_CAPPED`,
            `${name} cap reached: credited ${pts.capRemaining} of ${amount}; ${amount - pts.capRemaining} not credited.`,
            cmd.currency === 'xp' ? 'PTS-XP-MAX' : 'PTS-CXP-MAX',
          ),
        );
        ev.notCredited = [
          { currency: cmd.currency, amount: amount - pts.capRemaining, kind: cmd.kind },
        ];
        amount = pts.capRemaining;
      }
    }
    if (ev.errors.length > 0) return ev;
    builder.add(
      'points.awarded',
      { currency: cmd.currency, amount, kind: cmd.kind, requested: cmd.amount, credited: amount },
      { eventKey: cmd.eventKey, note: cmd.note },
    );
    ev.awards = [{ currency: cmd.currency, amount, kind: cmd.kind }];
    return ev;
  },
});

export const AdjustPointsCommand = z.object({
  type: z.literal('adjustPoints'),
  currency: LedgerCurrencySchema,
  /** May be negative; never 0. */
  amount: z
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((n) => n !== 0, 'An adjustment cannot be 0.'),
  reason: OptionalText,
  kind: z.enum(['adjustment', 'penalty']).default('adjustment'),
  eventKey: EventKeySchema.optional(),
  note: OptionalText,
});
export type AdjustPointsCommand = z.input<typeof AdjustPointsCommand>;

export const adjustPoints = defineCommand<z.output<typeof AdjustPointsCommand>>({
  type: 'adjustPoints',
  schema: AdjustPointsCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const reason = cmd.reason ?? '';
    if (reason === '') {
      ev.errors.push(
        ruleError('REASON_REQUIRED', 'An adjustment needs a reason.', 'PTS-DISCIPLINE'),
      );
      return ev;
    }
    const name = currencyName(ruleset, cmd.currency);
    const after = available(sheet, cmd.currency) + cmd.amount;
    if (after < 0)
      ev.notices.push(
        notice(
          'NEGATIVE_AFTER_ADJUSTMENT',
          `${name} available will be ${after}. The sheet will show a warning until it is fixed.`,
          'PTS-DISCIPLINE',
        ),
      );
    if ((cmd.currency === 'xp' || cmd.currency === 'cxp') && cmd.amount > 0) {
      const room = sheet.points[cmd.currency].capRemaining;
      if (cmd.amount > room)
        ev.notices.push(
          notice(
            'ABOVE_CAP',
            `This puts earned ${name} ${cmd.amount - room} above the ${sheet.points[cmd.currency].cap} cap.`,
            cmd.currency === 'xp' ? 'PTS-XP-MAX' : 'PTS-CXP-MAX',
          ),
        );
    }
    builder.add(
      'points.adjusted',
      { currency: cmd.currency, amount: cmd.amount, reason, kind: cmd.kind },
      { eventKey: cmd.eventKey, note: cmd.note },
    );
    return ev;
  },
});

/** Mist Token purchase ids the engine treats as teaching (awards.json mtPurchases). */
export const MT_TEACHING = { normal: 'teaching-normal', advanced: 'teaching-advanced' } as const;

/** Price of one unit, or null when the named level is not sold. */
export function mtUnitPrice(purchase: SyMtPurchase, namedLevel?: NamedLevelId): number | null {
  if (purchase.mtCost !== undefined) return purchase.mtCost;
  if (namedLevel === undefined || !purchase.mtByNamedLevel) return null;
  return purchase.mtByNamedLevel[namedLevel] ?? null;
}

function itemTexts(
  ruleset: SyRuleset,
  purchase: SyMtPurchase,
  qty: number,
  namedLevel?: NamedLevelId,
  skillId?: string,
): string[] {
  const out: string[] = [];
  const i = purchase.items;
  if (i?.basicComponents) out.push(plural(i.basicComponents * qty, 'Basic Component'));
  if (i?.exoticComponents) out.push(plural(i.exoticComponents * qty, 'Exotic Component'));
  if (i?.uncutGems) out.push(plural(i.uncutGems * qty, 'Random Uncut Gem'));
  if (i?.copper) out.push(`${i.copper * qty} Copper`);
  if (!purchase.grants && !i) {
    const level = namedLevel ? `${label(namedLevel)} ` : '';
    const skill = skillId
      ? `: ${ruleset.skillsById[skillId]?.name ?? skillId} ${label(namedLevel ?? 'basic')}`
      : '';
    out.push(
      `${qty > 1 ? `${qty} x ` : ''}${skill ? purchase.name : `${level}${purchase.name}`}${skill}`,
    );
  }
  return out;
}

export const SpendMtCommand = z.object({
  type: z.literal('spendMt'),
  purchaseId: RefIdSchema,
  qty: z.int().min(1).max(1000).default(1),
  /** Purchases priced by named level (teaching, Spell Enhancement, stable items). */
  namedLevel: NamedLevelSchema.optional(),
  /** Teaching: the skill taught. */
  skillId: RefIdSchema.optional(),
  /** The event the purchase is made at. */
  eventKey: EventKeySchema.optional(),
  /** The event it counts for: a back-buy, the missed event, or the alternate character's event. */
  forEventKey: EventKeySchema.optional(),
  /** Events the player attended that calendar year, across characters. */
  playerEventsAttendedInYear: z.int().min(0).max(1000).optional(),
  note: OptionalText,
});
export type SpendMtCommand = z.input<typeof SpendMtCommand>;

export const spendMt = defineCommand<z.output<typeof SpendMtCommand>>({
  type: 'spendMt',
  schema: SpendMtCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const RULE = 'PTS-MT-SPEND';
    const purchase = ruleset.mtPurchasesById[cmd.purchaseId];
    if (!purchase) {
      ev.errors.push(
        ruleError('UNKNOWN_PURCHASE', `Unknown Mist Token purchase "${cmd.purchaseId}".`, RULE),
      );
      return ev;
    }
    const qty = cmd.qty;
    const unit = mtUnitPrice(purchase, cmd.namedLevel);
    if (unit === null) {
      ev.errors.push(
        cmd.namedLevel === undefined
          ? ruleError('CHOICE_REQUIRED', `${purchase.name}: choose the named level.`, RULE)
          : ruleError(
              'NAMED_LEVEL_INVALID',
              `${purchase.name} is not sold at ${label(cmd.namedLevel)}.`,
              RULE,
            ),
      );
      return ev;
    }
    const isTeaching = purchase.id === MT_TEACHING.normal || purchase.id === MT_TEACHING.advanced;
    const single = isTeaching || purchase.condition !== undefined;
    if (single && qty !== 1)
      ev.errors.push(ruleError('QTY_INVALID', `${purchase.name} is bought one at a time.`, RULE));
    const mtCost = unit * qty;
    ev.cost = { currency: 'mt', amount: mtCost };
    const balance = sheet.points.mt.balance;
    if (mtCost > balance)
      ev.errors.push(
        ruleError(
          'NOT_ENOUGH_MT',
          `Not enough Mist Tokens: needs ${mtCost}, ${balance} left.`,
          RULE,
        ),
      );

    // Teaching: the skill and level taught.
    if (isTeaching) {
      const skill = cmd.skillId ? ruleset.skillsById[cmd.skillId] : undefined;
      if (!cmd.skillId)
        ev.errors.push(ruleError('CHOICE_REQUIRED', 'Choose the skill being taught.', RULE));
      else if (!skill)
        ev.errors.push(ruleError('UNKNOWN_SKILL', `Unknown skill "${cmd.skillId}".`, RULE));
      else if (skill.category === 'calling')
        ev.errors.push(
          ruleError(
            'MT_TEACHING_INVALID',
            'Calling skills are learned from the Calling book or a teacher.',
            'CALL-TECH',
          ),
        );
      else if ((purchase.id === MT_TEACHING.advanced) !== skill.advanced)
        ev.errors.push(
          ruleError(
            'MT_TEACHING_INVALID',
            `${skill.name} is ${skill.advanced ? 'an advanced' : 'a normal'} skill: use the ${skill.advanced ? 'advanced' : 'normal'} teaching.`,
            RULE,
          ),
        );
    }

    // Event keys and caps.
    const capKey = cmd.forEventKey ?? cmd.eventKey ?? null;
    if (cmd.forEventKey !== undefined) {
      const forKey = cmd.forEventKey;
      if (!purchase.backBuy && purchase.condition === undefined)
        ev.errors.push(
          ruleError(
            'BACK_BUY_NOT_ALLOWED',
            `${purchase.name} cannot be bought for another event.`,
            RULE,
          ),
        );
      else if (cmd.eventKey !== undefined) {
        if (forKey.slice(0, 4) !== cmd.eventKey.slice(0, 4))
          ev.errors.push(
            ruleError(
              'BACK_BUY_YEAR',
              'Back purchases are only for events of the same calendar year as the purchase.',
              RULE,
            ),
          );
        else if (eventKeyDate(forKey) > eventKeyDate(cmd.eventKey))
          ev.errors.push(
            ruleError(
              'BACK_BUY_DATE',
              'The event it counts for cannot be after the event it is bought at.',
              RULE,
            ),
          );
      } else if (purchase.condition === undefined)
        ev.errors.push(
          ruleError(
            'EVENT_REQUIRED',
            'A back purchase needs the event it is bought at: choose the event.',
            RULE,
          ),
        );
      if (purchase.backBuy && purchase.condition === undefined)
        if (!sheet.events.some((e) => e.key === forKey))
          ev.errors.push(
            ruleError(
              'BACK_BUY_NOT_ATTENDED',
              `Back purchases count for an event the character checked in at; ${forKey} is not one.`,
              RULE,
            ),
          );
    }
    const group = purchase.capGroup;
    const sameCap = (id: string) =>
      group !== undefined ? ruleset.mtPurchasesById[id]?.capGroup === group : id === purchase.id;
    if (purchase.capPerEvent !== undefined) {
      if (capKey === null)
        ev.errors.push(
          ruleError(
            'EVENT_REQUIRED',
            `${purchase.name} is capped per event: choose the event.`,
            RULE,
          ),
        );
      else {
        const bought = sheet.mtPurchases
          .filter((p) => sameCap(p.purchaseId) && p.capKey === capKey)
          .reduce((n, p) => n + p.qty, 0);
        if (bought + qty > purchase.capPerEvent)
          ev.errors.push(
            ruleError(
              'PURCHASE_OVER_CAP',
              `${purchase.name}: at most ${purchase.capPerEvent} per event; ${bought} already bought for this event.`,
              RULE,
            ),
          );
      }
    }
    if (purchase.capPerYear !== undefined) {
      if (capKey === null)
        ev.errors.push(
          ruleError(
            'EVENT_REQUIRED',
            `${purchase.name} is capped per year: choose the event.`,
            RULE,
          ),
        );
      else {
        const year = capKey.slice(0, 4);
        const bought = sheet.mtPurchases
          .filter((p) => p.purchaseId === purchase.id && p.capKey?.startsWith(`${year}-`))
          .reduce((n, p) => n + p.qty, 0);
        if (bought + qty > purchase.capPerYear)
          ev.errors.push(
            ruleError(
              'PURCHASE_OVER_CAP',
              `${purchase.name}: at most ${purchase.capPerYear} per year; ${bought} already bought in ${year}.`,
              RULE,
            ),
          );
      }
    }
    const totalCap = ruleset.awards.totalSpendCap.perEvent;
    if (totalCap !== null && cmd.eventKey) {
      const spent = sheet.mtPurchases
        .filter((p) => p.eventKey === cmd.eventKey)
        .reduce((n, p) => n + p.mtCost, 0);
      if (spent + mtCost > totalCap)
        ev.errors.push(
          ruleError(
            'MT_TOTAL_CAP',
            `At most ${totalCap} Mist Tokens per event; ${spent} spent.`,
            'PTS-MT-TOTAL-CAP',
          ),
        );
    }

    // Conditions.
    let grantKind = 'mt-purchase';
    if (purchase.condition !== undefined) {
      grantKind = purchase.condition;
      const forKey = cmd.forEventKey;
      if (!forKey)
        ev.errors.push(
          ruleError(
            'EVENT_REQUIRED',
            purchase.condition === 'missed-event'
              ? 'Choose the event that was missed.'
              : 'Choose the event the player attended with another character.',
            purchase.condition === 'missed-event' ? 'PTS-MT-MISSED' : 'PTS-MT-ALT',
          ),
        );
      else {
        const year = forKey.slice(0, 4);
        if (sheet.events.some((e) => e.key === forKey) || hasEventXp(sheet, forKey))
          ev.errors.push(
            ruleError(
              purchase.condition === 'missed-event'
                ? 'MISSED_EVENT_CONDITION'
                : 'ALT_CHARACTER_CONDITION',
              `This character already has event XP for ${forKey}.`,
              purchase.condition === 'missed-event' ? 'PTS-MT-MISSED' : 'PTS-MT-ALT',
            ),
          );
        if (purchase.condition === 'missed-event') {
          const thisYear = builder.at.slice(0, 4);
          if (year < thisYear)
            ev.errors.push(
              ruleError(
                'MISSED_EVENT_CONDITION',
                `Missed events can only be bought for the current year (${thisYear}).`,
                'PTS-MT-MISSED',
              ),
            );
          if (builder.events === null)
            ev.errors.push(
              ruleError(
                'EVENT_LIST_REQUIRED',
                'Missed Event XP needs the event list to check that the event took place.',
                'PTS-MT-MISSED',
              ),
            );
          else if (!builder.events.some((e) => e.key === forKey))
            ev.errors.push(
              ruleError('EVENT_UNKNOWN', `${forKey} is not a known event.`, 'PTS-MT-MISSED'),
            );
          const attended = cmd.playerEventsAttendedInYear ?? eventsInYear(sheet, year, forKey);
          if (attended < 1)
            ev.errors.push(
              ruleError(
                'MISSED_EVENT_CONDITION',
                `The player must have attended another event in ${year}.`,
                'PTS-MT-MISSED',
              ),
            );
        } else {
          const used = sheet.mtPurchases.filter(
            (p) => p.purchaseId === purchase.id && p.capKey?.startsWith(`${year}-`),
          ).length;
          const attended = cmd.playerEventsAttendedInYear ?? eventsInYear(sheet, year);
          if (attended === 0)
            ev.errors.push(
              ruleError(
                'ALT_CHARACTER_CONDITION',
                `Alternate character event XP: the player must attend an event in ${year} for each use; enter how many they attended.`,
                'PTS-MT-ALT',
              ),
            );
          else if (used + 1 > attended)
            ev.errors.push(
              ruleError(
                'ALT_CHARACTER_CONDITION',
                `Alternate character event XP: ${plural(used, 'use')} in ${year}; the player attended ${plural(attended, 'event')} (one use per event attended).`,
                'PTS-MT-ALT',
              ),
            );
        }
      }
    }

    // Grants, with the earned caps: block what cannot be credited in full.
    const grants: { currency: LedgerCurrency; amount: number; kind: string }[] = (
      purchase.grants ?? []
    ).map((g) => ({ currency: g.currency, amount: g.amount * qty, kind: grantKind }));
    for (const currency of ['xp', 'cxp'] as const) {
      const wanted = grants
        .filter((g) => g.currency === currency)
        .reduce((n, g) => n + g.amount, 0);
      const room = sheet.points[currency].capRemaining;
      if (wanted > room)
        ev.errors.push(
          ruleError(
            currency === 'xp' ? 'XP_CAP_REACHED' : 'CXP_CAP_REACHED',
            `Only ${room} more ${currencyName(ruleset, currency)} can be earned (${sheet.points[currency].cap} cap).`,
            currency === 'xp' ? 'PTS-XP-MAX' : 'PTS-CXP-MAX',
          ),
        );
    }
    if (ev.errors.length > 0) return ev;
    const payload: MtSpentPayload = {
      purchaseId: purchase.id,
      qty,
      mtCost,
      grants,
      items: itemTexts(
        ruleset,
        purchase,
        qty,
        cmd.namedLevel,
        isTeaching ? cmd.skillId : undefined,
      ),
      ...(cmd.forEventKey ? { forEventKey: cmd.forEventKey } : {}),
      ...(purchase.mtByNamedLevel && cmd.namedLevel ? { namedLevel: cmd.namedLevel } : {}),
      ...(isTeaching && cmd.skillId ? { skillId: cmd.skillId } : {}),
    };
    builder.add('mt.spent', payload, { eventKey: cmd.eventKey, note: cmd.note });
    ev.awards = grants.map((g) => ({ ...g }));
    return ev;
  },
});
