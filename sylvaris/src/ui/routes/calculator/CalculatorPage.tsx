// `#/` on the public site: the Life and Damage Calculator (docs/PUBLIC-SITE-PLAN.md, item 3). A
// "Your Character" card holds what normally comes from the sheet; the Life, Armor, and Damage
// calculators are the Play screen's own (`CombatCards`), fed a sheet built from the form.
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Button, Card, ConfirmDialog, Field, LevelStepper, Tabs } from '../../components/index.ts';
import { useRuleset } from '../../data/rulesetContext.ts';
import { Screen } from '../../Screen.tsx';
import { CombatCards } from '../character/play/CombatPanel.tsx';
import type { CombatState } from '../character/play/combat.ts';
import play from '../character/play/play.module.css';
import {
  TECHNIQUES,
  calculatorFields,
  calculatorOptions,
  calculatorSheet,
  changeInputs,
  defaultCalculatorState,
  maxLevel,
  raceChoiceFields,
  readCalculatorState,
  saveCalculatorState,
  skillsFor,
  techniqueLevel,
  withCalling,
  withLevel,
  withRace,
  withTechnique,
  type CalculatorInputs,
  type CalculatorState,
  type PickField,
  type SkillField,
} from './calculatorInputs.ts';
import styles from './calculator.module.css';

const TITLE = 'Life and Damage Calculator';

/** The page always opens on Totals: reading the numbers is why people come here. */
type CalculatorTab = 'totals' | 'character';

const TECHNIQUE_NAMES = { expert: 'Expert', master: 'Master', grandmaster: 'Grandmaster' };

export function CalculatorPage() {
  const rs = useRuleset();
  const [state, setState] = useState<CalculatorState>(() => readCalculatorState(rs));
  const [tab, setTab] = useState<CalculatorTab>('totals');
  const [confirming, setConfirming] = useState(false);
  const headingId = useId();
  useEffect(() => saveCalculatorState(state), [state]);

  const sheet = useMemo(() => calculatorSheet(rs, state.inputs), [rs, state.inputs]);
  const options = useMemo(
    () => calculatorOptions(rs, sheet, state.inputs.spells),
    [rs, sheet, state.inputs.spells],
  );
  const setInputs = (change: (inputs: CalculatorInputs) => CalculatorInputs) =>
    setState((s) => changeInputs(rs, s, change));
  const setCombat = (change: (combat: CombatState) => CombatState) =>
    setState((s) => ({ ...s, combat: change(s.combat) }));

  return (
    <Screen title={TITLE}>
      <div className={styles.page}>
        <h1>{TITLE}</h1>
        <p className={styles.unofficial}>
          Unofficial, player-made tool, not checked by Sylvaris LARP staff. If anything here
          disagrees with the rulebook or staff, the rulebook and staff win.
        </p>
        <p>
          Add up your Life, Armor, and damage call without a character sheet. Set your race and
          skills in Character, then pick buffs, armor, and weapons in Totals. Your choices stay on
          this device.
        </p>
        <Tabs
          label="Calculator"
          className={styles.tabs ?? ''}
          selectedId={tab}
          onSelect={(id) => setTab(id as CalculatorTab)}
          tabs={[
            {
              id: 'totals',
              label: 'Totals',
              content: (
                <CombatCards
                  ruleset={rs}
                  sheet={sheet}
                  options={options}
                  state={state.combat}
                  setState={setCombat}
                  title="Life, Armor, and Damage"
                  headingLevel={2}
                  headingId={headingId}
                />
              ),
            },
            {
              id: 'character',
              label: 'Character',
              content: <CharacterCard inputs={state.inputs} setInputs={setInputs} />,
            },
          ]}
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
          setState(defaultCalculatorState(rs));
          setTab('totals');
          setConfirming(false);
        }}
        onCancel={() => setConfirming(false)}
      >
        <p>This clears your character, buffs, armor coverage, and weapon on this device.</p>
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
  const choices = raceChoiceFields(rs, inputs.raceId);
  const skills = skillsFor(rs, fields, inputs.raceId, inputs.callingId);
  const regular = skills.filter((s) => s.raceId === null && s.callingId === null);
  const racial = skills.filter((s) => s.raceId !== null);
  const calling = skills.filter((s) => s.callingId !== null);
  const raceName = rs.racesById[inputs.raceId]?.name ?? '';
  const callingName = rs.callingsById[inputs.callingId]?.name ?? '';

  const rows = (list: readonly SkillField[]) =>
    list.map((f) => <SkillRow key={f.skillId} field={f} inputs={inputs} setInputs={setInputs} />);
  const checks = (list: readonly PickField[], key: 'spells' | 'powers') =>
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
      <p className={play.hint}>Only what changes Life, Armor, or damage is asked here.</p>
      <div className={styles.sections}>
        <FormGroup title="Race and Calling">
          <Field label="Race">
            {(control) => (
              <select
                {...control}
                value={inputs.raceId}
                onChange={(e) => setInputs((i) => withRace(rs, i, e.target.value))}
              >
                {rs.races.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {choices.map((c) => (
            <Field key={c.choiceId} label={c.label}>
              {(control) => (
                <select
                  {...control}
                  value={inputs.choices[c.choiceId] ?? ''}
                  onChange={(e) =>
                    setInputs((i) => ({
                      ...i,
                      choices: { ...i.choices, [c.choiceId]: e.target.value },
                    }))
                  }
                >
                  {c.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ))}
          <Field label="Calling">
            {(control) => (
              <select
                {...control}
                value={inputs.callingId}
                onChange={(e) => setInputs((i) => withCalling(rs, i, e.target.value))}
              >
                <option value="">None</option>
                {fields.callings.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </FormGroup>
        <FormGroup title="Skills">{rows(regular)}</FormGroup>
        {racial.length > 0 ? (
          <FormGroup title={`${raceName} racial skills`}>{rows(racial)}</FormGroup>
        ) : null}
        {calling.length > 0 ? (
          <FormGroup title={`${callingName} skills`}>{rows(calling)}</FormGroup>
        ) : null}
        <FormGroup title="Spells and Artifact">
          <fieldset className={play.checks}>
            <legend>Spells you can cast</legend>
            {checks(fields.spells, 'spells')}
          </fieldset>
          <fieldset className={play.checks}>
            <legend>Artifact powers</legend>
            {checks(fields.powers, 'powers')}
          </fieldset>
        </FormGroup>
      </div>
    </Card>
  );
}

/** A skill's level stepper and the Techniques the level allows (or already ticked). */
function SkillRow({
  field,
  inputs,
  setInputs,
}: {
  field: SkillField;
  inputs: CalculatorInputs;
  setInputs: (change: (inputs: CalculatorInputs) => CalculatorInputs) => void;
}) {
  const rs = useRuleset();
  const own = inputs.skills[field.skillId];
  const level = own?.level ?? 0;
  const techniques = TECHNIQUES.filter(
    (t) => techniqueLevel(rs, t) <= level || own?.techniques.includes(t),
  );
  return (
    <div className={styles.skill}>
      <div className={styles.levelRow}>
        <span className={styles.levelName}>{field.label}</span>
        <LevelStepper
          label={field.label}
          value={level}
          min={0}
          max={maxLevel(rs)}
          onChange={(n) => setInputs((i) => withLevel(rs, i, field.skillId, n))}
        />
      </div>
      {techniques.length > 0 ? (
        <div className={styles.techniques}>
          {techniques.map((t) => (
            <Check
              key={t}
              label={
                <>
                  <span className="visually-hidden">{field.label}</span> {TECHNIQUE_NAMES[t]}
                </>
              }
              checked={own?.techniques.includes(t) ?? false}
              onChange={(on) => setInputs((i) => withTechnique(rs, i, field.skillId, t, on))}
            />
          ))}
        </div>
      ) : null}
    </div>
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
  label: ReactNode;
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
