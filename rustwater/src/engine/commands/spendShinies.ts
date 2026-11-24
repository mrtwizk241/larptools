// spendShinies: one Shiny purchase with prices and per-event caps from awards.json
// ([PTS-SHINY-SPEND]). Resource caps are per rarity in total per event (DECISIONS Q-PTS-8).
// Bought CXP counts as earned, so a purchase the cap cannot fully credit is blocked.
//
// The engine sees one character. "Player attended" counts for the missed-event and alt-character
// rules default to this character's own events; the UI may pass the player's count across
// characters as playerEventsAttendedInYear. Ban periods are not modelled yet.
import { z } from 'zod';
import { RefIdSchema } from '../actions/define.ts';
import type { ShiniesSpentPayload } from '../actions/shiniesSpent.ts';
import { notice, ruleError } from '../errors.ts';
import { EventKeySchema, GameEventSchema } from '../model.ts';
import { defineCommand, evaluation } from './define.ts';
import {
  countsAsEarned,
  eventsInYear,
  hasEventCxp,
  itemText,
  OptionalText,
  plural,
} from './helpers.ts';

export const SpendShiniesCommand = z.object({
  type: z.literal('spendShinies'),
  purchaseId: RefIdSchema,
  qty: z.int().min(1).max(1000).default(1),
  /** Event the purchase is made at (needed for per-event caps; for alt purchases, the event the alt played). */
  eventKey: EventKeySchema.optional(),
  /** Missed-event purchase: the event missed. */
  forEvent: GameEventSchema.optional(),
  /** Alt-character purchase: the character who gets the Event CXP. */
  altCharacter: z
    .object({ id: z.string().max(64).optional(), name: z.string().trim().min(1).max(200) })
    .optional(),
  /** Events the player attended that calendar year, across characters. Defaults to this character's. */
  playerEventsAttendedInYear: z.int().min(0).max(1000).optional(),
  note: OptionalText,
});
export type SpendShiniesCommand = z.input<typeof SpendShiniesCommand>;

export const spendShinies = defineCommand<z.output<typeof SpendShiniesCommand>>({
  type: 'spendShinies',
  schema: SpendShiniesCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const purchase = ruleset.shinyPurchasesById[cmd.purchaseId];
    if (!purchase) {
      ev.errors.push(
        ruleError(
          'UNKNOWN_PURCHASE',
          `Unknown Shiny purchase "${cmd.purchaseId}".`,
          'PTS-SHINY-SPEND',
        ),
      );
      return ev;
    }
    const qty = cmd.qty;
    const cost = purchase.price * qty;
    ev.cost = { currency: 'shinies', amount: cost };
    const balance = sheet.points.shinies.balance;
    if (cost > balance)
      ev.errors.push(
        ruleError(
          'NOT_ENOUGH_SHINIES',
          `Not enough Shinies: needs ${cost}, ${balance} left.`,
          'PTS-SHINY-SPEND',
        ),
      );

    if (purchase.capPerEvent !== undefined) {
      if (cmd.eventKey === undefined)
        ev.errors.push(
          ruleError(
            'EVENT_REQUIRED',
            `${purchase.name} is capped per event: choose the event.`,
            'PTS-SHINY-SPEND',
          ),
        );
      else {
        const bought = sheet.shinyPurchases
          .filter((p) => p.purchaseId === purchase.id && p.eventKey === cmd.eventKey)
          .reduce((sum, p) => sum + p.qty, 0);
        if (bought + qty > purchase.capPerEvent)
          ev.errors.push(
            ruleError(
              'PURCHASE_OVER_CAP',
              `${purchase.name}: at most ${purchase.capPerEvent} per event; ${bought} already bought for this event.`,
              'PTS-SHINY-SPEND',
            ),
          );
      }
    }

    const grants: ShiniesSpentPayload['grants'] = (purchase.grants ?? []).map((g) => ({
      currency: g.currency as 'cxp' | 'pxp' | 'shinies' | 'fp',
      amount: g.amount * qty,
      kind: g.kind,
    }));
    const items = (purchase.items ?? []).map((i) => itemText(ruleset, i, qty));
    let forEvent: ShiniesSpentPayload['forEvent'];
    let altCharacter: ShiniesSpentPayload['altCharacter'];
    const eventCxp = ruleset.ruleset.eventCxp;

    if ((purchase.condition !== undefined || purchase.eventCxp) && qty !== 1)
      ev.errors.push(
        ruleError('QTY_INVALID', `${purchase.name} is bought one at a time.`, 'PTS-SHINY-SPEND'),
      );

    if (purchase.condition === 'missed-event') {
      if (!cmd.forEvent)
        ev.errors.push(
          ruleError('EVENT_REQUIRED', 'Choose the event that was missed.', 'PTS-SHINY-SPEND'),
        );
      else {
        forEvent = cmd.forEvent;
        const year = cmd.forEvent.date.slice(0, 4);
        if (
          hasEventCxp(sheet, cmd.forEvent.key) ||
          sheet.events.some((e) => e.key === cmd.forEvent?.key)
        )
          ev.errors.push(
            ruleError(
              'MISSED_EVENT_CONDITION',
              `This character already has Event CXP for ${cmd.forEvent.name}.`,
              'PTS-SHINY-SPEND',
            ),
          );
        const attended =
          cmd.playerEventsAttendedInYear ?? eventsInYear(sheet, year, cmd.forEvent.key);
        if (attended < 1)
          ev.errors.push(
            ruleError(
              'MISSED_EVENT_CONDITION',
              `The player must have attended another event in ${year}.`,
              'PTS-SHINY-SPEND',
            ),
          );
        grants.push({
          currency: 'cxp',
          amount: eventCxp,
          kind: 'event',
          eventKey: cmd.forEvent.key,
        });
      }
    } else if (purchase.condition === 'alt-character') {
      if (!cmd.altCharacter)
        ev.errors.push(
          ruleError(
            'ALT_CHARACTER_REQUIRED',
            'Name the character who gets the Event CXP.',
            'PTS-SHINY-SPEND',
          ),
        );
      if (cmd.eventKey === undefined)
        ev.errors.push(
          ruleError(
            'EVENT_REQUIRED',
            'Choose the event the other character played.',
            'PTS-SHINY-SPEND',
          ),
        );
      if (cmd.altCharacter && cmd.eventKey !== undefined) {
        altCharacter = cmd.altCharacter;
        const year = cmd.eventKey.slice(0, 4);
        const used = sheet.shinyPurchases.filter(
          (p) => p.purchaseId === purchase.id && p.eventKey?.startsWith(`${year}-`),
        ).length;
        const attended = cmd.playerEventsAttendedInYear ?? eventsInYear(sheet, year);
        const limit = Math.min(purchase.capPerCalendarYear ?? Infinity, attended);
        if (used + 1 > limit)
          ev.errors.push(
            ruleError(
              'ALT_CHARACTER_CONDITION',
              `Alt-character Event CXP: ${plural(used, 'use')} in ${year}; the limit is ${limit} (at most ${purchase.capPerCalendarYear ?? 'no limit'} a year and no more than the events the player attended).`,
              'PTS-SHINY-SPEND',
            ),
          );
        items.push(`Event CXP (${eventCxp}) for ${cmd.altCharacter.name} at ${cmd.eventKey}`);
        ev.notices.push(
          notice(
            'ALT_CHARACTER_CREDIT',
            `Record ${eventCxp} Event CXP on ${cmd.altCharacter.name} for ${cmd.eventKey}.`,
            'PTS-SHINY-WALLET',
          ),
        );
      }
    }

    // Bought CXP counts as earned: block what the cap cannot credit in full.
    const cxpWanted = grants
      .filter((g) => g.currency === 'cxp' && countsAsEarned(ruleset, g.kind))
      .reduce((sum, g) => sum + g.amount, 0);
    if (cxpWanted > sheet.points.cxp.capRemaining)
      ev.errors.push(
        ruleError(
          'CXP_CAP_REACHED',
          `Only ${sheet.points.cxp.capRemaining} more CXP can be earned (${ruleset.ruleset.earnedCxpCap.amount} cap).`,
          'PTS-CXP-CAP',
        ),
      );

    if (ev.errors.length > 0) return ev;
    builder.add(
      'shinies.spent',
      {
        purchaseId: purchase.id,
        qty,
        shiniesCost: cost,
        grants,
        items,
        ...(forEvent ? { forEvent } : {}),
        ...(altCharacter ? { altCharacter } : {}),
      },
      { eventKey: cmd.eventKey, note: cmd.note },
    );
    return ev;
  },
});
