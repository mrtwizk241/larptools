// Test helpers for engine tests: a ruleset, a staff context, and a small harness that plans
// commands and appends the resulting actions. Not used by app code.
import { loadRuleset, type Ruleset } from '../data/index.ts';
import type { PlanContext, PlanResult } from './commands/define.ts';
import { plan } from './commands/plan.ts';
import type { Command } from './commands/registry.ts';
import type { CreateCharacterCommand } from './commands/createCharacter.ts';
import { deriveSheet } from './derive/deriveSheet.ts';
import type { Action, ActorRole } from './model.ts';
import type { Sheet } from './sheet.ts';

export const rs: Ruleset = loadRuleset();

export const AT = '2026-05-16T12:00:00.000Z';

export function event(date: string, slug: string, name = slug) {
  return { key: `${date}-${slug}`, name, date };
}

export interface Harness {
  readonly actions: Action[];
  sheet(): Sheet;
  ctx(role?: ActorRole): PlanContext;
  plan(command: Command, role?: ActorRole): PlanResult;
  /** Plans and appends; throws with the error messages when the plan fails. */
  run(command: Command): Action[];
}

export function harness(initial: readonly Action[] = []): Harness {
  const actions: Action[] = [...initial];
  let id = actions.length;
  let cached: { length: number; sheet: Sheet } | null = null;
  const sheet = (): Sheet => {
    if (!cached || cached.length !== actions.length)
      cached = { length: actions.length, sheet: deriveSheet(rs, actions) };
    return cached.sheet;
  };
  const ctx = (role: ActorRole = 'staff'): PlanContext => ({
    actor: { role, name: 'Test Staff' },
    now: () => AT,
    newId: () => `act-${++id}`,
    nextSeq: actions.length + 1,
  });
  return {
    actions,
    sheet,
    ctx,
    plan: (command, role) => plan(rs, sheet(), command, ctx(role)),
    run(command) {
      const result = plan(rs, sheet(), command, ctx());
      if (!result.ok)
        throw new Error(
          `plan failed: ${result.errors.map((e) => `${e.code}: ${e.message}`).join(' | ')}`,
        );
      actions.push(...result.actions);
      return result.actions;
    },
  };
}

export const BASE_CHARACTER: CreateCharacterCommand = {
  type: 'createCharacter',
  characterName: 'Mara Quill',
  playerName: 'Sample Player',
  ancestryId: 'human',
  subtypeId: 'human-wastelander',
};

/** A harness with a created character (Human Wastelander unless overridden). */
export function withCharacter(overrides: Partial<CreateCharacterCommand> = {}): Harness {
  const h = harness();
  h.run({ ...BASE_CHARACTER, ...overrides });
  return h;
}

/** Credits CXP with a staff adjustment (never clamped; counts as earned), for test setup. */
export function grantCxp(h: Harness, amount: number): void {
  h.run({ type: 'adjustPoints', currency: 'cxp', amount, reason: 'test setup' });
}

export function grantShinies(h: Harness, amount: number): void {
  h.run({ type: 'adjustPoints', currency: 'shinies', amount, reason: 'test setup' });
}

/** Buys `skillId` basic up to `level` (teacher given). */
export function learnBasic(h: Harness, skillId: string, level: number, archetype?: string): void {
  h.run({
    type: 'learnSkill',
    skillId,
    part: 'basic',
    toLevel: level,
    teacher: 'Old Jory',
    ...(archetype ? { archetype } : {}),
  });
}
