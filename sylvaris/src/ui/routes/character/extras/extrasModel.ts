// Extras screen model: Artifact slot math and power names, the awakening check, and familiar
// trick options. Pure, so it is unit tested.
import type { ArtifactSection, Ruleset, Sheet } from '../../../../engine/index.ts';
import { plural } from '../journals/events.ts';

/** A readable label from an id: `art-basic-skill-use` gives "Basic skill use". */
export function labelFromId(id: string): string {
  const words = id.replace(/^(art|fam)-/, '').replace(/-/g, ' ');
  return `${words[0]?.toUpperCase() ?? ''}${words.slice(1)}`;
}

/** The power's `name` from the data, or a label from its id. */
export function powerName(ruleset: Ruleset, powerId: string): string {
  const power = ruleset.artifactPowersById[powerId] as { name?: string } | undefined;
  return power?.name ?? labelFromId(powerId);
}

/** A special trick's `name` from the data, or a label from its id; skills by their name. */
export function trickName(ruleset: Ruleset, id: string): string {
  const special = ruleset.specialTricksById[id] as { name?: string } | undefined;
  if (special) return special.name ?? labelFromId(id);
  return ruleset.skillsById[id]?.name ?? labelFromId(id);
}

/** "3 of 4 unlocked slots used, 1 free. 4 of 10 slots unlocked." */
export function slotsText(a: ArtifactSection): string {
  return `${a.slotsUsed} of ${plural(a.slotsUnlocked, 'unlocked slot')} used, ${a.slotsFree} free. ${a.slotsUnlocked} of ${a.maxSlots} slots unlocked.`;
}

/** "Next slot: 5 AXP." or "Every slot is unlocked." */
export function nextSlotText(a: ArtifactSection): string {
  return a.nextSlotCost === null ? 'Every slot is unlocked.' : `Next slot: ${a.nextSlotCost} AXP.`;
}

/** What awakening needs, met or not ([ART-RULES]). */
export function awakenLines(ruleset: Ruleset, sheet: Sheet): { met: boolean; text: string }[] {
  const r = ruleset.ruleset.artifact;
  const xp = sheet.points.xp.earned;
  const axp = sheet.points.axp.available;
  return [
    { met: xp >= r.minXpEarned, text: `XP earned: ${xp} (needs ${r.minXpEarned}).` },
    { met: axp >= r.awakenCostAxp, text: `AXP available: ${axp} (needs ${r.awakenCostAxp}).` },
  ];
}

/** Powers may be removed once per calendar year: whether that is used for `year`. */
export function removalUsed(ruleset: Ruleset, a: ArtifactSection, year: string): boolean {
  const per = ruleset.artifacts.rules.removePowersPerYear;
  return a.removals.filter((r) => r.at.startsWith(year)).length >= per;
}

/** Choice options for a power: listed options, the elements, or null for free text. */
export function powerChoiceOptions(ruleset: Ruleset, powerId: string): [string, string][] | null {
  const power = ruleset.artifactPowersById[powerId];
  if (!power?.choice) return null;
  if (power.choiceOptions) return power.choiceOptions.map((o) => [o, labelFromId(o)]);
  if (power.choice === 'element') return ruleset.ruleset.magicSchools.map((s) => [s.id, s.name]);
  if (power.choice === 'condition')
    return ruleset.artifacts.allowedConditions.map((c) => [c.id, c.label]);
  return null;
}

/** Skills a familiar may learn: not magic, crafting, or Calling, racial only of its owner's race. */
export function trickSkillOptions(ruleset: Ruleset, sheet: Sheet): [string, string][] {
  const raceId = sheet.race?.raceId;
  return Object.values(ruleset.skillsById)
    .filter(
      (s) =>
        s.category !== 'magic' &&
        s.category !== 'crafting' &&
        s.category !== 'calling' &&
        (s.category !== 'racial' || ('raceId' in s && s.raceId === raceId)),
    )
    .map((s) => [s.id, s.name] as [string, string])
    .sort((a, b) => a[1].localeCompare(b[1]));
}

/** Trick slots for a familiar quality. */
export function trickSlots(ruleset: Ruleset, quality: string): number {
  return (
    (ruleset.familiars.rules.trickSlotsByQuality as Readonly<Record<string, number>>)[quality] ?? 0
  );
}

/** Locations: "3 of 5 used (20 at most). Raven's Rest is fixed." */
export function locationsText(sheet: Sheet): string {
  const l = sheet.locations;
  return `${l.used} of ${l.capacity} used, ${l.max} at most. Portals: ${l.portalSlots}. Trees: ${l.treeSlots}.`;
}
