# Sylvaris rules engine

Pure TypeScript. It turns a character's action log into a sheet and checks staff commands against the Sylvaris rules (Rulebook V1.3.1, Callings Supplement V1.3.1). It imports nothing from React, the DOM, or storage (ESLint enforces this). Rules data comes only from `loadRuleset()` in `src/data/index.ts` (the engine re-exports it).

## API (`index.ts`)

- `deriveSheet(ruleset, actions)` replays the log into a `Sheet` (`sheet.ts`). Bad actions become `sheet.warnings`; it never throws. Player-authored actions of staff-only types are ignored with a warning; `allowedForRole(type, role)` gives the same check to the server.
- `plan(ruleset, sheet, command, ctx)` checks a staff command and returns the actions to append, or `RuleError`s with a stable `code`, a plain message, and the rules spec id. `ctx.events` (optional) is the events registry; Missed Event XP needs it.
- `preview(ruleset, sheet, command)` gives `allowed`, the cost or refund, awards, and reasons, for button labels. It ignores inputs not filled in yet (reason, choices, event, teacher).
- `summarize(sheet)` gives a roster row: name, player, race, Calling, XP available, events, retired.
- `checkRequest(ruleset, sheet, request)` tells the staff inbox if a player's learning request can be approved.
- Check-in: `checkRegistration`, `checkInSources`, `checkInItems`, `upkeepFor` build the pre-registration pull list and check planned Mist Token purchases through `plan()`.
- Helpers: costs (`levelCost`, `skillCost`, `fullSkillCost`, `techniqueCost`), skill state (`stepOrderProblem`, `refundableSteps`, `checkPrereqs`), `retirementCarry`, `npcTimeRewards`, `computeStats`.
- Model (`model.ts`): `StoredCharacterSchema`, `ActionSchema`, `ACTION_TYPES`, `RequestSchema` (with `step`), events, trackers, settings, `formatIssues`, `slug`, `eventKey`.

A skill purchase step is `{ level: n }` or `{ technique: 'expert' | 'master' | 'grandmaster' }`. `COMMAND_TYPES` lists every command; `ACTION_REGISTRY` every action.

## Where things live

- `actions/`: one file per action family. Each action has a Zod payload and a replay handler.
- `commands/`: one file per command family. Each command has a Zod input and `evaluate()`.
- `derive/`: the replay loop (`deriveSheet.ts`), the mutable `Draft`, and `finalize.ts`, which builds the sheet.
- `rules/`: pure math: costs, Techniques and abilities, prerequisites, stats and caps, check-in income, awards and caps, retirement, Calling rules, journals.
- `checkin/`: pre-registration.
- `golden/`: invented characters built through `plan()` with hand-derived numbers.

## Add an action

1. In the right file in `actions/`, write a Zod payload and call `defineAction({ type, payload, apply })`. `apply` writes into the draft and calls `warn()` for problems; it never throws.
2. Add the type to `ACTION_TYPES` in `model.ts` and the definition to `DEFINITIONS` in `actions/registry.ts`.
3. If the sheet shows something new, add it to `Draft` (`derive/draft.ts`), the `Sheet` type, and `finalize.ts`.
4. Add a command in `commands/` with `defineCommand({ type, schema, evaluate })`. Check every rule there and add actions with `builder.add()`. List it in `commands/registry.ts` and the `Command` union.
5. Test the command (allowed and blocked, with error codes) and the replay.

## Rules that are easy to get wrong

- Named abilities above Basic need their Technique; the level alone is not enough.
- Spent XP, CXP, and AXP come from the cost or refund stored in each action, so history keeps the prices paid; a stored price that differs from the current table adds a warning. Refunds give the stored amount back.
- Numbers come from the ruleset data, never from the code.
- Open questions use the defaults in `docs/DECISIONS.md`; each file names the ones it applies.
