// `#/events/:key/register/:characterId`: pre-register a character for an event. The player chooses
// how they come, what to buy with Shinies (and the resource types), their check-in skill choices,
// and how they pay upkeep. The rules engine checks it live; staff see it when they check in.
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, ApiError } from '../../../api/client.ts';
import type { RegistrationEntry } from '../../../api/contract.ts';
import {
  PAYMENT_TEXT,
  PREREG_PURCHASES,
  RARITIES,
  checkRegistration,
  gatherTiers,
  playerFormProblems,
  scavengingTiers,
  type CheckInChoices,
  type CheckInSource,
  type EventPayment,
  type RegistrationPlan,
  type Ruleset,
} from '../../../engine/index.ts';
import type { GameEvent, StoredCharacter } from '../../../engine/model.ts';
import { isStaffRole, useOptionalAuth } from '../../auth/authContext.ts';
import { Alert, Button, Card, Field, useToast } from '../../components/index.ts';
import { useSheet } from '../../data/engineHooks.ts';
import { useRegistrations } from '../../data/registrations.ts';
import { dateText } from '../../lib/names.ts';
import { useEvents } from '../../lib/useEvents.ts';
import { Screen } from '../../Screen.tsx';
import { ErrorList } from '../character/ErrorList.tsx';
import styles from './events.module.css';

type PurchaseState = Record<string, { qty: number; types: Record<string, number> }>;

const DEFAULT_PLAN: RegistrationPlan = {
  attendance: 'player',
  purchases: [],
  choices: {},
  note: '',
  bookingConfirmed: false,
};

const NO_EVENT_CXP = {
  missedEvents: 0,
  missedDetails: '',
  altCharacterEvents: 0,
  altCharacterName: '',
};

function toPurchaseState(plan: RegistrationPlan): PurchaseState {
  const out: PurchaseState = {};
  for (const p of plan.purchases) out[p.purchaseId] = { qty: p.qty, types: { ...(p.types ?? {}) } };
  return out;
}

function fromPurchaseState(state: PurchaseState): RegistrationPlan['purchases'] {
  return Object.entries(state)
    .filter(([, v]) => v.qty > 0)
    .map(([purchaseId, v]) => {
      const types = Object.fromEntries(Object.entries(v.types).filter(([, n]) => n > 0));
      return { purchaseId, qty: v.qty, ...(Object.keys(types).length > 0 ? { types } : {}) };
    });
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
            <Link to="/events">Back to events</Link>
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
  return (
    <Field label={label} {...(hint ? { hint } : {})} className={styles.numberField ?? ''}>
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
  const [booking, setBooking] = useState(start.bookingConfirmed);
  const [payment, setPayment] = useState<EventPayment | undefined>(start.payment);
  const [eventCxp, setEventCxp] = useState(start.eventCxp ?? NO_EVENT_CXP);
  const [problem, setProblem] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const locked = existing !== undefined && existing.status !== 'registered' && !isStaff;

  const plan: RegistrationPlan = useMemo(
    () => ({
      attendance,
      purchases: fromPurchaseState(purchases),
      choices,
      note,
      bookingConfirmed: booking,
      ...(payment ? { payment } : {}),
      ...(eventCxp.missedEvents > 0 || eventCxp.altCharacterEvents > 0 ? { eventCxp } : {}),
    }),
    [attendance, purchases, choices, note, booking, payment, eventCxp],
  );
  const check = useMemo(
    () => checkRegistration(ruleset, character.actions, event, plan),
    [ruleset, character.actions, event, plan],
  );
  // The booking and payment questions are the player's; staff editing at the desk skip them.
  const formProblems = isStaff ? [] : playerFormProblems(plan);
  const allProblems = [...formProblems, ...check.errors];
  const hasScavenging = check.sources.some((s) => s.kind === 'scavenging' && s.basic > 0);
  const set = (patch: Partial<CheckInChoices>) => setChoices((c) => ({ ...c, ...patch }));
  const back = isStaff
    ? existing && existing.status !== 'registered'
      ? `/events/${event.key}/check-in/${character.id}`
      : `/events/${event.key}`
    : '/events';

  async function save() {
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

  const balanceLeft = check.shiniesBalance - check.shiniesCost;
  const saveBlocked: string | undefined = locked
    ? 'Check-in has started.'
    : allProblems.length > 0
      ? 'Fix the problems above.'
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

      <Card title="Before the event" headingLevel={2}>
        <div className={styles.form}>
          <label className={styles.radio}>
            <input
              type="checkbox"
              checked={booking}
              onChange={(e) => setBooking(e.target.checked)}
            />
            <span>
              I understand that I still need to book the event through the booking page on the
              website.
            </span>
          </label>
          <fieldset className={styles.radios}>
            <legend>How are you paying for the event?</legend>
            {(Object.keys(PAYMENT_TEXT) as EventPayment[]).map((value) => (
              <label key={value} className={styles.radio}>
                <input
                  type="radio"
                  name="payment"
                  checked={payment === value}
                  onChange={() => setPayment(value)}
                />
                <span>{PAYMENT_TEXT[value]}</span>
              </label>
            ))}
          </fieldset>
        </div>
      </Card>

      <Card title="How you are coming" headingLevel={2}>
        <Field label="Attending as" hint="Staff confirm this at check-in.">
          {(control) => (
            <select {...control} value={attendance} onChange={(e) => setAttendance(e.target.value)}>
              {ruleset.awards.attendance.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </Card>

      <Card title="Spend Shinies" headingLevel={2}>
        <p>
          You have <span className="num">{check.shiniesBalance}</span> Shinies. These choices cost{' '}
          <span className="num">{check.shiniesCost}</span>, leaving{' '}
          <span className="num">{balanceLeft}</span>.
        </p>
        <ul className={styles.purchaseList}>
          {PREREG_PURCHASES.map((id) => {
            const def = ruleset.shinyPurchasesById[id];
            if (!def) return null;
            const row = purchases[id] ?? { qty: 0, types: {} };
            const isResource = def.items?.some((i) => i.kind === 'resource') ?? false;
            const chosen = Object.values(row.types).reduce((a, b) => a + b, 0);
            return (
              <li key={id} className={styles.purchase}>
                <NumberField
                  label={`${def.name} (${def.price} Shinies each)`}
                  hint={
                    def.capPerEvent !== undefined
                      ? `Up to ${def.capPerEvent} per event.`
                      : undefined
                  }
                  value={row.qty}
                  max={def.capPerEvent ?? 100}
                  onChange={(qty) => setPurchases((p) => ({ ...p, [id]: { ...row, qty } }))}
                />
                {isResource && row.qty > 0 ? (
                  <fieldset className={styles.types}>
                    <legend>
                      Which types? {chosen} of {row.qty} chosen
                    </legend>
                    {ruleset.ruleset.resourceTypes.map((t) => (
                      <NumberField
                        key={t.id}
                        label={t.name}
                        value={row.types[t.id] ?? 0}
                        max={row.qty}
                        onChange={(n) =>
                          setPurchases((p) => ({
                            ...p,
                            [id]: { ...row, types: { ...row.types, [t.id]: n } },
                          }))
                        }
                      />
                    ))}
                  </fieldset>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Event CXP for other events" headingLevel={2}>
        <p>
          {`${ruleset.shinyPurchasesById['buy-missed-event-cxp']?.price ?? 500} Shinies an event. Staff check these and record them at the desk.`}
        </p>
        <div className={styles.form}>
          <NumberField
            label="Missed events to buy CXP for"
            hint="The event must be in the current or the previous season."
            value={eventCxp.missedEvents}
            max={10}
            onChange={(n) => setEventCxp((c) => ({ ...c, missedEvents: n }))}
          />
          {eventCxp.missedEvents > 0 ? (
            <Field label="Which event dates?" required>
              {(control) => (
                <input
                  {...control}
                  autoComplete="off"
                  maxLength={1000}
                  value={eventCxp.missedDetails}
                  onChange={(e) => setEventCxp((c) => ({ ...c, missedDetails: e.target.value }))}
                />
              )}
            </Field>
          ) : null}
          <NumberField
            label="Events of CXP to buy for an alternate character"
            hint="At most 3 a year, and you must play one event a year for each event you buy."
            value={eventCxp.altCharacterEvents}
            max={3}
            onChange={(n) => setEventCxp((c) => ({ ...c, altCharacterEvents: n }))}
          />
          {eventCxp.altCharacterEvents > 0 ? (
            <Field label="Alternate character's name" required>
              {(control) => (
                <input
                  {...control}
                  autoComplete="off"
                  maxLength={200}
                  value={eventCxp.altCharacterName}
                  onChange={(e) => setEventCxp((c) => ({ ...c, altCharacterName: e.target.value }))}
                />
              )}
            </Field>
          ) : null}
        </div>
      </Card>

      <Card title="Check-in skills" headingLevel={2}>
        {check.sources.length === 0 ? (
          <p>This character has no skills or abilities that give items at check-in.</p>
        ) : (
          <div className={styles.sources}>
            {check.sources.map((source) => (
              <SourceChoice
                key={source.kind + source.name}
                source={source}
                choices={choices}
                set={set}
                ruleset={ruleset}
              />
            ))}
          </div>
        )}
      </Card>

      <Card title="Upkeep" headingLevel={2}>
        {check.upkeep.due ? (
          <fieldset className={styles.radios}>
            <legend>Upkeep is due. How will you pay?</legend>
            {(
              [
                ['resources', 'Hand in 2 basic resources'],
                ['bits', 'Hand in 10 Bits'],
                [
                  'shinies',
                  `Spend ${ruleset.shinyPurchasesById['buy-upkeep']?.price ?? 40} Shinies`,
                ],
                ...(hasScavenging ? ([['scavenging', 'Use 1 level of Scavenging']] as const) : []),
                ['other-character', 'Another character is paying my upkeep'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className={styles.radio}>
                <input
                  type="radio"
                  name="upkeep"
                  checked={choices.upkeep === value}
                  onChange={() => set({ upkeep: value })}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
        ) : null}
        {check.upkeep.due && choices.upkeep === 'other-character' ? (
          <Field label="Which character is paying?" required>
            {(control) => (
              <input
                {...control}
                autoComplete="off"
                maxLength={200}
                value={choices.upkeepPayer ?? ''}
                onChange={(e) => set({ upkeepPayer: e.target.value })}
              />
            )}
          </Field>
        ) : null}
        {check.upkeep.due ? null : <p>No upkeep this time: {check.upkeep.reason}.</p>}
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
              <li key={index}>
                <strong>{item.text}</strong> <span className={styles.meta}>({item.source})</span>
              </li>
            ))}
            {check.picks.map((pick) => (
              <li key={pick}>{pick}</li>
            ))}
          </ul>
        )}
      </Card>

      <ErrorList
        title="This cannot be saved yet:"
        messages={[...allProblems, ...problem].filter((m, i, a) => a.indexOf(m) === i)}
      />
      <div className={styles.actions}>
        <Button
          variant="primary"
          disabled={locked || saving || allProblems.length > 0}
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
        <Link to={back}>Back</Link>
      </div>
    </>
  );
}

function SourceCard({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <section className={styles.source} aria-label={title}>
      <h3 className={styles.sourceTitle}>{title}</h3>
      {text ? <p className={styles.sourceText}>{text}</p> : null}
      {children}
    </section>
  );
}

function SourceChoice({
  source,
  choices,
  set,
  ruleset,
}: {
  source: CheckInSource;
  choices: CheckInChoices;
  set: (patch: Partial<CheckInChoices>) => void;
  ruleset: Ruleset;
}) {
  const rarityName = (id: string) => ruleset.ruleset.rarities.find((r) => r.id === id)?.name ?? id;
  const typeName = (id: string) =>
    ruleset.ruleset.resourceTypes.find((r) => r.id === id)?.name ?? id;
  switch (source.kind) {
    case 'human-passive':
      return (
        <SourceCard title={source.name} text={source.text}>
          <fieldset className={styles.radios}>
            <legend>Take</legend>
            <label className={styles.radio}>
              <input
                type="radio"
                name="human-passive"
                checked={!choices.humanPassiveBits}
                onChange={() => set({ humanPassiveBits: false })}
              />
              <span>2 random basic resources</span>
            </label>
            <label className={styles.radio}>
              <input
                type="radio"
                name="human-passive"
                checked={choices.humanPassiveBits === true}
                onChange={() => set({ humanPassiveBits: true })}
              />
              <span>10 Bits</span>
            </label>
          </fieldset>
        </SourceCard>
      );
    case 'deep-pockets':
      return (
        <SourceCard title={`${source.name} (level ${source.level})`} text={source.text}>
          <NumberField
            label="Levels taken as 10 Bits (the rest are 2 resources each)"
            value={choices.deepPocketsBitsLevels ?? 0}
            max={source.level}
            onChange={(n) => set({ deepPocketsBitsLevels: n })}
          />
          <Field label="Note to staff" hint="For example, stacking uses for a rarer resource.">
            {(control) => (
              <input
                {...control}
                value={choices.deepPocketsNote ?? ''}
                onChange={(e) => set({ deepPocketsNote: e.target.value })}
              />
            )}
          </Field>
        </SourceCard>
      );
    case 'look-what-i-found':
      return (
        <SourceCard title={`${source.name} (level ${source.level})`} text={source.text}>
          <p>You draw {source.level * 2} random items at check-in.</p>
        </SourceCard>
      );
    case 'familiar-gather':
      return (
        <SourceCard title={source.name} text={source.text}>
          <fieldset className={styles.radios}>
            <legend>Use Gather this event (3 random resources)?</legend>
            <label className={styles.radio}>
              <input
                type="radio"
                name="familiar-gather"
                checked={choices.familiarGather !== false}
                onChange={() => set({ familiarGather: true })}
              />
              <span>Yes</span>
            </label>
            <label className={styles.radio}>
              <input
                type="radio"
                name="familiar-gather"
                checked={choices.familiarGather === false}
                onChange={() => set({ familiarGather: false })}
              />
              <span>No</span>
            </label>
          </fieldset>
        </SourceCard>
      );
    case 'scavenging': {
      const tiers = scavengingTiers(source, choices);
      const bits = choices.scavengingBits ?? { common: 0, uncommon: 0, rare: 0 };
      const bitsEach = { common: 10, uncommon: 15, rare: 20 } as const;
      return (
        <SourceCard
          title={`Scavenging (basic ${source.basic}${source.adept ? `, adept ${source.adept}` : ''}${source.advanced ? `, advanced ${source.advanced}` : ''}${source.mastery ? ', mastery' : ''})`}
          text={source.text}
        >
          {source.advanced > 0 ? (
            <NumberField
              label="Advanced upgrades to use (rare)"
              value={tiers.rare}
              max={Math.min(source.advanced, source.basic)}
              onChange={(n) => set({ scavengingAdvanced: n })}
            />
          ) : null}
          {source.adept > 0 ? (
            <NumberField
              label="Adept upgrades to use (uncommon)"
              value={tiers.uncommon}
              max={Math.min(source.adept, source.basic - tiers.rare)}
              onChange={(n) => set({ scavengingAdept: n })}
            />
          ) : null}
          {RARITIES.filter((r) => tiers[r] > 0).map((r) => (
            <NumberField
              key={r}
              label={`${rarityName(r)} uses taken as ${bitsEach[r]} Bits (of ${tiers[r]})`}
              value={Math.min(bits[r], tiers[r])}
              max={tiers[r]}
              onChange={(n) => set({ scavengingBits: { ...bits, [r]: n } })}
            />
          ))}
          {source.mastery ? <p>Mastery: one more random resource for each use.</p> : null}
        </SourceCard>
      );
    }
    case 'dismantle':
    case 'harvesting': {
      const tiers = gatherTiers(source.basic, source.adept, source.advanced);
      const field = source.kind === 'dismantle' ? 'dismantleFirstType' : 'harvestingFirstType';
      const split = choices[field] ?? {
        common: tiers.common,
        uncommon: tiers.uncommon,
        rare: tiers.rare,
      };
      const [first, second] = source.types;
      return (
        <SourceCard
          title={`${source.name} (basic ${source.basic}${source.adept ? `, adept ${source.adept}` : ''}${source.advanced ? `, advanced ${source.advanced}` : ''})`}
          text={source.text}
        >
          {RARITIES.filter((r) => tiers[r] > 0).map((r) => {
            const n = Math.min(split[r], tiers[r]);
            return (
              <NumberField
                key={r}
                label={`${rarityName(r)}: how many ${typeName(first)} (of ${tiers[r]}; the rest ${typeName(second)})`}
                hint={`${n} ${typeName(first)}, ${tiers[r] - n} ${typeName(second)}.`}
                value={n}
                max={tiers[r]}
                onChange={(v) => set({ [field]: { ...split, [r]: v } })}
              />
            );
          })}
        </SourceCard>
      );
    }
    case 'profession-pick':
      return (
        <SourceCard title={source.name} text={source.text}>
          {source.options.length === 0 ? (
            <p>No options yet (for example, no basic spells memorized).</p>
          ) : (
            <Field label="Your choice for this event">
              {(control) => (
                <select
                  {...control}
                  value={choices.professionPicks?.[source.field] ?? ''}
                  onChange={(e) => {
                    const next = { ...(choices.professionPicks ?? {}) };
                    if (e.target.value === '') delete next[source.field];
                    else next[source.field] = e.target.value;
                    set({ professionPicks: next });
                  }}
                >
                  <option value="">Choose at the event</option>
                  {source.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
        </SourceCard>
      );
  }
}
