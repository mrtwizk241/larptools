// Records: starting items ([ITEM-START]), Spirit Fragments ([PTS-SPIRIT]), Boons
// ([PLAY-BOON-SLOTS]), familiarized locations ([PLAY-FAMILIARIZE]), the Familiar ([FAM-RULES]),
// and items owed.
// - Starting items: up to 10 picks, repeats allowed (Q-ITEM-1); a pick that names a spell, recipe,
//   or performance should be a Basic one (Q-ITEM-2). Each call replaces the whole set.
// - Locations: the tavern is fixed; portals up to the Blink, Rifting, and Air Magic levels, trees
//   up to Friend of the Forest, 20 in total with the tavern (Q-PLAY-8, Q-RACE-9).
// - Familiar: trick slots by quality; a skill trick takes 1 or 2 slots (Basic, or Expert with the
//   Technique), never a magic, crafting, or Calling skill, and a racial skill only of the
//   owner's race; each special trick takes 1 slot (Q-PLAY-7).
import { z } from 'zod';
import { NameSchema, RefIdSchema } from '../actions/define.ts';
import { FamiliarTrickSchema, StartingPickSchema } from '../actions/records.ts';
import { notice, ruleError, RULE_IDS } from '../errors.ts';
import { EventKeySchema, IdSchema, IsoDateSchema } from '../model.ts';
import { defineCommand, evaluation } from './define.ts';
import { OptionalText, plural } from './helpers.ts';

export const SetStartingItemsCommand = z.object({
  type: z.literal('setStartingItems'),
  picks: z.array(StartingPickSchema).max(100),
  note: OptionalText,
});
export type SetStartingItemsCommand = z.input<typeof SetStartingItemsCommand>;

export const setStartingItems = defineCommand<z.output<typeof SetStartingItemsCommand>>({
  type: 'setStartingItems',
  schema: SetStartingItemsCommand,
  evaluate(ruleset, _sheet, cmd, builder) {
    const ev = evaluation();
    const RULE = 'ITEM-START';
    const data = ruleset.startingEquipment;
    if (cmd.picks.length > data.picks)
      ev.errors.push(
        ruleError(
          'STARTING_ITEMS_OVER',
          `Choose at most ${data.picks} starting items; ${cmd.picks.length} chosen.`,
          RULE,
        ),
      );
    const seen = new Set<string>();
    for (const pick of cmd.picks) {
      const option = ruleset.startingOptionsById[pick.optionId];
      if (!option) {
        ev.errors.push(
          ruleError('UNKNOWN_STARTING_ITEM', `Unknown starting item "${pick.optionId}".`, RULE),
        );
        continue;
      }
      if (!data.duplicatesAllowed && seen.has(option.id))
        ev.errors.push(
          ruleError('STARTING_ITEM_REPEAT', `${option.name} can be picked once.`, RULE),
        );
      seen.add(option.id);
      if (option.choice && !pick.detail)
        ev.errors.push(
          ruleError('CHOICE_REQUIRED', `${option.name}: name the ${option.choice}.`, RULE),
        );
      const ref =
        option.choice === 'spell'
          ? ruleset.spellsById[pick.detail ?? '']
          : option.choice === 'recipe'
            ? ruleset.recipesById[pick.detail ?? '']
            : option.choice === 'performance'
              ? ruleset.performancesById[pick.detail ?? '']
              : undefined;
      if (ref && option.quality && ref.level !== option.quality)
        ev.errors.push(
          ruleError(
            'STARTING_NOT_BASIC',
            `${option.name}: ${ref.name} is not ${option.quality}.`,
            RULE,
          ),
        );
      if (option.gmApproval)
        ev.notices.push(notice('GM_APPROVAL', `${option.name} needs GM approval.`, RULE));
    }
    if (ev.errors.length > 0) return ev;
    if (cmd.picks.length < data.picks)
      ev.notices.push(
        notice(
          'STARTING_ITEMS_FEWER',
          `${plural(cmd.picks.length, 'starting item')} chosen; ${data.picks} are allowed.`,
          RULE,
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

export const ChangeSpiritCommand = z.object({
  type: z.literal('changeSpirit'),
  delta: z
    .int()
    .min(-100)
    .max(100)
    .refine((n) => n !== 0, 'A change cannot be 0.'),
  reason: OptionalText,
  eventKey: EventKeySchema.optional(),
  note: OptionalText,
});
export type ChangeSpiritCommand = z.input<typeof ChangeSpiritCommand>;

export const changeSpirit = defineCommand<z.output<typeof ChangeSpiritCommand>>({
  type: 'changeSpirit',
  schema: ChangeSpiritCommand,
  evaluate(_ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const { current, max } = sheet.spirit;
    const after = current + cmd.delta;
    if (after < 0 || after > max)
      ev.errors.push(
        ruleError(
          'SPIRIT_RANGE',
          `Spirit Fragments stay between 0 and ${max}; ${current} ${cmd.delta > 0 ? '+' : ''}${cmd.delta} is ${after}.`,
          'PTS-SPIRIT',
        ),
      );
    const reason = cmd.reason ?? '';
    if (reason === '')
      ev.errors.push(
        ruleError('REASON_REQUIRED', 'A Spirit Fragment change needs a reason.', 'PTS-SPIRIT'),
      );
    if (ev.errors.length > 0) return ev;
    if (after === 0)
      ev.notices.push(
        notice(
          'NO_SPIRIT_LEFT',
          'At 0 Spirit Fragments the character can never be raised.',
          'PTS-SPIRIT',
        ),
      );
    builder.add(
      'spirit.changed',
      { delta: cmd.delta, reason },
      { eventKey: cmd.eventKey, note: cmd.note },
    );
    return ev;
  },
});

export const AddBoonCommand = z.object({
  type: z.literal('addBoon'),
  slot: z.enum(['greater', 'lesser']).optional(),
  /** A Flesh Crafting mutagen recipe; leave out to type the boon as free text with `name`. */
  recipeId: RefIdSchema.optional(),
  name: NameSchema.optional(),
  eventKey: EventKeySchema.optional(),
  note: OptionalText,
});
export type AddBoonCommand = z.input<typeof AddBoonCommand>;

export const addBoon = defineCommand<z.output<typeof AddBoonCommand>>({
  type: 'addBoon',
  schema: AddBoonCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const RULE = 'PLAY-BOON-SLOTS';
    const recipe = cmd.recipeId ? ruleset.recipesById[cmd.recipeId] : undefined;
    if (cmd.recipeId && !recipe) {
      ev.errors.push(ruleError('UNKNOWN_RECIPE', `Unknown recipe "${cmd.recipeId}".`, RULE));
      return ev;
    }
    if (recipe && !recipe.boonSlot) {
      ev.errors.push(ruleError('NOT_A_BOON', `${recipe.name} does not fill a Boon Slot.`, RULE));
      return ev;
    }
    const slot = cmd.slot ?? recipe?.boonSlot;
    const name = cmd.name ?? recipe?.name;
    if (!slot || !name) {
      ev.errors.push(
        ruleError('CHOICE_REQUIRED', 'Choose the boon (or its name) and its slot.', RULE),
      );
      return ev;
    }
    if (recipe?.boonSlot && recipe.boonSlot !== slot)
      ev.errors.push(
        ruleError(
          'BOON_SLOT_MISMATCH',
          `${recipe.name} goes in a ${recipe.boonSlot} Boon Slot.`,
          RULE,
        ),
      );
    const b = sheet.boons;
    const used = slot === 'greater' ? b.greaterUsed : b.lesserUsed;
    const slots = slot === 'greater' ? b.greaterSlots : b.lesserSlots;
    if (used >= slots)
      ev.errors.push(
        ruleError(
          'BOON_SLOTS_FULL',
          `All ${slots} ${slot} Boon Slots are used; remove a boon first.`,
          RULE,
        ),
      );
    if (ev.errors.length > 0) return ev;
    builder.add(
      'boon.added',
      { slot, name, ...(recipe ? { recipeId: recipe.id } : {}) },
      { eventKey: cmd.eventKey, note: cmd.note },
    );
    return ev;
  },
});

export const RemoveBoonCommand = z.object({
  type: z.literal('removeBoon'),
  boonActionId: IdSchema,
  reason: OptionalText,
  note: OptionalText,
});
export type RemoveBoonCommand = z.input<typeof RemoveBoonCommand>;

export const removeBoon = defineCommand<z.output<typeof RemoveBoonCommand>>({
  type: 'removeBoon',
  schema: RemoveBoonCommand,
  evaluate(_ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    if (!sheet.boons.entries.some((b) => b.actionId === cmd.boonActionId)) {
      ev.errors.push(
        ruleError('BOON_NOT_FOUND', 'That boon is not on the sheet.', 'PLAY-BOON-SLOTS'),
      );
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

export const FamiliarizeLocationCommand = z.object({
  type: z.literal('familiarizeLocation'),
  name: NameSchema,
  kind: z.enum(['portal', 'tree']).default('portal'),
  date: IsoDateSchema,
  note: OptionalText,
});
export type FamiliarizeLocationCommand = z.input<typeof FamiliarizeLocationCommand>;

export const familiarizeLocation = defineCommand<z.output<typeof FamiliarizeLocationCommand>>({
  type: 'familiarizeLocation',
  schema: FamiliarizeLocationCommand,
  evaluate(_ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const RULE = 'PLAY-FAMILIARIZE';
    const loc = sheet.locations;
    const lower = cmd.name.toLowerCase();
    // The fixed location reads "Raven's Rest (local tavern)": compare the name part.
    const fixedName = (loc.fixedLocation.split(' (')[0] ?? '').toLowerCase();
    if (lower === fixedName || loc.entries.some((e) => e.name.toLowerCase() === lower))
      ev.errors.push(ruleError('LOCATION_DUPLICATE', `${cmd.name} is already familiar.`, RULE));
    const ofKind = loc.entries.filter((e) => e.kind === cmd.kind).length;
    const kindSlots = cmd.kind === 'portal' ? loc.portalSlots : loc.treeSlots;
    if (ofKind >= kindSlots)
      ev.errors.push(
        ruleError(
          'LOCATION_SLOTS_FULL',
          cmd.kind === 'portal'
            ? `${plural(kindSlots, 'portal location')} allowed by Blink, Rifting, and Air Magic levels; all are used.`
            : `${plural(kindSlots, 'tree')} allowed by Friend of the Forest; all are used.`,
          RULE,
        ),
      );
    else if (loc.used >= loc.capacity)
      ev.errors.push(
        ruleError(
          'LOCATION_MAX',
          `At most ${loc.max} familiar locations, the tavern included.`,
          RULE,
        ),
      );
    if (ev.errors.length > 0) return ev;
    builder.add(
      'location.familiarized',
      { name: cmd.name, kind: cmd.kind, date: cmd.date },
      { note: cmd.note },
    );
    return ev;
  },
});

export const RemoveLocationCommand = z.object({
  type: z.literal('removeLocation'),
  entryId: IdSchema,
  reason: OptionalText,
  note: OptionalText,
});
export type RemoveLocationCommand = z.input<typeof RemoveLocationCommand>;

export const removeLocation = defineCommand<z.output<typeof RemoveLocationCommand>>({
  type: 'removeLocation',
  schema: RemoveLocationCommand,
  evaluate(_ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    if (!sheet.locations.entries.some((e) => e.entryId === cmd.entryId))
      ev.errors.push(
        ruleError('LOCATION_NOT_FOUND', 'That location is not on the sheet.', 'PLAY-FAMILIARIZE'),
      );
    const reason = cmd.reason ?? '';
    if (reason === '')
      ev.errors.push(
        ruleError('REASON_REQUIRED', 'Removing a location needs a reason.', 'PLAY-FAMILIARIZE'),
      );
    if (ev.errors.length > 0) return ev;
    builder.add('location.removed', { entryId: cmd.entryId, reason }, { note: cmd.note });
    return ev;
  },
});

export const SetFamiliarCommand = z.object({
  type: z.literal('setFamiliar'),
  name: NameSchema,
  form: z.string().trim().max(200).optional(),
  quality: z.enum(['basic', 'expert', 'master', 'grandmaster']),
  stable: z.boolean().default(true),
  tricks: z.array(FamiliarTrickSchema).max(20).default([]),
  note: OptionalText,
});
export type SetFamiliarCommand = z.input<typeof SetFamiliarCommand>;

export const setFamiliar = defineCommand<z.output<typeof SetFamiliarCommand>>({
  type: 'setFamiliar',
  schema: SetFamiliarCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const RULE = 'FAM-RULES';
    const rules = ruleset.familiars.rules;
    const slots = (rules.trickSlotsByQuality as Readonly<Record<string, number>>)[cmd.quality] ?? 0;
    const used = cmd.tricks.reduce((n, t) => n + t.slots, 0);
    if (used > slots)
      ev.errors.push(
        ruleError(
          'TRICK_SLOTS_FULL',
          `A ${cmd.quality} Familiar has ${plural(slots, 'Trick Slot')}; the tricks use ${used}.`,
          RULE,
        ),
      );
    const raceId = sheet.race?.raceId;
    const seen = new Set<string>();
    for (const t of cmd.tricks) {
      if (seen.has(t.id))
        ev.errors.push(
          ruleError(
            'TRICK_DUPLICATE',
            `"${t.id}" is listed twice; give it more slots instead.`,
            RULE,
          ),
        );
      seen.add(t.id);
      const skill = ruleset.skillsById[t.id];
      const special = ruleset.specialTricksById[t.id];
      if (special) {
        if (t.slots !== 1)
          ev.errors.push(
            ruleError('TRICK_SLOTS_INVALID', 'Each special trick takes 1 Trick Slot.', RULE),
          );
        continue;
      }
      if (!skill) {
        ev.errors.push(ruleError('UNKNOWN_TRICK', `Unknown trick "${t.id}".`, RULE));
        continue;
      }
      if (
        skill.category === 'magic' ||
        skill.category === 'crafting' ||
        skill.category === 'calling' ||
        (skill.category === 'racial' && skill.raceId !== raceId)
      )
        ev.errors.push(
          ruleError(
            'TRICK_SKILL_NOT_ALLOWED',
            `A Familiar cannot learn ${skill.name}. ${rules.skillTricks.allowedNote}`,
            RULE,
          ),
        );
      if (t.slots > rules.skillTricks.maxSlotsPerSkill)
        ev.errors.push(
          ruleError(
            'TRICK_SLOTS_INVALID',
            `A skill trick takes at most ${rules.skillTricks.maxSlotsPerSkill} Trick Slots.`,
            RULE,
          ),
        );
    }
    if (ev.errors.length > 0) return ev;
    if (sheet.familiar)
      ev.notices.push(notice('FAMILIAR_REPLACED', `${sheet.familiar.name} is replaced.`, RULE));
    if (!cmd.stable)
      ev.notices.push(
        notice('FAMILIAR_UNSTABLE', 'An unstable Familiar leaves at the end of the event.', RULE),
      );
    builder.add(
      'familiar.set',
      {
        name: cmd.name,
        ...(cmd.form ? { form: cmd.form } : {}),
        quality: cmd.quality,
        stable: cmd.stable,
        tricks: cmd.tricks,
      },
      { note: cmd.note },
    );
    return ev;
  },
});

export const RemoveFamiliarCommand = z.object({
  type: z.literal('removeFamiliar'),
  reason: OptionalText,
  note: OptionalText,
});
export type RemoveFamiliarCommand = z.input<typeof RemoveFamiliarCommand>;

export const removeFamiliar = defineCommand<z.output<typeof RemoveFamiliarCommand>>({
  type: 'removeFamiliar',
  schema: RemoveFamiliarCommand,
  evaluate(_ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    if (!sheet.familiar)
      ev.errors.push(ruleError('NO_FAMILIAR', 'The character has no Familiar.', 'FAM-RULES'));
    const reason = cmd.reason ?? '';
    if (reason === '')
      ev.errors.push(
        ruleError('REASON_REQUIRED', 'Removing a Familiar needs a reason.', 'FAM-RULES'),
      );
    if (ev.errors.length > 0) return ev;
    builder.add('familiar.removed', { reason }, { note: cmd.note });
    return ev;
  },
});

export const AddOwedCommand = z.object({
  type: z.literal('addOwed'),
  text: z.string().trim().min(1).max(500),
  eventKey: EventKeySchema.optional(),
  note: OptionalText,
});
export type AddOwedCommand = z.input<typeof AddOwedCommand>;

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

export const DeliverOwedCommand = z.object({
  type: z.literal('deliverOwed'),
  owedId: IdSchema,
  note: OptionalText,
});
export type DeliverOwedCommand = z.input<typeof DeliverOwedCommand>;

export const deliverOwed = defineCommand<z.output<typeof DeliverOwedCommand>>({
  type: 'deliverOwed',
  schema: DeliverOwedCommand,
  evaluate(_ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const owed = sheet.owed.find((o) => o.id === cmd.owedId);
    if (!owed) ev.errors.push(ruleError('OWED_NOT_FOUND', 'No such owed item.', RULE_IDS.command));
    else if (owed.delivered)
      ev.errors.push(
        ruleError(
          'OWED_ALREADY_DELIVERED',
          `"${owed.text}" was already delivered.`,
          RULE_IDS.command,
        ),
      );
    if (ev.errors.length > 0) return ev;
    builder.add('owed.delivered', { owedId: cmd.owedId }, { note: cmd.note });
    return ev;
  },
  allowedWhenRetired: () => true,
});
