// Cross-file checks for the Sylvaris rules data that Zod cannot express per file: every id a
// record points at must exist, and paired data (schools and skills, crafts and recipes, uses
// and levels) must agree.
import type {
  ArtifactsFile,
  AwardsFile,
  CallingsFile,
  FamiliarsFile,
  GemsFile,
  PerformancesFile,
  PrereqGroup,
  RacesFile,
  RecipesFile,
  RitualsFile,
  SkillsFile,
  SpellsFile,
  StartingEquipmentFile,
  SyRulesetFile,
} from './schema/index.ts';
import { duplicateIds } from './schema/index.ts';

/** The validated contents of one Sylvaris season folder. */
export type SyRulesetData = {
  ruleset: SyRulesetFile;
  skills: SkillsFile;
  races: RacesFile;
  callings: CallingsFile;
  spells: SpellsFile;
  rituals: RitualsFile;
  recipes: RecipesFile;
  performances: PerformancesFile;
  gems: GemsFile;
  startingEquipment: StartingEquipmentFile;
  artifacts: ArtifactsFile;
  familiars: FamiliarsFile;
  awards: AwardsFile;
};

const NAMED = ['basic', 'expert', 'master', 'grandmaster'] as const;
type Leveled = {
  id: string;
  category: string;
  advanced: boolean;
  prereqs: readonly PrereqGroup[];
  replacesSkill?: string | undefined;
  levels: Record<(typeof NAMED)[number], { uses: number; kind: string }>;
};

/** Every skill of the season: regular, racial, and Calling. */
export function allSkills(d: SyRulesetData): Leveled[] {
  return [...d.skills, ...d.races.flatMap((r) => r.skills), ...d.callings.flatMap((c) => c.skills)];
}

/** True when the dotted path names a value in obj. */
function hasPath(obj: unknown, path: string): boolean {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object' || !Object.hasOwn(cur, part)) return false;
    cur = (cur as Record<string, unknown>)[part];
  }
  return true;
}

/** Returns one plain-English line per broken reference. Empty means all good. */
export function findSylvarisReferenceProblems(d: SyRulesetData): string[] {
  const out: string[] = [];
  const bad = (where: string, what: string) => out.push(`${where}: ${what}`);
  const r = d.ruleset;
  const uses = r.skills.usesPerAbility;

  // Skills across all sources
  const skills = allSkills(d);
  for (const id of duplicateIds(skills)) bad('skills', `skill id "${id}" used more than once`);
  const skillById = new Map(skills.map((s) => [s.id, s]));
  const magicSkills = new Set(skills.filter((s) => s.category === 'magic').map((s) => s.id));
  const craftSkillById = new Map(
    d.skills.filter((s) => s.category === 'crafting').map((s) => [s.id, s]),
  );
  for (const s of skills) {
    const w = `skill ${s.id}`;
    for (const g of s.prereqs)
      for (const req of g.of) {
        const p = skillById.get(req.skill);
        if (!p) bad(w, `prereq names unknown skill "${req.skill}"`);
        else if (p.category === 'racial' || p.category === 'calling')
          bad(w, `prereq "${req.skill}" is a ${p.category} skill`);
        if (req.technique !== r.skills.advancedPrereqTechnique)
          bad(
            w,
            `prereq "${req.skill}" at ${req.technique}, expected ${r.skills.advancedPrereqTechnique}`,
          );
      }
    if (s.replacesSkill !== undefined && !skillById.has(s.replacesSkill))
      bad(w, `replaces unknown skill "${s.replacesSkill}"`);
    for (const l of NAMED) {
      const a = s.levels[l];
      if (a.kind !== 'passive' && a.uses !== uses[l])
        bad(`${w}.${l}`, `uses ${a.uses}, expected ${uses[l]}`);
    }
  }

  // ruleset.json combat buffs: each names a real source, and its Enhancement Slot flag agrees
  // with the source's (E) mark where the source has one.
  const flagged = {
    spell: new Map(d.spells.map((x) => [x.id, x.enhancement])),
    recipe: new Map(d.recipes.map((x) => [x.id, x.enhancement])),
    performance: new Map(d.performances.map((x) => [x.id, x.enhancement])),
  };
  const powerIds = new Set(d.artifacts.powers.map((p) => p.id));
  for (const b of r.combat.buffs) {
    const w = `combat buff ${b.id}`;
    const { kind, id, at } = b.from;
    if (kind === 'skill') {
      if (!skillById.has(id)) bad(w, `unknown skill "${id}"`);
      if (at === undefined) bad(w, 'a skill buff needs the named level that unlocks it');
    } else if (kind === 'artifact') {
      if (!powerIds.has(id)) bad(w, `unknown Artifact power "${id}"`);
    } else {
      const mark = flagged[kind].get(id);
      if (mark === undefined) bad(w, `unknown ${kind} "${id}"`);
      else if (mark !== b.enhancement)
        bad(w, `enhancement ${b.enhancement}, but the ${kind} says ${mark}`);
    }
  }

  // ruleset.json
  const techLevels = r.skills.techniques.map((t) => [t.id, t.level] as const);
  for (const [id, level] of techLevels)
    if (r.skills.namedLevels[id] !== level)
      bad(`ruleset.skills.techniques ${id}`, `level ${level} differs from namedLevels`);
  const ledgerKinds = new Set(r.ledgerKinds.map((k) => k.id));
  const schoolIds = new Set<string>(r.magicSchools.map((s) => s.id));
  for (const s of r.magicSchools) {
    const sk = d.skills.find((x) => x.id === s.skill);
    if (!sk || sk.category !== 'magic' || sk.school !== s.id)
      bad(`ruleset.magicSchools ${s.id}`, `skill "${s.skill}" missing or not of this school`);
  }
  for (const s of d.skills)
    if (s.school !== undefined && r.magicSchools.find((m) => m.id === s.school)?.skill !== s.id)
      bad(`skill ${s.id}`, `school "${s.school}" is not listed for it in ruleset.magicSchools`);
  for (const key of [...Object.keys(r.sources), ...Object.keys(r.notes)])
    if (key !== 'townBuildings' && !hasPath(r, key))
      bad('ruleset sources/notes', `"${key}" names no value`);
  const levelSum = (r.skills.maxLevel * (r.skills.maxLevel + 1)) / 2;
  const fullSkill =
    r.skills.costPerLevel * levelSum + r.skills.techniques.reduce((n, t) => n + t.cost, 0);
  if (r.cxp.earnedCap !== 2 * fullSkill)
    bad('ruleset.cxp.earnedCap', `${r.cxp.earnedCap}, but one full Calling costs ${2 * fullSkill}`);
  const languageIds = new Set(r.languages.map((l) => l.id));

  // races.json
  for (const w of duplicateIds(d.races.flatMap((x) => x.innate)))
    bad('races', `innate id "${w}" used more than once`);
  for (const race of d.races) {
    const w = `race ${race.id}`;
    if (!languageIds.has(race.language)) bad(w, `unknown language "${race.language}"`);
    for (const s of race.skills)
      if (s.raceId !== race.id) bad(w, `skill ${s.id} has raceId "${s.raceId}"`);
    const choiceById = new Map(race.choices.map((c) => [c.id, c]));
    if ((race.size === 'choice') !== choiceById.has('size'))
      bad(w, 'size "choice" and a "size" choice go together');
    for (const i of race.innate) {
      if (i.grantsSkillUse !== undefined && !skillById.has(i.grantsSkillUse))
        bad(w, `innate uses unknown skill "${i.grantsSkillUse}"`);
      if (i.naturalWeapon) {
        const c = choiceById.get(i.naturalWeapon.choiceId);
        const opts = i.naturalWeapon.options.map((o) => o.id).join(',');
        if (!c || c.options?.join(',') !== opts)
          bad(w, `natural weapon options do not match choice "${i.naturalWeapon.choiceId}"`);
      }
    }
  }

  // callings.json
  for (const c of d.callings) {
    const w = `calling ${c.id}`;
    const own = new Set(c.skills.map((s) => s.id));
    const choiceIds = new Set((c.choices ?? []).map((x) => x.id));
    for (const s of c.skills) {
      if (s.callingId !== c.id) bad(w, `skill ${s.id} has callingId "${s.callingId}"`);
      if (s.mirrorsChoice !== undefined && !choiceIds.has(s.mirrorsChoice))
        bad(w, `skill ${s.id} mirrors unknown choice "${s.mirrorsChoice}"`);
    }
    for (const ch of c.choices ?? [])
      if (ch.appliesToSkill !== undefined && !own.has(ch.appliesToSkill))
        bad(w, `choice ${ch.id} applies to "${ch.appliesToSkill}", not one of its skills`);
    for (const e of c.effects ?? []) {
      if (e.perTechniqueInSkill !== undefined && !own.has(e.perTechniqueInSkill))
        bad(w, `effect scales with "${e.perTechniqueInSkill}", not one of its skills`);
      if (e.fromChoice !== undefined && !choiceIds.has(e.fromChoice))
        bad(w, `effect reads unknown choice "${e.fromChoice}"`);
    }
  }

  // spells.json, performances.json
  for (const s of d.spells) {
    if (!schoolIds.has(s.school)) bad(`spell ${s.id}`, `unknown school "${s.school}"`);
    if (s.uses !== uses[s.level]) bad(`spell ${s.id}`, `uses ${s.uses}, expected ${uses[s.level]}`);
  }
  for (const p of d.performances)
    if (p.uses !== uses[p.level])
      bad(`performance ${p.id}`, `uses ${p.uses}, expected ${uses[p.level]}`);

  // rituals.json
  const rr = d.rituals.rules;
  const chartIds = new Set(d.rituals.planarChart.map((p) => p.id));
  for (const x of d.rituals.rituals) {
    const w = `ritual ${x.id}`;
    if (x.uses !== rr.usesByLevel[x.level]) bad(w, `uses ${x.uses} differ from rules`);
    const tier = NAMED.indexOf(x.level) + 1;
    if (x.castMinutes !== tier * rr.castMinutesPerNamedLevel)
      bad(w, `castMinutes ${x.castMinutes}`);
    for (const m of x.requiredMagic ?? [])
      if (!magicSkills.has(m)) bad(w, `"${m}" is not a magic skill`);
  }
  for (const p of d.rituals.planarChart) {
    if (p.parent !== undefined && !chartIds.has(p.parent))
      bad(`plane ${p.id}`, `unknown parent "${p.parent}"`);
    for (const m of p.requiredMagic)
      if (!magicSkills.has(m)) bad(`plane ${p.id}`, `"${m}" is not a magic skill`);
    if ((p.requiredMagic.length === 0) !== (p.requiredMagicVaries === true))
      bad(`plane ${p.id}`, 'requiredMagic is empty only when it varies');
  }

  // recipes.json
  const recipeById = new Map(d.recipes.map((x) => [x.id, x]));
  for (const x of d.recipes) {
    const w = `recipe ${x.id}`;
    const craft = craftSkillById.get(x.craft);
    if (!craft) bad(w, `"${x.craft}" is not a crafting skill`);
    else if (craft.advanced !== x.advancedCraft) bad(w, 'advancedCraft differs from its craft');
    if (x.uses !== uses[x.level]) bad(w, `uses ${x.uses}, expected ${uses[x.level]}`);
    for (const s of x.grantsSkillUse ?? [])
      if (!skillById.has(s)) bad(w, `grants unknown skill "${s}"`);
  }

  // gems.json
  for (const c of d.gems.cuts) {
    if (c.cutRecipe === undefined) continue;
    const rec = recipeById.get(c.cutRecipe);
    if (!rec || rec.gemCut !== c.id) bad(`gem cut ${c.id}`, `"${c.cutRecipe}" is not its recipe`);
    else if (rec.level !== c.craftLevel) bad(`gem cut ${c.id}`, 'craftLevel differs from recipe');
  }

  // starting-equipment.json
  if (d.startingEquipment.picks !== r.creation.startingEquipmentPicks)
    bad('starting-equipment', 'picks differ from ruleset.creation.startingEquipmentPicks');

  // familiars.json
  for (const s of d.familiars.rules.skillSpecials)
    if (!skillById.has(s.skill)) bad('familiars.rules.skillSpecials', `unknown skill "${s.skill}"`);

  // artifacts.json
  const conditionIds = new Set(d.artifacts.allowedConditions.map((c) => c.id));
  for (const p of d.artifacts.powers)
    if (p.choice === 'element')
      for (const o of p.choiceOptions ?? [])
        if (!schoolIds.has(o)) bad(`artifact power ${p.id}`, `unknown element "${o}"`);
  if (conditionIds.size === 0) bad('artifacts', 'no allowed conditions');

  // awards.json
  const a = d.awards;
  const grants = [
    ...a.attendance.flatMap((x) => x.grants.map((g) => [`attendance ${x.id}`, g] as const)),
    ...a.extras.flatMap((x) => (x.grants ?? []).map((g) => [`extra ${x.id}`, g] as const)),
    ...a.awayRoles.flatMap((x) => x.grants.map((g) => [`away role ${x.id}`, g] as const)),
  ];
  for (const [w, g] of grants)
    if (!ledgerKinds.has(g.kind)) bad(w, `unknown ledger kind "${g.kind}"`);
  for (const x of a.otherMtSources)
    if (!ledgerKinds.has(x.kind)) bad(`mt source ${x.id}`, `unknown ledger kind "${x.kind}"`);
  if (!ledgerKinds.has(a.npcTime.ledgerKind))
    bad('awards.npcTime', `unknown ledger kind "${a.npcTime.ledgerKind}"`);
  const conditions = new Set(a.conditions.map((c) => c.id));
  for (const p of a.mtPurchases)
    if (p.condition !== undefined && !conditions.has(p.condition))
      bad(`purchase ${p.id}`, `condition "${p.condition}" has no text`);
  for (const id of ['player', 'npc-unpaid', 'npc-paid', 'gm-staff'] as const)
    if (!a.attendance.some((x) => x.id === id)) bad('awards.attendance', `missing "${id}"`);
  const player = a.attendance.find((x) => x.id === 'player');
  const playerGets = (c: string) =>
    player?.grants.filter((g) => g.currency === c).reduce((n, g) => n + g.amount, 0);
  if (playerGets('xp') !== r.xp.perEvent) bad('attendance player', 'XP differs from ruleset');
  if (playerGets('cxp') !== r.cxp.perEvent) bad('attendance player', 'CXP differs from ruleset');
  if (playerGets('axp') !== r.axp.perEvent) bad('attendance player', 'AXP differs from ruleset');

  return out;
}
