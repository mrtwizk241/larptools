// The rules wiki: a plain-English guide to the Sylvaris Rulebook and the Callings Supplement.
// Written for players in our own words; page numbers point at the books. Every number comes
// from the Sylvaris rules data, so the wiki and the character sheet always agree.
import {
  NAMED_LEVELS,
  allTechniquesCost,
  costToLevel,
  fullSkillCost,
  humanize,
  levelCost,
  ordinal,
  levelName,
  percent,
  prereqText,
  skillName,
  techniqueCost,
  word,
  type WikiRuleset,
} from './wikiData.ts';

export type WikiGroup = 'start' | 'options' | 'play' | 'reference';

export const GROUPS: { id: WikiGroup; title: string }[] = [
  { id: 'start', title: 'Start here' },
  { id: 'options', title: 'Character options' },
  { id: 'play', title: 'How the game runs' },
  { id: 'reference', title: 'Reference lists' },
];

export type ReferenceListId =
  | 'skills'
  | 'races'
  | 'callings'
  | 'spells'
  | 'rituals'
  | 'recipes'
  | 'performances'
  | 'starting-equipment'
  | 'artifact-powers'
  | 'familiar-tricks';

export interface Article {
  slug: string;
  title: string;
  summary: string;
  group: WikiGroup;
  /** Markdown subset (see Markdown.tsx). Reference pages leave it out and render from data. */
  body?: (rs: WikiRuleset) => string;
  /** Reference pages: which list to show. */
  list?: ReferenceListId;
}

// ---- Small builders shared by several pages -------------------------------------------------

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function currencyAbbr(rs: WikiRuleset, id: string): string {
  return rs.ruleset.currencies.find((c) => c.id === id)?.abbr ?? id.toUpperCase();
}

function grantsText(rs: WikiRuleset, grants: readonly { currency: string; amount: number }[]) {
  const totals = new Map<string, number>();
  for (const g of grants) totals.set(g.currency, (totals.get(g.currency) ?? 0) + g.amount);
  return [...totals]
    .map(([currency, amount]) => `${amount} ${currencyAbbr(rs, currency)}`)
    .join(', ');
}

function costTable(rs: WikiRuleset, unit: string): string {
  const rows = ['| Level | Cost of this level | Total so far | Named level |', '|---|---|---|---|'];
  const named = rs.ruleset.skills.namedLevels;
  for (let n = 1; n <= rs.ruleset.skills.maxLevel; n += 1) {
    const name = NAMED_LEVELS.find((l) => named[l] === n);
    rows.push(
      `| ${n} | ${levelCost(rs, n)} ${unit} | ${costToLevel(rs, n)} ${unit} | ${name ? levelName(name) : ''} |`,
    );
  }
  return rows.join('\n');
}

function techniqueTable(rs: WikiRuleset, unit: string): string {
  const rows = ['| Technique | Needs skill level | Needs first | Cost |', '|---|---|---|---|'];
  for (const t of rs.ruleset.skills.techniques)
    rows.push(
      `| ${levelName(t.id)} | ${t.level} | ${t.requires ? `${levelName(t.requires)} Technique` : 'Nothing'} | ${t.cost} ${unit} |`,
    );
  return rows.join('\n');
}

function usesTable(rs: WikiRuleset, what: string): string {
  const rows = [`| ${what} | Uses it costs |`, '|---|---|'];
  for (const l of NAMED_LEVELS)
    rows.push(`| ${levelName(l)} | ${rs.ruleset.skills.usesPerAbility[l]} |`);
  return rows.join('\n');
}

function mtPurchaseRows(rs: WikiRuleset): string {
  const rows = ['| Buy | Price | Limit |', '|---|---|---|'];
  for (const p of rs.awards.mtPurchases) {
    const price =
      p.mtCost !== undefined
        ? `${p.mtCost} MT`
        : NAMED_LEVELS.flatMap((l) => {
            const v = p.mtByNamedLevel?.[l];
            return v === undefined ? [] : [`${levelName(l)} ${v}`];
          }).join(', ') + ' MT';
    const limits: string[] = [];
    if (p.capPerEvent !== undefined) limits.push(`${p.capPerEvent} per event`);
    if (p.capPerYear !== undefined) limits.push(`${p.capPerYear} per year`);
    if (p.capGroup === 'teaching') limits.push('shared with all teaching');
    if (p.condition) limits.push('see below');
    rows.push(`| ${p.name} | ${price} | ${limits.join(', ') || 'None'} |`);
  }
  return rows.join('\n');
}

function mtPurchase(rs: WikiRuleset, id: string) {
  const p = rs.mtPurchasesById[id];
  if (!p) throw new Error(`Missing Mist Token purchase ${id}`);
  return p;
}

/** The most common stable component cost per item kind and level (exceptions are on recipes). */
function stableCostTable(rs: WikiRuleset): string {
  const kinds: { id: string; name: string }[] = [
    { id: 'consumable', name: 'Consumable (used once)' },
    { id: 'augment', name: 'Augment (used once)' },
    { id: 'permanent', name: 'Permanent item' },
    { id: 'renewing-upgrade', name: 'Renewing Augment upgrade' },
    { id: 'continuous-augment', name: 'Continuous Augment' },
  ];
  const cost = (kind: string, level: string): string => {
    const counts = new Map<string, number>();
    for (const r of rs.recipes) {
      if (r.itemCategory !== kind || r.level !== level) continue;
      const parts = [`${r.stableCost.basic} Basic`];
      if (r.stableCost.exotic > 0) parts.push(`${r.stableCost.exotic} Exotic`);
      const key = parts.join(' + ');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let best = '';
    let most = 0;
    for (const [key, n] of counts)
      if (n > most) {
        best = key;
        most = n;
      }
    return best || 'No recipes';
  };
  const rows = [
    `| Item kind | ${NAMED_LEVELS.map(levelName).join(' | ')} |`,
    `|---|${NAMED_LEVELS.map(() => '---').join('|')}|`,
  ];
  for (const k of kinds)
    rows.push(`| ${k.name} | ${NAMED_LEVELS.map((l) => cost(k.id, l)).join(' | ')} |`);
  return rows.join('\n');
}

function advancedSkillLines(rs: WikiRuleset, category: string): string {
  return rs.skills
    .filter((s) => s.category === category && s.advanced)
    .map((s) => `- **${s.name}:** ${prereqText(rs, s) ?? 'no prerequisites.'}`)
    .join('\n');
}

function plainSkillNames(rs: WikiRuleset, category: string): string {
  return rs.skills
    .filter((s) => s.category === category && !s.advanced)
    .map((s) => s.name)
    .join(', ');
}

// ---- The pages -------------------------------------------------------------------------------

export const ARTICLES: Article[] = [
  {
    slug: 'getting-started',
    title: 'New to Sylvaris?',
    summary: 'What a character is, how a weekend runs, and where to read next.',
    group: 'start',
    body: (rs) => `
Sylvaris is a live action role playing game. You play one character across many weekend events. Your character grows by earning points at events and spending them on skills (Rulebook p.6 to 18).

> This wiki is an unofficial, plain-English guide to the ${rs.ruleset.name} and the Callings Supplement V${rs.ruleset.callingsVersion}. When this guide and the books disagree, the books win: the Rulebook for most rules and the Callings Supplement for Callings. Ask staff when in doubt.

## Your character in one minute
- **Race.** One of ${rs.races.length} races. It gives two innate abilities and two racial skills. See [Races](/wiki/races).
- **Skills.** What your character can do. You buy levels and Techniques with Experience Points (XP). See [Skills, levels, and Techniques](/wiki/skills).
- **Points.** You start with ${rs.ruleset.xp.start} XP and earn ${rs.ruleset.xp.perEvent} XP at each full event. Other points pay for Callings and Artifacts. See [Points and tokens](/wiki/points).
- **Items.** You pick ${rs.ruleset.creation.startingEquipmentPicks} starting items. Everything else you find, buy, or craft in game.

## A weekend at Sylvaris
1. **Check in.** Pay, sign waivers, collect your sheet and items, and pay upkeep. See [Events and check-in](/wiki/events).
2. **Game on.** An event has ${rs.ruleset.events.repopsPerEvent} re-pops. At each re-pop your skill uses come back. See [Play](/wiki/play).
3. **Between events.** You may send one In-Between Game Action (IBGA) and report crafting on the check-out form.

## Where to go next
- New player: [Making a character](/wiki/making-a-character), then [Skills, levels, and Techniques](/wiki/skills).
- Looking something up: the reference lists at the bottom of the [wiki home](/wiki), or the [Glossary](/wiki/glossary).
`,
  },
  {
    slug: 'making-a-character',
    title: 'Making a character',
    summary: 'The creation steps, your starting XP, and the starting limits.',
    group: 'start',
    body: (rs) => {
      const c = rs.ruleset.creation;
      const expertExample = costToLevel(rs, 3) + techniqueCost(rs, 'expert');
      const literacy = c.literacyChoice
        .map((id) => (id === 'race-language' ? "your race's language" : humanize(id)))
        .join(' or ');
      return `
Creating a character takes a few steps (Rulebook p.15 to 18, p.64).

## 1. Concept
Decide who your character is and what role they want in the world. A short note is enough.

## 2. Race
Pick one of the ${rs.races.length} races. Each has makeup or costume rules, two innate abilities, and two racial skills only that race can buy. Some races also ask you to choose something, such as a size or an element. See [Races](/wiki/races) and the [list of races](/wiki/races-list). Makeup and costume are expected by your ${ordinal(c.garbEnforcedByEvent)} event (Rulebook p.9, p.15).

## 3. Skills with ${c.startingXp} XP
You start with ${c.startingXp} XP to spend on skills, racial skills included (Rulebook p.16).
- No skill above level **${c.maxSkillLevel}** at creation. The book advises staying at 3 or below for a first character.
- No Technique above **${levelName(c.maxTechnique)}** at creation.
- These limits count racial skills too.
- Unspent XP stays on your character for later.

Example: one skill to level 3 plus its ${levelName('expert')} Technique costs ${costToLevel(rs, 3)} + ${techniqueCost(rs, 'expert')} = ${expertExample} XP (Rulebook p.17). Costs are explained in [Skills, levels, and Techniques](/wiki/skills).

## 4. Backstory
Write who your character is: personality, important moments, fears, goals, and family. Avoid royalty, chosen ones, and "last of my kind" stories (Rulebook p.17, p.18).

## 5. Starting items
Pick ${c.startingEquipmentPicks} items from the starting list (Rulebook p.18). The app lets you pick the same item more than once. A Basic spell, recipe, or performance note pick needs you to name which one. See the [starting equipment list](/wiki/starting-equipment-list).

## 6. Age, size, and language
- **Age** is a category from ${c.minAgeCategory} to ${c.maxAgeCategory}; each step is a tenth of your race's lifespan. New characters start at ${c.defaultAgeCategory} or older (Rulebook p.64).
- **Size** is set by your race. Beast-Kin and Fae choose a size that fits their type (Rulebook p.64).
- **Language:** you start able to read and write ${literacy} (Rulebook p.64). Elves also choose one more language. Other languages are learned in play.

## 7. Send it in
Your character goes to Logistics (in the app, to staff for approval). Your sheet is ready at check-in.
`;
    },
  },
  {
    slug: 'races',
    title: 'Races',
    summary: 'What a race gives you, and a quick table of all of them.',
    group: 'options',
    body: (rs) => {
      const rows = ['| Race | Size | Lifespan | Language |', '|---|---|---|---|'];
      for (const r of rs.races) {
        const lang = rs.ruleset.languages.find((l) => l.id === r.language)?.name ?? r.language;
        rows.push(
          `| ${r.name} | ${r.size === 'choice' ? 'You choose' : humanize(r.size)} | ${humanize(r.lifespan)} | ${lang} |`,
        );
      }
      return `
Every character belongs to one of the ${rs.races.length} races (Rulebook p.16, p.19 to 62). Full details for each race are in the [list of races](/wiki/races-list).

## What every race has
- **Makeup or costume rules** you wear at every event.
- **An innate passive:** always on, such as extra Armor Points.
- **An innate active:** usable once per encounter, but no more than once every ${rs.ruleset.racialInnateMinMinutesBetweenUses} minutes (Rulebook p.65).
- **Two racial skills.** Only your race can buy them. They cost the same as any other skill and count toward the starting limits (Rulebook p.16, p.17).
- **A lifespan, size, and language** (Rulebook p.64).

## The races at a glance
${rows.join('\n')}

> Changing race later takes a ritual (Race Change). Your old racial skills are removed. See [Magic](/wiki/magic).
`;
    },
  },
  {
    slug: 'points',
    title: 'Points and tokens',
    summary: 'XP, CXP, AXP, and Mist Tokens: how you earn them, spend them, and their caps.',
    group: 'start',
    body: (rs) => {
      const r = rs.ruleset;
      const xp = mtPurchase(rs, 'xp');
      const cxp = mtPurchase(rs, 'cxp');
      const missed = mtPurchase(rs, 'missed-event-xp');
      const alt = mtPurchase(rs, 'alt-character-event-xp');
      return `
Sylvaris uses four kinds of points (Rulebook p.10 to 13). The app keeps a dated log of every point earned or spent.

| Points | Short | Start | Per full event | Spent on |
|---|---|---|---|---|
| Experience Points | XP | ${r.xp.start} | ${r.xp.perEvent} | Skills and Techniques |
| Calling Experience Points | CXP | ${r.cxp.start} | ${r.cxp.perEvent} | Calling skills only |
| Artifact Experience Points | AXP | ${r.axp.start} | ${r.axp.perEvent} | Artifact Power Slots |
| Mist Tokens | MT | 0 | Earned by helping | XP, CXP, components, and more |

## XP
- Every new character starts with ${r.xp.start} XP (Rulebook p.10, p.16).
- Each full event gives ${r.xp.perEvent} XP. It is credited at check-in and shows on your sheet after the event (Rulebook p.10).
- A character can earn at most **${r.xp.earnedCap} XP** in total, the starting ${r.xp.start} included (Rulebook p.10).
- XP buys skill levels and Techniques. See [Skills, levels, and Techniques](/wiki/skills).

## CXP
- CXP starts at ${r.cxp.start} and each event gives ${r.cxp.perEvent} (Rulebook p.11).
- It only buys Calling skills, never ordinary skills (Rulebook p.10, p.87).
- The book caps CXP at one full Calling. The app counts that as **${r.cxp.earnedCap} CXP**: two Calling skills to level ${r.skills.maxLevel} (${costToLevel(rs, r.skills.maxLevel)} each) plus all three Techniques in each (${allTechniquesCost(rs)} each). See [Callings](/wiki/callings).

## AXP
Each event gives ${r.axp.perEvent} AXP (Rulebook p.11). Staff can give more for help beyond the norm. AXP opens Artifact Power Slots. See [Artifacts](/wiki/artifacts).

## Mist Tokens
Mist Tokens (MT) reward helping the game: NPC time, staff work, setup and clean up, donations, and more. Staff record them on the character you name. Full earning rates are on [Events and check-in](/wiki/events#rewards-for-helping) (Rulebook p.12).

### What Mist Tokens buy
${mtPurchaseRows(rs)}

- **XP and CXP** cost ${xp.mtCost} MT per point, up to ${xp.capPerEvent} XP and ${cxp.capPerEvent} CXP per event. You may buy them for earlier events of the current year or season (Rulebook p.12).
- **Teaching** (normal or advanced skill) shares one limit: ${mtPurchase(rs, 'teaching-normal').capPerEvent} per event.
- **Missed Event XP** (${missed.mtCost} MT) buys the event XP for an event your character missed. Your character must have no credit for it, you must have played another event that calendar year, and the event must be in the current year or season (Rulebook p.13).
- **Alternate Character Event XP** (${alt.mtCost} MT) gives a second character the event XP for an event you played, up to ${alt.capPerYear} times a calendar year. Each use needs one event attended that year (Rulebook p.13).
- There is no total spending limit per event in the app; only the limits above apply.
`;
    },
  },
  {
    slug: 'skills',
    title: 'Skills, levels, and Techniques',
    summary: 'Level costs, Techniques, uses, advanced skills, and teaching.',
    group: 'options',
    body: (rs) => {
      const s = rs.ruleset.skills;
      const counts = (['offensive', 'defensive', 'utility', 'magic', 'crafting'] as const)
        .map((c) => `${rs.skills.filter((x) => x.category === c).length} ${c}`)
        .join(', ');
      return `
Skills are what your character can do (Rulebook p.86 to 106). There are ${rs.skills.length} regular skills (${counts}), plus racial and Calling skills. See the [skills list](/wiki/skills-list).

## Levels
Each skill has levels 1 to ${s.maxLevel}, bought in order. Level n costs ${s.costPerLevel} x n XP. Four levels are **named levels**: ${NAMED_LEVELS.map((l) => `${levelName(l)} (${s.namedLevels[l]})`).join(', ')} (Rulebook p.16, p.86).

${costTable(rs, 'XP')}

## Techniques
Each skill has three Techniques, bought separately from levels and in order (Rulebook p.17, p.86, p.87).

${techniqueTable(rs, 'XP')}

A whole skill, level ${s.maxLevel} with all three Techniques, costs ${fullSkillCost(rs)} XP. Racial skills cost the same.

## Uses and named abilities
- Every level you buy is one **use**. Your uses come back at each re-pop. Techniques give no uses (Rulebook p.86).
- Each named level has its own ability. Using it costs uses:

${usesTable(rs, 'Named ability')}

- **A named ability above Basic only works once you own its Technique.** Reaching the level is not enough: a level 8 skill with no Techniques can only use its Basic ability (Rulebook p.88).
- Some abilities are **passive**: always on once you own them, with no uses spent. Most raise Life Points, Armor Points, or passive damage.

## Advanced skills
Advanced skills are marked in the [skills list](/wiki/skills-list). Each needs other skills first, owned at the ${levelName(s.advancedPrereqTechnique)} Technique, before you can learn its Basic level. They cost the same XP as other skills (Rulebook p.94, p.97, p.105, p.115, p.132).

## Teaching and the Log of Learning
- **Level 1** of any skill needs a teacher who has the skill (Rulebook p.87).
- **Levels 2 to ${s.maxLevel}** you teach yourself.
- **Each Technique** needs a teacher who owns that Technique and spends the uses to show you.
- Every teaching goes in the **Log of Learning** at the in-game bar: student, teacher, skill, and level, signed by the teacher. Logistics does not add teachings that are not in the log (Rulebook p.88).
- You can also pay Mist Tokens for teaching. See [Points and tokens](/wiki/points#what-mist-tokens-buy).

> In the app, a skill bought without a named teacher shows as unverified until staff confirm it.
`;
    },
  },
  {
    slug: 'play',
    title: 'Play: uses, life, death, and slots',
    summary: 'Re-pops, Life and Armor Points, passive caps, death, slots, and dual wielding.',
    group: 'play',
    body: (rs) => {
      const r = rs.ruleset;
      const b = r.body;
      const c = r.caps;
      const sl = r.slots;
      const sessions = r.events.sessions
        .map((x) => `| ${x.session} | ${x.begins} | ${x.ends} |`)
        .join('\n');
      const dual = (grant: string) =>
        rs.skills
          .filter((x) => x.grants?.some((g) => g.grant === grant))
          .map((x) => x.name)
          .join(', ');
      const dualTech = (grant: string) =>
        levelName(
          rs.skills.flatMap((x) => x.grants ?? []).find((g) => g.grant === grant)?.at ?? 'expert',
        );
      const quality = Object.entries(sl.augmentSlotsByQuality)
        .map(([q, n]) => `${humanize(q)} ${n}`)
        .join(', ');
      const relic = Object.entries(r.relic.damageByElement)
        .map(([e, call]) => `${humanize(e)}: ${r.relic.baseDamage} ${call}`)
        .join('; ');
      return `
The rules you use every weekend (Rulebook p.65 to 87).

## Re-pops and uses
An event has ${r.events.repopsPerEvent} re-pops. At each one, all your skill uses come back and buffs from spells and potions end (Rulebook p.13).

| Session | Begins | Ends |
|---|---|---|
${sessions}

- Calling skill uses come back only at re-pop, unless an ability says it works on Calling skills (Callings p.3).
- A racial innate active works once per encounter, at most once every ${r.racialInnateMinMinutesBetweenUses} minutes (Rulebook p.65).
- You can have skills renewed by others at most ${c.skillRenewalsPerEncounter} times per encounter (Rulebook p.71, p.72).

## Life and Armor Points
- You have **${b.baseLifePoints} Life Points** to start; skills, spells, and items add more (Rulebook p.68, p.76).
- You have **${b.baseArmorPoints} Armor Points** of your own. Armor you wear, skills, spells, and racial abilities add them, all in one pool (Rulebook p.70, p.76).
- Damage takes Armor Points first, then Life Points.
- Refitting armor takes a ${b.refitCount} count and restores it; help Hastens it. Hasten halves a count but never below ${b.hastenMinCount} (Rulebook p.69, p.70).

## Passive caps
| What | Most you can have |
|---|---|
| Passive damage per attack | ${c.passiveDamage} (${c.passiveDamageFromBehind} from behind) |
| Passive damage while Weakened | ${c.passiveDamageWeakened} |
| Healable Life Points | ${c.healableLifePoints} |
| Temporary Life Points | ${c.temporaryLifePoints} |
| Refittable Armor Points | ${c.refittableArmorPoints} |
| Temporary Armor Points | ${c.temporaryArmorPoints} |

Spending a skill use can go past the damage cap. Temporary points cannot be healed or refit (Rulebook p.76, p.86, p.87).

## Death and Spirit Fragments
1. At **0 Life Points** you are unconscious and wake after ${b.unconsciousMinutes} minutes with 1 Life Point.
2. Below 0 you are **bleeding out**: you die after ${b.bleedOutSeconds} seconds, or at once from a Killing Blow (a ${b.killingBlowCount} count).
3. Once dead, your **death count** runs ${b.deathCountMinutes} minutes. A Raise Dead within it brings you back at ${percent(b.raiseLifeFraction)} of your Life Points with nothing lost.
4. After the death count, a Raise Dead still works but costs ${b.spiritFragmentLossAfterDeathCount} Spirit Fragment. You may also become a spirit and try to return another way (Rulebook p.77, p.78).

You start with **${b.spiritFragmentsStart} Spirit Fragments** and can never have more than ${b.spiritFragmentsMax}. At 0 you can never be raised. Death also empties your Enhancement Slots.

## Enhancement, Attunement, and Boon Slots
- **${sl.enhancement} Enhancement Slots.** Spells, rituals, and performances marked (E) take one. Only the biggest bonus of the same kind counts. They empty at re-pop and death (Rulebook p.78).
- **${sl.attunement} Attunement Slots.** An item with a filled Augment Slot is a magic item: attune it to use it. Attuning takes ${sl.attunementMinutes} minutes; you can only unattune at the end of an event (Rulebook p.79).
- **${sl.greaterBoon} Greater and ${sl.lesserBoon} Lesser Boon Slots,** mostly for Flesh Crafting Mutagens (Rulebook p.79).
- **Augment Slots by item quality:** ${quality} (Rulebook p.71).

## Weapons, Relics, and dual wielding
- Anyone may fight with two short weapons (Rulebook p.65).
- The ${dualTech('dual-wield-long-short')} Technique of ${dual('dual-wield-long-short')} lets you wield a long and a short weapon; the ${dualTech('dual-wield-long-long')} Technique lets you wield two long weapons.
- A **Relic** in one hand throws packets by element: ${relic} (Rulebook p.65, p.66).
- Coins: ${r.coins.copperPerSilver} Copper make 1 Silver, ${r.coins.silverPerGold} Silver make 1 Gold (Rulebook p.71).
`;
    },
  },
  {
    slug: 'magic',
    title: 'Magic',
    summary: 'Magic skills, the Spellbook, what a spell costs to cast, and rituals.',
    group: 'options',
    body: (rs) => {
      const rr = rs.rituals.rules;
      const schools = rs.ruleset.magicSchools
        .map((m) => `${m.name} (${rs.spellsBySchool[m.id]?.length ?? 0} spells)`)
        .join(', ');
      const ritualMinutes = NAMED_LEVELS.map(
        (l) =>
          `| ${levelName(l)} | ${rr.usesByLevel[l]} | ${rr.castMinutesPerNamedLevel * (NAMED_LEVELS.indexOf(l) + 1)} minutes |`,
      ).join('\n');
      const planes = rs.rituals.planarChart
        .map(
          (p) =>
            `| ${p.parent ? `${rs.planesById[p.parent]?.name ?? ''}: ` : ''}${p.name} | ${
              p.requiredMagicVaries
                ? 'Varies'
                : p.requiredMagic.map((id) => skillName(rs, id)).join(', ')
            } |`,
        )
        .join('\n');
      return `
Magic in Sylvaris comes from six base schools: ${schools} (Rulebook p.110 to 128). Each school is a magic skill. See the [spell list](/wiki/spells-list).

## Casting a spell
You need all three (Rulebook p.111):
1. The spell's copy in **your own Spellbook**.
2. The **Technique** for the spell's level in that school. Basic spells only need the skill.
3. Enough unspent **uses** of that school's skill:

${usesTable(rs, 'Spell level')}

There are no spell slots and no limit on Spellbook size. Spells marked (E) take one of the target's Enhancement Slots (Rulebook p.118).

## The Spellbook
- Your Spellbook is yours alone. Each spell needs its own copy (Rulebook p.112).
- A new character may take a Basic spell copy as a starting item.
- More copies come from another caster's Spellbook, Research Notes, or a loose copy, put in by a Relic Crafter. Report new copies on the check-out form; you get the tagged copy at the next event and may use it on trust until then (Rulebook p.88, p.112, p.113).
- A **Scroll** is different: anyone who can read can cast it once, then it is gone (Rulebook p.113).

## Advanced magic
Advanced magic skills have no spell lists. They are leveled skills with their own abilities (Rulebook p.110, p.115 to 117).
${advancedSkillLines(rs, 'magic')}

## Rituals
Rituals are cast with the Ritualism skill (Rulebook p.126). Each needs ${levelName(rr.requiredTechniqueInEachMagic)} or better in every base magic it lists, and ${rr.consumesRitualScript ? 'uses up a Ritual Script' : 'a Ritual Script'}. ${rr.enhancementNote} See the [ritual list](/wiki/rituals-list).

| Ritual level | Ritualism uses | Casting time |
|---|---|---|
${ritualMinutes}

### Planar Chart
Planar rituals need the magics of the place you reach (Rulebook p.128).

| Plane | Needs |
|---|---|
${planes}
`;
    },
  },
  {
    slug: 'crafting',
    title: 'Crafting',
    summary: 'Crafting skills, the Crafting Journal, component costs, and gems.',
    group: 'options',
    body: (rs) => {
      const gemRows = rs.gems.gems
        .map(
          (g) =>
            `| ${g.name} (${g.color.toLowerCase()}) | ${g.valueCopper.square} | ${g.valueCopper.circle} | ${g.valueCopper.triangle} |`,
        )
        .join('\n');
      const cuts = rs.gems.cuts
        .filter((c) => c.craftLevel)
        .map((c) => `${humanize(c.id)} (${levelName(c.craftLevel ?? '')})`)
        .join(', ');
      const basic = mtPurchase(rs, 'basic-component');
      const exotic = mtPurchase(rs, 'exotic-component');
      const gem = mtPurchase(rs, 'uncut-gem');
      return `
Crafters make potions, weapons, armor, augments, and more (Rulebook p.129 to 154). There are ${rs.recipes.length} recipes across ${Object.keys(rs.recipesByCraft).length} crafts. See the [recipe list](/wiki/recipes-list).

## Crafting skills
Base crafts: ${plainSkillNames(rs, 'crafting')}.

Advanced crafts need two base crafts first:

${advancedSkillLines(rs, 'crafting')}

## What you need to craft
- The recipe in **your own Crafting Journal**.
- The **Technique** for the recipe's level, and the uses: ${NAMED_LEVELS.map((l) => `${levelName(l)} ${rs.ruleset.skills.usesPerAbility[l]}`).join(', ')}.
- A crafting space (somewhere safe, like the tavern) and tagged tools for that craft. Each item is a counted action (Rulebook p.129).

## The Crafting Journal
- Each crafter keeps their own Journal. A new character may take a Basic recipe as a starting item (Rulebook p.18, p.129).
- To copy a recipe, a crafter who knows it crafts it into your Journal, spending the same uses. Research Notes also work.
- Report new recipes on the check-out form. You get the tagged copy at the next event and may use it on trust until then (Rulebook p.88, p.129).

## Unstable and stable items
- **Unstable** items cost only skill uses and expire at the end of the event.
- **Stable** items also cost components and last. Components are turned in at the next check-in before tags are handed out (Rulebook p.129, p.130).

Usual stable cost in components (a recipe may say otherwise):

${stableCostTable(rs)}

Mist Tokens buy components: Basic ${basic.mtCost} MT (up to ${basic.capPerEvent} per event), Exotic ${exotic.mtCost} MT (up to ${exotic.capPerEvent}), random uncut gem ${gem.mtCost} MT (up to ${gem.capPerEvent}) (Rulebook p.12).

## Augments
An augment sits in an item's Augment Slot. Craft it straight into an empty slot, or craft it loose and set it later with an Insert or Set recipe. An item with a filled slot must be attuned. Augments that grant an advanced skill only work if you know that skill (Rulebook p.130).

## Gems
Terra Artis cuts gems: ${cuts}. Value in Copper (Rulebook p.144):

| Gem | Square | Circle | Triangle |
|---|---|---|---|
${gemRows}

${rs.gems.notes}
`;
    },
  },
  {
    slug: 'performances',
    title: 'Performances',
    summary: 'How performances work, what they cost, and the Performance Record.',
    group: 'options',
    body: (rs) => {
      const rows = NAMED_LEVELS.map(
        (l) =>
          `| ${levelName(l)} | ${rs.ruleset.skills.usesPerAbility[l]} | ${rs.performances.filter((p) => p.level === l).length} |`,
      ).join('\n');
      return `
Performers use the Performance skill to help everyone who sees or hears them (Rulebook p.101, p.107 to 109). There are ${rs.performances.length} performances. See the [performance list](/wiki/performances-list).

## How they work
- A performance reaches everyone in voice range and only works in a safe place, such as the tavern (Rulebook p.107).
- Performances marked (E) take an Enhancement Slot on each listener.
- Several performances can be chained into one set. Other performers can join to Hasten it or add their own.
- Performing needs the Performance Technique for that level, and costs uses:

| Level | Uses | Performances |
|---|---|---|
${rows}

## The Performance Record
- Each performer keeps their own Performance Record of notes. A new character may take a Basic note as a starting item (Rulebook p.18, p.108).
- To learn a note, someone who knows it performs it for you, spending the uses. Research Notes also work.
- Report new notes on the check-out form; you get the tagged note at the next event (Rulebook p.88, p.108).
`;
    },
  },
  {
    slug: 'callings',
    title: 'Callings',
    summary: 'Who can start a Calling, what it costs in CXP, Techniques, and changing.',
    group: 'options',
    body: (rs) => {
      const c = rs.ruleset.calling;
      return `
A Calling is a special path with its own innate ability and two Calling skills (Callings Supplement). There are ${rs.callings.length} Callings. See the [list of Callings](/wiki/callings-list).

> For Callings the Callings Supplement is the authority, not the Rulebook.

## Starting a Calling
You can start a Calling when all of these are true (Callings p.2):
- Your character has played at least **${c.minFullEvents} full events**.
- You have **${c.startCostCxp} CXP** to buy level ${c.startLevelInBothSkills} in both Calling skills at once.
- You have the Calling's book (from the Atheneum) or a teacher of that Calling in game.

You may follow only ${word(c.maxActive)} Calling at a time (Rulebook p.87).

## CXP costs
Calling skills are paid in CXP, never XP. The books do not give a full table, so the app uses the normal skill costs in CXP: level n costs ${rs.ruleset.skills.costPerLevel} x n, Techniques ${rs.ruleset.skills.techniques.map((t) => t.cost).join(', ')}. One Calling skill in full costs ${fullSkillCost(rs)} CXP, so a full Calling is ${rs.ruleset.cxp.earnedCap} CXP, which is also the CXP cap.

${costTable(rs, 'CXP')}

Once started, you buy levels through Logistics whenever you like; no teacher is needed for levels (Callings p.2, p.3).

## Calling Techniques
To learn a Calling Technique, study the Calling's book or have a teacher show you, and (Callings p.2, p.3):
- ${c.noTechniqueAtStartEvent ? 'not at the same event you started the Calling;' : ''}
- at most ${word(c.techniquesPerEvent)} Calling Technique per event;
- afterwards your two Calling skills may be at most ${word(c.maxTechniqueGap)} Technique apart;
- in order: ${levelName('expert')}, then ${levelName('master')}, then ${levelName('grandmaster')}.

## How Calling skills differ
- Only characters on that Calling can use them.
- Their uses return only at re-pop, unless an ability says it works on Calling skills.
- They cannot be granted, stored in items, or boosted by Familiars, Artifacts, or Boons unless the ability says so (Callings p.3).

## Changing Calling
Tell GM staff and Logistics by email that you are leaving your Calling. Its skills are locked from then on, and their CXP is not refunded unless you unlearn them in game (for example with the Unlearn ritual). You can start a new Calling from the next event (Callings p.3).
`;
    },
  },
  {
    slug: 'artifacts',
    title: 'Artifacts',
    summary: 'Awakening an Artifact, AXP slots, power tiers, and the rules for changing them.',
    group: 'options',
    body: (rs) => {
      const a = rs.ruleset.artifact;
      const ar = rs.artifacts.rules;
      const tiers = [1, 2, 3, 4, 5]
        .map((t) => `| ${t} | ${t} | ${rs.artifacts.powers.filter((p) => p.tier === t).length} |`)
        .join('\n');
      const allSlots = a.awakenCostAxp + (a.maxSlots - 1) * a.slotCostAxp;
      return `
An Artifact is one item that grows powers as you spend AXP on it (Rulebook p.79 to 82). See the [Artifact powers list](/wiki/artifact-powers-list).

## Awakening
- A character may have **${word(a.maxPerPc)}** Artifact. Almost any item works; GMs may say no.
- You can awaken it once your character has earned **${a.minXpEarned} XP**.
- Awakening costs **${a.awakenCostAxp} AXP** and opens the first Artifact Power Slot. Each further slot costs ${a.slotCostAxp} AXP, up to ${a.maxSlots} slots (${allSlots} AXP for all).

## Powers and tiers
A power fills as many slots as its tier. Putting a power in a slot costs ${ar.powerSlotCostAxp} AXP. Only ${word(ar.maxPowersTier4Plus)} power of Tier 4 or higher at a time.

| Tier | Slots it fills | Powers in the list |
|---|---|---|
${tiers}

Some powers ask you to name something when you set them: a skill, element, language, or condition. Immunity powers only work against the [allowed conditions](/wiki/artifact-powers-list) (Rulebook p.82).

## Changing an Artifact
- Fill empty slots only between events, telling Logistics at least ${ar.fillNoticeDaysBeforeEvent} days before the next event.
- Remove powers ${word(ar.removePowersPerYear)} time a year; their slots become empty.
- Change the item's shape ${word(ar.reshapePerYear)} time a year${ar.reshapeNeedsGmApproval ? ', with GM approval' : ''}; it keeps its powers.
- Players may suggest new powers. Approved ones join the list for everyone.
`;
    },
  },
  {
    slug: 'familiars',
    title: 'Familiars and familiarized places',
    summary: 'Gaining a Familiar, Trick Slots, tricks, and the places you can travel to.',
    group: 'options',
    body: (rs) => {
      const f = rs.familiars.rules;
      const fz = rs.ruleset.familiarization;
      const slots = Object.entries(f.trickSlotsByQuality)
        .map(([q, n]) => `| ${humanize(q)} | ${n} |`)
        .join('\n');
      const bySlots = f.skillTricks.levelBySlots
        .map(
          (x) =>
            `${x.slots} ${x.slots === 1 ? 'slot gives' : 'slots give'} the ${levelName(x.level)} level${
              x.needsTechnique ? ` and its Technique` : ''
            }`,
        )
        .join('; ');
      return `
## Familiars
A Familiar is a small animal companion (Rulebook p.84, p.85). See the [list of familiar tricks](/wiki/familiar-tricks-list).
- A character may have **${word(f.maxPerPc)}** Familiar. It comes from an adventure, a Flesh Crafting elixir, or a ritual.${f.unstableLeavesAtEventEnd ? ' One from an unstable elixir leaves at the end of the event.' : ''}
- It needs an approved phys rep, usually a plush. ${f.hasLifeOrArmor ? '' : 'It has no Life or Armor Points.'}

### Trick Slots
A Familiar's quality sets its Trick Slots, up to ${f.maxTrickSlots}:

| Quality | Trick Slots |
|---|---|
${slots}

- A slot can hold a skill: ${f.skillTricks.allowedNote.charAt(0).toLowerCase()}${f.skillTricks.allowedNote.slice(1)}
- ${sentence(bySlots)}. At most ${f.skillTricks.maxSlotsPerSkill} slots per skill.
- ${f.skillTricks.usesPerRepopEqualsSlots ? 'Its uses per re-pop equal the slots given to that skill.' : ''} ${f.skillTricks.constantPassivesGranted ? '' : 'Always-on passives give nothing.'}
${f.skillSpecials.map((s) => `- **${skillName(rs, s.skill)}:** ${s.summary}`).join('\n')}
- Special tricks also take a slot each.
- ${f.retrainingNote}

## Familiarized places
Some travel abilities take you to places you know (Rulebook p.85).
- Everyone has one fixed place: ${fz.fixedLocation}. It cannot be changed.
- Skills such as Air Magic add more places, up to ${fz.maxLocations} in total${fz.fixedLocationCountsTowardMax ? ', the fixed place included' : ''}.
- To familiarize a place, spend ${fz.minutesToFamiliarize} minutes relaxing there. Keep a list of places and dates.
- GM events can erase a familiarization.
`;
    },
  },
  {
    slug: 'events',
    title: 'Events and check-in',
    summary: 'Check-in steps, upkeep, IBGAs, and rewards for NPCs and staff.',
    group: 'play',
    body: (rs) => {
      const e = rs.ruleset.events;
      const u = rs.ruleset.upkeep;
      const aw = rs.awards;
      const npc = aw.npcTime;
      const attendance = aw.attendance
        .map(
          (b) =>
            `| ${b.name} | ${grantsText(rs, b.grants)}${b.npcTimeMax ? ', plus NPC time at its most' : ''}${b.silver ? `, ${b.silver} Silver` : ''} |`,
        )
        .join('\n');
      const extras = aw.extras
        .map(
          (x) =>
            `| ${x.name} | ${x.npcHours ? `Counts as ${x.npcHours} hours of NPC time` : grantsText(rs, x.grants ?? [])} |`,
        )
        .join('\n');
      const away = aw.awayRoles
        .map(
          (x) =>
            `| ${x.name} | ${grantsText(rs, x.grants)} ${x.per === 'month' ? 'per month' : 'per month that has an event'} |`,
        )
        .join('\n');
      const other = aw.otherMtSources
        .map((x) => {
          const amount =
            x.mtPerUnit !== undefined ? `${x.mtPerUnit} MT` : `${x.mtMin} to ${x.mtMax} MT`;
          const per = {
            plot: 'per accepted plot',
            dollar: 'per dollar',
            hour: 'per hour',
            grade: 'per grade',
          }[x.per];
          return `| ${x.name} | ${amount} ${per} |`;
        })
        .join('\n');
      const paid = aw.attendance.find((b) => b.paidChoice)?.paidChoice;
      return `
How a weekend works around the game itself (Rulebook p.7 to 13).

## Check-in
${e.checkInSteps.map((s, i) => `${i + 1}. ${sentence(s)}.`).join('\n')}

Event XP is credited at check-in (Rulebook p.7, p.10).

## Upkeep
Upkeep is **${u.silverPerEvent} Silver** per event, paid at check-in.${u.firstEventFree ? " Your character's first event is free." : ''} Some skills and abilities cover it (Rulebook p.7):
${u.modifiers.map((m) => `- ${m.summary} (${m.source}).`).join('\n')}

## Between events: IBGA
You may send ${word(e.ibgaPerGap)} In-Between Game Action (IBGA) per character between events, emailed to the GM team at least ${e.ibgaDeadlineDaysBefore} days before the next event. Skills and items used in it count as spent from your next re-pop. Anything you spend is turned in at the next check-in (Rulebook p.13).

## Check-out
Stable crafted items and new recipes, spell copies, and performance notes go on the online check-out form, due by ${e.checkoutFormDue} (Rulebook p.8).

## Rewards for helping
### At the event
| Role | Reward |
|---|---|
${attendance}
${extras}

- **NPC time:** ${npc.xpPerHour} XP and ${npc.cxpPerHour} CXP per hour, up to ${npc.maxHours} hours. After that, ${npc.mtPerHourAfterMax} MT per hour, up to ${npc.mtCap} MT (Rulebook p.12).
${paid ? `- **Paid NPCs** choose either uses of their crafting, check-in, or research skills, or 1 Silver per ${paid.silverPerXp} XP the character has.` : ''}

### Away from the event
| Role | Reward |
|---|---|
${away}

### Other Mist Tokens
| Source | Reward |
|---|---|
${other}

Spending Mist Tokens is covered in [Points and tokens](/wiki/points#mist-tokens).
`;
    },
  },
  {
    slug: 'retirement',
    title: 'Retirement',
    summary: 'Retiring a character and what carries over to the next one.',
    group: 'play',
    body: (rs) => {
      const r = rs.ruleset.retirement;
      return `
You can keep your character and start a second one under the normal rules, or **retire** a character to pass some of its progress on (Rulebook p.63). A retired character can no longer be played.

## What carries over
| What | Amount |
|---|---|
| XP | ${percent(r.xp.fraction)} of earned XP after taking off ${r.xp.deduct ?? 0} |
| CXP | ${percent(r.cxp.fraction)} of earned CXP |
| AXP | ${percent(r.axp.fraction)} of earned AXP |
| Coin and items | ${percent(r.goods.fraction)} of the market value of everything owned, minus ${r.goods.deductCopper} Copper |

- Every amount is rounded ${r.rounding}. The item value never goes below ${r.goods.min}.
- All items are turned in. The new character gets new starting items.
- The share replaces the usual ${rs.ruleset.xp.start} starting XP. The app warns you when it is below ${r.warnBelowXp}.

Example: a character who earned 1000 XP passes on (1000 - ${r.xp.deduct ?? 0}) x ${percent(r.xp.fraction)} = ${Math.floor((1000 - (r.xp.deduct ?? 0)) * r.xp.fraction)} XP.

## Building from a retirement
- The points go to one character of the same player: a new one or one you already play. Once given, they stay with that character.
- ${r.creationLimitsWaived ? 'The starting limits do not apply: you may spend all inherited XP and start at any skill level.' : ''}
- Teaching for ${r.coinPaidTechniques.map(levelName).join(' and ')} Techniques must be paid in coin, out of the item share.
`;
    },
  },
  {
    slug: 'glossary',
    title: 'Glossary',
    summary: 'Short meanings for the words the rules and this app use.',
    group: 'start',
    body: (rs) => `
- **Advanced skill:** a skill that needs other skills at the ${levelName(rs.ruleset.skills.advancedPrereqTechnique)} Technique first. See [Skills](/wiki/skills#advanced-skills).
- **Artifact:** your one item that gains powers with AXP. See [Artifacts](/wiki/artifacts).
- **Attunement Slot:** lets you use one magic item. You have ${rs.ruleset.slots.attunement}.
- **AXP:** Artifact Experience Points.
- **Boon Slot:** holds a Mutagen or similar boon; Greater and Lesser.
- **Calling:** a special path paid with CXP. See [Callings](/wiki/callings).
- **Check-out form:** the online form after an event where you report crafting and new copies.
- **Component:** Basic or Exotic crafting material for stable items.
- **CXP:** Calling Experience Points.
- **Enhancement Slot:** holds one (E) effect. You have ${rs.ruleset.slots.enhancement}.
- **Encounter:** a fight or scene. Ends when GMs say so or after a quiet spell (Rulebook p.65).
- **Familiar:** a small companion with Trick Slots. See [Familiars](/wiki/familiars).
- **Hasten:** halves a count, never below ${rs.ruleset.body.hastenMinCount}.
- **IBGA:** In-Between Game Action. See [Events](/wiki/events#between-events-ibga).
- **Log of Learning:** the signed book at the bar where teachings are recorded.
- **Mist Tokens (MT):** rewards for helping the game. See [Points and tokens](/wiki/points#mist-tokens).
- **Named level:** ${NAMED_LEVELS.map((l) => `${levelName(l)} (${rs.ruleset.skills.namedLevels[l]})`).join(', ')}.
- **Passive:** always on, no uses spent.
- **Re-pop:** the moment uses come back; ${rs.ruleset.events.repopsPerEvent} per event.
- **Spirit Fragment:** your hold on life; at 0 you cannot be raised.
- **Stable / unstable:** stable items last; unstable ones expire at the end of the event.
- **Technique:** a separate purchase that unlocks a named ability. See [Skills](/wiki/skills#techniques).
- **Use:** one charge of a skill. Each level gives one.
- **XP:** Experience Points, spent on skills.
`,
  },
  {
    slug: 'skills-list',
    title: 'All skills',
    summary: 'Every regular skill by category, with prerequisites and each named ability.',
    group: 'reference',
    list: 'skills',
  },
  {
    slug: 'races-list',
    title: 'All races',
    summary: 'Each race: makeup, innate abilities, choices, and its two racial skills.',
    group: 'reference',
    list: 'races',
  },
  {
    slug: 'callings-list',
    title: 'All Callings',
    summary: 'Each Calling: innate, detriment, choices, and its two Calling skills.',
    group: 'reference',
    list: 'callings',
  },
  {
    slug: 'spells-list',
    title: 'All spells',
    summary: 'Every spell by school and level.',
    group: 'reference',
    list: 'spells',
  },
  {
    slug: 'rituals-list',
    title: 'All rituals',
    summary: 'Every ritual with its level, casting time, and the magic it needs.',
    group: 'reference',
    list: 'rituals',
  },
  {
    slug: 'recipes-list',
    title: 'All recipes',
    summary: 'Every recipe by craft and level, with its stable cost.',
    group: 'reference',
    list: 'recipes',
  },
  {
    slug: 'performances-list',
    title: 'All performances',
    summary: 'Every performance by level.',
    group: 'reference',
    list: 'performances',
  },
  {
    slug: 'starting-equipment-list',
    title: 'Starting equipment',
    summary: 'The items a new character picks from.',
    group: 'reference',
    list: 'starting-equipment',
  },
  {
    slug: 'artifact-powers-list',
    title: 'Artifact powers',
    summary: 'Every Artifact power by tier, and the conditions immunity powers allow.',
    group: 'reference',
    list: 'artifact-powers',
  },
  {
    slug: 'familiar-tricks-list',
    title: 'Familiar tricks',
    summary: 'The special tricks a Familiar can learn.',
    group: 'reference',
    list: 'familiar-tricks',
  },
];

export const ARTICLES_BY_SLUG = new Map(ARTICLES.map((a) => [a.slug, a]));
