// `#/calculator`: the stand-alone Soak and Damage Calculator, public like the Rules Wiki. A
// "Your Character" card holds what normally comes from the sheet; the Health, Armor, and Damage
// cards are the Play Tracker's own (`CombatCards`), fed a sheet built from the form.
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Button, Card, ConfirmDialog, Field, LevelStepper } from '../../components/index.ts';
import type { Ruleset } from '../../../engine/index.ts';
import { useRuleset } from '../../data/rulesetContext.ts';
import { Screen } from '../../Screen.tsx';
import { CombatCards } from '../character/play/CombatPanel.tsx';
import { attacks, withDefaultNames, type CombatState } from '../character/play/combat.ts';
import play from '../character/play/play.module.css';
import {
  calculatorFields,
  calculatorSheet,
  defaultCalculatorState,
  readCalculatorState,
  saveCalculatorState,
  subtypeMatters,
  withAncestry,
  type CalculatorInputs,
  type CalculatorState,
  type ChoiceField,
  type FormSection,
} from './calculatorInputs.ts';
import styles from './calculator.module.css';

const TITLE = 'Soak and Damage Calculator';

/** Keeps the default damage line names in step with the attacks the form allows. */
function withNames(rs: Ruleset, state: CalculatorState): CalculatorState {
  const list = attacks(rs, calculatorSheet(rs, state.inputs));
  return {
    ...state,
    combat: { ...state.combat, lines: withDefaultNames(state.combat.lines, list) },
  };
}

export function CalculatorPage() {
  const rs = useRuleset();
  const [state, setState] = useState<CalculatorState>(() => {
    const stored = readCalculatorState(rs);
    return withNames(rs, stored);
  });
  const [confirming, setConfirming] = useState(false);
  useEffect(() => saveCalculatorState(state), [state]);

  const sheet = useMemo(() => calculatorSheet(rs, state.inputs), [rs, state.inputs]);
  const setInputs = (change: (inputs: CalculatorInputs) => CalculatorInputs) =>
    setState((s) => ({ ...s, inputs: change(s.inputs) }));
  const setCombat = (change: (combat: CombatState) => CombatState) =>
    setState((s) => ({ ...s, combat: change(s.combat) }));

  return (
    <Screen title={TITLE}>
      <div className={styles.page}>
        <h1>{TITLE}</h1>
        <p>
          Add up your Health, Armor, and damage calls without a character sheet. Set your character
          below, then pick buffs and weapons in the cards. Your choices stay on this device.
        </p>
        <CharacterCard inputs={state.inputs} setInputs={setInputs} />
        <CombatCards
          ruleset={rs}
          sheet={sheet}
          state={state.combat}
          setState={setCombat}
          title="Health, Armor, and Damage"
          level={2}
        />
        <div>
          <Button onClick={() => setConfirming(true)}>Reset calculator</Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirming}
        title="Reset the calculator?"
        confirmLabel="Reset calculator"
        danger
        onConfirm={() => {
          setState(withNames(rs, defaultCalculatorState(rs)));
          setConfirming(false);
        }}
        onCancel={() => setConfirming(false)}
      >
        <p>This clears your character, buffs, armor coverage, and damage lines on this device.</p>
      </ConfirmDialog>
    </Screen>
  );
}

function toggle(list: readonly string[], id: string, on: boolean): string[] {
  return on ? [...list.filter((x) => x !== id), id] : list.filter((x) => x !== id);
}

function CharacterCard({
  inputs,
  setInputs,
}: {
  inputs: CalculatorInputs;
  setInputs: (change: (inputs: CalculatorInputs) => CalculatorInputs) => void;
}) {
  const rs = useRuleset();
  const fields = useMemo(() => calculatorFields(rs), [rs]);
  const ancestry = rs.ancestriesById[inputs.ancestryId];
  const askSubtype = useMemo(() => subtypeMatters(rs, inputs.ancestryId), [rs, inputs.ancestryId]);

  const levels = (section: FormSection) =>
    fields.levels
      .filter((f) => f.section === section)
      .map((f) => (
        <div key={f.skillId} className={styles.levelRow}>
          <span className={styles.levelName}>{f.label}</span>
          <LevelStepper
            label={f.label}
            value={inputs.levels[f.skillId] ?? 0}
            min={0}
            max={f.max}
            onChange={(level) =>
              setInputs((i) => ({ ...i, levels: { ...i.levels, [f.skillId]: level } }))
            }
          />
        </div>
      ));
  const toggles = (section: FormSection, school: boolean) =>
    fields.toggles
      .filter((t) => t.section === section && t.school === school)
      .map((t) => (
        <Check
          key={t.key}
          label={t.label}
          checked={inputs.owned.includes(t.key)}
          onChange={(on) => setInputs((i) => ({ ...i, owned: toggle(i.owned, t.key, on) }))}
        />
      ));
  const choices = (list: readonly ChoiceField[], key: 'boons' | 'familiar') =>
    list.map((c) => (
      <Check
        key={c.id}
        label={c.label}
        checked={inputs[key].includes(c.id)}
        onChange={(on) => setInputs((i) => ({ ...i, [key]: toggle(i[key], c.id, on) }))}
      />
    ));

  return (
    <Card title="Your Character" headingLevel={2}>
      <div className={styles.sections}>
        <FormGroup title="Ancestry">
          <Field label="Ancestry">
            {(control) => (
              <select
                {...control}
                value={inputs.ancestryId}
                onChange={(e) => setInputs((i) => withAncestry(rs, i, e.target.value))}
              >
                {rs.ancestries.ancestries.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {askSubtype && ancestry ? (
            <Field label="Subtype">
              {(control) => (
                <select
                  {...control}
                  value={inputs.subtypeId}
                  onChange={(e) => setInputs((i) => ({ ...i, subtypeId: e.target.value }))}
                >
                  {ancestry.subtypes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ) : null}
        </FormGroup>
        <FormGroup title="Weapon Skills">
          {levels('weapon')}
          <div className={play.checks}>{toggles('weapon', false)}</div>
        </FormGroup>
        <FormGroup title="Defense Skills">{levels('defense')}</FormGroup>
        <FormGroup title="Magic">
          {levels('magic')}
          <fieldset className={play.checks}>
            <legend>Magic schools known (for packets)</legend>
            {toggles('magic', true)}
          </fieldset>
          <div className={play.checks}>{toggles('magic', false)}</div>
        </FormGroup>
        <FormGroup title="Boons and Familiar">
          <fieldset className={play.checks}>
            <legend>Boons</legend>
            {choices(fields.boons, 'boons')}
          </fieldset>
          <fieldset className={play.checks}>
            <legend>Familiar skills</legend>
            {choices(fields.familiar, 'familiar')}
          </fieldset>
        </FormGroup>
      </div>
    </Card>
  );
}

function FormGroup({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={styles.group}>
      <h3 id={id} className={styles.groupTitle}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className={play.check}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
