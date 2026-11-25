// How an action type plugs into replay: a Zod payload schema plus a handler that writes the
// action into the replay Draft. Add a new action type by adding a defineAction() call in an
// action family file and listing it in registry.ts.
import { z } from 'zod';
import type { Draft } from '../derive/draft.ts';
import type { Action, ActionType } from '../model.ts';

export interface ActionDefinition<P> {
  readonly type: ActionType;
  readonly payload: z.ZodType<P>;
  /** False only for character.created; every other action needs a character first. */
  readonly requiresCharacter: boolean;
  /** Writes the action into the draft. Adds warnings for problems; never throws on bad data. */
  apply(draft: Draft, payload: P, action: Action): void;
  /** True when this payload may still be replayed after character.retired (notes, owed delivery). */
  allowedWhenRetired?(payload: P): boolean;
}

/** The registry stores definitions with their payload type erased. */
export interface RegisteredAction {
  readonly type: ActionType;
  readonly payload: z.ZodType<unknown>;
  readonly requiresCharacter: boolean;
  apply(draft: Draft, payload: unknown, action: Action): void;
  allowedWhenRetired(payload: unknown): boolean;
}

export function defineAction<P>(
  def: Omit<ActionDefinition<P>, 'requiresCharacter'> & { requiresCharacter?: boolean },
): RegisteredAction & { readonly schema: z.ZodType<P> } {
  return {
    type: def.type,
    payload: def.payload,
    schema: def.payload,
    requiresCharacter: def.requiresCharacter ?? true,
    apply: (draft, payload, action) => def.apply(draft, payload as P, action),
    allowedWhenRetired: (payload) => def.allowedWhenRetired?.(payload as P) ?? false,
  };
}

// ---- Shared payload pieces ----

export const LedgerCurrencySchema = z.enum(['xp', 'cxp', 'axp', 'mt']);
export const SkillCurrencySchema = z.enum(['xp', 'cxp']);

/** Kebab-case id, same rule as the rules data. */
export const RefIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Must be a kebab-case id such as "back-strike".')
  .max(100);

export const NameSchema = z.string().trim().min(1).max(200);
export const ReasonSchema = z.string().trim().min(1).max(2000);
export const ShortTextSchema = z.string().trim().max(200);
export const ItemTextSchema = z.string().trim().min(1).max(500);

/** Race or Calling choices: choice id to an option id, a language id, text, or a list. */
export const ChoicesSchema = z.record(
  RefIdSchema,
  z.union([z.string().trim().min(1).max(500), z.array(z.string().trim().min(1).max(200)).max(20)]),
);

export const AwardSchema = z.object({
  currency: LedgerCurrencySchema,
  amount: z.int().min(1),
  kind: RefIdSchema,
});
