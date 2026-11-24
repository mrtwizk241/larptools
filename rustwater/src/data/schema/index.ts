// One schema per rules data file. Each is strict: unknown keys fail validation.
export * from './common.ts';
export { RulesetFile, type ArchetypeCostKind } from './ruleset.ts';
export { Archetype, ArchetypesFile } from './archetypes.ts';
export { CostKind, Prereq, Skill, SkillPart, SkillsFile, type SkillPartId } from './skills.ts';
export { Ancestry, AncestryAbility, AncestriesFile, Subtype } from './ancestries.ts';
export { Profession, ProfessionPassive, ProfessionSkill, ProfessionsFile } from './professions.ts';
export { MasterySpell, SchoolSpell, Spell, SpellsFile } from './spells.ts';
export { CraftRecipe, MasteryRecipe, Recipe, RecipesFile } from './recipes.ts';
export { Performance, PerformancesFile, Ritual } from './performances.ts';
export { AwakenedSkill, FamiliarFile, FamiliarSkill } from './familiar.ts';
export { Boon, BoonsFile } from './boons.ts';
export { StartingItemOption, StartingItemsFile } from './starting-items.ts';
export { InfectionFile, InfectionTrack } from './infection.ts';
export { AttendanceBundle, AwardsFile, PurchaseCondition, ShinyPurchase } from './awards.ts';
