// The "test build" screen inside the downloaded wiki file. Plain elements and `tb-` classes (its
// styles are in plannerCss.ts); every rule check comes from the engine through buildModel.ts.
import { useId, useState, type ReactNode } from 'react';
import type { Sheet, SheetSkill, SkillStep } from '../engine/index.ts';
import { CATEGORY_TITLES, humanize } from '../ui/routes/wiki/wikiData.ts';
import {
  EMPTY_BUILD,
  addEvent,
  awakenArtifact,
  buildSummary,
  buyStep,
  changePoints,
  leaveCalling,
  loadBuild,
  powerName,
  removableSteps,
  removeArtifactPower,
  removeFamiliar,
  removeStep,
  ruleset,
  saveBuild,
  setArtifactPower,
  setFamiliar,
  sheetOf,
  startBuild,
  startCalling,
  stepLabel,
  undo,
  unlockArtifactSlot,
  type Build,
  type FamiliarInput,
  type PointsCurrency,
  type Result,
  type StorageLike,
} from './buildModel.ts';

type Area = 'start' | 'points' | 'skills' | 'calling' | 'familiar' | 'artifact' | 'tools';
type Status = { area: Area; ok: boolean; text: string } | null;
type Choices = Record<string, string | string[]>;

interface ChoiceDef {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly options?: readonly string[] | undefined;
  readonly multi?: true | undefined;
  readonly summary?: string | undefined;
  readonly excludeOwned?: boolean | undefined;
}

const CURRENCY: Record<string, string> = { xp: 'XP', cxp: 'CXP', axp: 'AXP' };

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A visually hidden addition to a button's name, so "Remove level 2" says which skill. */
function Hidden({ children }: { children: ReactNode }) {
  return <span className="tb-vh">{children}</span>;
}

function StatusLine({ status, area }: { status: Status; area: Area }) {
  const mine = status?.area === area ? status : null;
  return (
    <p role="status" className={mine ? (mine.ok ? 'tb-ok' : 'tb-problem') : 'tb-status'}>
      {mine?.text ?? ''}
    </p>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="tb-card" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="tb-field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
}

// ---- Choices (race and Calling) -------------------------------------------------------------

function choiceOptions(def: ChoiceDef, raceId: string | null): [string, string][] | null {
  const rs = ruleset();
  switch (def.kind) {
    case 'pick':
      return (def.options ?? []).map((o) => [o, humanize(o)]);
    case 'language':
      return rs.ruleset.languages.map((l) => [l.id, l.name]);
    case 'racial-passive':
      return rs.races
        .filter((r) => !(def.excludeOwned && r.id === raceId))
        .flatMap((r) =>
          r.innate
            .filter((i) => i.kind === 'passive')
            .map((i): [string, string] => [i.id, `${r.name}: ${i.summary.slice(0, 70)}`]),
        );
    case 'racial-skill':
      return rs.races
        .filter((r) => !(def.excludeOwned && r.id === raceId))
        .flatMap((r) => r.skills.map((s): [string, string] => [s.id, `${s.name} (${r.name})`]));
    case 'spell-list':
      return rs.spells.map((sp) => [sp.id, `${sp.name} (${humanize(sp.school)}, ${sp.level})`]);
    default:
      return null;
  }
}

function ChoiceFields({
  defs,
  raceId,
  value,
  onChange,
}: {
  defs: readonly ChoiceDef[];
  raceId: string | null;
  value: Choices;
  onChange: (next: Choices) => void;
}) {
  return (
    <>
      {defs.map((def) => {
        const options = choiceOptions(def, raceId);
        const current = value[def.id];
        const set = (v: string | string[]) => onChange({ ...value, [def.id]: v });
        if (options === null)
          return (
            <Field key={def.id} label={def.label}>
              {(id) => (
                <input
                  id={id}
                  type="text"
                  value={typeof current === 'string' ? current : ''}
                  onChange={(e) => set(e.target.value)}
                />
              )}
            </Field>
          );
        if (def.multi || def.kind === 'spell-list') {
          const list = Array.isArray(current) ? current : [];
          return (
            <fieldset key={def.id} className="tb-fieldset">
              <legend>{def.label}</legend>
              <div className="tb-checks">
                {options.map(([id, label]) => (
                  <label key={id} className="tb-check">
                    <input
                      type="checkbox"
                      checked={list.includes(id)}
                      onChange={(e) =>
                        set(e.target.checked ? [...list, id] : list.filter((x) => x !== id))
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        }
        return (
          <Field key={def.id} label={def.label}>
            {(id) => (
              <select
                id={id}
                value={typeof current === 'string' ? current : ''}
                onChange={(e) => set(e.target.value)}
              >
                <option value="">Choose</option>
                {options.map(([oid, label]) => (
                  <option key={oid} value={oid}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        );
      })}
    </>
  );
}

/** Drops empty answers so the engine sees only what was chosen. */
function filled(choices: Choices): Choices {
  const out: Choices = {};
  for (const [k, v] of Object.entries(choices)) {
    if (Array.isArray(v) ? v.length > 0 : v.trim() !== '') out[k] = v;
  }
  return out;
}

// ---- Start ----------------------------------------------------------------------------------

function StartForm({ onResult, status }: { onResult: (r: Result) => void; status: Status }) {
  const rs = ruleset();
  const [name, setName] = useState('');
  const [raceId, setRaceId] = useState('');
  const [choices, setChoices] = useState<Choices>({});
  const race = raceId ? rs.racesById[raceId] : undefined;
  return (
    <Card title="Start a test build">
      <p>
        Plan a character with the real rules: points, skills, a Calling, a familiar, and an
        Artifact. Nothing leaves this device; the build is kept in this browser.
      </p>
      <Field label="Name (optional)">
        {(id) => (
          <input id={id} type="text" value={name} onChange={(e) => setName(e.target.value)} />
        )}
      </Field>
      <Field label="Race">
        {(id) => (
          <select
            id={id}
            value={raceId}
            onChange={(e) => {
              setRaceId(e.target.value);
              setChoices({});
            }}
          >
            <option value="">Choose a race</option>
            {rs.races.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      {race ? (
        <>
          <p className="tb-muted">{race.summary}</p>
          <ChoiceFields
            defs={race.choices.filter((d) => d.kind !== 'language')}
            raceId={race.id}
            value={choices}
            onChange={setChoices}
          />
        </>
      ) : null}
      <button
        type="button"
        className="tb-btn tb-primary"
        onClick={() => {
          if (!raceId) {
            onResult({ ok: false, errors: ['Choose a race first.'] });
            return;
          }
          onResult(startBuild(name, raceId, filled(choices)));
        }}
      >
        Start the test build
      </button>
      <StatusLine status={status} area="start" />
    </Card>
  );
}

// ---- Points and numbers ---------------------------------------------------------------------

function PointsCard({
  build,
  sheet,
  act,
  status,
}: {
  build: Build;
  sheet: Sheet;
  act: (area: Area, r: Result) => void;
  status: Status;
}) {
  const rs = ruleset();
  const [currency, setCurrency] = useState<PointsCurrency>('xp');
  const [amount, setAmount] = useState('10');
  const p = sheet.points;
  const n = Number.parseInt(amount, 10);
  return (
    <Card title="Points">
      <dl className="tb-facts">
        <div>
          <dt>XP</dt>
          <dd>
            {p.xp.available} left of {p.xp.earned} earned (cap {p.xp.cap})
          </dd>
        </div>
        <div>
          <dt>CXP</dt>
          <dd>
            {p.cxp.available} left of {p.cxp.earned} earned
          </dd>
        </div>
        <div>
          <dt>AXP</dt>
          <dd>
            {p.axp.available} left of {p.axp.earned} earned
          </dd>
        </div>
        <div>
          <dt>Events</dt>
          <dd>{sheet.events.length} attended</dd>
        </div>
      </dl>
      <button
        type="button"
        className="tb-btn tb-primary"
        onClick={() => act('points', addEvent(build))}
      >
        Attend a test event
      </button>
      <p className="tb-muted">
        Each event gives {rs.ruleset.xp.perEvent} XP, {rs.ruleset.cxp.perEvent} CXP, and{' '}
        {rs.ruleset.axp.perEvent} AXP. A Calling needs {rs.ruleset.calling.minFullEvents} events
        before the one it starts at.
      </p>
      <div className="tb-row">
        <Field label="Points">
          {(id) => (
            <select
              id={id}
              value={currency}
              onChange={(e) => setCurrency(e.target.value as PointsCurrency)}
            >
              <option value="xp">XP</option>
              <option value="cxp">CXP</option>
              <option value="axp">AXP</option>
            </select>
          )}
        </Field>
        <Field label="Amount">
          {(id) => (
            <input
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
        </Field>
      </div>
      <div className="tb-buttons">
        <button
          type="button"
          className="tb-btn"
          onClick={() => act('points', changePoints(build, currency, n))}
        >
          Add {CURRENCY[currency]}
        </button>
        <button
          type="button"
          className="tb-btn"
          onClick={() => act('points', changePoints(build, currency, -n))}
        >
          Remove {CURRENCY[currency]}
        </button>
      </div>
      <StatusLine status={status} area="points" />
    </Card>
  );
}

function NumbersCard({ sheet }: { sheet: Sheet }) {
  const s = sheet.stats;
  const d = s.passiveDamage;
  const rows: [string, string][] = [
    ['Life Points', String(s.lifePoints.value)],
    ['Armor Points', String(s.armorPoints.value)],
    ['Passive damage, one-handed', `+${d.oneHanded.value}`],
    ['Passive damage, two-handed', `+${d.twoHanded.value}`],
    ['Passive damage, ranged', `+${d.ranged.value}`],
    ['Passive damage, Relic', `+${d.relic.value}`],
    ['Enhancement Slots', String(s.slots.enhancement)],
    ['Attunement Slots', String(s.slots.attunement + s.slots.attunementToolOnly)],
    ['Boon Slots', `${s.slots.greaterBoon} greater, ${s.slots.lesserBoon} lesser`],
    ['Languages', String(s.languages.count)],
  ];
  return (
    <Card title="Sheet numbers">
      <dl className="tb-facts">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

// ---- Skills ---------------------------------------------------------------------------------

function OwnedSkill({
  build,
  skill,
  act,
}: {
  build: Build;
  skill: SheetSkill;
  act: (area: Area, r: Result) => void;
}) {
  const cur = CURRENCY[skill.currency] ?? 'XP';
  const unlocked = skill.abilities.filter((a) => a.unlocked).map((a) => cap(a.named));
  const next = skill.nextTechnique;
  const steps: SkillStep[] = skill.locked ? [] : removableSteps(build, skill.skillId);
  return (
    <li className="tb-skill">
      <h4>
        {skill.displayName}
        {skill.locked ? ' (locked)' : ''}
      </h4>
      <p className="tb-muted">
        Level {skill.level} of {skill.maxLevel}. {skill.maxUses} uses per re-pop.
        {skill.techniques.length
          ? ` Techniques: ${skill.techniques.map(cap).join(', ')}.`
          : ''}{' '}
        Abilities: {unlocked.join(', ') || 'none yet'}. Spent {skill.spent} {cur}.
      </p>
      <div className="tb-buttons">
        {!skill.locked && skill.level < skill.maxLevel && skill.nextLevelCost !== null ? (
          <button
            type="button"
            className="tb-btn"
            onClick={() => act('skills', buyStep(build, skill.skillId, { level: skill.level + 1 }))}
          >
            + Level {skill.level + 1} ({skill.nextLevelCost} {cur})
            <Hidden> for {skill.displayName}</Hidden>
          </button>
        ) : null}
        {!skill.locked && next && next.levelReached ? (
          <button
            type="button"
            className="tb-btn"
            onClick={() =>
              act('skills', buyStep(build, skill.skillId, { technique: next.technique }))
            }
          >
            + {cap(next.technique)} Technique ({next.cost} {cur})
            <Hidden> for {skill.displayName}</Hidden>
          </button>
        ) : null}
        {steps.map((step) => (
          <button
            key={stepLabel(step)}
            type="button"
            className="tb-btn tb-quiet"
            onClick={() => act('skills', removeStep(build, skill.skillId, step))}
          >
            Remove {stepLabel(step)}
            <Hidden> from {skill.displayName}</Hidden>
          </button>
        ))}
      </div>
      {!skill.locked && next && !next.levelReached ? (
        <p className="tb-muted">
          {cap(next.technique)} Technique needs level {next.needsLevel}.
        </p>
      ) : null}
    </li>
  );
}

function SkillsCard({
  build,
  sheet,
  act,
  status,
}: {
  build: Build;
  sheet: Sheet;
  act: (area: Area, r: Result) => void;
  status: Status;
}) {
  const rs = ruleset();
  const [pick, setPick] = useState('');
  const owned = sheet.skills.filter((s) => s.level > 0 || s.techniques.length > 0);
  const ownedIds = new Set(owned.map((s) => s.skillId));
  const raceId = sheet.race?.raceId ?? null;
  const addable = Object.values(rs.skillsById).filter(
    (s) =>
      !ownedIds.has(s.id) &&
      s.category !== 'calling' &&
      (s.category !== 'racial' || s.raceId === raceId),
  );
  const categories = [...new Set(addable.map((s) => s.category))];
  return (
    <Card title="Skills">
      <Field label="Add a skill">
        {(id) => (
          <select id={id} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose a skill</option>
            {categories.map((c) => (
              <optgroup
                key={c}
                label={CATEGORY_TITLES[c as keyof typeof CATEGORY_TITLES] ?? cap(c)}
              >
                {addable
                  .filter((s) => s.category === c)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.advanced ? ' (advanced)' : ''}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        )}
      </Field>
      <button
        type="button"
        className="tb-btn tb-primary"
        onClick={() => {
          if (!pick) {
            act('skills', { ok: false, errors: ['Choose a skill first.'] });
            return;
          }
          act('skills', buyStep(build, pick, { level: 1 }));
          setPick('');
        }}
      >
        Add level 1 ({rs.ruleset.skills.costPerLevel} XP)
      </button>
      <StatusLine status={status} area="skills" />
      {owned.length === 0 ? (
        <p className="tb-muted">No skills yet.</p>
      ) : (
        <ul className="tb-skills">
          {owned.map((s) => (
            <OwnedSkill key={s.skillId} build={build} skill={s} act={act} />
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---- Calling --------------------------------------------------------------------------------

function CallingCard({
  build,
  sheet,
  act,
  status,
}: {
  build: Build;
  sheet: Sheet;
  act: (area: Area, r: Result) => void;
  status: Status;
}) {
  const rs = ruleset();
  const [callingId, setCallingId] = useState('');
  const [choices, setChoices] = useState<Choices>({});
  const active = sheet.calling;
  const calling = callingId ? rs.callingsById[callingId] : undefined;
  const e = sheet.callingEligibility;
  return (
    <Card title="Calling">
      {active ? (
        <>
          <p>
            <strong>{active.name}</strong>. {active.innate.name}: {active.innate.summary}
          </p>
          {active.detriment ? <p className="tb-muted">Detriment: {active.detriment}</p> : null}
          <p className="tb-muted">
            Its skills are in the Skills list and cost CXP. Each Calling Technique needs a test
            event after the Calling started, one per event.
          </p>
          <button
            type="button"
            className="tb-btn"
            onClick={() => act('calling', leaveCalling(build))}
          >
            Leave the Calling
          </button>
        </>
      ) : (
        <>
          <p className="tb-muted">
            {e.fullEvents} full events attended; a Calling needs {e.needed} before the event it
            starts at, and {rs.ruleset.calling.startCostCxp} CXP.
          </p>
          <Field label="Calling">
            {(id) => (
              <select
                id={id}
                value={callingId}
                onChange={(ev) => {
                  setCallingId(ev.target.value);
                  setChoices({});
                }}
              >
                <option value="">Choose a Calling</option>
                {rs.callings.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {calling ? (
            <>
              <p className="tb-muted">{calling.summary}</p>
              <ChoiceFields
                defs={calling.choices ?? []}
                raceId={sheet.race?.raceId ?? null}
                value={choices}
                onChange={setChoices}
              />
            </>
          ) : null}
          <button
            type="button"
            className="tb-btn tb-primary"
            onClick={() => {
              if (!callingId) {
                act('calling', { ok: false, errors: ['Choose a Calling first.'] });
                return;
              }
              act('calling', startCalling(build, callingId, filled(choices)));
            }}
          >
            Start this Calling
          </button>
        </>
      )}
      {sheet.formerCallings.length ? (
        <p className="tb-muted">
          Former Callings: {sheet.formerCallings.map((c) => c.name).join(', ')}.
        </p>
      ) : null}
      <StatusLine status={status} area="calling" />
    </Card>
  );
}

// ---- Familiar -------------------------------------------------------------------------------

const QUALITIES = ['basic', 'expert', 'master', 'grandmaster'] as const;

function FamiliarCard({
  build,
  sheet,
  act,
  status,
}: {
  build: Build;
  sheet: Sheet;
  act: (area: Area, r: Result) => void;
  status: Status;
}) {
  const rs = ruleset();
  const [input, setInput] = useState<FamiliarInput>({ name: '', quality: 'basic', tricks: [] });
  const [trick, setTrick] = useState('');
  const [slots, setSlots] = useState('1');
  const f = sheet.familiar;
  const raceId = sheet.race?.raceId ?? null;
  const skillTricks = Object.values(rs.skillsById)
    .filter(
      (s) =>
        ['offensive', 'defensive', 'utility'].includes(s.category) ||
        (s.category === 'racial' && s.raceId === raceId),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const trickName = (id: string) =>
    rs.familiars.specialTricks.find((t) => t.id === id)?.name ?? rs.skillsById[id]?.name ?? id;
  const slotsFor = rs.familiars.rules.trickSlotsByQuality[input.quality] ?? 0;
  return (
    <Card title="Familiar">
      {f ? (
        <>
          <p>
            <strong>{f.name}</strong>, {f.quality} quality. Trick Slots: {f.slotsUsed} of{' '}
            {f.trickSlots} used.
          </p>
          {f.tricks.length ? (
            <ul className="tb-list">
              {f.tricks.map((t) => (
                <li key={t.id}>
                  {t.name} ({t.slots} {t.slots === 1 ? 'slot' : 'slots'}
                  {t.level ? `, ${t.level}` : ''})
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            className="tb-btn tb-quiet"
            onClick={() => act('familiar', removeFamiliar(build))}
          >
            Remove the familiar
          </button>
          <p className="tb-muted">To change it, fill in the form below and set it again.</p>
        </>
      ) : null}
      <div className="tb-row">
        <Field label="Familiar name">
          {(id) => (
            <input
              id={id}
              type="text"
              value={input.name}
              onChange={(e) => setInput({ ...input, name: e.target.value })}
            />
          )}
        </Field>
        <Field label="Quality">
          {(id) => (
            <select
              id={id}
              value={input.quality}
              onChange={(e) =>
                setInput({ ...input, quality: e.target.value as FamiliarInput['quality'] })
              }
            >
              {QUALITIES.map((q) => (
                <option key={q} value={q}>
                  {cap(q)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <p className="tb-muted">
        {cap(input.quality)} quality gives {slotsFor} Trick {slotsFor === 1 ? 'Slot' : 'Slots'}.
      </p>
      <div className="tb-row">
        <Field label="Trick">
          {(id) => (
            <select id={id} value={trick} onChange={(e) => setTrick(e.target.value)}>
              <option value="">Choose a trick</option>
              <optgroup label="Special tricks">
                {rs.familiars.specialTricks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Skill tricks">
                {skillTricks.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            </select>
          )}
        </Field>
        <Field label="Slots">
          {(id) => (
            <select id={id} value={slots} onChange={(e) => setSlots(e.target.value)}>
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          )}
        </Field>
      </div>
      <div className="tb-buttons">
        <button
          type="button"
          className="tb-btn"
          onClick={() => {
            if (!trick) return;
            setInput({
              ...input,
              tricks: [
                ...input.tricks.filter((t) => t.id !== trick),
                { id: trick, slots: Number(slots) },
              ],
            });
            setTrick('');
          }}
        >
          Add the trick to the form
        </button>
      </div>
      {input.tricks.length ? (
        <ul className="tb-list">
          {input.tricks.map((t) => (
            <li key={t.id}>
              {trickName(t.id)} ({t.slots}){' '}
              <button
                type="button"
                className="tb-link"
                onClick={() =>
                  setInput({ ...input, tricks: input.tricks.filter((x) => x.id !== t.id) })
                }
              >
                Take off {trickName(t.id)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        className="tb-btn tb-primary"
        onClick={() => act('familiar', setFamiliar(build, input))}
      >
        {f ? 'Set the familiar again' : 'Set the familiar'}
      </button>
      <StatusLine status={status} area="familiar" />
    </Card>
  );
}

// ---- Artifact -------------------------------------------------------------------------------

function powerChoices(
  kind: string | undefined,
  options: readonly string[] | undefined,
): [string, string][] | null {
  const rs = ruleset();
  if (options?.length) return options.map((o) => [o, humanize(o)]);
  switch (kind) {
    case 'language':
      return rs.ruleset.languages.map((l) => [l.id, l.name]);
    case 'condition':
      return rs.artifacts.allowedConditions.map((c) => [c.id, c.label]);
    case 'skill':
      return Object.values(rs.skillsById).map((s) => [s.id, s.name]);
    default:
      return null;
  }
}

function ArtifactCard({
  build,
  sheet,
  act,
  status,
}: {
  build: Build;
  sheet: Sheet;
  act: (area: Area, r: Result) => void;
  status: Status;
}) {
  const rs = ruleset();
  const [name, setName] = useState('');
  const [powerId, setPowerId] = useState('');
  const [choice, setChoice] = useState('');
  const a = sheet.artifact;
  const power = rs.artifacts.powers.find((p) => p.id === powerId);
  const options = power?.choice ? powerChoices(power.choice, power.choiceOptions) : null;
  const tiers = [...new Set(rs.artifacts.powers.map((p) => p.tier))].sort();
  return (
    <Card title="Artifact">
      {!a ? (
        <>
          <p className="tb-muted">
            A character can awaken an Artifact at {rs.ruleset.artifact.minXpEarned} XP earned. Each
            Power Slot costs {rs.ruleset.artifact.slotCostAxp} AXP, up to{' '}
            {rs.ruleset.artifact.maxSlots}; a power fills slots equal to its tier.
          </p>
          <Field label="Artifact name">
            {(id) => (
              <input id={id} type="text" value={name} onChange={(e) => setName(e.target.value)} />
            )}
          </Field>
          <button
            type="button"
            className="tb-btn tb-primary"
            onClick={() => act('artifact', awakenArtifact(build, name))}
          >
            Awaken the Artifact ({rs.ruleset.artifact.awakenCostAxp} AXP)
          </button>
        </>
      ) : (
        <>
          <p>
            <strong>{a.name}</strong>. Slots: {a.slotsUnlocked} unlocked of {a.maxSlots},{' '}
            {a.slotsUsed} used, {a.slotsFree} free.
          </p>
          {a.nextSlotCost !== null ? (
            <button
              type="button"
              className="tb-btn"
              onClick={() => act('artifact', unlockArtifactSlot(build))}
            >
              Unlock a slot ({a.nextSlotCost} AXP)
            </button>
          ) : null}
          {a.powers.length ? (
            <ul className="tb-list">
              {a.powers.map((p) => (
                <li key={p.entryId}>
                  {powerName(p.powerId, p.choice)} (Tier {p.tier}){' '}
                  <button
                    type="button"
                    className="tb-link"
                    onClick={() => act('artifact', removeArtifactPower(build, p.entryId))}
                  >
                    Remove {powerName(p.powerId, p.choice)}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <Field label="Power">
            {(id) => (
              <select
                id={id}
                value={powerId}
                onChange={(e) => {
                  setPowerId(e.target.value);
                  setChoice('');
                }}
              >
                <option value="">Choose a power</option>
                {tiers.map((t) => (
                  <optgroup key={t} label={`Tier ${t}`}>
                    {rs.artifacts.powers
                      .filter((p) => p.tier === t)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            )}
          </Field>
          {power ? <p className="tb-muted">{power.summary}</p> : null}
          {power?.choice ? (
            <Field label={`Choose the ${power.choice}`}>
              {(id) =>
                options ? (
                  <select id={id} value={choice} onChange={(e) => setChoice(e.target.value)}>
                    <option value="">Choose</option>
                    {options.map(([oid, label]) => (
                      <option key={oid} value={oid}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={id}
                    type="text"
                    value={choice}
                    onChange={(e) => setChoice(e.target.value)}
                  />
                )
              }
            </Field>
          ) : null}
          <button
            type="button"
            className="tb-btn tb-primary"
            onClick={() => {
              if (!powerId) {
                act('artifact', { ok: false, errors: ['Choose a power first.'] });
                return;
              }
              act('artifact', setArtifactPower(build, powerId, choice));
            }}
          >
            Set the power
          </button>
        </>
      )}
      <StatusLine status={status} area="artifact" />
    </Card>
  );
}

// ---- Tools ----------------------------------------------------------------------------------

function ToolsCard({
  build,
  sheet,
  onBuild,
  setStatus,
  status,
}: {
  build: Build;
  sheet: Sheet;
  onBuild: (b: Build) => void;
  setStatus: (s: Status) => void;
  status: Status;
}) {
  const [confirming, setConfirming] = useState(false);
  const summary = buildSummary(sheet);
  const id = useId();
  return (
    <Card title="This build">
      <div className="tb-buttons">
        <button
          type="button"
          className="tb-btn"
          onClick={() => {
            onBuild(undo(build));
            setStatus({ area: 'tools', ok: true, text: 'Took back the last change.' });
          }}
        >
          Undo the last change
        </button>
        {confirming ? (
          <button
            type="button"
            className="tb-btn tb-danger"
            onClick={() => {
              onBuild(EMPTY_BUILD);
              setConfirming(false);
              setStatus({ area: 'start', ok: true, text: 'Started over.' });
            }}
          >
            Yes, start over
          </button>
        ) : (
          <button type="button" className="tb-btn tb-quiet" onClick={() => setConfirming(true)}>
            Start over
          </button>
        )}
      </div>
      <label htmlFor={id}>Summary to copy</label>
      <textarea id={id} className="tb-summary" readOnly rows={8} value={summary} />
      <button
        type="button"
        className="tb-btn"
        onClick={() => {
          const done = () => setStatus({ area: 'tools', ok: true, text: 'Copied the summary.' });
          const fallback = () => {
            const box = document.getElementById(id) as HTMLTextAreaElement | null;
            box?.select();
            setStatus({
              area: 'tools',
              ok: true,
              text: 'Selected the summary: copy it from the box.',
            });
          };
          try {
            void navigator.clipboard.writeText(summary).then(done, fallback);
          } catch {
            fallback();
          }
        }}
      >
        Copy the summary
      </button>
      <StatusLine status={status} area="tools" />
    </Card>
  );
}

// ---- The screen -----------------------------------------------------------------------------

export function Planner({ storage }: { storage: StorageLike | null }) {
  const [build, setBuildState] = useState<Build>(() => loadBuild(storage));
  const [status, setStatus] = useState<Status>(null);
  const setBuild = (next: Build) => {
    setBuildState(next);
    saveBuild(storage, next);
  };
  const act = (area: Area, result: Result) => {
    if (result.ok) {
      setBuild(result.build);
      setStatus({ area, ok: true, text: result.message });
    } else setStatus({ area, ok: false, text: result.errors.join(' ') });
  };
  const sheet = sheetOf(build);
  if (!sheet.created)
    return (
      <div className="tb">
        <StartForm onResult={(r) => act('start', r)} status={status} />
      </div>
    );
  return (
    <div className="tb">
      <p className="tb-title">
        <strong>{sheet.profile.characterName}</strong>, {sheet.race?.name}
        {sheet.calling ? `, ${sheet.calling.name}` : ''}. XP {sheet.points.xp.available} left.
      </p>
      <PointsCard build={build} sheet={sheet} act={act} status={status} />
      <SkillsCard build={build} sheet={sheet} act={act} status={status} />
      <NumbersCard sheet={sheet} />
      <CallingCard build={build} sheet={sheet} act={act} status={status} />
      <FamiliarCard build={build} sheet={sheet} act={act} status={status} />
      <ArtifactCard build={build} sheet={sheet} act={act} status={status} />
      <ToolsCard
        build={build}
        sheet={sheet}
        onBuild={setBuild}
        setStatus={setStatus}
        status={status}
      />
    </div>
  );
}
