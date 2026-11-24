// Play Tracker: Health and Armor cards side by side, Damage full width under them (stacked on
// phones). Each card shows its total first, then its buffs grouped Permanent, Repop, Encounter.
// Damage keeps up to 5 saved lines. The choices are kept on this device per character, so they
// survive a reload mid-fight. `CombatCards` is the same three cards for any sheet and any saved
// state; the stand-alone Soak and Damage Calculator (`#/calculator`) uses it with a sheet built
// from its form.
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ChevronDown, Minus, Plus } from 'lucide-react';
import type { Ruleset, Sheet } from '../../../../engine/index.ts';
import { Button, Card, IconButton, SectionHeading } from '../../../components/index.ts';
import type { CharacterView } from '../view.ts';
import {
  addDamageLine,
  ARMOR_LOCATIONS,
  armorBuffs,
  armorLines,
  attacks,
  buffTotals,
  changeLineAttack,
  chooseInGroup,
  clampRawMagic,
  combatKey,
  DAMAGE_ENHANCEMENTS,
  damageBuffs,
  damageFor,
  groupByTiming,
  hasRawMagicEnhancement,
  healthBuffs,
  healthLines,
  isWeapon,
  lineAttack,
  lineGear,
  lineName,
  lineType,
  MAX_DAMAGE_LINES,
  permanentDamage,
  physrepArmor,
  RAW_MAGIC_MAX,
  readCombatState,
  reflexArmor,
  removeDamageLine,
  SCOPES,
  takesScope,
  TEMP_ENHANCEMENTS,
  TIMINGS,
  toggleBuff,
  toggleOpen,
  withDefaultNames,
  type Attack,
  type Buff,
  type CombatState,
  type DamageLineState,
  type GearOption,
  type Line,
  type Timing,
} from './combat.ts';
import expand from '../expand.module.css';
import styles from './play.module.css';

const SLOT_HINT = 'Only the highest buff in a buff slot counts. Unslotted bonuses add on.';

function sum(lines: readonly Line[]): number {
  return lines.reduce((total, l) => total + l.amount, 0);
}

function timingTitle(id: Timing): string {
  return TIMINGS.find((t) => t.id === id)?.title ?? id;
}

/** Level of the section heading; cards sit one level under it and buff groups two. */
type SectionLevel = 2 | 3;

const SectionLevelContext = createContext<SectionLevel>(3);

/** The Play Tracker's cards for one character, with choices kept in `rw.combat.<id>`. */
export function CombatPanel({ view }: { view: CharacterView }) {
  const { ruleset, sheet } = view;
  const [state, setState] = useState<CombatState>(() => {
    const stored = readCombatState(view.id);
    return { ...stored, lines: withDefaultNames(stored.lines, attacks(ruleset, sheet)) };
  });
  useEffect(() => {
    try {
      localStorage.setItem(combatKey(view.id), JSON.stringify(state));
    } catch {
      // Private mode or full storage: the choices just do not survive a reload.
    }
  }, [view.id, state]);
  return <CombatCards ruleset={ruleset} sheet={sheet} state={state} setState={setState} />;
}

export interface CombatCardsProps {
  ruleset: Ruleset;
  sheet: Sheet;
  state: CombatState;
  setState: (fn: (s: CombatState) => CombatState) => void;
  /** Section heading text. Defaults to the Play Tracker's. */
  title?: string;
  /** Section heading level (default 3, under the Play Tracker's h2). */
  level?: SectionLevel;
}

/** Health, Armor, and Damage cards for a sheet; the caller keeps the state. */
export function CombatCards({
  ruleset,
  sheet,
  state,
  setState,
  title = 'Health, armor, and damage',
  level = 3,
}: CombatCardsProps) {
  const list = useMemo(() => attacks(ruleset, sheet), [ruleset, sheet]);
  const update = (patch: Partial<CombatState>) => setState((s) => ({ ...s, ...patch }));
  const cardLevel = (level + 1) as 3 | 4;

  // Health
  const hLines = useMemo(() => healthLines(ruleset, sheet), [ruleset, sheet]);
  const hBuffs = useMemo(() => healthBuffs(ruleset, sheet), [ruleset, sheet]);
  const hChosen = new Set(state.health);
  const hTotals = buffTotals(hBuffs, hChosen);
  const maxHealth = sum(hLines);
  const health = maxHealth + (hTotals.slot?.amount ?? 0) + hTotals.extra;

  // Armor
  const aLines = useMemo(() => armorLines(ruleset, sheet), [ruleset, sheet]);
  const aBuffs = useMemo(() => armorBuffs(ruleset, sheet), [ruleset, sheet]);
  const aChosen = new Set(state.armor);
  const aTotals = buffTotals(aBuffs, aChosen);
  const covered = state.covered.filter((l) => (ARMOR_LOCATIONS as readonly string[]).includes(l));
  const physrep = physrepArmor(sheet, covered.length);
  const reflex = reflexArmor(sheet, covered.length);
  const baseArmor = sum(aLines) + physrep.amount + reflex.amount;
  const armor = baseArmor + (aTotals.slot?.amount ?? 0) + aTotals.extra;
  const armorPermanent: Line[] = [
    ...aLines,
    ...(physrep.amount > 0
      ? [{ label: `Armor phys rep (${covered.length} locations)`, amount: physrep.amount }]
      : []),
    ...(reflex.amount > 0 ? [{ label: 'Reflexes', amount: reflex.amount }] : []),
  ];

  return (
    <SectionLevelContext.Provider value={level}>
      <section aria-labelledby="combat-heading" className={styles.group}>
        <div className={styles.groupHead}>
          <div className={styles.groupTitle}>
            <SectionHeading level={level} id="combat-heading">
              {title}
            </SectionHeading>
          </div>
        </div>
        <div className={styles.cards}>
          <Card title="Health" headingLevel={cardLevel} className={styles.statCard ?? ''}>
            <Total label="Health" value={health} />
            <p className={styles.note}>Max {maxHealth}</p>
            <Disclosure
              label="Buffs and details"
              open={state.open.includes('health')}
              onToggle={() => update({ open: toggleOpen(state.open, 'health') })}
            >
              <p className={styles.note}>{SLOT_HINT}</p>
              <TimingGroup timing="permanent">
                <ReadOnlyLines lines={hLines} label="Max Health" />
              </TimingGroup>
              {groupByTiming(hBuffs).map((g) => (
                <TimingGroup key={g.timing} timing={g.timing}>
                  <BuffChoices
                    buffs={g.buffs}
                    chosen={hChosen}
                    onToggle={(id) => update({ health: [...toggleBuff(hBuffs, hChosen, id)] })}
                    onGroup={(group, id) =>
                      update({ health: [...chooseInGroup(hBuffs, hChosen, group, id)] })
                    }
                  />
                </TimingGroup>
              ))}
              <Ignored ignored={hTotals.ignored} />
            </Disclosure>
          </Card>
          <Card title="Armor" headingLevel={cardLevel} className={styles.statCard ?? ''}>
            <Total label="Armor" value={armor} />
            <p className={styles.note}>{covered.length} of 7 locations covered</p>
            <Disclosure
              label="Buffs and details"
              open={state.open.includes('armor')}
              onToggle={() => update({ open: toggleOpen(state.open, 'armor') })}
            >
              <p className={styles.note}>{SLOT_HINT}</p>
              <TimingGroup timing="permanent">
                <ReadOnlyLines lines={armorPermanent} label="Armor" />
                <fieldset className={styles.checks}>
                  <legend>Armor phys rep coverage</legend>
                  <p className={expand.muted}>
                    2 armor a covered location (at least half covered)
                    {physrep.upgraded > 0
                      ? `; ${physrep.upgraded} of them give 5 from the Armor skill`
                      : ''}
                    .
                  </p>
                  {ARMOR_LOCATIONS.map((loc) => (
                    <label key={loc} className={styles.check}>
                      <input
                        type="checkbox"
                        checked={covered.includes(loc)}
                        onChange={(e) =>
                          update({
                            covered: e.target.checked
                              ? [...covered, loc]
                              : covered.filter((l) => l !== loc),
                          })
                        }
                      />
                      <span>{loc}</span>
                    </label>
                  ))}
                </fieldset>
                {reflex.blocked ? <p className={expand.muted}>{reflex.blocked}</p> : null}
              </TimingGroup>
              {groupByTiming(aBuffs).map((g) => (
                <TimingGroup key={g.timing} timing={g.timing}>
                  <BuffChoices
                    buffs={g.buffs}
                    chosen={aChosen}
                    onToggle={(id) => update({ armor: [...toggleBuff(aBuffs, aChosen, id)] })}
                    onGroup={(group, id) =>
                      update({ armor: [...chooseInGroup(aBuffs, aChosen, group, id)] })
                    }
                  />
                </TimingGroup>
              ))}
              <Ignored ignored={aTotals.ignored} />
            </Disclosure>
          </Card>
          <DamageCard
            ruleset={ruleset}
            sheet={sheet}
            list={list}
            state={state}
            update={update}
            setState={setState}
            cardLevel={cardLevel}
          />
        </div>
      </section>
    </SectionLevelContext.Provider>
  );
}

/** The big number at the top of a card; the hidden label makes it read "Health 40". */
function Total({ label, value }: { label: string; value: number }) {
  return (
    <p className={styles.total} aria-live="polite">
      <span className="visually-hidden">{label} </span>
      {value}
    </p>
  );
}

/** One button per card that shows or hides its buffs and details; closed by default. */
function Disclosure({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = useId();
  return (
    <>
      <button
        type="button"
        className={styles.disclosure}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span>{label}</span>
        <ChevronDown
          aria-hidden="true"
          className={open ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron}
        />
      </button>
      {open ? (
        <div id={panelId} className={styles.disclosureBody}>
          {children}
        </div>
      ) : null}
    </>
  );
}

function TimingGroup({ timing, children }: { timing: Timing; children: ReactNode }) {
  const Heading = useContext(SectionLevelContext) === 2 ? 'h4' : 'h5';
  return (
    <div className={styles.timing}>
      <Heading className={styles.timingTitle}>{timingTitle(timing)}</Heading>
      {children}
    </div>
  );
}

function ReadOnlyLines({ lines, label }: { lines: readonly Line[]; label: string }) {
  if (lines.length === 0) return <p className={styles.note}>Nothing from the sheet.</p>;
  return (
    <ul className={styles.fixed} aria-label={`${label} from`}>
      {lines.map((l) => (
        <li key={l.label}>
          {l.label}: <span className="num">{l.amount >= 0 ? `+${l.amount}` : l.amount}</span>
        </li>
      ))}
    </ul>
  );
}

function buffMeta(b: Buff): string {
  return `(${b.source}, ${b.kind === 'slot' ? 'buff slot, ' : ''}${b.lasts})`;
}

/**
 * Checkboxes for buffs; an either/or group with more than one buff (Tactics) is one select.
 * A group with one buff here (a single Blessing of Nature) stays a checkbox.
 */
function BuffChoices({
  buffs,
  chosen,
  onToggle,
  onGroup,
}: {
  buffs: readonly Buff[];
  chosen: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onGroup: (group: string, id: string | null) => void;
}) {
  const shown = new Set<string>();
  return (
    <div className={styles.checks}>
      {buffs.map((b) => {
        const members = b.group ? buffs.filter((x) => x.group === b.group) : [b];
        if (members.length > 1 && b.group) {
          if (shown.has(b.group)) return null;
          shown.add(b.group);
          return (
            <GroupSelect
              key={b.group}
              group={b.group}
              members={members}
              chosen={chosen}
              onGroup={onGroup}
            />
          );
        }
        return (
          <label key={b.id} className={styles.check}>
            <input type="checkbox" checked={chosen.has(b.id)} onChange={() => onToggle(b.id)} />
            <span>
              <strong>
                {b.name} +{b.amount}
              </strong>{' '}
              <span className={expand.muted}>{buffMeta(b)}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function GroupSelect({
  group,
  members,
  chosen,
  onGroup,
}: {
  group: string;
  members: readonly Buff[];
  chosen: ReadonlySet<string>;
  onGroup: (group: string, id: string | null) => void;
}) {
  const id = useId();
  const first = members[0];
  if (!first) return null;
  const value = members.find((m) => chosen.has(m.id))?.id ?? '';
  return (
    <div className={styles.selectField}>
      <label htmlFor={id}>{first.name}</label>
      <select id={id} value={value} onChange={(e) => onGroup(group, e.target.value || null)}>
        <option value="">None</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {`${m.name} +${m.amount}`}
          </option>
        ))}
      </select>
      <span className={styles.note}>{buffMeta(first)}</span>
    </div>
  );
}

function Ignored({ ignored }: { ignored: readonly Buff[] }) {
  if (ignored.length === 0) return null;
  return (
    <div aria-live="polite">
      {ignored.map((b) => (
        <p key={b.id} className={expand.muted}>
          {b.name} does not add: a higher buff in a buff slot counts instead.
        </p>
      ))}
    </div>
  );
}

// ---------- Damage ----------

function DamageCard({
  ruleset,
  sheet,
  list,
  state,
  update,
  setState,
  cardLevel,
}: {
  ruleset: Ruleset;
  sheet: Sheet;
  list: readonly Attack[];
  state: CombatState;
  update: (patch: Partial<CombatState>) => void;
  setState: (fn: (s: CombatState) => CombatState) => void;
  cardLevel: 3 | 4;
}) {
  const buffs = useMemo(() => damageBuffs(ruleset, sheet), [ruleset, sheet]);
  const permanent = useMemo(() => permanentDamage(ruleset, sheet), [ruleset, sheet]);
  const chosen = new Set(state.damage);
  const precision = sheet.skills.some((s) => s.skillId === 'precision');
  const stunMastery = sheet.skills.some(
    (s) => s.skillId === 'stun' && s.parts.some((p) => p.part === 'mastery' && p.level > 0),
  );
  const rawMagic = hasRawMagicEnhancement(sheet);
  const options = {
    fromBehind: precision && state.fromBehind,
    targetStunned: stunMastery && state.stunned,
    rawMagic: rawMagic ? state.rawMagic : 0,
  };
  const full = state.lines.length >= MAX_DAMAGE_LINES;
  const setLine = (id: string, change: (l: DamageLineState) => DamageLineState) =>
    setState((s) => ({ ...s, lines: s.lines.map((l) => (l.id === id ? change(l) : l)) }));
  const groups = groupByTiming(buffs);
  const rows = state.lines.flatMap((line) => {
    const attack = lineAttack(line, list);
    if (!attack) return [];
    const result = damageFor(
      ruleset,
      sheet,
      attack,
      buffs,
      chosen,
      options,
      lineGear(line, attack),
    );
    return [{ line, attack, result, call: `${result.total} ${lineType(line, attack)}` }];
  });

  return (
    <Card
      title="Damage"
      headingLevel={cardLevel}
      className={`${styles.statCard} ${styles.damageCard}`}
    >
      <ul className={styles.calls} aria-label="Damage calls">
        {rows.map(({ line, attack, call }) => (
          <li key={line.id} className={styles.callRow}>
            <span className={styles.lineName}>{lineName(line, attack)}</span>
            <strong className={styles.call}>{call}</strong>
          </li>
        ))}
      </ul>
      <Disclosure
        label="Edit lines and buffs"
        open={state.open.includes('damage')}
        onToggle={() => update({ open: toggleOpen(state.open, 'damage') })}
      >
        <ol className={styles.damageLines} aria-label="Damage lines">
          {rows.map(({ line, attack, result }, index) => (
            <DamageLineRow
              key={line.id}
              index={index}
              line={line}
              attack={attack}
              list={list}
              result={result}
              removable={state.lines.length > 1}
              onChange={(change) => setLine(line.id, change)}
              onRemove={() =>
                setState((s) => ({ ...s, lines: removeDamageLine(s.lines, line.id) }))
              }
            />
          ))}
        </ol>
        <div className={styles.addLine}>
          <Button
            disabled={full}
            {...(full ? { disabledReason: `Up to ${MAX_DAMAGE_LINES} damage lines.` } : {})}
            onClick={() => setState((s) => ({ ...s, lines: addDamageLine(s.lines, list) }))}
          >
            Add a damage line
          </Button>
        </div>
        <p className={styles.note}>
          Buffs below apply to every line. Only the highest damage buff in a buff slot counts.
        </p>
        <TimingGroup timing="permanent">
          {permanent.length > 0 ? (
            <ul className={styles.fixed} aria-label="Permanent damage from the sheet">
              {permanent.map((p) => (
                <li key={p.id}>
                  {p.label}: <span className="num">+{p.amount}</span>{' '}
                  <span className={expand.muted}>({p.detail})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.note}>Nothing from the sheet.</p>
          )}
          {precision ? (
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={state.fromBehind}
                onChange={(e) => update({ fromBehind: e.target.checked })}
              />
              <span>From behind (Precision, fist or short weapon)</span>
            </label>
          ) : null}
        </TimingGroup>
        {groups.map((g) => (
          <TimingGroup key={g.timing} timing={g.timing}>
            <BuffChoices
              buffs={g.buffs}
              chosen={chosen}
              onToggle={(id) => update({ damage: [...toggleBuff(buffs, chosen, id)] })}
              onGroup={(group, id) =>
                update({ damage: [...chooseInGroup(buffs, chosen, group, id)] })
              }
            />
            {g.timing === 'encounter' && rawMagic ? (
              <Stepper
                label="Raw Magic Enhancement stacks"
                hint="+1 packet damage each"
                value={state.rawMagic}
                max={RAW_MAGIC_MAX}
                onChange={(v) => update({ rawMagic: clampRawMagic(v) })}
              />
            ) : null}
            {g.timing === 'encounter' && stunMastery ? (
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={state.stunned}
                  onChange={(e) => update({ stunned: e.target.checked })}
                />
                <span>Target is Stunned (Stun Mastery)</span>
              </label>
            ) : null}
          </TimingGroup>
        ))}
      </Disclosure>
    </Card>
  );
}

function DamageLineRow({
  index,
  line,
  attack,
  list,
  result,
  removable,
  onChange,
  onRemove,
}: {
  index: number;
  line: DamageLineState;
  attack: Attack;
  list: readonly Attack[];
  result: ReturnType<typeof damageFor>;
  removable: boolean;
  onChange: (change: (l: DamageLineState) => DamageLineState) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const name = lineName(line, attack);
  const type = lineType(line, attack);
  const call = `${result.total} ${type}`;
  const weapons = list.filter((a) => a.kind !== 'packet');
  const packets = list.filter((a) => a.kind === 'packet');
  return (
    <li className={styles.damageLine} aria-label={`Damage line ${index + 1}`}>
      <div className={styles.lineHead}>
        <span className={styles.lineName}>{name}</span>
        <p aria-live="polite">
          Call: <strong className={styles.call}>{`"${call}"`}</strong>
        </p>
      </div>
      <div className={styles.selects}>
        <div className={styles.selectField}>
          <label htmlFor={`${id}-name`}>Name</label>
          <input
            id={`${id}-name`}
            type="text"
            autoComplete="off"
            maxLength={60}
            value={line.name}
            onChange={(e) => onChange((l) => ({ ...l, name: e.target.value }))}
          />
        </div>
        <div className={styles.selectField}>
          <label htmlFor={`${id}-attack`}>Weapon or packet</label>
          <select
            id={`${id}-attack`}
            value={attack.id}
            onChange={(e) => onChange((l) => changeLineAttack(l, list, e.target.value))}
          >
            <optgroup label="Weapons">
              {weapons.map((a) => (
                <option key={a.id} value={a.id}>
                  {`${a.name} (${a.base})`}
                </option>
              ))}
            </optgroup>
            {packets.length > 0 ? (
              <optgroup label="Passive magic packets">
                {packets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {`${a.name} (${a.base})`}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </div>
        {attack.types.length > 1 ? (
          <div className={styles.selectField}>
            <label htmlFor={`${id}-type`}>Damage type</label>
            <select
              id={`${id}-type`}
              value={type}
              onChange={(e) => onChange((l) => ({ ...l, type: e.target.value }))}
            >
              {attack.types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {isWeapon(attack) ? (
          <>
            <GearSelect
              id={`${id}-enhancement`}
              label="Damage Enhancement"
              options={DAMAGE_ENHANCEMENTS}
              value={line.enhancement}
              onChange={(v) => onChange((l) => ({ ...l, enhancement: v }))}
            />
            <GearSelect
              id={`${id}-temp`}
              label="Temporary enhancement"
              options={TEMP_ENHANCEMENTS}
              value={line.temp}
              onChange={(v) => onChange((l) => ({ ...l, temp: v }))}
            />
          </>
        ) : null}
        {takesScope(attack) ? (
          <GearSelect
            id={`${id}-scope`}
            label="Scope"
            options={SCOPES}
            value={line.scope}
            onChange={(v) => onChange((l) => ({ ...l, scope: v }))}
          />
        ) : null}
      </div>
      <ReadOnlyLines lines={result.lines} label={`${name} damage`} />
      {result.notes.map((n) => (
        <p key={n} className={expand.muted}>
          {n}
        </p>
      ))}
      {removable ? (
        <div>
          <Button aria-label={`Remove line ${name}`} onClick={onRemove}>
            Remove line
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function GearSelect<Id extends string>({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: readonly GearOption<Id>[];
  value: Id;
  onChange: (value: Id) => void;
}) {
  return (
    <div className={styles.selectField}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const next = options.find((o) => o.id === e.target.value);
          if (next) onChange(next.id);
        }}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.amount > 0 ? `${o.name} +${o.amount}` : o.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** `[-] 3 [+]` for Raw Magic Enhancement stacks; aria-disabled keeps focus at the limits. */
function Stepper({
  label,
  hint,
  value,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={`${id}-label`} className={styles.stepper}>
      <span id={`${id}-label`} className={styles.stepperLabel}>
        {label} <span className={expand.muted}>({hint})</span>
      </span>
      <div className={styles.stepperControls}>
        <IconButton
          variant="ghost"
          aria-label={`Fewer ${label}`}
          aria-disabled={value > 0 ? undefined : true}
          icon={<Minus />}
          onClick={() => {
            if (value > 0) onChange(value - 1);
          }}
        />
        <span className={styles.stepperValue} aria-live="polite" aria-atomic="true">
          {value}
        </span>
        <IconButton
          variant="ghost"
          aria-label={`More ${label}`}
          aria-disabled={value < max ? undefined : true}
          icon={<Plus />}
          onClick={() => {
            if (value < max) onChange(value + 1);
          }}
        />
      </div>
    </div>
  );
}
