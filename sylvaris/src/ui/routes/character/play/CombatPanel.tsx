// Play screen: Life, Armor, and Damage calculators (cribbed from Rustwater). Each shows its total
// and opens to the breakdown and the buffs to tick: the character's own skills, spells, and
// Artifact powers, and what others or items can give. Choices stay on this device per character,
// so they survive a reload mid-fight. The rules on stacking and caps are in combat.ts.
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button, Field, SectionHeading } from '../../../components/index.ts';
import type { Ruleset, Sheet } from '../../../../engine/index.ts';
import type { CharacterView } from '../view.ts';
import {
  ATTACK_LABELS,
  armorFor,
  attacks,
  buffOptions,
  damageFor,
  defaultCombatState,
  enhancementSlots,
  lifeFor,
  parseCombatState,
  setBuff,
  shellBody,
  signed,
  type Attack,
  type BuffOption,
  type Chosen,
  type CombatState,
  type Ignored,
  type Line,
} from './combat.ts';
import styles from './play.module.css';

/** Where the calculator choices are kept on this device. */
const combatKey = (id: string) => `sy.combat.${id}`;

function readState(id: string, defaults: CombatState): CombatState {
  try {
    const raw = localStorage.getItem(combatKey(id));
    if (!raw) return defaults;
    return parseCombatState(JSON.parse(raw), defaults);
  } catch {
    return defaults;
  }
}

export function CombatPanel({ view }: { view: CharacterView }) {
  const { ruleset, sheet } = view;
  const [state, setState] = useState<CombatState>(() =>
    readState(view.id, defaultCombatState(sheet)),
  );
  useEffect(() => {
    try {
      localStorage.setItem(combatKey(view.id), JSON.stringify(state));
    } catch {
      // Private mode or full storage: the choices just do not survive a reload.
    }
  }, [view.id, state]);
  const options = useMemo(() => buffOptions(ruleset, sheet), [ruleset, sheet]);
  return (
    <CombatCards
      ruleset={ruleset}
      sheet={sheet}
      options={options}
      state={state}
      setState={setState}
      title="Life, armor, and damage"
      headingLevel={3}
      headingId="combat-heading"
    />
  );
}

export interface CombatCardsProps {
  ruleset: Ruleset;
  sheet: Sheet;
  /** The buffs to offer (`buffOptions`, or the calculator's own list). */
  options: readonly BuffOption[];
  state: CombatState;
  setState: (change: (state: CombatState) => CombatState) => void;
  title: string;
  headingLevel: 2 | 3;
  headingId: string;
}

/** The Life, Armor, and Damage calculators for a sheet, with the choices held by the caller. */
export function CombatCards({
  ruleset,
  sheet,
  options,
  state,
  setState,
  title,
  headingLevel,
  headingId,
}: CombatCardsProps) {
  const update = (patch: Partial<CombatState>) => setState((s) => ({ ...s, ...patch }));

  const list = useMemo(() => attacks(ruleset, sheet), [ruleset, sheet]);
  const chosen: Chosen = state.chosen;
  const pick = (id: string, count: number) =>
    setState((s) => ({ ...s, chosen: { ...setBuff(options, s.chosen, id, count) } }));

  const shell = shellBody(ruleset, sheet);
  const life = lifeFor(ruleset, sheet, options, chosen, state.amplifiedLife);
  const armor = armorFor(ruleset, sheet, options, chosen, {
    covered: state.covered,
    amplified: state.amplifiedArmor,
  });
  const attack = list.find((a) => a.id === state.attack) ?? list[0];
  const damage = attack
    ? damageFor(ruleset, sheet, attack, options, chosen, {
        fromBehind: state.fromBehind,
        dualWield: state.dualWield,
        bonded: state.bonded,
        weakened: state.weakened,
      })
    : null;
  const type = attack?.types.includes(state.type) ? state.type : (attack?.types[0] ?? '');
  const slots = enhancementSlots(sheet, options, chosen, [
    ...life.ignored,
    ...armor.ignored,
    ...(damage?.ignored ?? []),
  ]);
  const anyChosen = Object.keys(chosen).length > 0;
  const physrep = ruleset.ruleset.combat.armorPhysRep;

  return (
    <section aria-labelledby={headingId} className={styles.group}>
      <SectionHeading level={headingLevel} id={headingId}>
        {title}
      </SectionHeading>
      <p className={styles.hint}>
        Open one to tick buffs and armor. The choices stay on this device.
      </p>
      <ul className={styles.calcs}>
        <li>
          <Calc title="Life" value={life.value} meta={`Max ${life.cap} healable`}>
            <Breakdown lines={life.lines} label="Life" />
            <NotCounted list={life.notCounted} />
            <BuffPicker
              what="life"
              options={options.filter((o) => o.buff.life !== undefined)}
              chosen={chosen}
              onPick={pick}
            />
            <Check
              checked={state.amplifiedLife}
              onChange={(v) => update({ amplifiedLife: v })}
              label="In an Amplified Life Enhancement Slot (doubles the Life enhancement)"
            />
            <Result
              text={`Life ${life.value}${life.total > life.cap ? ` (${life.total}, capped at ${life.cap})` : ''}.`}
              ignored={life.ignored}
            />
          </Calc>
        </li>
        <li>
          <Calc
            title="Armor"
            value={armor.value}
            meta={
              shell
                ? 'Your shell is your armor'
                : `${state.covered.filter((l) => physrep.locations.includes(l)).length} of ${physrep.locations.length} locations covered`
            }
          >
            <Breakdown lines={armor.lines} label="Armor" />
            <NotCounted list={armor.notCounted} />
            {shell ? (
              <p className={styles.hint}>
                Your shell counts as your suit of armor; no other phys rep armor adds (Q-RACE-3).
              </p>
            ) : (
              <fieldset className={styles.checks}>
                <legend>Armor phys rep coverage</legend>
                <p className={styles.hint}>
                  {physrep.pointsPerLocation} Armor Points for each location at least half covered.
                </p>
                <div className={styles.locations}>
                  {physrep.locations.map((loc) => (
                    <Check
                      key={loc}
                      checked={state.covered.includes(loc)}
                      onChange={(v) =>
                        update({
                          covered: v
                            ? [...state.covered.filter((l) => l !== loc), loc]
                            : state.covered.filter((l) => l !== loc),
                        })
                      }
                      label={loc}
                    />
                  ))}
                </div>
              </fieldset>
            )}
            <BuffPicker
              what="armor"
              options={options.filter((o) => o.buff.armor !== undefined)}
              chosen={chosen}
              onPick={pick}
            />
            <Check
              checked={state.amplifiedArmor}
              onChange={(v) => update({ amplifiedArmor: v })}
              label="In an Amplified Armor Enhancement Slot (doubles the Armor enhancement)"
            />
            <Result
              text={`Armor ${armor.value}${armor.total > armor.cap ? ` (${armor.total}, capped at ${armor.cap})` : ''}.`}
              ignored={armor.ignored}
            />
          </Calc>
        </li>
        {attack && damage ? (
          <li>
            <Calc
              title="Damage"
              value={damage.total}
              unit={type}
              meta={`${attack.name}, ${ATTACK_LABELS[attack.attack]}`}
            >
              <DamageControls
                list={list}
                attack={attack}
                type={type}
                onAttack={(id) => update({ attack: id, type: '' })}
                onType={(t) => update({ type: t })}
              />
              <fieldset className={styles.checks}>
                <legend>This attack</legend>
                {damage.can.fromBehind ? (
                  <Check
                    checked={state.fromBehind}
                    onChange={(v) => update({ fromBehind: v })}
                    label="From behind (melee)"
                  />
                ) : null}
                {damage.can.dualWield ? (
                  <Check
                    checked={state.dualWield}
                    onChange={(v) => update({ dualWield: v })}
                    label="Dual wielding"
                  />
                ) : null}
                {damage.can.bonded ? (
                  <Check
                    checked={state.bonded}
                    onChange={(v) => update({ bonded: v })}
                    label="With your bonded weapon"
                  />
                ) : null}
                <Check
                  checked={state.weakened}
                  onChange={(v) => update({ weakened: v })}
                  label="Weakened (passive damage halved, cap 10)"
                />
              </fieldset>
              <Breakdown lines={damage.lines} label="Damage" />
              <BuffPicker
                what="damage"
                options={options.filter((o) =>
                  (o.buff.damage ?? []).some((p) => p.attacks.includes(attack.attack)),
                )}
                chosen={chosen}
                onPick={pick}
              />
              <div className={styles.result} aria-live="polite">
                <p>
                  Call: <strong className={styles.call}>{`"${damage.total} ${type}"`}</strong>
                </p>
                <p className={styles.hint}>
                  Passive damage {damage.passiveValue} of the {damage.cap} cap.
                </p>
                {damage.notes.map((n) => (
                  <p key={n} className={styles.hint}>
                    {n}
                  </p>
                ))}
                <IgnoredList ignored={damage.ignored} />
              </div>
            </Calc>
          </li>
        ) : null}
      </ul>
      <div className={styles.slotLine}>
        <p data-over={slots.used > slots.have ? '' : undefined}>
          Enhancement Slots: {slots.used} of {slots.have} used by the ticked buffs
          {slots.used > slots.have ? '. That is more than you have.' : '.'}
        </p>
        {anyChosen ? <Button onClick={() => update({ chosen: {} })}>Clear buffs</Button> : null}
      </div>
    </section>
  );
}

/** A calculator: a button with its total that opens the details below it. */
function Calc({
  title,
  value,
  unit,
  meta,
  children,
}: {
  title: string;
  value: number;
  unit?: string;
  meta: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className={styles.calc}>
      <button
        type="button"
        className={styles.calcHead}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.calcTitle}>
          {title} <span className={styles.calcValue}>{unit ? `${value} ${unit}` : value}</span>
        </span>
        <ChevronDown aria-hidden="true" className={styles.chevron} />
      </button>
      <p className={styles.calcMeta}>{meta}</p>
      <div id={panelId} hidden={!open} className={styles.calcBody}>
        {children}
      </div>
    </div>
  );
}

function Breakdown({ lines, label }: { lines: readonly Line[]; label: string }) {
  if (lines.length === 0) return <p className={styles.hint}>Nothing yet.</p>;
  return (
    <ul className={styles.breakdown} aria-label={`${label} from`}>
      {lines.map((l, i) => (
        <li key={`${l.label}-${i}`}>
          <span>{l.label}</span>
          <span className="num">{signed(l.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

function NotCounted({ list }: { list: readonly string[] }) {
  if (list.length === 0) return null;
  return <p className={styles.hint}>Not counted now: {list.join('; ')}.</p>;
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
}) {
  return (
    <label className={styles.check}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function amountText(option: BuffOption, what: 'life' | 'armor' | 'damage'): string {
  const b = option.buff;
  if (what === 'life') return `+${b.life ?? 0} Life`;
  if (what === 'armor') return `+${b.armor ?? 0} Armor`;
  return (b.damage ?? [])
    .map(
      (p) =>
        `+${p.amount} ${p.attacks.map((a) => ATTACK_LABELS[a]).join('/')}${p.fromBehind ? ' from behind' : ''}`,
    )
    .join(', ');
}

/** "Enhancement Slot, until re-pop or death. Once per re-pop." */
function buffMeta(option: BuffOption): string {
  const b = option.buff;
  const lasts = `${b.lasts.charAt(0).toLowerCase()}${b.lasts.slice(1)}`;
  const list = [
    b.enhancement ? 'Enhancement Slot' : 'no slot',
    lasts,
    option.max > 1 ? `stacks up to ${option.max}` : null,
  ]
    .filter((x): x is string => x !== null)
    .join(', ');
  return b.note ? `${list}. ${b.note}` : list;
}

/** The character's own buffs, then what others and items give, as checkboxes or use counts. */
function BuffPicker({
  what,
  options,
  chosen,
  onPick,
}: {
  what: 'life' | 'armor' | 'damage';
  options: readonly BuffOption[];
  chosen: Chosen;
  onPick: (id: string, count: number) => void;
}) {
  const yours = options.filter((o) => o.yours);
  const given = options.filter((o) => !o.yours);
  const groups: { legend: string; list: BuffOption[] }[] = [
    { legend: 'Your abilities', list: yours },
    { legend: 'From others and items', list: given },
  ];
  return (
    <>
      {groups
        .filter((g) => g.list.length > 0)
        .map((g) => (
          <fieldset key={g.legend} className={styles.checks}>
            <legend>{g.legend}</legend>
            {g.list.map((o) =>
              o.max > 1 ? (
                <Field
                  key={o.buff.id}
                  label={`${o.buff.name} (${amountText(o, what)} each)`}
                  hint={buffMeta(o)}
                >
                  {(control) => (
                    <select
                      {...control}
                      value={chosen[o.buff.id] ?? 0}
                      onChange={(e) => onPick(o.buff.id, Number(e.target.value))}
                    >
                      {Array.from({ length: o.max + 1 }, (_, n) => (
                        <option key={n} value={n}>
                          {n === 0 ? 'Not used' : `${n} ${n === 1 ? 'use' : 'uses'}`}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              ) : (
                <Check
                  key={o.buff.id}
                  checked={(chosen[o.buff.id] ?? 0) > 0}
                  onChange={(v) => onPick(o.buff.id, v ? 1 : 0)}
                  label={
                    <>
                      <strong>
                        {o.buff.name} {amountText(o, what)}
                      </strong>{' '}
                      <span className={styles.hint}>({buffMeta(o)})</span>
                    </>
                  }
                />
              ),
            )}
          </fieldset>
        ))}
    </>
  );
}

function IgnoredList({ ignored }: { ignored: readonly Ignored[] }) {
  return (
    <>
      {ignored.map((b) => (
        <p key={b.id} className={styles.hint}>
          {b.name} does not add: {b.reason}.
        </p>
      ))}
    </>
  );
}

function Result({ text, ignored }: { text: string; ignored: readonly Ignored[] }) {
  return (
    <div className={styles.result} aria-live="polite">
      <p>
        <strong>{text}</strong>
      </p>
      <IgnoredList ignored={ignored} />
    </div>
  );
}

function DamageControls({
  list,
  attack,
  type,
  onAttack,
  onType,
}: {
  list: readonly Attack[];
  attack: Attack;
  type: string;
  onAttack: (id: string) => void;
  onType: (type: string) => void;
}) {
  const weapons = list.filter((a) => !a.id.startsWith('natural:') && a.attack !== 'relic');
  const relics = list.filter((a) => a.attack === 'relic');
  const natural = list.filter((a) => a.id.startsWith('natural:'));
  return (
    <div className={styles.selects}>
      <Field label="Weapon">
        {(control) => (
          <select {...control} value={attack.id} onChange={(e) => onAttack(e.target.value)}>
            <optgroup label="Weapons">
              {weapons.map((a) => (
                <option key={a.id} value={a.id}>
                  {`${a.name} (base ${a.base})`}
                </option>
              ))}
            </optgroup>
            <optgroup label="Relic">
              {relics.map((a) => (
                <option key={a.id} value={a.id}>
                  {`${a.name} (base ${a.base})`}
                </option>
              ))}
            </optgroup>
            {natural.length > 0 ? (
              <optgroup label="Natural weapons">
                {natural.map((a) => (
                  <option key={a.id} value={a.id}>
                    {`${a.name} (base ${a.base})`}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        )}
      </Field>
      {attack.types.length > 1 ? (
        <Field label="Damage type">
          {(control) => (
            <select {...control} value={type} onChange={(e) => onType(e.target.value)}>
              {attack.types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}
    </div>
  );
}
