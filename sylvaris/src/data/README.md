# Sylvaris rules data

Each Sylvaris season lives in one folder under `rulesets/`, for example `rulesets/sylvaris-1.3.1/` for Rulebook V1.3.1 and the Callings Supplement V1.3.1. The app reads rules only from these files. Every file is checked by a schema in `schema/` when the app loads it and by `npm test`.

## Files

| File                      | Holds                                                                                                                                                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ruleset.json`            | Season id and name, currencies, ledger kinds, XP, CXP, and AXP numbers, skill costs and the Technique table, creation limits, languages, magic schools, events, upkeep, coins, body numbers, caps, slots, familiar locations, Calling, Artifact, retirement |
| `skills.json`             | The 80 regular and advanced skills: offensive, defensive, utility, magic, crafting                                                                                                                                                                          |
| `races.json`              | The 14 races: innates, choices, conditional effects, and their two racial skills each                                                                                                                                                                       |
| `callings.json`           | The 13 Callings: innate, detriment, choices, effects, and their two Calling skills each                                                                                                                                                                     |
| `spells.json`             | The 104 spells of the six schools                                                                                                                                                                                                                           |
| `rituals.json`            | Ritualism rules, the 12 rituals, and the planar chart                                                                                                                                                                                                       |
| `recipes.json`            | The 254 recipes of the twelve crafts                                                                                                                                                                                                                        |
| `performances.json`       | The 18 performance notes                                                                                                                                                                                                                                    |
| `gems.json`               | Gem cuts and copper values                                                                                                                                                                                                                                  |
| `starting-equipment.json` | The 17 starting options and the number of picks                                                                                                                                                                                                             |
| `artifacts.json`          | Artifact rules, allowed conditions, and the 76 powers by tier                                                                                                                                                                                               |
| `familiars.json`          | Familiar rules, trick slots by quality, and special tricks                                                                                                                                                                                                  |
| `awards.json`             | Check-in attendance bundles, NPC time, extras, staff roles between events, other Mist Token sources, and the Mist Token purchase table with its caps                                                                                                        |

## How the data is shaped

- Every skill (regular, racial, Calling) has the same shape: `levels.basic`, `expert`, `master`, `grandmaster`, each with `uses`, `kind` (`active`, `passive`, or `both`), and `summary`. A passive ability has 0 uses.
- Racial skills sit inside their race with `category: "racial"` and `raceId`. Calling skills sit inside their Calling with `category: "calling"` and `callingId`. Skill ids are unique across all three.
- `prereqs` is a list of groups. Every group must be met. A group is met when `need` of the skills in `of` have the named Technique. So "A + B" is two groups of one, "A or B" is one group with `need: 1`, and "any two of A, B, C" is one group with `need: 2`.
- `passives` are fixed numbers added once a Technique is owned. `derived` numbers scale with the skill level. `grants` hand out abilities that are not numbers.
- In `ruleset.json` every constant is a plain number. Page references are in `sources` and staff notes in `notes`, keyed by the path of the value, for example `"xp.earnedCap"`.

## Rules for editing

- Numbers only. Never write a formula ("5 x level"). The math is in code; the data holds its numbers.
- `summary` is our own short wording. Never copy rulebook sentences. Keep every number, use count, and call exactly.
- `source` is the page reference, for example `Rulebook p.91` or `Callings p.5`.
- ids are lowercase words joined by `-`. Keep an id when a rule carries over, so characters keep their skills.

## Start a new season

1. Copy the newest folder, for example `rulesets/sylvaris-1.3.1/` to `rulesets/sylvaris-1.4.0/`.
2. In the new `ruleset.json`, change `id` (same as the folder name), `name`, `rulebookVersion`, and `callingsVersion`.
3. Edit the files. Give new records new ids.
4. Register the folder in `index.ts`: add its imports and an entry in `RAW` (copy the sylvaris-1.3.1 lines).
5. Run the tests (below). They fail on a misspelt key, a missing or duplicate id, a number written as text, a negative cost, or an id that points at nothing, and name the file and record.

Characters keep the season they were made in.

## Run the tests

In a Bash shell in the project folder:

```
source scripts/node-env.sh
npx vitest run src/data
```

`npm test` runs every test in the project, these included.

## Code

- `schema/`: one Zod schema per file, shared parts in `common.ts`. Objects are strict, so unknown keys fail.
- `references.ts`: checks that ids used across files exist and that paired numbers agree.
- `index.ts`: `loadRuleset(id)` (also exported as `loadSylvarisRuleset`; `listRulesets()` lists the bundled seasons) validates, checks references, builds lookups (`skillsById` across all skills, `racesById`, `spellsBySchool`, `recipesByCraft`, and more), freezes, and caches a season.
