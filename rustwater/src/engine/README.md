Pure TypeScript rules engine: computes character state from the action log. No React, DOM, or storage imports.

- `deriveSheet(ruleset, actions)` replays the log into a `Sheet` (`sheet.ts`). Bad actions become `sheet.warnings`; it never throws.
- `plan(ruleset, sheet, command, ctx)` validates a staff command and returns the actions to append, or `RuleError`s.
- `preview(ruleset, sheet, command)` gives cost, `allowed`, and reasons for button labels.
- Add an action type: a file in `actions/` using `defineAction`, listed in `actions/registry.ts`.
- Add a command: a file in `commands/` using `defineCommand`, listed in `commands/registry.ts`.
