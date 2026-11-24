// memorize / forgetMemorized: spells, recipes, performances, and rituals ([MAG-MEMORIZE],
// [CRF-MEMORIZE], [MULTI-BARD-MEMO], [MULTI-RIT]). Free-text knowledges ([CRF-KNOW]) are story
// notes now: memorize refuses kind 'knowledge', and forgetMemorized still removes old ones.
// - An item goes in its school or craft pool when a slot is free, else in the universal pool.
//   Performances and rituals have one pool each. Mastery recipes go in the universal pool only.
// - With no free slot, `buySlot: true` buys one memorization level (1 AP) in the same plan, using
//   the learnSkill rules (a teacher is needed for level 1 outside creation); otherwise it errors
//   with the cost.
// - The character must know the school or craft at the item's rank (Q-MAG-3, Q-CRF-4), the
//   performance tier, or Ritualism. Forgetting frees the slot; no AP comes back.
import { z } from 'zod';
import type { Ruleset } from '../../data/index.ts';
import { RefIdSchema } from '../actions/define.ts';
import { MemoryKindSchema } from '../actions/memorized.ts';
import { ruleError, RULE_IDS } from '../errors.ts';
import { EventKeySchema, IdSchema } from '../model.ts';
import { levelCost } from '../rules/costs.ts';
import { archetypeOf, tableFromSheet } from '../rules/levels.ts';
import { memoryTarget, poolDefs } from '../rules/memory.ts';
import type { MemoryKind, Sheet } from '../sheet.ts';
import { defineCommand, evaluation } from './define.ts';
import { OptionalShortText, OptionalText } from './helpers.ts';
import { evaluateLearn } from './learnSkill.ts';

export const MemorizeCommand = z.object({
  type: z.literal('memorize'),
  kind: MemoryKindSchema,
  /** Spell, recipe, performance, or ritual id. */
  refId: RefIdSchema.optional(),
  /** Free text for a knowledge. */
  text: z.string().trim().min(1).max(500).optional(),
  /** Force a slot: the school or craft id, or `universal`. Defaults to the best free slot. */
  slot: RefIdSchema.optional(),
  /** With no free slot, buy one memorization level (1 AP) in the same plan. */
  buySlot: z.boolean().default(false),
  /** Who taught it; also the teacher for a memorization level bought with it. */
  teacher: OptionalShortText,
  eventKey: EventKeySchema.optional(),
  note: OptionalText,
});
export type MemorizeCommand = z.input<typeof MemorizeCommand>;

export const ForgetMemorizedCommand = z.object({
  type: z.literal('forgetMemorized'),
  /** The entry's actionId from sheet.memory.entries. */
  entryId: IdSchema,
  reason: OptionalText,
  note: OptionalText,
});
export type ForgetMemorizedCommand = z.input<typeof ForgetMemorizedCommand>;

const RULE: Record<MemoryKind, string> = {
  spell: 'MAG-MEMORIZE',
  recipe: 'CRF-MEMORIZE',
  performance: 'MULTI-BARD-MEMO',
  ritual: 'MULTI-RIT',
  knowledge: 'CRF-KNOW',
};

function memorizationArchetype(ruleset: Ruleset, sheet: Sheet, skillId: string): string | null {
  const skill = ruleset.skillsById[skillId];
  if (!skill) return null;
  const table = tableFromSheet(sheet);
  const own = archetypeOf(ruleset, table, skillId);
  if (own !== null) return own;
  const rule = skill.archetypeRule;
  return rule?.kind === 'same-as-skill' ? archetypeOf(ruleset, table, rule.skill) : null;
}

export const memorize = defineCommand<z.output<typeof MemorizeCommand>>({
  type: 'memorize',
  schema: MemorizeCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const rule = RULE[cmd.kind];
    const opts = { eventKey: cmd.eventKey, note: cmd.note };
    if (cmd.kind === 'knowledge') {
      // Knowledges are story notes now (I-13): old ones still replay, new ones are refused.
      ev.errors.push(
        ruleError(
          'KNOWLEDGE_IS_STORY_NOTE',
          'Knowledges are story notes now. Add a story note instead.',
          rule,
        ),
      );
      return ev;
    }
    if (cmd.refId === undefined) {
      ev.errors.push(ruleError('REF_REQUIRED', `Choose the ${cmd.kind} to memorize.`, rule));
      return ev;
    }
    const table = tableFromSheet(sheet);
    const target = memoryTarget(ruleset, table, cmd.kind, cmd.refId);
    if (!target) {
      ev.errors.push(ruleError('UNKNOWN_MEMORY_ITEM', `Unknown ${cmd.kind} "${cmd.refId}".`, rule));
      return ev;
    }
    if (target.notMemorizable !== null) {
      ev.errors.push(ruleError('NOT_MEMORIZABLE', target.notMemorizable, rule));
      return ev;
    }
    if (sheet.memory.entries.some((e) => e.kind === cmd.kind && e.refId === cmd.refId))
      ev.errors.push(ruleError('ALREADY_MEMORIZED', `${target.name} is already memorized.`, rule));
    for (const u of target.unmet)
      ev.errors.push(ruleError('MEMORY_REQUIREMENT', `${target.name} needs ${u}.`, rule));

    let candidates = target.pools;
    if (cmd.slot !== undefined) {
      const chosen = target.pools.find((p) => target.slotOf(p) === cmd.slot);
      if (!chosen) {
        ev.errors.push(
          ruleError(
            'MEMORY_SLOT_INVALID',
            `${target.name} cannot go in the "${cmd.slot}" slot.`,
            rule,
          ),
        );
        return ev;
      }
      candidates = [chosen];
    }
    const pools = sheet.memory.slots;
    const free = candidates.find((id) => (pools.find((p) => p.pool === id)?.free ?? 0) > 0);
    let pool = free;
    let apBought = 0;
    if (pool === undefined) {
      const defs = poolDefs(ruleset);
      const buyable = candidates
        .map((id) => defs.find((d) => d.pool === id))
        .find((d) => d?.memorizationSkillId);
      const memSkillId = buyable?.memorizationSkillId ?? null;
      if (!buyable || memSkillId === null) {
        ev.errors.push(ruleError('NO_FREE_SLOT', `No free slot for ${target.name}.`, rule));
        return ev;
      }
      const memSkill = ruleset.skillsById[memSkillId];
      const memName = memSkill?.name ?? memSkillId;
      if (!cmd.buySlot) {
        const archetype = memorizationArchetype(ruleset, sheet, memSkillId);
        const amount = levelCost(ruleset, 'memorization', 1);
        ev.cost = {
          currency: 'ap',
          amount,
          ...(archetype !== null ? { archetype } : {}),
        };
        ev.errors.push(
          ruleError(
            'SLOT_REQUIRED',
            `No free ${buyable.kind} slot for ${target.name}. One more ${memName} level costs ${amount} AP.`,
            rule,
          ),
        );
        return ev;
      }
      if (ev.errors.length > 0) return ev;
      const learn = evaluateLearn(
        ruleset,
        sheet,
        { skillId: memSkillId, part: 'main', teacher: cmd.teacher },
        { atCreation: false, ...opts },
        builder,
      );
      ev.errors.push(...learn.errors);
      ev.notices.push(...learn.notices);
      if (learn.cost) ev.cost = learn.cost;
      if (learn.teacherRequired !== undefined) ev.teacherRequired = learn.teacherRequired;
      apBought = learn.cost?.amount ?? 0;
      pool = buyable.pool;
    } else {
      ev.cost = { currency: 'ap', amount: 0 };
    }
    if (ev.errors.length > 0) return ev;
    builder.add(
      'memorized.added',
      {
        kind: cmd.kind,
        refId: target.refId,
        slot: target.slotOf(pool),
        ...(apBought > 0 ? { apBought } : {}),
      },
      opts,
    );
    return ev;
  },
});

export const forgetMemorized = defineCommand<z.output<typeof ForgetMemorizedCommand>>({
  type: 'forgetMemorized',
  schema: ForgetMemorizedCommand,
  evaluate(_ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const entry = sheet.memory.entries.find((e) => e.actionId === cmd.entryId);
    if (!entry) {
      ev.errors.push(
        ruleError('MEMORY_ENTRY_NOT_FOUND', 'That item is not memorized.', RULE_IDS.command),
      );
      return ev;
    }
    builder.add(
      'memorized.removed',
      {
        entryId: entry.actionId,
        kind: entry.kind,
        ...(entry.refId !== null ? { refId: entry.refId } : {}),
        ...(entry.text !== null ? { text: entry.text } : {}),
        ...(cmd.reason ? { reason: cmd.reason } : {}),
      },
      { note: cmd.note },
    );
    return ev;
  },
});
