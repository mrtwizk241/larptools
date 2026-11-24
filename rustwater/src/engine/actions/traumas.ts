// trauma.added / trauma.edited / trauma.removed: short text notes tied to infection, kept by
// staff ([PLAY-TRAUMA]). Players read them in their action log and on the sheet.
import { z } from 'zod';
import { warn } from '../derive/draft.ts';
import { IdSchema } from '../model.ts';
import { defineAction, ReasonSchema } from './define.ts';

export const TraumaTextSchema = z.string().trim().min(1).max(500);

export const TraumaAddedPayload = z.object({ text: TraumaTextSchema });
export type TraumaAddedPayload = z.infer<typeof TraumaAddedPayload>;

export const TraumaEditedPayload = z.object({
  /** The trauma.added action. */
  traumaId: IdSchema,
  text: TraumaTextSchema,
  /** Text before the change, for reading history. */
  fromText: z.string().max(500).optional(),
});
export type TraumaEditedPayload = z.infer<typeof TraumaEditedPayload>;

export const TraumaRemovedPayload = z.object({
  traumaId: IdSchema,
  reason: ReasonSchema,
  /** Text of the removed trauma, for reading history. */
  text: z.string().max(500).optional(),
});
export type TraumaRemovedPayload = z.infer<typeof TraumaRemovedPayload>;

export const traumaAdded = defineAction({
  type: 'trauma.added',
  payload: TraumaAddedPayload,
  apply(draft, p, action) {
    draft.traumas.push({ id: action.id, text: p.text, addedAt: action.at });
  },
});

export const traumaEdited = defineAction({
  type: 'trauma.edited',
  payload: TraumaEditedPayload,
  apply(draft, p, action) {
    const index = draft.traumas.findIndex((t) => t.id === p.traumaId);
    const trauma = draft.traumas[index];
    if (!trauma) {
      warn(draft, action.id, 'TRAUMA_NOT_FOUND', `No trauma "${p.traumaId}" to edit; skipped.`);
      return;
    }
    draft.traumas[index] = { ...trauma, text: p.text };
  },
});

export const traumaRemoved = defineAction({
  type: 'trauma.removed',
  payload: TraumaRemovedPayload,
  apply(draft, p, action) {
    const index = draft.traumas.findIndex((t) => t.id === p.traumaId);
    if (index < 0) {
      warn(draft, action.id, 'TRAUMA_NOT_FOUND', `No trauma "${p.traumaId}" to remove; skipped.`);
      return;
    }
    draft.traumas.splice(index, 1);
  },
});
