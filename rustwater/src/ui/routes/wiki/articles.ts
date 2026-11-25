// The rules wiki: a plain-English guide to the Rustwater 2026 rulebook (2.0) and the Professions
// Document. Written for players; page numbers point at the rulebook. Numbers that live in the
// rules data come from the ruleset, so the wiki and the sheet always agree.
import type { Ruleset } from '../../../data/index.ts';

export type WikiGroup = 'start' | 'play' | 'options' | 'reference';

export const GROUPS: { id: WikiGroup; title: string }[] = [
  { id: 'start', title: 'Start Here' },
  { id: 'play', title: 'How the Game Runs' },
  { id: 'options', title: 'Character Options' },
  { id: 'reference', title: 'Reference Lists' },
];

export interface Article {
  slug: string;
  title: string;
  summary: string;
  group: WikiGroup;
  /** Markdown subset (see Markdown.tsx). Reference pages leave it out and render from data. */
  body?: (ruleset: Ruleset) => string;
  /** Reference pages: which list to show. */
  list?:
    | 'skills'
    | 'ancestries'
    | 'professions'
    | 'spells'
    | 'recipes'
    | 'performances'
    | 'familiar'
    | 'effects';
}

const T = (n: number) => (n * (n + 1)) / 2;

function costRows(ruleset: Ruleset): string {
  const c = ruleset.ruleset.archetypeSkill.costs;
  const row = (name: string, per: number, max: number | null, flat = false) =>
    `| ${name} | ${flat ? `${per} AP each` : `${per} AP x level`} | ${
      max === null ? 'No limit' : max
    } | ${flat ? (max === 1 ? `${per} AP` : '1 AP per slot') : `${per * T(5)} AP`} |`;
  return [
    '| Skill type | Cost of each level | Highest level | Cost to reach the top |',
    '|---|---|---|---|',
    `| Basic | ${ruleset.ruleset.basicSkill.costPerLevel} CXP x level | ${ruleset.ruleset.basicSkill.maxLevel} | ${
      ruleset.ruleset.basicSkill.costPerLevel * T(ruleset.ruleset.basicSkill.maxLevel)
    } CXP |`,
    row('Adept', c.adept.costPerLevel, c.adept.maxLevel ?? null),
    row('Advanced', c.advanced.costPerLevel, c.advanced.maxLevel ?? null),
    row('Per encounter', c.encounter.costPerLevel, c.encounter.maxLevel ?? null),
    row('Passive', c.passive.costPerLevel, c.passive.maxLevel ?? null),
    row('Mastery', c.mastery.costPerLevel, 1, true),
    row('Memorization', c.memorization.costPerLevel, null, true),
  ].join('\n');
}

function shinyRows(ruleset: Ruleset): string {
  const lines = ['| Buy | Price in Shinies | Limit |', '|---|---|---|'];
  for (const p of ruleset.awards.shinyPurchases) {
    const limit =
      p.capPerEvent !== undefined
        ? `${p.capPerEvent} per event`
        : p.capPerCalendarYear !== undefined
          ? `${p.capPerCalendarYear} per calendar year`
          : 'See below';
    lines.push(`| ${p.name} | ${p.price} | ${limit} |`);
  }
  return lines.join('\n');
}

export const ARTICLES: Article[] = [
  {
    slug: 'getting-started',
    title: 'New to Rustwater?',
    summary: 'What a character sheet holds, how events work, and where to start.',
    group: 'start',
    body: (rs) => `
Rustwater is a live action role playing game set in a ruined world where the Risen Virus brings the dead back. You play one character across many weekend events. Your character grows by earning points at events and spending them on skills.

> This wiki is an unofficial, plain-English guide to the ${rs.ruleset.name} rulebook (version ${rs.ruleset.rulebookVersion}) and the Professions Document. When this guide and the rulebook disagree, the rulebook wins. Ask staff when in doubt.

## Your character in one minute
- **Ancestry.** What your character is (Human, Elf, Fae and more). It sets a few special abilities and your starting infection. See [Ancestries](/wiki/ancestries).
- **Skills.** What your character can do in a fight or between fights. You buy skills with points. See [Skills and archetypes](/wiki/skills).
- **Points.** You start with ${rs.ruleset.startingCxp} Character Experience (CXP) and earn ${rs.ruleset.eventCxp} more at each event. See [Points and currencies](/wiki/points).
- **Items.** You pick 10 starting items. Everything else you find, buy, or craft in game.

## A weekend at Rustwater
1. **Check in.** Pay for the event, sign waivers, collect your sheet, items staff owe you, and anything you bought with Shinies. Pay upkeep. See [Events, check-in and rewards](/wiki/events).
2. **Game on.** Friday evening the game starts. Your skills are ready to use.
3. **Re-pops.** Saturday at 6am and 5pm everyone's skills come back and buffs end. See [Fighting, dying and the virus](/wiki/combat).
4. **Check out.** At the end you hand back your sheet and help clean up.

## Using this app
- Make an account with your name and email, then build a character with the same rules staff use. Staff approve it before it goes live.
- When you learn a skill in game, tap the + next to it on your Skills list and say who taught you. Staff approve it and it lands on your sheet with its cost.
- The Play screen counts your skill uses during an event and works without signal.
See [Using this app](/wiki/using-the-app).
`,
  },
  {
    slug: 'making-a-character',
    title: 'Making a Character',
    summary: 'The six steps of character creation, with the numbers you need.',
    group: 'start',
    body: (rs) => `
Character creation is the same in the app and on paper (Rulebook p.15-18). In the app, choose **Create a new character** on your character list. When you finish, the character goes to staff for approval.

## 1. Names
Give your character a name. Your player name and email come from your account.

## 2. Ancestry and subtype
Pick one ancestry and one of its subtypes. Each ancestry has a passive ability, a shared ability, and each subtype adds one more ability. See the [list of ancestries](/wiki/ancestries-list).
- Your ancestry sets your **base infection** (how close the Risen Virus is to taking you).
- You may take up to ${rs.ruleset.extraInfection.maxLevels} extra infection levels for ${rs.ruleset.extraInfection.cxpPerLevel} extra CXP each. Aware cannot.
- Some ancestries have costume requirements, due by your third event.

## 3. Ancestry levels (LXP)
You start with ${rs.ruleset.lxp.atCreation} Ancestry Experience (LXP). Both active ancestry abilities start at level 1; your starting LXP raises one of them to level 2. Each level is one more use. Passives do not level.

## 4. Starting skills
You have ${rs.ruleset.startingCxp} CXP (plus any extra-infection CXP) to spend on **basic** skills. No teacher is needed at creation.
- Level n of a basic skill costs ${rs.ruleset.basicSkill.costPerLevel} x n CXP: level 1 is 10, level 2 is 20 more (30 in total), level 3 is 30 more (60 in total).
- Each basic level also earns Archetype Points (AP) in that skill's archetype: level 1 earns 1 AP, level 2 earns 2 more, and so on.
- Spend that AP on archetype skills of the same archetype: adept and advanced upgrades, per-encounter skills, passives, and memorized spells or recipes.
- You do not have to spend every CXP; what you keep carries forward.

## 5. Starting equipment
Choose 10 items from the starting list (Rulebook p.18): basic weapons, armor, shields, resources, a blueprint or memorized spell or recipe, a consumable, Bits, or a memorized performance. You may pick the same option more than once. Memorizing still needs the slot or AP.

## 6. Review and send
Check the summary. In the app, **Send to staff** sends it for approval. Staff may approve it or send it back with a note; you can change it and send it again.

> Coming back with a retired character? Tell staff. They add your carried-over CXP, FP, and Shinies when they approve. See [Retirement](/wiki/points#retirement).
`,
  },
  {
    slug: 'points',
    title: 'Points and Currencies',
    summary: 'CXP, AP, LXP, PXP, FP, and Shinies: how each is earned and spent.',
    group: 'start',
    body: (rs) => `
Rustwater uses six kinds of points (Rulebook p.11-19). The app keeps a dated log of every point you earn or spend.

| Points | Short | Earned by | Spent on |
|---|---|---|---|
| Character Experience | CXP | Starting ${rs.ruleset.startingCxp}, ${rs.ruleset.eventCxp} per event, NPC time, Shinies | Basic skills |
| Archetype Points | AP | Buying basic skill levels | Archetype skills of the same archetype |
| Ancestry Experience | LXP | 1 at creation, 1 more per ${rs.ruleset.lxp.perCxp} CXP | Ancestry ability levels |
| Profession Experience | PXP | Volunteering, staff and NPC work, Shinies | Profession skills |
| Familiar Points | FP | 1 per event attended | Bonding, awakening, and leveling a familiar |
| Shinies | | Helping the game, donations, good grades | CXP, PXP, resources, Bits, upkeep |

## CXP
- Every new character starts with ${rs.ruleset.startingCxp} CXP.
- Each event you attend gives ${rs.ruleset.eventCxp} CXP ("Event CXP").
- NPC time, staffing, and buying CXP with Shinies add more. See [Events, check-in and rewards](/wiki/events).
- The rulebook says you cannot earn more than ${rs.ruleset.earnedCxpCap.amount} XP. The app reads this as ${rs.ruleset.earnedCxpCap.amount} CXP earned after creation; staff have the final say.

## AP
Buying level n of a basic skill earns n AP in that skill's archetype, so a basic skill at level 10 has earned 55 AP. AP stays in its archetype: Warrior AP only buys Warrior skills. Magic and Crafting each have their own pool.

## Skill cost chart
${costRows(rs)}

Example: two levels of an adept upgrade cost 3 + 6 = 9 AP (Rulebook p.48).

## LXP
You have 1 LXP at creation and earn another each time your total CXP passes a multiple of ${rs.ruleset.lxp.perCxp}. A new character's second LXP usually comes around the fourth event. Each LXP raises one of your two active ancestry abilities by a level, which is one more use.

## PXP
PXP only buys profession skills. You never earn PXP just for attending. Level n of a profession skill costs 10 x n PXP. See [Professions](/wiki/professions).

## Shinies
Shinies reward helping the game. What they buy:

${shinyRows(rs)}

Missed Event CXP: buy the ${rs.ruleset.eventCxp} Event CXP for an event your character missed, if you attended at least one other event that calendar year. Alternate character: buy Event CXP for a second character, up to 3 times a calendar year.

## Retirement
When a character retires (planned) or is lost (for example rising as a Risen at infection 10), the player starts a new character with a head start (Rulebook p.17-18):
- **CXP:** take the CXP spent on the old character, subtract ${rs.ruleset.startingCxp}, divide by 3 (round down), then add any unspent CXP. The new character starts with ${rs.ruleset.startingCxp} plus that.
- **FP:** FP spent divided by 3 (round down), plus unspent FP.
- **Shinies:** all of them move to the new character.
- Skills, items, AP, LXP, and PXP do not carry over.
`,
  },
  {
    slug: 'skills',
    title: 'Skills and Archetypes',
    summary: 'Skill types, uses, teachers, masteries, and how upgrades work.',
    group: 'options',
    body: (rs) => `
Skills are what your character can do (Rulebook p.46-63). Each skill belongs to an archetype: **Warrior**, **Defender**, **Rogue**, **Utility**, **Magic**, or **Crafting**. A few skills can be bought in more than one archetype; see [Multi-archetype skills](/wiki/multi-archetype).

## Skill types
- **Basic skills** cost CXP, levels 1 to 10. The level is usually how many times you can use the skill each re-pop.
- **Adept and Advanced** upgrades cost AP, levels 1 to 5. Using one spends one use of the upgrade and one basic use of the same skill, and makes that use stronger.
- **Per encounter skills** cost AP, levels 1 to 5. Each level is one use per encounter.
- **Passive skills** cost AP, levels 1 to 5. Always on, usually stronger with each level.
- **Mastery** costs 10 AP, one level, and needs level 9 in that skill's basic part.
- **Memorization** costs 1 AP per slot, with no limit: each slot holds one spell, recipe, or performance.
- **Profession skills** are bought with PXP and only work for that profession. See [Professions](/wiki/professions).

## Skill cost chart
${costRows(rs)}

## Learning a skill
- Outside character creation you need a **teacher** for the first level of any new skill. The teacher roleplays the lesson for 2 to 5 minutes.
- After that first level you may raise the skill to its top level without a teacher.
- Both student and teacher record the lesson in the Learning Log. In this app: tap **+** next to the skill on your Skills list, name your teacher, and send it. Staff approve it and the app records the cost.

## Uses and when they come back
- **Per re-pop:** back at game-on and at each re-pop (Saturday 6am and 5pm).
- **Per encounter:** back at the start of each encounter. Outside an encounter, one use per 60 minutes.
- **Per event:** back at the next event.
- **Check-in:** claimed at check-in, for example resources.
- A specific skill can be restored at most 5 times in one encounter. Profession skills cannot be restored unless the restoring effect says so.

## Marks
- **(R) Resistance:** you resist the effect after it hits. Not usable against unresistable effects.
- **(Av) Avoidance:** you get out of the way or knock the effect away. Not usable against unavoidable effects.

## Skills that change your numbers
Some skills raise a number on your sheet. For example Toughness adds 10 health per level, Weapon Damage adds 1 damage per level, and Armor adds 5 armor per level, each with an extra bonus at level 5. The app adds these up for you on the Overview.

See the [full skills list](/wiki/skills-list) with every part and its rule text.
`,
  },
  {
    slug: 'events',
    title: 'Events, Check-In and Rewards',
    summary: 'Check-in, upkeep, Event CXP, NPC time, staff rewards, and Shinies.',
    group: 'play',
    body: (rs) => {
      const npc = rs.awards.npcTime;
      return `
## Check-in
At check-in you (Rulebook p.8):
- Pay for the event and sign waivers.
- Collect your character sheet, item tags staff owe you, Shiny purchases, and items your skills give at check-in.
- Pay upkeep, and hand in resources for production skills and anything spent between games.

Staff record your attendance, which gives your Event CXP and counts toward things like starting a profession.

## Upkeep
Surviving between events costs upkeep: **2 basic resources or 10 Bits**, paid at check-in. Your character's first event is free, Aware never pay, and 40 Shinies cover it. Staff may change it for in-game reasons.

## What you earn
| How you attended | You get |
|---|---|
| Player | ${rs.ruleset.eventCxp} Event CXP and 1 FP |
| Full event NPC (unpaid) | Event CXP, full NPC time (5 CXP, 5 PXP, 500 Shinies), 3 common, 2 uncommon and 1 rare resource, 1 FP |
| Full event NPC (paid) | As unpaid NPC, plus a full event of crafting skill uses (or 1 more rare resource) |
| Full event GM staff | Event CXP, 10 CXP, 10 PXP, 500 Shinies, 3 common, 2 uncommon and 1 rare resource, 1 FP |

## NPC time
For each hour you NPC you earn ${npc.cxpPerHour} CXP, ${npc.pxpPerHour} PXP, and ${npc.shiniesPerHour} Shinies, for up to ${npc.maxHours} hours. Hours past ${npc.maxHours} earn ${npc.shiniesPerHourAfterMax} Shinies each. NPC Shinies stop at ${npc.shiniesCap} per event. Signing up for a ${npc.preSignedShift.shiftHours} hour shift before the event counts as ${npc.preSignedShift.creditedHours} hours.

## Helping at the event
| Job | Shinies |
|---|---|
${rs.awards.extras.map((e) => `| ${e.name} | ${e.grants.map((g) => g.amount).join(' + ')} |`).join('\n')}

## Between games
| Role | Each month |
|---|---|
${rs.awards.betweenGamesRoles
  .map(
    (r) =>
      `| ${r.name} | ${r.grants.map((g) => `${g.amount} ${g.currency === 'pxp' ? 'PXP' : 'Shinies'}`).join(' and ')} |`,
  )
  .join('\n')}

Other Shinies: 50 per plot you write and run (up to 200 per plot), 10 per $1 of requested donations (up to 500 per donation unless pre-approved, receipt needed), 1 per packet donated, 50 per hour of GM-approved volunteer work, and 100 for each A or 50 for each B on a report card from the last year.

## What Shinies buy
${shinyRows(rs)}
`;
    },
  },
  {
    slug: 'combat',
    title: 'Fighting, Dying and the Virus',
    summary: 'Re-pops, encounters, going down, death, infection, trauma, and aging.',
    group: 'play',
    body: () => `
## Re-pops
A re-pop restores all skills and ends all buffs on characters. Each event has two: **Saturday 6am** and **Saturday 5pm**. Per-event skills do not come back at a re-pop (Rulebook p.33).

## Encounters
A combat encounter ends after 5 minutes with no damage calls, or when a Narrator or GM says so. A non-combat encounter (a conversation, a puzzle, a crafting session) ends when it is over. Outside an encounter, a per-encounter skill can be used once every 60 minutes.

## Health, going down, and death
1. At **0 Health** you are **Downed**. After 5 minutes you heal to 1 Health.
2. Damage below 0 puts you at **-1 Health, bleeding out**. You have 60 seconds for someone to stabilise or heal you. Health never goes below -1.
3. If nobody does, you are **Dead**. Buffs, re-pop and encounter effects, and status effects end (delimbs and aging stay).
4. After a 5 minute count you rise at full Health and gain **1 infection level**. A Raise Dead before the count ends prevents the infection.
Dying does not give back your skill uses.

## Infection
Infection measures how far the Risen Virus has taken you. Your ancestry sets your starting level. Each death without a Raise Dead adds 1. At **10** your character becomes a Risen and leaves play; you then make a retirement character. Aware use a Connection track instead and rise as a Restless at 10.

## Trauma
When the virus brings you back, a GM works out a trauma effect with you to roleplay. Play it as strongly as you like. In-game work can remove it.

## Aging
"Age" effects move your character up an age category until healed; Regenerate removes them. Aging survives death. Aware do not age.

## Lasting effects
Most effects end with the encounter. These last longer:

| Effect | Lasts |
|---|---|
| Age | Until healed (Regenerate) |
| Corruption | Until removed or the end of the re-pop |
| Disease | The re-pop |
| Drain | Until death, or the end of the event |
| Poison | Until removed or death; damage every minute |
| Rot | Until removed; bleed every 60 seconds |
| Wither | Until removed |
| Delimb | Until a Regenerate effect |

What every effect call does is in [Effects to Know](/wiki/effects).

Non-combat players wear a green sash; GMs may adjust plots for them.
`,
  },
  {
    slug: 'items-buffs-boons',
    title: 'Items, Buffs and Boons',
    summary: 'Item quality, resources, Bits, buff slots, and boons.',
    group: 'play',
    body: () => `
## Item quality
Tagged items come in four qualities: **Basic**, **Adept**, **Advanced**, and **Master**. For weapons, armor, and shields the quality sets how many enhancement slots it has: 1, 2, 3, or 4. Master items are very rare. Starting equipment is basic quality.

## Resources and Bits
Resources come in three rarities (**Common**, **Uncommon**, **Rare**) and four types (**Chemical**, **Organic**, **Scrap**, **Junk**). Rarity sets the value; the type matters for crafting. Bits are the everyday currency.

## Buff slots
Everyone has **4 buff slots**. A buff sits in a slot until the re-pop (or the encounter, if it says so). You may refuse a buff, or replace one when your slots are full. Several passive buffs to the same number do not add up: only the highest counts. Some effects give one extra slot, at most one per source. Unslotted buffs stack with slotted ones, but only the newest of each kind counts.

## Boons
Boons are special buffs, usually from powerful crafting or magic, that change your body. You can hold **3 boons** at once and never two of the same boon. Unless a boon says otherwise it ends at the end of the event. Medcraft augmentations are permanent until removed. The app keeps your boons on the Extras screen.
`,
  },
  {
    slug: 'ancestries',
    title: 'Ancestries',
    summary: 'What an ancestry gives you, infection, age, and how ability levels work.',
    group: 'options',
    body: (rs) => `
Your ancestry is what your character is (Rulebook p.15-33). There are ${rs.ancestries.ancestries.length}: ${rs.ancestries.ancestries.map((a) => a.name).join(', ')}.

## What an ancestry gives you
- A **passive** that is always on (some give items at check-in).
- A **shared ability** every member of the ancestry has.
- One more **subtype ability** from the subtype you pick.
- A **base infection** level, a **maximum age**, and sometimes costume requirements.

## Ability levels
Both active abilities start at level 1. Each level is one more use per encounter, per re-pop, or per event, as the ability says. You raise them with LXP: one at creation, one more for every ${rs.ruleset.lxp.perCxp} CXP. See [Points and currencies](/wiki/points).

See every ancestry, subtype, and ability in the [ancestry list](/wiki/ancestries-list).
`,
  },
  {
    slug: 'professions',
    title: 'Professions',
    summary: 'Starting a profession, PXP costs, levels, and tiers.',
    group: 'options',
    body: () => `
A profession is an advanced set of skills bought only with PXP (Professions Document p.1). A character has one profession.

## What a profession gives
- A **passive**, free when you start.
- **Skill 1**, used per encounter, levels 1 to 5. Each level is one use per encounter.
- **Skill 2**, used per re-pop, levels 1 to 5. At level 3 you can upgrade one use to adept, at level 4 a second one, and at level 5 one use to advanced.

## Starting one
- You need to have played **3 events** as this character first.
- Start by buying level 1 of either skill (10 PXP). You get the passive at the same time.
- Record it with staff. In this app, staff record profession purchases on your sheet.

## Costs and pace
Level n of a profession skill costs 10 x n PXP: 10, 20, 30, 40, 50 (150 to reach level 5). Each skill can go up **one level per event**, so level 5 takes at least five events.

| Level | PXP for this level | PXP in total |
|---|---|---|
| 1 | 10 | 10 |
| 2 | 20 | 30 |
| 3 | 30 | 60 |
| 4 | 40 | 100 |
| 5 | 50 | 150 |

## Restoring
Profession skills cannot be restored by other skills unless the restoring effect says it works on profession skills.

## Patron professions
Some professions come from a patron (Dream, Earth, Time, Home, Dealer, Death, Tenacity). They work the same way and usually come through the story.

See every profession in the [profession list](/wiki/professions-list).
`,
  },
  {
    slug: 'crafting',
    title: 'Crafting',
    summary: 'Crafts and resources, stable and unstable items, blueprints, recipe slots.',
    group: 'options',
    body: () => `
Crafting turns resources into items (Rulebook p.63-81). Crafting skills are bought like other skills; their AP is Crafting AP.

## The four crafts
| Craft | Uses |
|---|---|
| Gearcraft | Scrap |
| Engineering | Junk |
| Chemistry | Chemical |
| Medicine | Organic |

Common resources make basic recipes, uncommon make adept recipes, and rare make advanced recipes.

## Crafting an item
- A basic recipe spends one basic use of the craft. An adept recipe spends an adept use and a basic use; advanced likewise.
- **Stable** items cost the recipe's resources and last 2 years (or forever if marked P). **Unstable** items cost only the skill use and fall apart at the end of the event.
- A session takes the time of the highest rank item plus 1 minute per extra item: basic 5, adept 10, advanced 15 minutes.
- A stable consumable also gives Bits: 1 for basic, 2 for adept, 3 for advanced.

## Recipes you know
- Each level of a craft (basic, adept, advanced) gives one free slot for a recipe of that craft.
- **Recipe Memorization** gives one more slot per level for any recipe, at 1 AP each.
- Learn a recipe from a teacher (5 minutes) or from a blueprint (5 minutes and a basic use; the blueprint is used up).

## Blueprints
A blueprint is a one-time recipe. Crafting from it uses the blueprint instead of skill uses. To read one you need at least 1 level of the craft at its rank. Player-made blueprints and recipe notes last a year.

See every recipe in the [recipe list](/wiki/recipes-list).
`,
  },
  {
    slug: 'magic',
    title: 'Magic',
    summary: 'Schools, packet damage, spell slots, blueprints, and casting.',
    group: 'options',
    body: () => `
Magic is bought like other skills; its AP is Magic AP (Rulebook p.82-93).

## Schools
| School | Packet damage | Incant starts |
|---|---|---|
| Elemental | 1 Fire, Air, Earth, or Water | "I summon the elements..." |
| Life | 1 Essence | "By the spark of life..." |
| Death | 1 Harm | "By the embrace of death..." |
| Tech | 1 Zap | "With innovations hand..." |

Each school's basic skill lets you throw packets for that damage. Raw Magic Proficiency adds 1 per level, and 1 more at level 5.

## Casting
- A basic spell spends a basic use of its school. Adept and advanced spells also spend an adept or advanced use, which come back each encounter.
- You can cast with the incant or silently with a 5 second charge.

## Spells you know
- Each level of a school (basic, adept, advanced) gives one free slot for a spell of that school.
- **Spell Memorization** gives one more slot per level for any spell, at 1 AP each.
- Learn from a teacher (5 minutes) or a blueprint (5 minutes; the blueprint is used up).

## Blueprints
Any caster can write a blueprint of a spell they know: spend a use at the spell's rank and 5 minutes. A stable blueprint costs 1 resource of that rank and lasts 2 years; an unstable one ends with the event.

See every spell in the [spell list](/wiki/spells-list).
`,
  },
  {
    slug: 'familiars',
    title: 'Familiars',
    summary: 'Bonding, awakening, familiar levels, Essence, and familiar skills.',
    group: 'options',
    body: (rs) => `
A familiar is a small creature bonded to your character (Rulebook p.100-104). It needs a physical prop at least 4 inches long, with you, to bond or to use its skills.

## Familiar Points (FP)
You earn 1 FP for each event you attend. FP pay for everything below.

| Step | FP |
|---|---|
| Bond (familiar level 1) | 0 |
| Awaken (level 2) | 5 |
| Each level from 3 to 10 | 3 |
| Break a bond | 1 |
| Make it forget a skill | 1 per skill |

Reaching level 10 costs 29 FP in total. You can bond one familiar at a time, and awaken it at the same event you bond it.

## Awakening
An awakened familiar gains one awakened skill: ${rs.familiar.awakenedSkills.map((s) => s.name).join(', ')}.

## Essence and skills
Each familiar level gives Essence equal to that level, so a level 10 familiar has 55 Essence in total. Essence buys familiar skills. A familiar has **4 skill slots**, and you can buy up to 2 more at 5 Essence each.

See every familiar skill in the [familiar skill list](/wiki/familiar-list).
`,
  },
  {
    slug: 'multi-archetype',
    title: 'Multi-Archetype Skills',
    summary: 'Bardic Performance, Ritualism, Meditation, Alchemy, and Enchanting.',
    group: 'options',
    body: () => `
A few skills can be bought in more than one archetype (Rulebook p.94-99). The first time you buy one, you choose the archetype. Every later purchase of that skill uses the same archetype's AP.

## Bardic Performance
Bought in Utility or Magic. Inspire others with a song, dance, or story. Everyone you target must watch or listen to the whole performance, and it cannot be used in combat.
- **Basic:** perform for up to 4 targets. Each level also gives one free memorized performance.
- **Adept:** with a basic use, up to 10 targets; unlocks adept performances.
- **Advanced:** with a basic use, everyone in voice range; unlocks advanced performances.
- **Memorize Performance:** 1 AP for each extra performance.

## Cognitive powers
Ritualism, Meditation, Alchemy, and Enchanting combine two other skills. You pay for them in one of the archetypes you used to meet their prerequisites.

See every performance and ritual in the [performance and ritual list](/wiki/performances-list).
`,
  },
  {
    slug: 'using-the-app',
    title: 'Using This App',
    summary: 'Accounts, new characters, learning skills, Play, and what staff do.',
    group: 'start',
    body: () => `
## Your account
- **Create an account** with your name, email, and a password. Staff see your name and email so they can match you to your characters.
- Forgot your password? Ask staff for a one-time code and use **Forgot your password, or have a code from staff?** on the sign-in page.
- Already have a character from the Google Sheet? Ask staff to link it to your account.

## A new character
Choose **Create a new character**. The app walks you through the [creation steps](/wiki/making-a-character) and checks every rule as you go. **Send to staff** sends it for approval. If staff send it back, you see their note, can change it, and send it again.

## Learning a skill in game
On your character's **Skills** list, tap **+** next to the skill you learned (turn off "Owned only" to find a new skill). Say who taught you and send it. Staff approve it and it lands on your sheet with its cost. **My learning requests** shows what staff decided.

## During an event
The **Play** screen counts your skill uses per encounter and per re-pop, and works with no signal. A sheet you opened before also shows offline.

## What staff do
Staff check you in, award points, approve new characters and learnings, and fix mistakes. Every change goes in your character's log with the date and who made it, so nothing is lost.
`,
  },
  {
    slug: 'glossary',
    title: 'Glossary',
    summary: 'Short meanings of the words used on the sheet.',
    group: 'start',
    body: (rs) => `
| Word | Meaning |
|---|---|
| Adept, Advanced | Upgrades to a basic skill. Using one also spends a basic use. |
| AP | Archetype Points. Earned by basic skill levels, spent in the same archetype. |
| Archetype | A skill family: Warrior, Defender, Rogue, Utility, Magic, Crafting. |
| Bits | The everyday in-game currency. |
| Blueprint | A one-time recipe or spell. |
| Boon | A special buff that changes your body. 3 at most. |
| Buff slot | Where a buff sits. 4 by default. |
| CXP | Character Experience. Buys basic skills. |
| Encounter | A fight or scene. Per-encounter skills come back at the next one. |
| Essence | A familiar's skill currency. |
| Event CXP | The ${rs.ruleset.eventCxp} CXP each attended event gives. |
| FP | Familiar Points. 1 per event. |
| Infection | How far the Risen Virus has taken you. 10 means you become a Risen. |
| LXP | Ancestry Experience. Raises ancestry abilities. |
| Mastery | A one-level capstone for a skill at basic level 9. |
| Memorization | A slot for one more spell, recipe, or performance. 1 AP each. |
| PXP | Profession Experience. Buys profession skills. |
| Re-pop | Saturday 6am and 5pm. Skills come back, buffs end. |
| Retirement | Ending a character and starting a new one with a head start. |
| Shinies | Reward currency for helping the game. |
| Upkeep | 2 basic resources or 10 Bits at check-in. |
`,
  },
  {
    slug: 'effects',
    title: 'Effects to Know',
    summary: 'Every effect call, with (A) Detrimental Ailment and (M) Movement Impairing marks.',
    group: 'reference',
    list: 'effects',
  },
  {
    slug: 'skills-list',
    title: 'All Skills',
    summary: 'Every skill by archetype, with each part, its cost type, and its rule text.',
    group: 'reference',
    list: 'skills',
  },
  {
    slug: 'ancestries-list',
    title: 'All Ancestries',
    summary: 'Every ancestry and subtype with their abilities.',
    group: 'reference',
    list: 'ancestries',
  },
  {
    slug: 'professions-list',
    title: 'All Professions',
    summary: 'Every profession with its passive and two skills.',
    group: 'reference',
    list: 'professions',
  },
  {
    slug: 'spells-list',
    title: 'All Spells',
    summary: 'Every spell by school and rank, with its call.',
    group: 'reference',
    list: 'spells',
  },
  {
    slug: 'recipes-list',
    title: 'All Recipes',
    summary: 'Every recipe by craft and rank, with its resource cost.',
    group: 'reference',
    list: 'recipes',
  },
  {
    slug: 'performances-list',
    title: 'Performances and Rituals',
    summary: 'Every bardic performance and ritual.',
    group: 'reference',
    list: 'performances',
  },
  {
    slug: 'familiar-list',
    title: 'Familiar Skills',
    summary: 'Awakened skills and every familiar skill by Essence tier.',
    group: 'reference',
    list: 'familiar',
  },
];

export const ARTICLES_BY_SLUG = new Map(ARTICLES.map((a) => [a.slug, a]));
