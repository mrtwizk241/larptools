// Cross-file checks that Zod cannot express per file: every id a record points at must
// exist, and paired data (schools and skills, recipes and resources) must agree.
import type {
  AncestriesFile,
  ArchetypesFile,
  AwardsFile,
  BoonsFile,
  Effect,
  FamiliarFile,
  InfectionFile,
  PerformancesFile,
  Prereq,
  ProfessionsFile,
  RecipesFile,
  RulesetFile,
  SkillsFile,
  SpellsFile,
  StartingItemsFile,
} from './schema/index.ts';
import { duplicateIds } from './schema/index.ts';

/** The validated contents of one season folder. */
export type RulesetData = {
  ruleset: RulesetFile;
  archetypes: ArchetypesFile;
  skills: SkillsFile;
  ancestries: AncestriesFile;
  professions: ProfessionsFile;
  spells: SpellsFile;
  recipes: RecipesFile;
  performances: PerformancesFile;
  familiar: FamiliarFile;
  boons: BoonsFile;
  startingItems: StartingItemsFile;
  infection: InfectionFile;
  awards: AwardsFile;
};

const ids = (items: readonly { id: string }[]) => new Set(items.map((i) => i.id));
const sameSet = <T>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/** Returns one plain-English line per broken reference. Empty means all good. */
export function findReferenceProblems(d: RulesetData): string[] {
  const out: string[] = [];
  const bad = (where: string, what: string) => out.push(`${where}: ${what}`);
  const r = d.ruleset;

  const archetypeIds = ids(d.archetypes);
  const ledgerKindIds = ids(r.ledgerKinds);
  const schoolIds = ids(r.magicSchools);
  const disciplineIds = ids(r.craftingDisciplines);
  const resourceTypeIds = ids(r.resourceTypes);
  const ancestryIds = ids(d.ancestries.ancestries);
  const trackIds = ids(d.infection.tracks);
  const ritualIds = ids(d.performances.rituals);
  const recipeById = new Map(d.recipes.map((x) => [x.id, x]));
  const spellById = new Map(d.spells.map((x) => [x.id, x]));
  const skillById = new Map(d.skills.map((s) => [s.id, s]));
  const purchaseIds = ids(d.awards.shinyPurchases);
  const awardedCurrencies = new Set(r.currencies.filter((c) => !c.derived).map((c) => c.id));

  const hasPart = (skillId: string, part: string) => {
    const s = skillById.get(skillId);
    return s !== undefined && part in s.parts;
  };
  const checkSkillPart = (where: string, skill: string, part: string) => {
    if (!skillById.has(skill)) bad(where, `unknown skill "${skill}"`);
    else if (!hasPart(skill, part)) bad(where, `skill "${skill}" has no part "${part}"`);
  };
  const checkEffect = (where: string, e: Effect) => {
    if (e.skill !== undefined) {
      if (e.part !== undefined) checkSkillPart(where, e.skill, e.part);
      else if (!skillById.has(e.skill)) bad(where, `unknown skill "${e.skill}"`);
    }
    if (e.levelOf) checkSkillPart(where, e.levelOf.skill, e.levelOf.part);
  };
  const checkPrereq = (where: string, p: Prereq) => {
    if ('allOf' in p) p.allOf.forEach((x) => checkPrereq(where, x));
    else if ('anyOf' in p) p.anyOf.forEach((x) => checkPrereq(where, x));
    else if ('skill' in p) checkSkillPart(where, p.skill, p.part);
    else {
      const f = p.from;
      for (const a of [...(f.archetype ? [f.archetype] : []), ...(f.archetypes ?? [])])
        if (!archetypeIds.has(a)) bad(where, `unknown archetype "${a}"`);
      for (const s of f.skills ?? []) checkSkillPart(where, s, p.part);
    }
  };

  // ruleset.json
  for (const k of r.earnedCxpCap.excludedKinds)
    if (!ledgerKindIds.has(k)) bad('ruleset.earnedCxpCap', `unknown ledger kind "${k}"`);
  if (!ledgerKindIds.has(r.extraInfection.ledgerKind))
    bad('ruleset.extraInfection', `unknown ledger kind "${r.extraInfection.ledgerKind}"`);
  for (const a of r.upkeep.zeroForAncestries)
    if (!ancestryIds.has(a)) bad('ruleset.upkeep', `unknown ancestry "${a}"`);
  if (!purchaseIds.has(r.upkeep.coveredByPurchase))
    bad('ruleset.upkeep', `unknown purchase "${r.upkeep.coveredByPurchase}"`);
  for (const s of r.magicSchools)
    if (skillById.get(s.skill)?.school !== s.id)
      bad(`ruleset.magicSchools ${s.id}`, `skill "${s.skill}" missing or not of this school`);
  for (const c of r.craftingDisciplines)
    if (skillById.get(c.skill)?.discipline !== c.id)
      bad(
        `ruleset.craftingDisciplines ${c.id}`,
        `skill "${c.skill}" missing or not this discipline`,
      );

  // skills.json
  for (const s of d.skills) {
    const w = `skill ${s.id}`;
    for (const a of [...(s.archetype ? [s.archetype] : []), ...(s.archetypeOptions ?? [])])
      if (!archetypeIds.has(a)) bad(w, `unknown archetype "${a}"`);
    if (s.archetypeRule?.kind === 'same-as-skill') {
      const other = skillById.get(s.archetypeRule.skill);
      if (!other) bad(w, `archetypeRule names unknown skill "${s.archetypeRule.skill}"`);
      else if (!sameSet(other.archetypeOptions ?? [], s.archetypeOptions ?? []))
        bad(w, `archetypeOptions differ from "${other.id}"`);
    }
    if (s.archetypeOptions && !s.archetypeRule) bad(w, 'archetypeOptions without archetypeRule');
    if (s.school !== undefined && !schoolIds.has(s.school)) bad(w, `unknown school "${s.school}"`);
    if (s.discipline !== undefined && !disciplineIds.has(s.discipline))
      bad(w, `unknown discipline "${s.discipline}"`);
    if (s.components) {
      const pool = s.category === 'magic' ? schoolIds : disciplineIds;
      for (const c of s.components) if (!pool.has(c)) bad(w, `unknown component "${c}"`);
    }
    const partIds = Object.keys(s.parts);
    if (s.type === 'basic' && !partIds.includes('basic'))
      bad(w, 'basic skill without a basic part');
    if (s.type !== 'basic' && !sameSet(partIds, ['main']))
      bad(w, `${s.type} skill must have only "main"`);
    for (const [pid, p] of Object.entries(s.parts)) {
      if (!p) continue;
      const pw = `${w}.${pid}`;
      const expectedKind = pid === 'main' ? s.type : pid;
      if (p.costKind !== expectedKind)
        bad(pw, `costKind "${p.costKind}", expected "${expectedKind}"`);
      p.prereqs.forEach((x) => checkPrereq(pw, x));
      p.effects?.forEach((e) => checkEffect(pw, e));
      if (p.memorizationSlots) {
        const m = p.memorizationSlots;
        const pool = m.kind === 'spell' ? schoolIds : disciplineIds;
        if (m.pool !== 'any' && !pool.has(m.pool))
          bad(pw, `unknown ${m.kind} slot pool "${m.pool}"`);
      }
      for (const g of p.grants ?? [])
        if ('ritual' in g && !ritualIds.has(g.ritual)) bad(pw, `unknown ritual "${g.ritual}"`);
      for (const a of p.abilities ?? []) {
        const sp = spellById.get(a);
        if (!sp || !sp.mastery || sp.masterySkill !== s.id)
          bad(pw, `ability "${a}" is not a mastery spell of this skill`);
      }
    }
  }

  // ancestries.json
  const abilityIds: string[] = [];
  for (const a of d.ancestries.ancestries) {
    if (!trackIds.has(a.infectionTrack))
      bad(`ancestry ${a.id}`, `unknown track "${a.infectionTrack}"`);
    const all = [a.passive, a.sharedAbility, ...a.subtypes.flatMap((s) => [s.passive, s.ability])];
    for (const ab of all) if (ab) abilityIds.push(ab.id);
  }
  for (const id of duplicateIds(abilityIds.map((id) => ({ id }))))
    bad('ancestries', `duplicate ability id "${id}"`);
  for (const id of duplicateIds(d.ancestries.ancestries.flatMap((a) => a.subtypes)))
    bad('ancestries', `duplicate subtype id "${id}"`);
  const abilitySet = new Set(abilityIds);
  for (const a of d.ancestries.ancestries) {
    const c = a.sharedAbility.choice;
    for (const id of [...(c?.allowedAbilityIds ?? []), ...(c?.excludedAbilityIds ?? [])])
      if (!abilitySet.has(id)) bad(`ancestry ${a.id} choice`, `unknown ability "${id}"`);
  }

  // professions.json
  const pr = d.professions.rules;
  const profAbilities = d.professions.professions.flatMap((p) => [p.passive, ...p.skills]);
  for (const id of duplicateIds(profAbilities)) bad('professions', `duplicate ability id "${id}"`);
  const levels = pr.usesByLevel.map((u) => u.level);
  if (
    !sameSet(
      levels,
      Array.from({ length: pr.maxLevel }, (_, i) => i + 1),
    )
  )
    bad('professions.rules.usesByLevel', `levels must be 1..${pr.maxLevel}`);
  for (const p of d.professions.professions) {
    const w = `profession ${p.id}`;
    if (
      !sameSet(
        p.skills.map((s) => s.slot),
        ['skill-1', 'skill-2'],
      )
    )
      bad(w, 'needs one skill-1 and one skill-2');
    const own = p.skills.map((s) => s.id);
    for (const t of [p.passive.ratingCap, p.passive.ledgerSlots])
      if (t && !own.includes(t.skill))
        bad(w, `table names skill "${t.skill}" of another profession`);
    for (const sp of p.passive.perEventChoice?.excludeSpells ?? [])
      if (!spellById.has(sp)) bad(w, `unknown spell "${sp}"`);
  }

  // spells.json
  for (const s of d.spells) {
    const w = `spell ${s.id}`;
    if (!s.mastery) {
      if (!schoolIds.has(s.school)) bad(w, `unknown school "${s.school}"`);
      if (s.usesBuffSlot !== s.marks.includes('B')) bad(w, 'usesBuffSlot disagrees with marks');
      continue;
    }
    const sk = skillById.get(s.masterySkill);
    if (!sk || sk.type !== 'mastery' || sk.category !== 'magic')
      bad(w, `"${s.masterySkill}" is not a mastery magic skill`);
    else if (!sameSet(sk.components ?? [], s.components))
      bad(w, 'components differ from its skill');
    for (const e of s.expends) checkSkillPart(w, e.skill, e.part);
  }

  // recipes.json
  const resourceOf = new Map(r.craftingDisciplines.map((c) => [c.id, c.resourceType]));
  for (const x of d.recipes) {
    const w = `recipe ${x.id}`;
    let allowed: (string | undefined)[];
    if (!x.mastery) {
      if (!disciplineIds.has(x.discipline)) bad(w, `unknown discipline "${x.discipline}"`);
      allowed = [resourceOf.get(x.discipline)];
    } else {
      const sk = skillById.get(x.masterySkill);
      if (!sk || sk.type !== 'mastery' || sk.category !== 'crafting')
        bad(w, `"${x.masterySkill}" is not a mastery crafting skill`);
      else if (!sameSet(sk.components ?? [], x.components))
        bad(w, 'components differ from its skill');
      allowed = x.components.map((c) => resourceOf.get(c));
    }
    for (const c of [...x.cost, ...(x.upgradeCost ?? [])]) {
      if (!resourceTypeIds.has(c.type)) bad(w, `unknown resource type "${c.type}"`);
      if (!allowed.includes(c.type)) bad(w, `costs "${c.type}", not a resource of its craft`);
    }
  }

  // performances.json
  for (const p of d.performances.performances)
    for (const e of p.targetEffects)
      for (const g of [...(e.grants ? [e.grants] : []), ...(e.grantsOneOf ?? [])])
        checkSkillPart(`performance ${p.id}`, g.skill, g.part);
  for (const x of d.performances.rituals)
    x.effects?.forEach((e) => checkEffect(`ritual ${x.id}`, e));

  // familiar.json
  const f = d.familiar;
  for (const id of duplicateIds([...f.awakenedSkills, ...f.skills]))
    bad('familiar', `skill id "${id}" used twice`);
  for (const s of f.skills)
    if (s.tier !== s.costEssence) bad(`familiar skill ${s.id}`, 'tier and costEssence differ');
  const famLevels = f.levels.table.map((t) => t.level);
  const expected = Array.from(
    { length: f.levels.max - f.levels.min + 1 },
    (_, i) => f.levels.min + i,
  );
  if (!sameSet(famLevels, expected))
    bad('familiar.levels', `table must cover ${f.levels.min}..${f.levels.max}`);

  // boons.json
  const b = d.boons;
  const expiryIds = ids(b.expiryKinds);
  const originById = new Map(b.origins.map((o) => [o.id, o]));
  if (!expiryIds.has(b.rules.defaultExpiry))
    bad('boons.rules', `unknown expiry "${b.rules.defaultExpiry}"`);
  for (const o of b.origins)
    if (skillById.get(o.masterySkill)?.type !== 'mastery')
      bad(`boon origin ${o.id}`, `"${o.masterySkill}" is not a mastery skill`);
  for (const m of b.modifiers) {
    if (!recipeById.has(m.recipeId)) bad(`boon modifier ${m.id}`, `unknown recipe "${m.recipeId}"`);
    if (m.appliesToOrigin && !originById.has(m.appliesToOrigin))
      bad(`boon modifier ${m.id}`, `unknown origin "${m.appliesToOrigin}"`);
    if (m.setsExpiry && !expiryIds.has(m.setsExpiry))
      bad(`boon modifier ${m.id}`, `unknown expiry "${m.setsExpiry}"`);
  }
  for (const x of b.boons) {
    const w = `boon ${x.id}`;
    const origin = originById.get(x.origin);
    const recipe = recipeById.get(x.recipeId);
    if (!origin) bad(w, `unknown origin "${x.origin}"`);
    if (!recipe) bad(w, `unknown recipe "${x.recipeId}"`);
    else if (origin && (!recipe.mastery || recipe.masterySkill !== origin.masterySkill))
      bad(w, `recipe "${recipe.id}" is not a ${origin.masterySkill} recipe`);
    if (!expiryIds.has(x.expiry)) bad(w, `unknown expiry "${x.expiry}"`);
    if (x.linksToOrigin && !originById.has(x.linksToOrigin))
      bad(w, `unknown origin "${x.linksToOrigin}"`);
    for (const a of x.restrictedTo ?? [])
      if (!ancestryIds.has(a)) bad(w, `unknown ancestry "${a}"`);
    x.effects?.forEach((e) => checkEffect(w, e));
  }

  // starting-items.json
  for (const o of d.startingItems.options)
    for (const c of o.choices ?? [])
      if (c.field === 'type')
        for (const t of c.options)
          if (!resourceTypeIds.has(t)) bad(`starting item ${o.id}`, `unknown resource type "${t}"`);

  // infection.json
  if (!ids(d.infection.gain).has(d.infection.trauma.createdOn))
    bad('infection.trauma', `unknown gain "${d.infection.trauma.createdOn}"`);

  // awards.json
  const a = d.awards;
  const grants = [
    ...a.attendance.flatMap((x) => x.grants.map((g) => [`attendance ${x.id}`, g] as const)),
    ...a.extras.flatMap((x) => x.grants.map((g) => [`extra ${x.id}`, g] as const)),
    ...a.betweenGamesRoles.flatMap((x) => x.grants.map((g) => [`role ${x.id}`, g] as const)),
    ...a.shinyPurchases.flatMap((x) =>
      (x.grants ?? []).map((g) => [`purchase ${x.id}`, g] as const),
    ),
  ];
  for (const [w, g] of grants) {
    if (!ledgerKindIds.has(g.kind)) bad(w, `unknown ledger kind "${g.kind}"`);
    if (!awardedCurrencies.has(g.currency)) bad(w, `currency "${g.currency}" cannot be awarded`);
  }
  if (!ledgerKindIds.has(a.npcTime.ledgerKind))
    bad('awards.npcTime', `unknown ledger kind "${a.npcTime.ledgerKind}"`);
  for (const x of a.otherShinySources)
    if (!ledgerKindIds.has(x.kind)) bad(`shiny source ${x.id}`, `unknown ledger kind "${x.kind}"`);
  const conditionIds = ids(a.conditions);
  for (const x of a.shinyPurchases) {
    if (x.condition && !conditionIds.has(x.condition))
      bad(`purchase ${x.id}`, `condition "${x.condition}" has no text`);
    if (!x.grants && !x.items && !x.eventCxp) bad(`purchase ${x.id}`, 'buys nothing');
  }

  return out;
}
