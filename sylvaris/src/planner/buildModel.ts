// The "test build" planner inside the downloaded wiki file: a blank character people can try
// builds on, with the app's own rules engine. Each change is an engine command planned with a
// staff context (staff may award points), so costs, prerequisites, caps, and the Calling rules
// are exactly the app's. Events are invented, two weeks apart, so the event-based rules (five
// events before a Calling, one Calling Technique per event) work as they do in play.
import {
  deriveSheet,
  loadRuleset,
  plan,
  refundableSteps,
  type Action,
  type Command,
  type Ruleset,
  type Sheet,
  type SkillStep,
} from '../engine/index.ts';

export const BUILD_STORAGE_KEY = 'sylvaris-test-build-v1';

/** A build is the action log, kept in groups (one per change) so Undo removes one change. */
export interface Build {
  readonly version: 1;
  readonly groups: readonly (readonly Action[])[];
}

export type Result =
  | { readonly ok: true; readonly build: Build; readonly message: string }
  | { readonly ok: false; readonly errors: readonly string[] };

export const EMPTY_BUILD: Build = { version: 1, groups: [] };

let rulesetCache: Ruleset | undefined;
export function ruleset(): Ruleset {
  rulesetCache ??= loadRuleset();
  return rulesetCache;
}

export function actionsOf(build: Build): Action[] {
  return build.groups.flat();
}

const sheetCache = new WeakMap<Build, Sheet>();
export function sheetOf(build: Build): Sheet {
  let sheet = sheetCache.get(build);
  if (!sheet) {
    sheet = deriveSheet(ruleset(), actionsOf(build));
    sheetCache.set(build, sheet);
  }
  return sheet;
}

/** The first invented event; each later one is two weeks on. */
const FIRST_EVENT = Date.UTC(2026, 0, 3);
const DAY = 86_400_000;

function eventDate(n: number): string {
  return new Date(FIRST_EVENT + (n - 1) * 14 * DAY).toISOString().slice(0, 10);
}

/** The latest invented event the character attended, if any. */
export function latestEventKey(build: Build): string | undefined {
  const events = sheetOf(build).events;
  return events[events.length - 1]?.key;
}

/** Changes are dated at the latest event (or the day before the first one). */
function nowFor(build: Build): string {
  const n = sheetOf(build).events.length;
  const day = n === 0 ? new Date(FIRST_EVENT - DAY).toISOString().slice(0, 10) : eventDate(n);
  return `${day}T12:00:00.000Z`;
}

/** Plans one engine command and, when the rules allow it, adds its actions as one group. */
export function run(build: Build, command: Command, message: string): Result {
  const actions = actionsOf(build);
  let id = actions.length;
  const result = plan(ruleset(), sheetOf(build), command, {
    actor: { role: 'staff', name: 'Test build' },
    now: () => nowFor(build),
    newId: () => `tb-${++id}`,
    nextSeq: actions.length + 1,
  });
  if (!result.ok) return { ok: false, errors: result.errors.map((e) => e.message) };
  return { ok: true, build: { version: 1, groups: [...build.groups, result.actions] }, message };
}

export function undo(build: Build): Build {
  return { version: 1, groups: build.groups.slice(0, -1) };
}

// ---- Changes ---------------------------------------------------------------------------------

export function startBuild(
  name: string,
  raceId: string,
  choices: Record<string, string | string[]>,
): Result {
  const race = ruleset().racesById[raceId];
  return run(
    EMPTY_BUILD,
    {
      type: 'createCharacter',
      characterName: name.trim() || 'Test build',
      playerName: 'Test build',
      raceId,
      choices,
    },
    `Started a ${race?.name ?? raceId} test build with ${ruleset().ruleset.xp.start} XP.`,
  );
}

export function addEvent(build: Build): Result {
  const n = sheetOf(build).events.length + 1;
  const date = eventDate(n);
  return run(
    build,
    { type: 'checkIn', event: { key: `${date}-test-event-${n}`, name: `Test event ${n}`, date } },
    `Attended test event ${n}.`,
  );
}

export type PointsCurrency = 'xp' | 'cxp' | 'axp';

export function changePoints(build: Build, currency: PointsCurrency, amount: number): Result {
  const name = currency.toUpperCase();
  if (!Number.isInteger(amount) || amount === 0)
    return { ok: false, errors: ['Enter a whole number of points.'] };
  if (amount > 0)
    return run(
      build,
      { type: 'awardPoints', currency, amount, kind: 'gm-award' },
      `Added ${amount} ${name}.`,
    );
  return run(
    build,
    { type: 'adjustPoints', currency, amount, reason: 'Test build' },
    `Removed ${-amount} ${name}.`,
  );
}

export function stepLabel(step: SkillStep): string {
  if ('level' in step) return `level ${step.level}`;
  return `${step.technique.charAt(0).toUpperCase()}${step.technique.slice(1)} Technique`;
}

export function buyStep(build: Build, skillId: string, step: SkillStep): Result {
  const eventKey = latestEventKey(build);
  const name = ruleset().skillsById[skillId]?.name ?? skillId;
  return run(
    build,
    { type: 'learnSkill', skillId, step, ...(eventKey ? { eventKey } : {}) },
    `Added ${name} ${stepLabel(step)}.`,
  );
}

/** The steps that can be removed from an owned skill: its top level and its top Technique. */
export function removableSteps(build: Build, skillId: string): SkillStep[] {
  const owned = sheetOf(build).skills.find((s) => s.skillId === skillId);
  if (!owned) return [];
  return refundableSteps(ruleset(), { level: owned.level, techniques: [...owned.techniques] });
}

export function removeStep(build: Build, skillId: string, step: SkillStep): Result {
  const name = ruleset().skillsById[skillId]?.name ?? skillId;
  return run(
    build,
    { type: 'refundSkill', skillId, step, reason: 'Test build' },
    `Removed ${name} ${stepLabel(step)}.`,
  );
}

export function startCalling(
  build: Build,
  callingId: string,
  choices: Record<string, string | string[]>,
): Result {
  const eventKey = latestEventKey(build);
  const calling = ruleset().callingsById[callingId];
  return run(
    build,
    {
      type: 'startCalling',
      callingId,
      choices,
      teacher: 'Calling book',
      ...(eventKey ? { eventKey } : {}),
    },
    `Started ${calling?.name ?? callingId}.`,
  );
}

export function leaveCalling(build: Build): Result {
  const eventKey = latestEventKey(build);
  return run(
    build,
    { type: 'leaveCalling', reason: 'Test build', ...(eventKey ? { eventKey } : {}) },
    'Left the Calling.',
  );
}

export interface FamiliarInput {
  name: string;
  quality: 'basic' | 'expert' | 'master' | 'grandmaster';
  tricks: { id: string; slots: number }[];
}

export function setFamiliar(build: Build, input: FamiliarInput): Result {
  return run(
    build,
    {
      type: 'setFamiliar',
      name: input.name.trim() || 'Familiar',
      quality: input.quality,
      tricks: input.tricks,
    },
    `Set the familiar ${input.name.trim() || 'Familiar'}.`,
  );
}

export function removeFamiliar(build: Build): Result {
  return run(build, { type: 'removeFamiliar', reason: 'Test build' }, 'Removed the familiar.');
}

export function awakenArtifact(build: Build, name: string): Result {
  const n = name.trim() || 'Artifact';
  return run(build, { type: 'awakenArtifact', name: n }, `Awakened the Artifact ${n}.`);
}

export function unlockArtifactSlot(build: Build): Result {
  return run(build, { type: 'unlockArtifactSlot' }, 'Unlocked an Artifact Power Slot.');
}

export function setArtifactPower(build: Build, powerId: string, choice: string): Result {
  const power = ruleset().artifacts.powers.find((p) => p.id === powerId);
  return run(
    build,
    {
      type: 'setArtifactPower',
      powerId,
      ...(choice.trim() ? { choice: choice.trim() } : {}),
    },
    `Set the power ${power?.name ?? powerId}.`,
  );
}

export function removeArtifactPower(build: Build, entryId: string): Result {
  return run(
    build,
    { type: 'removeArtifactPowers', entryIds: [entryId], reason: 'Test build' },
    'Removed the power.',
  );
}

// ---- Saving in the browser -------------------------------------------------------------------

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The saved build, if it still replays without warnings; otherwise nothing. */
export function loadBuild(storage: StorageLike | null): Build {
  try {
    const text = storage?.getItem(BUILD_STORAGE_KEY);
    if (!text) return EMPTY_BUILD;
    const data = JSON.parse(text) as Build;
    if (data.version !== 1 || !Array.isArray(data.groups)) return EMPTY_BUILD;
    const build: Build = { version: 1, groups: data.groups };
    return sheetOf(build).created ? build : EMPTY_BUILD;
  } catch {
    return EMPTY_BUILD;
  }
}

export function saveBuild(storage: StorageLike | null, build: Build): void {
  try {
    if (build.groups.length === 0) storage?.removeItem(BUILD_STORAGE_KEY);
    else storage?.setItem(BUILD_STORAGE_KEY, JSON.stringify(build));
  } catch {
    // Storage blocked (private window, some file viewers): the build lasts until the page closes.
  }
}

// ---- A summary to copy -----------------------------------------------------------------------

/** An Artifact power's name, with its choice when it has one. */
export function powerName(powerId: string, choice: string | null): string {
  const name = ruleset().artifacts.powers.find((p) => p.id === powerId)?.name ?? powerId;
  return choice ? `${name} (${choice})` : name;
}

/** Plain text of the build, to paste into a message. */
export function buildSummary(sheet: Sheet): string {
  const p = sheet.points;
  const lines = [
    `${sheet.profile.characterName} (${sheet.race?.name ?? 'no race'}), test build`,
    `Events: ${sheet.events.length}. XP ${p.xp.spent} spent of ${p.xp.earned}, ${p.xp.available} left. CXP ${p.cxp.spent} of ${p.cxp.earned}. AXP ${p.axp.spent} of ${p.axp.earned}.`,
    `Life Points ${sheet.stats.lifePoints.value}, Armor Points ${sheet.stats.armorPoints.value}.`,
  ];
  if (sheet.calling) lines.push(`Calling: ${sheet.calling.name}.`);
  lines.push('Skills:');
  for (const s of sheet.skills) {
    if (s.level === 0 && s.techniques.length === 0) continue;
    const techniques = s.techniques.length
      ? `, Techniques: ${s.techniques.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(', ')}`
      : '';
    lines.push(`- ${s.displayName} ${s.level}${techniques}`);
  }
  if (sheet.familiar)
    lines.push(
      `Familiar: ${sheet.familiar.name} (${sheet.familiar.quality}), tricks: ${
        sheet.familiar.tricks.map((t) => t.name).join(', ') || 'none'
      }.`,
    );
  if (sheet.artifact)
    lines.push(
      `Artifact: ${sheet.artifact.name}, ${sheet.artifact.slotsUnlocked} slots, powers: ${
        sheet.artifact.powers.map((pw) => powerName(pw.powerId, pw.choice)).join(', ') || 'none'
      }.`,
    );
  return lines.join('\n');
}
