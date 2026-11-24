// Boons, starting items, and owed rewards ([PLAY-BOONS], [ITEM-START], [PTS-OWED]).
// - addBoon / removeBoon: 3 slots, one instance per boon id, ancestry restrictions, expiry text
//   from the boon's expiry kind (or the default) unless staff type one.
// - setStartingItems: up to 10 picks from starting-items.json, repeats allowed; a notice when
//   fewer than 10. Each call replaces the whole set. A "memorized" pick is a separate memorize.
// - addOwed / deliverOwed: manual owed rewards; delivery also marks check-in item rewards and
//   still works on a retired character.
import { z } from 'zod';
import { BoonEffectSchema } from '../actions/boons.ts';
import { NameSchema, RefIdSchema } from '../actions/define.ts';
import { OwedIdSchema } from '../actions/owed.ts';
import { StartingPickSchema } from '../actions/startingItems.ts';
import { notice, ruleError, RULE_IDS } from '../errors.ts';
import { EventKeySchema, IdSchema } from '../model.ts';
import { defineCommand, evaluation } from './define.ts';
import { OptionalText, plural } from './helpers.ts';

export const AddBoonCommand = z.object({
  type: z.literal('addBoon'),
  /** Boon id from boons.json; leave out to type a boon as free text with `name`. */
  boonId: RefIdSchema.optional(),
  name: NameSchema.optional(),
  /** Expiry text; defaults to the boon's expiry kind or the default (end of event). */
  expires: z.string().trim().max(500).optional(),
  /** Custom boons: what it does. */
  text: z.string().trim().max(2000).optional(),
  /** Custom boons: stats it changes. */
  effects: z.array(BoonEffectSchema).max(5).optional(),
  eventKey: EventKeySchema.optional(),
  note: OptionalText,
});
export type AddBoonCommand = z.input<typeof AddBoonCommand>;

export const RemoveBoonCommand = z.object({
  type: z.literal('removeBoon'),
  /** The boon's actionId from sheet.boons. */
  boonActionId: IdSchema,
  reason: OptionalText,
  note: OptionalText,
});
export type RemoveBoonCommand = z.input<typeof RemoveBoonCommand>;

export const SetStartingItemsCommand = z.object({
  type: z.literal('setStartingItems'),
  picks: z.array(StartingPickSchema).max(100),
  note: OptionalText,
});
export type SetStartingItemsCommand = z.input<typeof SetStartingItemsCommand>;

export const AddOwedCommand = z.object({
  type: z.literal('addOwed'),
  text: z.string().trim().min(1).max(500),
  eventKey: EventKeySchema.optional(),
  note: OptionalText,
});
export type AddOwedCommand = z.input<typeof AddOwedCommand>;

export const DeliverOwedCommand = z.object({
  type: z.literal('deliverOwed'),
  /** An id from sheet.owed. */
  owedId: OwedIdSchema,
  note: OptionalText,
});
export type DeliverOwedCommand = z.input<typeof DeliverOwedCommand>;

export const addBoon = defineCommand<z.output<typeof AddBoonCommand>>({
  type: 'addBoon',
  schema: AddBoonCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const rules = ruleset.boons.rules;
    const boon = cmd.boonId !== undefined ? ruleset.boonsById[cmd.boonId] : undefined;
    if (cmd.boonId !== undefined && !boon) {
      ev.errors.push(ruleError('UNKNOWN_BOON', `Unknown boon "${cmd.boonId}".`, 'PLAY-BOONS'));
      return ev;
    }
    const name = cmd.name ?? boon?.name;
    if (name === undefined) {
      ev.errors.push(ruleError('NAME_REQUIRED', 'Choose a boon or type its name.', 'PLAY-BOONS'));
      return ev;
    }
    if (sheet.boons.length >= rules.slots)
      ev.errors.push(
        ruleError(
          'BOON_SLOTS_FULL',
          `All ${rules.slots} boon slots are used; remove a boon first.`,
          'PLAY-BOONS',
        ),
      );
    if (boon && rules.uniquePerBoonId && sheet.boons.some((b) => b.boonId === boon.id))
      ev.errors.push(ruleError('BOON_DUPLICATE', `${boon.name} is already active.`, 'PLAY-BOONS'));
    const ancestryId = sheet.ancestry?.ancestryId;
    if (boon?.restrictedTo && (ancestryId === undefined || !boon.restrictedTo.includes(ancestryId)))
      ev.errors.push(
        ruleError(
          'BOON_RESTRICTED',
          `${boon.name} is only for ${boon.restrictedTo
            .map((id) => ruleset.ancestriesById[id]?.name ?? id)
            .join(', ')}.`,
          'PLAY-BOONS',
        ),
      );
    if (ev.errors.length > 0) return ev;
    const expiryId = boon?.expiry ?? rules.defaultExpiry;
    const expires =
      cmd.expires || ruleset.boons.expiryKinds.find((k) => k.id === expiryId)?.text || '';
    builder.add(
      'boon.added',
      {
        ...(boon ? { boonId: boon.id } : {}),
        name,
        ...(expires ? { expires } : {}),
        ...(!boon && cmd.text ? { text: cmd.text } : {}),
        ...(!boon && cmd.effects && cmd.effects.length > 0 ? { effects: cmd.effects } : {}),
      },
      { eventKey: cmd.eventKey, note: cmd.note },
    );
    return ev;
  },
});

export const removeBoon = defineCommand<z.output<typeof RemoveBoonCommand>>({
  type: 'removeBoon',
  schema: RemoveBoonCommand,
  evaluate(_ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    if (!sheet.boons.some((b) => b.actionId === cmd.boonActionId)) {
      ev.errors.push(ruleError('BOON_NOT_FOUND', 'That boon is not active.', 'PLAY-BOONS'));
      return ev;
    }
    builder.add(
      'boon.removed',
      { boonActionId: cmd.boonActionId, ...(cmd.reason ? { reason: cmd.reason } : {}) },
      { note: cmd.note },
    );
    return ev;
  },
});

export const setStartingItems = defineCommand<z.output<typeof SetStartingItemsCommand>>({
  type: 'setStartingItems',
  schema: SetStartingItemsCommand,
  evaluate(ruleset, _sheet, cmd, builder) {
    const ev = evaluation();
    const rules = ruleset.startingItems.rules;
    if (cmd.picks.length > rules.picks)
      ev.errors.push(
        ruleError(
          'STARTING_ITEMS_OVER',
          `Choose at most ${rules.picks} starting items; ${cmd.picks.length} chosen.`,
          'ITEM-START',
        ),
      );
    const seen = new Set<string>();
    for (const pick of cmd.picks) {
      if (!ruleset.startingItemsById[pick.optionId])
        ev.errors.push(
          ruleError(
            'UNKNOWN_STARTING_ITEM',
            `Unknown starting item "${pick.optionId}".`,
            'ITEM-START',
          ),
        );
      else if (!rules.repeatsAllowed && seen.has(pick.optionId))
        ev.errors.push(
          ruleError(
            'STARTING_ITEM_REPEAT',
            `${ruleset.startingItemsById[pick.optionId]?.name ?? pick.optionId} can be picked once.`,
            'ITEM-START',
          ),
        );
      seen.add(pick.optionId);
    }
    if (ev.errors.length > 0) return ev;
    if (rules.warnIfFewer && cmd.picks.length < rules.picks)
      ev.notices.push(
        notice(
          'STARTING_ITEMS_FEWER',
          `${plural(cmd.picks.length, 'starting item')} chosen; ${rules.picks} are allowed.`,
          'ITEM-START',
        ),
      );
    builder.add(
      'items.startingSet',
      {
        picks: cmd.picks.map((p) => ({
          optionId: p.optionId,
          ...(p.detail ? { detail: p.detail } : {}),
        })),
      },
      { note: cmd.note },
    );
    return ev;
  },
});

export const addOwed = defineCommand<z.output<typeof AddOwedCommand>>({
  type: 'addOwed',
  schema: AddOwedCommand,
  evaluate(_ruleset, _sheet, cmd, builder) {
    builder.add(
      'owed.added',
      { text: cmd.text, ...(cmd.eventKey ? { eventKey: cmd.eventKey } : {}) },
      { eventKey: cmd.eventKey, note: cmd.note },
    );
    return evaluation();
  },
});

export const deliverOwed = defineCommand<z.output<typeof DeliverOwedCommand>>({
  type: 'deliverOwed',
  schema: DeliverOwedCommand,
  evaluate(_ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const owed = sheet.owed.find((o) => o.id === cmd.owedId);
    if (!owed)
      ev.errors.push(ruleError('OWED_NOT_FOUND', 'No such owed reward.', RULE_IDS.command));
    else if (owed.delivered)
      ev.errors.push(
        ruleError('OWED_ALREADY_DELIVERED', `"${owed.text}" was already delivered.`, 'PTS-OWED'),
      );
    if (ev.errors.length > 0) return ev;
    builder.add('owed.delivered', { owedId: cmd.owedId }, { note: cmd.note });
    return ev;
  },
  allowedWhenRetired: () => true,
});
