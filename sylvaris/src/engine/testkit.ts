// Test helpers for Sylvaris engine tests: a ruleset, a staff context, and a small harness that
// plans commands and appends the resulting actions. Not used by app code.
import { loadSylvarisRuleset, type SyRuleset } from '../data/index.ts';
import type { PlanContext, PlanResult } from './commands/define.ts';
import { plan } from './commands/plan.ts';
import type { Command } from './commands/registry.ts';
import type { CreateCharacterCommand } from './commands/character.ts';
import { deriveSheet } from './derive/deriveSheet.ts';
import type { Action, ActorRole, GameEvent, SkillStep } from './model.ts';
import type { Sheet } from './sheet.ts';

export const rs: SyRuleset = loadSylvarisRuleset();

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
  /** Plans and expects failure; returns the error codes. */
  fail(command: Command): string[];
  /** Sets the time the next actions are recorded at. */
  at(iso: string): void;
  /** Sets the events registry passed in the plan context (undefined: none). */
  knownEvents(events: readonly GameEvent[] | undefined): void;
  /** Plans as the build playground (PlanContext.playground) from now on. */
  playground(on: boolean): void;
}

export function harness(initial: readonly Action[] = []): Harness {
  const actions: Action[] = [...initial];
  let id = actions.length;
  let now = AT;
  let known: readonly GameEvent[] | undefined;
  let isPlayground = false;
  let cached: { length: number; sheet: Sheet } | null = null;
  const sheet = (): Sheet => {
    if (!cached || cached.length !== actions.length)
      cached = { length: actions.length, sheet: deriveSheet(rs, actions) };
    return cached.sheet;
  };
  const ctx = (role: ActorRole = 'staff'): PlanContext => ({
    actor: { role, name: 'Test Staff' },
    now: () => now,
    newId: () => `act-${++id}`,
    nextSeq: actions.length + 1,
    ...(known ? { events: known } : {}),
    ...(isPlayground ? { playground: true } : {}),
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
    fail(command) {
      const result = plan(rs, sheet(), command, ctx());
      if (result.ok) throw new Error(`expected ${command.type} to fail, it passed`);
      return result.errors.map((e) => e.code);
    },
    at(iso) {
      now = iso;
    },
    knownEvents(events) {
      known = events;
    },
    playground(on) {
      isPlayground = on;
    },
  };
}

export const BASE_CHARACTER: CreateCharacterCommand = {
  type: 'createCharacter',
  characterName: 'Wren Ashdown',
  playerName: 'Sample Player',
  raceId: 'human',
};

/** A harness with a created character (Human unless overridden). */
export function withCharacter(overrides: Partial<CreateCharacterCommand> = {}): Harness {
  const h = harness();
  h.run({ ...BASE_CHARACTER, ...overrides });
  return h;
}

/** Credits points with a staff adjustment (never clamped), for test setup. */
export function grant(h: Harness, currency: 'xp' | 'cxp' | 'axp' | 'mt', amount: number): void {
  h.run({ type: 'adjustPoints', currency, amount, reason: 'test setup' });
}

/** Buys a skill up to `level` with `techniques` (teacher given), one command per step. */
export function learn(
  h: Harness,
  skillId: string,
  level: number,
  techniques: readonly ('expert' | 'master' | 'grandmaster')[] = [],
  eventKey?: string,
): void {
  const current = h.sheet().skills.find((s) => s.skillId === skillId);
  let lvl = current?.level ?? 0;
  const owned = new Set(current?.techniques ?? []);
  const gate = (t: 'expert' | 'master' | 'grandmaster') => rs.techniquesById[t]?.level ?? Infinity;
  const step = (s: SkillStep) =>
    h.run({
      type: 'learnSkill',
      skillId,
      step: s,
      teacher: 'Old Jory',
      ...(eventKey ? { eventKey } : {}),
    });
  const flush = () => {
    for (const t of techniques)
      if (!owned.has(t) && lvl >= gate(t)) {
        step({ technique: t });
        owned.add(t);
      }
  };
  flush();
  while (lvl < level) {
    lvl += 1;
    step({ level: lvl });
    flush();
  }
}

/** Checks a character in to `n` events, one a month from `startYear`-01. */
export function attend(h: Harness, n: number, startYear = 2026, attendance = 'player'): string[] {
  const keys: string[] = [];
  const done = h.sheet().events.length;
  for (let i = 0; i < n; i++) {
    const idx = done + i;
    const year = startYear + Math.floor(idx / 12);
    const month = String((idx % 12) + 1).padStart(2, '0');
    const e = event(`${year}-${month}-15`, `game-${idx + 1}`, `Game ${idx + 1}`);
    h.run({ type: 'checkIn', event: e, attendance: attendance as 'player', upkeep: 'paid' });
    keys.push(e.key);
  }
  return keys;
}
