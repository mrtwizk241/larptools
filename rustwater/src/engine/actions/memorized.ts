// memorized.added / memorized.removed: spells, recipes, performances, rituals, and free-text
// knowledges ([MAG-MEMORIZE], [CRF-MEMORIZE], [MULTI-BARD-MEMO], [MULTI-RIT], [CRF-KNOW]).
// A knowledge also appears in Sheet.storyNotes (source 'knowledge'); no command adds new ones.
// Replay records the entry; slot capacity is checked when the sheet is finalized, so a later
// refund that removes slots still shows up as a warning.
import { z } from 'zod';
import { noteAuthor, warn } from '../derive/draft.ts';
import { IdSchema } from '../model.ts';
import { memoryTarget, poolForSlot } from '../rules/memory.ts';
import { defineAction, RefIdSchema } from './define.ts';

export const MemoryKindSchema = z.enum(['spell', 'recipe', 'performance', 'ritual', 'knowledge']);

export const MemorizedAddedPayload = z
  .object({
    kind: MemoryKindSchema,
    /** Spell, recipe, performance, or ritual id. */
    refId: RefIdSchema.optional(),
    /** Free text for knowledges. */
    text: z.string().trim().min(1).max(500).optional(),
    /** School or craft id, `universal`, `performance`, `ritual`, or `none` (knowledges). */
    slot: RefIdSchema,
    /** AP paid for a memorization level bought with it (for reading history). */
    apBought: z.int().min(0).max(1000).optional(),
  })
  .refine((p) => (p.kind === 'knowledge' ? p.text !== undefined : p.refId !== undefined), {
    message: 'A knowledge needs text; other kinds need refId.',
  });
export type MemorizedAddedPayload = z.infer<typeof MemorizedAddedPayload>;

export const MemorizedRemovedPayload = z.object({
  /** The memorized.added action being forgotten. */
  entryId: IdSchema,
  kind: MemoryKindSchema,
  refId: RefIdSchema.optional(),
  text: z.string().trim().max(500).optional(),
  reason: z.string().trim().max(2000).optional(),
});
export type MemorizedRemovedPayload = z.infer<typeof MemorizedRemovedPayload>;

export const memorizedAdded = defineAction({
  type: 'memorized.added',
  payload: MemorizedAddedPayload,
  apply(draft, p, action) {
    if (p.kind === 'knowledge') {
      draft.memory.push({
        kind: 'knowledge',
        refId: null,
        name: p.text ?? '',
        rank: null,
        text: p.text ?? null,
        slot: 'none',
        pool: null,
        actionId: action.id,
      });
      // Knowledges are story notes now (I-13); old knowledge actions still replay into both.
      draft.storyNotes.push({
        id: action.id,
        text: p.text ?? '',
        source: 'knowledge',
        addedAt: action.at,
        by: noteAuthor(action),
      });
      return;
    }
    const refId = p.refId ?? '';
    const target = memoryTarget(draft.ruleset, draft.skills, p.kind, refId);
    if (!target) {
      warn(draft, action.id, 'UNKNOWN_MEMORY_ITEM', `Unknown ${p.kind} "${refId}"; skipped.`);
      return;
    }
    if (target.notMemorizable !== null) {
      warn(draft, action.id, 'NOT_MEMORIZABLE', `${target.notMemorizable} Skipped.`);
      return;
    }
    const pool = poolForSlot(p.kind, p.slot);
    if (pool === null || !target.pools.includes(pool)) {
      warn(
        draft,
        action.id,
        'MEMORY_SLOT_INVALID',
        `${target.name} cannot go in the "${p.slot}" slot; skipped.`,
      );
      return;
    }
    if (draft.memory.some((e) => e.kind === p.kind && e.refId === refId)) {
      warn(draft, action.id, 'ALREADY_MEMORIZED', `${target.name} is already memorized; skipped.`);
      return;
    }
    if (target.unmet.length > 0)
      warn(
        draft,
        action.id,
        'MEMORY_REQUIREMENT',
        `${target.name} needs ${target.unmet.join(', ')}.`,
      );
    draft.memory.push({
      kind: p.kind,
      refId,
      name: target.name,
      rank: target.rank,
      text: null,
      slot: p.slot,
      pool,
      actionId: action.id,
    });
  },
});

export const memorizedRemoved = defineAction({
  type: 'memorized.removed',
  payload: MemorizedRemovedPayload,
  apply(draft, p, action) {
    const index = draft.memory.findIndex((e) => e.actionId === p.entryId);
    if (index < 0) {
      warn(
        draft,
        action.id,
        'MEMORY_ENTRY_NOT_FOUND',
        `No memorized entry "${p.entryId}" to forget; skipped.`,
      );
      return;
    }
    const [removed] = draft.memory.splice(index, 1);
    if (removed?.kind === 'knowledge') {
      const note = draft.storyNotes.findIndex((n) => n.id === removed.actionId);
      if (note >= 0) draft.storyNotes.splice(note, 1);
    }
  },
});
