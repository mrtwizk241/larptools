// `#/events/:key/register/:characterId`: pre-register a character for an event. The player picks
// how they come, Mist Token purchases, check-in income choices (Merchanting), and how upkeep is
// paid. The rules engine checks it live; staff see it on the pull list and finish the check-in.
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, ApiError } from '../../../api/client.ts';
import type { RegistrationEntry } from '../../../api/contract.ts';
import {
  PREREG_PURCHASES,
  checkRegistration,
  type CheckInChoices,
  type RegistrationPlan,
  type Ruleset,
} from '../../../engine/index.ts';
import type { GameEvent, NamedLevelId, StoredCharacter } from '../../../engine/model.ts';
import { isStaffRole, useOptionalAuth } from '../../auth/authContext.ts';
import { Alert, Button, Card, Field, useToast } from '../../components/index.ts';
import { useSheet } from '../../data/engineHooks.ts';
import { useRegistrations } from '../../data/registrations.ts';
import { dateText } from '../../lib/names.ts';
import { useEvents } from '../../lib/useEvents.ts';
import { Screen } from '../../Screen.tsx';
import { today, upkeepReasonText, withoutPaidChoice } from '../character/checkin/checkInModel.ts';
import { IncomeChoices } from '../character/checkin/IncomeChoices.tsx';
import { ErrorList } from '../character/ErrorList.tsx';
import { levelName, priceText, soldLevels } from '../character/points/purchases.ts';
import styles from './events.module.css';
import { checkedInKeys, preRegisterBlock } from './preRegister.ts';

type PurchaseState = Record<string, { qty: number; namedLevel?: NamedLevelId }>;

const DEFAULT_PLAN: RegistrationPlan = {
  attendance: 'player',
  purchases: [],
  choices: {},
  note: '',
};

function toPurchaseState(plan: RegistrationPlan): PurchaseState {
  const out: PurchaseState = {};
  for (const p of plan.purchases)
    out[p.purchaseId] = { qty: p.qty, ...(p.namedLevel ? { namedLevel: p.namedLevel } : {}) };
  return out;
}

function fromPurchaseState(state: PurchaseState): RegistrationPlan['purchases'] {
  return Object.entries(state)
    .filter(([, v]) => v.qty > 0)
    .map(([purchaseId, v]) => ({
      purchaseId,
      qty: v.qty,
      ...(v.namedLevel ? { namedLevel: v.namedLevel } : {}),
    }));
}

export function RegistrationPage() {
  const { key = '', characterId = '' } = useParams();
  const registry = useEvents();
  const state = useSheet(characterId);
  const registrations = useRegistrations(key);
  const event = registry.events.find((e) => e.key === key);
  const existing =
    registrations.status === 'ready'
      ? registrations.items.find((r) => r.characterId === characterId)
      : undefined;

  const loading =
    registry.loading || state.status === 'loading' || registrations.status === 'loading';
  return (
    <Screen title={['Pre-register', event?.name ?? 'Event']}>
      <div className={styles.page}>
        {loading ? <p>Loading…</p> : null}
        {!loading && !event ? (
          <>
            <h1>Event not found</h1>
            <Link to="/events" className={styles.back}>
              Back to events
            </Link>
          </>
        ) : null}
        {!loading && event && state.status !== 'ready' ? (
          <>
            <h1>Pre-register</h1>
            <p role="alert">
              {state.status === 'error' ? state.message : 'There is no character at this link.'}
            </p>
          </>
        ) : null}
        {!loading && event && state.status === 'ready' ? (
          <RegistrationForm
            key={existing?.updatedAt ?? 'new'}
            event={event}
            character={state.character}
            ruleset={state.ruleset}
            characterName={state.sheet.profile.characterName}
            existing={existing}
          />
        ) : null}
      </div>
    </Screen>
  );
}

function NumberField({
  label,
  value,
  max,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
  hint?: string | undefined;
}) {
  // A number above the cap is lowered; say so instead of changing it silently (AC-17).
  const [lowered, setLowered] = useState(false);
  const shown = lowered ? `At most ${max}; lowered to ${max}.` : hint;
  return (
    <Field label={label} {...(shown ? { hint: shown } : {})} className={styles.numberField ?? ''}>
      {(control) => (
        <input
          {...control}
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Math.floor(Number(e.target.value));
            setLowered(Number.isFinite(n) && n > max);
            onChange(Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0);
          }}
        />
      )}
    </Field>
  );
}

function RegistrationForm({
  event,
  character,
  ruleset,
  characterName,
  existing,
}: {
  event: GameEvent;
  character: StoredCharacter;
  ruleset: Ruleset;
  characterName: string;
  existing: RegistrationEntry | undefined;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const isStaff = isStaffRole(useOptionalAuth()?.user?.role);
  const start = existing?.plan ?? DEFAULT_PLAN;
  const [attendance, setAttendance] = useState(start.attendance);
  const [purchases, setPurchases] = useState<PurchaseState>(() => toPurchaseState(start));
  const [choices, setChoices] = useState<CheckInChoices>(start.choices);
  const [note, setNote] = useState(start.note);
  const [problem, setProblem] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const locked = existing !== undefined && existing.status !== 'registered' && !isStaff;

  const bundle = ruleset.attendanceById[attendance];
  const plan: RegistrationPlan = useMemo(() => {
    const base: RegistrationPlan = {
      attendance,
      purchases: fromPurchaseState(purchases),
      // The paid NPC choice only goes with paid NPC attendance.
      choices: bundle?.paidChoice
        ? { ...choices, paidChoice: choices.paidChoice ?? 'skills' }
        : withoutPaidChoice(choices),
      note,
    };
    // Upkeep with one way to pay (the desk) needs no choice (acceptance AC-17).
    if (base.choices.upkeep !== undefined) return base;
    const first = checkRegistration(ruleset, character.actions, event, base);
    return first.upkeep.due && first.upkeep.covers.length === 0
      ? { ...base, choices: { ...base.choices, upkeep: 'paid' } }
      : base;
  }, [attendance, purchases, choices, note, bundle, ruleset, character.actions, event]);
  const check = useMemo(
    () => checkRegistration(ruleset, character.actions, event, plan),
    [ruleset, character.actions, event, plan],
  );
  const set = (patch: Partial<CheckInChoices>) => setChoices((c) => ({ ...c, ...patch }));
  const back = isStaff
    ? existing && existing.status !== 'registered'
      ? `/events/${event.key}/check-in/${character.id}`
      : `/events/${event.key}`
    : '/events';

  async function save() {
    if (saving) return;
    setSaving(true);
    setProblem([]);
    try {
      await api.saveRegistration(event.key, character.id, plan);
      toast.show(
        existing
          ? `Saved changes for ${characterName}.`
          : `${characterName} is pre-registered for ${event.name}.`,
      );
      void navigate(back);
    } catch (error) {
      setProblem(
        error instanceof ApiError && error.details.length > 0
          ? error.details
          : [error instanceof Error ? error.message : String(error)],
      );
    } finally {
      setSaving(false);
    }
  }

  async function withdraw() {
    try {
      await api.withdrawRegistration(event.key, character.id);
      toast.show(`${characterName} is no longer pre-registered for ${event.name}.`);
      void navigate(back);
    } catch (error) {
      setProblem([error instanceof Error ? error.message : String(error)]);
    }
  }

  const balanceLeft = check.mtBalance - check.mtCost;
  const upkeepBy =
    check.upkeep.due && check.upkeep.coveredBy !== null && check.upkeep.coveredBy !== 'paid'
      ? check.upkeep.coveredBy
      : null;
  // Players pre-register only for events still to come that they are not checked in to (AC-6).
  const closed =
    !isStaff && existing === undefined
      ? preRegisterBlock(event, checkedInKeys(ruleset, character), today())
      : null;
  if (closed !== null)
    return (
      <>
        <div className={styles.heading}>
          <h1>Pre-register {characterName}</h1>
          <p className={styles.meta}>
            {event.name}, {dateText(event.date)}
          </p>
        </div>
        <Alert kind="info">{closed} Pre-registration is closed.</Alert>
        <Link to="/events" className={styles.back}>
          Back to events
        </Link>
      </>
    );
  const saveBlocked: string | undefined = locked
    ? 'Check-in has started.'
    : check.errors.length > 0
      ? 'Fix the problems listed above.'
      : undefined;
  return (
    <>
      <div className={styles.heading}>
        <h1>Pre-register {characterName}</h1>
        <p className={styles.meta}>
          {event.name}, {dateText(event.date)}
        </p>
      </div>
      <p>
        Choose what you want ready at check-in. Staff pull it before the event, then check you in;
        your points for the event are added then.
      </p>
      {locked ? (
        <Alert kind="info">Staff have started your check-in. Ask them to change anything.</Alert>
      ) : null}

      <Card title="How you are coming" headingLevel={2}>
        <div className={styles.form}>
          <Field label="Attending as" hint="Staff confirm this at check-in.">
            {(control) => (
              <select
                {...control}
                value={attendance}
                onChange={(e) => setAttendance(e.target.value as RegistrationPlan['attendance'])}
              >
                {ruleset.awards.attendance.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {bundle?.paidChoice ? (
            <fieldset className={styles.radios}>
              <legend>Paid NPC: take</legend>
              <label className={styles.radio}>
                <input
                  type="radio"
                  name="paid-choice"
                  checked={plan.choices.paidChoice === 'skills'}
                  onChange={() => set({ paidChoice: 'skills' })}
                />
                <span>Use of Crafting, Check-in, or Research skills</span>
              </label>
              <label className={styles.radio}>
                <input
                  type="radio"
                  name="paid-choice"
                  checked={plan.choices.paidChoice === 'silver'}
                  onChange={() => set({ paidChoice: 'silver' })}
                />
                <span>Silver: 1 per {bundle.paidChoice.silverPerXp} XP earned</span>
              </label>
            </fieldset>
          ) : null}
        </div>
      </Card>

      <Card title="Spend Mist Tokens" headingLevel={2}>
        <p>
          You have <span className="num">{check.mtBalance}</span> Mist Tokens. These choices cost{' '}
          <span className="num">{check.mtCost}</span>, leaving{' '}
          <span className="num">{balanceLeft}</span>.
        </p>
        <ul className={styles.purchaseList}>
          {PREREG_PURCHASES.map((id) => {
            const def = ruleset.mtPurchasesById[id];
            if (!def) return null;
            const row = purchases[id] ?? { qty: 0 };
            const levels = soldLevels(def);
            const level = row.namedLevel ?? levels[0];
            return (
              <li key={id} className={styles.purchase}>
                <NumberField
                  label={`${def.name} (${priceText(def)})`}
                  hint={
                    def.capPerEvent !== undefined
                      ? `Up to ${def.capPerEvent} per event.`
                      : undefined
                  }
                  value={row.qty}
                  max={def.capPerEvent ?? 100}
                  onChange={(qty) =>
                    setPurchases((p) => ({
                      ...p,
                      [id]: { ...row, qty, ...(level ? { namedLevel: level } : {}) },
                    }))
                  }
                />
                {levels.length > 0 && row.qty > 0 ? (
                  <Field label={`${def.name}: named level`}>
                    {(control) => (
                      <select
                        {...control}
                        value={level}
                        onChange={(e) =>
                          setPurchases((p) => ({
                            ...p,
                            [id]: { ...row, namedLevel: e.target.value as NamedLevelId },
                          }))
                        }
                      >
                        {levels.map((l) => (
                          <option key={l} value={l}>
                            {levelName(l)}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className={styles.meta}>
          Teaching, stable items, back-buys, and missed or alternate character event XP are bought
          with staff at the desk.
        </p>
      </Card>

      <Card title="Check-in income" headingLevel={2}>
        <IncomeChoices
          sources={check.sources}
          choices={choices}
          onChange={setChoices}
          upkeepBy={upkeepBy}
          disabled={locked}
        />
      </Card>

      <Card title="Upkeep" headingLevel={2}>
        {check.upkeep.due ? (
          <fieldset className={styles.radios}>
            <legend>Upkeep is {check.upkeep.dueSilver} Silver. How is it paid?</legend>
            <label className={styles.radio}>
              <input
                type="radio"
                name="upkeep"
                checked={check.upkeep.coveredBy === 'paid'}
                onChange={() => set({ upkeep: 'paid' })}
              />
              <span>Pay {check.upkeep.dueSilver} Silver at the desk</span>
            </label>
            {check.upkeep.covers.map((c) => (
              <label key={c.id} className={styles.radio}>
                <input
                  type="radio"
                  name="upkeep"
                  checked={check.upkeep.coveredBy === c.id}
                  onChange={() => set({ upkeep: c.id })}
                />
                <span>{c.summary}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <p>{upkeepReasonText(check.upkeep.reason)}</p>
        )}
      </Card>

      <Card title="Note to staff" headingLevel={2}>
        <Field label="Note" hint="Optional: arriving late, special requests, and so on.">
          {(control) => (
            <textarea {...control} value={note} onChange={(e) => setNote(e.target.value)} />
          )}
        </Field>
      </Card>

      <Card title="What staff will hand you" headingLevel={2}>
        {check.items.length === 0 && check.picks.length === 0 ? (
          <p>Nothing to collect yet.</p>
        ) : (
          <ul className={styles.pullList}>
            {check.items.map((item, index) => (
              <li key={index}>{item.text}</li>
            ))}
            {check.picks.map((pick) => (
              <li key={pick}>{pick}</li>
            ))}
          </ul>
        )}
      </Card>

      <ErrorList
        title="This cannot be saved yet:"
        messages={[...check.errors, ...problem].filter((m, i, a) => a.indexOf(m) === i)}
      />
      <div className={styles.actions}>
        <Button
          variant="primary"
          disabled={locked || check.errors.length > 0}
          aria-disabled={saving || undefined}
          {...(saveBlocked ? { disabledReason: saveBlocked } : {})}
          onClick={() => void save()}
        >
          {existing ? 'Save changes' : 'Pre-register'}
        </Button>
        {existing && existing.status !== 'checked-in' && (!locked || isStaff) ? (
          <Button variant="ghost" onClick={() => void withdraw()}>
            Cancel pre-registration
          </Button>
        ) : null}
        <Link to={back} className={styles.back}>
          Back
        </Link>
      </div>
    </>
  );
}
