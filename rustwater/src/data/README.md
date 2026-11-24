# Rules data

Each season's rules live in one folder under `rulesets/`, for example `rulesets/2026-2.0/`. The app reads rules only from these files: costs, caps, skills, and text. Every file is checked by a schema in `schema/` when the app loads it and by `npm test`.

## Start a new season

1. Copy the newest folder, for example `rulesets/2026-2.0/` to `rulesets/2027-1.0/`.
2. In the new `ruleset.json`, change `id` (same as the folder name), `name`, `season`, and `rulebookVersion`.
3. Edit the files. Keep ids stable when a rule carries over, so characters keep their skills. Give new records new ids (lowercase, words joined by `-`).
4. Register the folder in `index.ts`: add its imports and an entry in `RAW` (copy the 2026-2.0 lines).
5. Run `npm test`. It fails on a misspelt key, a missing or duplicate id, a number written as text, or an id that points at nothing, and names the file and record.

Characters keep the season they were made in. Moving a character to a new season is a staff action in the app.

## Rules for editing

- Numbers only. Never write a formula ("10 \* level"). The shape of the math is in code; the data holds its numbers.
- `text` is what players read. `source` is the page reference. `sheetName` and `sheetNames` match the old Google Sheet for imports.
- A guessed value has `"assumed": true` and an `assumptionNote` saying what was guessed. Remove both once staff confirm the rule.

## Files

| File                  | Holds                                                                                                                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ruleset.json`        | Season id and name; currencies and ledger kinds; starting CXP, event CXP, earned-CXP cap; skill costs and level caps; LXP; extra infection; retirement; upkeep; magic schools, crafting disciplines, resource types, rarities |
| `archetypes.json`     | The six archetypes that earn and spend AP                                                                                                                                                                                     |
| `skills.json`         | Every skill (standard, magic, crafting, multi-archetype): parts, cost kind, frequency, prerequisites, effects on sheet numbers, rule text                                                                                     |
| `ancestries.json`     | Ancestries, subtypes, passives and leveled abilities, base infection, ages                                                                                                                                                    |
| `professions.json`    | PXP costs, uses per level, and the 19 professions with their passive and two skills                                                                                                                                           |
| `spells.json`         | School spells and mastery magic abilities                                                                                                                                                                                     |
| `recipes.json`        | Crafting and mastery crafting recipes with resource costs                                                                                                                                                                     |
| `performances.json`   | Bardic performances and Ritualism rituals                                                                                                                                                                                     |
| `familiar.json`       | Familiar levels, FP and Essence costs, awakened and familiar skills                                                                                                                                                           |
| `boons.json`          | Boon slots, expiry kinds, and the crafted boons                                                                                                                                                                               |
| `starting-items.json` | Starting equipment picks at creation                                                                                                                                                                                          |
| `infection.json`      | Infection and connection tracks, death counts, trauma                                                                                                                                                                         |
| `awards.json`         | Check-in bundles, NPC time, extras, between-games roles, other Shiny sources, Shiny purchases and their caps                                                                                                                  |

## Code

- `schema/`: one Zod schema per file. Objects are strict, so unknown keys fail.
- `references.ts`: checks that ids used across files exist.
- `index.ts`: `loadRuleset(id)` validates, checks references, builds id lookups (`skillsById`, `subtypesById`, and so on), freezes, and caches a season. `listRulesets()` lists bundled seasons.
