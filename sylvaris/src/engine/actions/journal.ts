// journal.added, journal.tagged, journal.removed ([SKL-NOTES], [MAG-SPELLBOOK], [CRF-JOURNAL],
// [PERF-LEARN]). New entries start pending; the tagged copy comes at the next event.
import { z } from 'zod';
import { warn } from '../derive/draft.ts';
import { IdSchema } from '../model.ts';
import { journalRef } from '../rules/journal.ts';
import { defineAction, ReasonSchema, RefIdSchema, ShortTextSchema } from './define.ts';

export const JournalKindSchema = z.enum(['spell', 'recipe', 'performance', 'ritual']);
export const JournalSourceSchema = z.enum(['teacher', 'research', 'scroll', 'starting', 'other']);

export const JournalAddedPayload = z.object({
  kind: JournalKindSchema,
  refId: RefIdSchema,
  source: JournalSourceSchema,
  /** Who copied or performed it (source `teacher`). */
  teacher: ShortTextSchema.optional(),
  status: z.literal('pending').default('pending'),
});
export type JournalAddedPayload = z.input<typeof JournalAddedPayload>;

export const journalAdded = defineAction({
  type: 'journal.added',
  payload: JournalAddedPayload,
  apply(draft, p, action) {
    if (!journalRef(draft.ruleset, p.kind, p.refId)) {
      warn(draft, action.id, 'UNKNOWN_JOURNAL_ENTRY', `Unknown ${p.kind} "${p.refId}"; skipped.`);
      return;
    }
    if (draft.journal.some((e) => e.kind === p.kind && e.refId === p.refId))
      warn(draft, action.id, 'JOURNAL_DUPLICATE', `The ${p.kind} "${p.refId}" is listed twice.`);
    draft.journal.push({
      entryId: action.id,
      kind: p.kind,
      refId: p.refId,
      source: p.source,
      teacher: p.teacher ? p.teacher : null,
      status: 'pending',
      addedAt: action.at,
      eventKey: action.eventKey ?? null,
    });
  },
});

export const JournalTaggedPayload = z.object({ entryId: IdSchema });
export type JournalTaggedPayload = z.infer<typeof JournalTaggedPayload>;

export const journalTagged = defineAction({
  type: 'journal.tagged',
  payload: JournalTaggedPayload,
  apply(draft, p, action) {
    const entry = draft.journal.find((e) => e.entryId === p.entryId);
    if (!entry) {
      warn(draft, action.id, 'JOURNAL_NOT_FOUND', 'No such journal entry; skipped.');
      return;
    }
    entry.status = 'tagged';
  },
});

export const JournalRemovedPayload = z.object({ entryId: IdSchema, reason: ReasonSchema });
export type JournalRemovedPayload = z.infer<typeof JournalRemovedPayload>;

export const journalRemoved = defineAction({
  type: 'journal.removed',
  payload: JournalRemovedPayload,
  apply(draft, p, action) {
    const index = draft.journal.findIndex((e) => e.entryId === p.entryId);
    if (index < 0) {
      warn(draft, action.id, 'JOURNAL_NOT_FOUND', 'No such journal entry; skipped.');
      return;
    }
    draft.journal.splice(index, 1);
  },
});
