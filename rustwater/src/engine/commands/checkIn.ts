// checkIn: record attendance at one event and compute its awards from awards.json
// ([PTS-CHECKIN], [PTS-CXP-EVENT], [PTS-SHINY-EARN], [PTS-CXP-CAP]).
// - Event CXP and the attendance FP at most once per event key (one check-in per event).
// - FP: 1 per attended event whatever the attendance (DECISIONS Q-PTS-7: the bundles carry it).
// - Partial attendance still gets full Event CXP (DECISIONS Q-PTS-11).
// - NPC time: credited hours = max(hours, 5) with a pre-signed 4 hour shift; CXP and PXP capped at
//   5 hours, Shinies at 500. Full-event NPC bundles get NPC time at its maximum.
import { z } from 'zod';
import type { Ruleset } from '../../data/index.ts';
import { RefIdSchema } from '../actions/define.ts';
import { notice, ruleError } from '../errors.ts';
import { GameEventSchema } from '../model.ts';
import type { Award, Sheet } from '../sheet.ts';
import { defineCommand, evaluation } from './define.ts';
import { countsAsEarned, hasEventCxp, itemText, OptionalText } from './helpers.ts';

export const CheckInCommand = z.object({
  type: z.literal('checkIn'),
  event: GameEventSchema,
  /** Attendance bundle id: player, npc-unpaid, npc-paid, gm-staff. */
  attendance: RefIdSchema,
  npcHours: z.int().min(0).max(200).default(0),
  /** Signed up for an NPC shift before the event. */
  preSignedShift: z.boolean().default(false),
  /** Extra roles at this event: marshal, set-up, sunday-clean-up. */
  extras: z.array(RefIdSchema).max(20).default([]),
  /** Check-in skill items handed over at the desk (from pre-registration), as text. */
  handedOut: z.array(z.string().trim().min(1).max(300)).max(100).default([]),
  /** Start-of-event choices and upkeep payment, as text. */
  picks: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
  note: OptionalText,
});
export type CheckInCommand = z.input<typeof CheckInCommand>;

/** NPC time rewards for `hours` ([PTS-SHINY-EARN] NPC Time formula). */
export function npcTimeRewards(
  ruleset: Ruleset,
  hours: number,
  preSignedShift: boolean,
  atMaximum: boolean,
): { cxp: number; pxp: number; shinies: number } {
  const t = ruleset.awards.npcTime;
  if (atMaximum)
    return {
      cxp: t.maxHours * t.cxpPerHour,
      pxp: t.maxHours * t.pxpPerHour,
      shinies: t.shiniesCap,
    };
  const credited = preSignedShift ? Math.max(hours, t.preSignedShift.creditedHours) : hours;
  const capped = Math.min(credited, t.maxHours);
  const shinies =
    capped * t.shiniesPerHour + Math.max(0, credited - t.maxHours) * t.shiniesPerHourAfterMax;
  return {
    cxp: capped * t.cxpPerHour,
    pxp: capped * t.pxpPerHour,
    shinies: Math.min(t.shiniesCap, shinies),
  };
}

function hasCraftingSkill(ruleset: Ruleset, sheet: Sheet): boolean {
  return sheet.skills.some(
    (s) => ruleset.skillsById[s.skillId]?.category === 'crafting' && s.parts.length > 0,
  );
}

export const checkIn = defineCommand<z.output<typeof CheckInCommand>>({
  type: 'checkIn',
  schema: CheckInCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const { event } = cmd;
    if (!event.key.startsWith(`${event.date}-`))
      ev.errors.push(
        ruleError(
          'INVALID_EVENT',
          `Event key ${event.key} does not start with its date ${event.date}.`,
          'PTS-CHECKIN',
        ),
      );
    const bundle = ruleset.attendanceById[cmd.attendance];
    if (!bundle)
      ev.errors.push(
        ruleError(
          'UNKNOWN_ATTENDANCE',
          `Unknown attendance type "${cmd.attendance}".`,
          'PTS-CHECKIN',
        ),
      );
    if (sheet.events.some((e) => e.key === event.key))
      ev.errors.push(
        ruleError(
          'EVENT_ALREADY_CHECKED_IN',
          `Already checked in to ${event.name}.`,
          'PTS-CXP-EVENT',
        ),
      );
    else if (bundle?.eventCxp && hasEventCxp(sheet, event.key))
      ev.errors.push(
        ruleError(
          'EVENT_CXP_ALREADY_CREDITED',
          `Event CXP for ${event.name} is already credited.`,
          'PTS-CXP-EVENT',
        ),
      );
    const extraCounts = new Map<string, number>();
    for (const id of cmd.extras) extraCounts.set(id, (extraCounts.get(id) ?? 0) + 1);
    for (const [id, n] of extraCounts) {
      const extra = ruleset.awards.extras.find((x) => x.id === id);
      if (!extra)
        ev.errors.push(ruleError('UNKNOWN_EXTRA', `Unknown extra "${id}".`, 'PTS-SHINY-EARN'));
      else if (n > extra.maxPerEvent)
        ev.errors.push(
          ruleError(
            'EXTRA_OVER_CAP',
            `${extra.name} can be credited ${extra.maxPerEvent} time${extra.maxPerEvent === 1 ? '' : 's'} per event.`,
            'PTS-SHINY-EARN',
          ),
        );
    }
    if (!bundle || ev.errors.length > 0) return ev;

    // Requested awards, in ledger order.
    const requested: Award[] = [];
    if (bundle.eventCxp)
      requested.push({ currency: 'cxp', amount: ruleset.ruleset.eventCxp, kind: 'event' });
    const npcKind = ruleset.awards.npcTime.ledgerKind;
    const atMax = bundle.npcTimeMax === true;
    if (atMax && (cmd.npcHours > 0 || cmd.preSignedShift))
      ev.notices.push(
        notice(
          'NPC_HOURS_IGNORED',
          `${bundle.name} already gets NPC time at its maximum; the hours entered are not added.`,
          'PTS-SHINY-EARN',
        ),
      );
    if (atMax || cmd.npcHours > 0 || cmd.preSignedShift) {
      const npc = npcTimeRewards(ruleset, cmd.npcHours, cmd.preSignedShift, atMax);
      requested.push({ currency: 'cxp', amount: npc.cxp, kind: npcKind });
      requested.push({ currency: 'pxp', amount: npc.pxp, kind: npcKind });
      requested.push({ currency: 'shinies', amount: npc.shinies, kind: npcKind });
    }
    for (const g of bundle.grants)
      requested.push({ currency: g.currency as Award['currency'], amount: g.amount, kind: g.kind });
    for (const id of cmd.extras) {
      const extra = ruleset.awards.extras.find((x) => x.id === id);
      for (const g of extra?.grants ?? [])
        requested.push({
          currency: g.currency as Award['currency'],
          amount: g.amount,
          kind: g.kind,
        });
    }

    // Earned CXP cap, applied in order.
    let room = sheet.points.cxp.capRemaining;
    const awards: Award[] = [];
    for (const a of requested) {
      let amount = a.amount;
      if (a.currency === 'cxp' && countsAsEarned(ruleset, a.kind)) {
        const credited = Math.min(amount, Math.max(0, room));
        if (credited < amount)
          ev.notices.push(
            notice(
              'CXP_CAPPED',
              `CXP cap reached: credited ${credited} of ${amount} CXP (${a.kind}).`,
              'PTS-CXP-CAP',
            ),
          );
        amount = credited;
        room -= credited;
      }
      if (amount > 0) awards.push({ ...a, amount });
    }

    const owed: string[] = [];
    if (bundle.items?.length)
      owed.push(`${bundle.items.map((i) => itemText(ruleset, i)).join(', ')} (${bundle.name})`);
    if (bundle.craftingAllowance) {
      if (hasCraftingSkill(ruleset, sheet))
        ev.notices.push(
          notice(
            'CRAFTING_ALLOWANCE',
            `${bundle.name}: may use a full event's worth of crafting skills.`,
            'PTS-SHINY-EARN',
          ),
        );
      else if (bundle.craftingAllowance.otherwiseItems.length)
        owed.push(
          `${bundle.craftingAllowance.otherwiseItems.map((i) => itemText(ruleset, i)).join(', ')} (${bundle.name}, no crafting skills)`,
        );
    }

    builder.add(
      'event.checkedIn',
      {
        event,
        attendance: bundle.id,
        npcHours: cmd.npcHours,
        preSignedShift: cmd.preSignedShift,
        extras: cmd.extras,
        awards,
        owed,
        ...(cmd.handedOut.length > 0 ? { handedOut: cmd.handedOut } : {}),
        ...(cmd.picks.length > 0 ? { picks: cmd.picks } : {}),
      },
      { eventKey: event.key, note: cmd.note },
    );
    ev.awards = awards;
    ev.owed = owed;
    return ev;
  },
});
