// Styles for the test-build planner in the downloaded wiki file. They use the app's colour tokens
// (the file carries the app's stylesheet) with fallbacks, so the planner reads well in light and
// dark and keeps 44px tap targets.
export const PLANNER_CSS = `
.tb { display: grid; gap: 16px; }
.tb-title { margin: 0; }
.tb-card { display: grid; gap: 12px; padding: 16px; border: 1px solid var(--color-border, #857e6e); border-radius: 12px; background: var(--color-surface, transparent); }
.tb-card > * { margin: 0; min-width: 0; }
.tb-card h3 { margin: 0; }
.tb-card h4 { margin: 0 0 4px; }
.tb-field { display: grid; gap: 4px; min-width: 0; }
.tb-field label, .tb-card > label { font-weight: 600; }
.tb-field input, .tb-field select, .tb-summary { box-sizing: border-box; width: 100%; min-height: 44px; padding: 8px 12px; font: inherit; color: var(--color-text, inherit); background: var(--color-bg, transparent); border: 1px solid var(--color-border-strong, #4d4a52); border-radius: 8px; }
.tb-summary { min-height: 8rem; font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.875rem; }
.tb-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 12px; }
.tb-buttons { display: flex; flex-wrap: wrap; gap: 8px; }
.tb-btn { min-height: 44px; padding: 8px 14px; font: inherit; font-weight: 600; color: var(--color-text, inherit); background: var(--color-surface-2, transparent); border: 1px solid var(--color-border-strong, #4d4a52); border-radius: 999px; cursor: pointer; }
.tb-primary { color: var(--color-on-primary, #fff); background: var(--color-primary, #3b5a1f); border-color: var(--color-primary, #3b5a1f); }
.tb-quiet { background: transparent; }
.tb-danger { color: var(--color-on-danger, #fff); background: var(--color-danger, #a3121c); border-color: var(--color-danger, #a3121c); }
.tb-link { min-height: 44px; padding: 0 4px; font: inherit; color: var(--color-link, #1b5687); background: none; border: 0; text-decoration: underline; cursor: pointer; }
.tb-muted, .tb-status { color: var(--color-text-muted, #4d4a52); }
.tb-status:empty { display: none; }
.tb-ok { font-weight: 600; color: var(--color-success, #2e6324); }
.tb-problem { font-weight: 600; color: var(--color-danger, #a3121c); }
.tb-facts { display: grid; gap: 6px; margin: 0; }
.tb-facts div { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; }
.tb-facts dt { font-weight: 600; }
.tb-facts dd { margin: 0; }
.tb-skills { display: grid; gap: 16px; margin: 0; padding: 0; list-style: none; }
.tb-skill { padding-top: 12px; border-top: 1px solid var(--color-border, #857e6e); }
.tb-list { margin: 0; padding-left: 1.25rem; }
.tb-fieldset { margin: 0; padding: 8px 12px; border: 1px solid var(--color-border, #857e6e); border-radius: 8px; }
.tb-fieldset legend { font-weight: 600; }
.tb-checks { display: grid; gap: 4px; max-height: 16rem; overflow-y: auto; }
.tb-check { display: flex; align-items: center; gap: 8px; min-height: 44px; }
.tb-check input { width: 22px; height: 22px; flex: none; }
.tb-vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`;
