// `#/events/:key/check-in/:characterId` (staff): check in a pre-registered character. Shows the
// pull list (check-in income, attendance silver, Mist Token purchases), the player's choices and
// note, then Finish check-in spends the Mist Tokens and credits the event's points in one step and
// shows a receipt.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Check } from 'lucide-react';
import { api, ApiError } from '../../../api/client.ts';
import type { RegistrationEntry } from '../../../api/contract.ts';
import {
  checkRegistration,
  preview,
  type Award,
  type EventCheckedInPayload,
  type MtSpentPayload,
  type Ruleset,
  type Sheet,
} from '../../../engine/index.ts';
import type { GameEvent, StoredCharacter } from '../../../engine/model.ts';
import { Alert, Badge, Button, ButtonLink, Card, Field, useToast } from '../../components/index.ts';
import { publishCharacterSaved } from '../../data/characterEvents.ts';
import { useSheet } from '../../data/engineHooks.ts';
import { useRepository } from '../../data/hooks.ts';
import { STATUS_TEXT, useRegistrations } from '../../data/registrations.ts';
import { readPayload } from '../../lib/describeAction.ts';
import { amountText, dateText } from '../../lib/names.ts';
import { useEvents } from '../../lib/useEvents.ts';
import { Screen } from '../../Screen.tsx';
import { AwardList, HandOutList, NotCreditedLine } from '../character/checkin/CheckInPage.tsx';
import { extraText, upkeepLine, withoutPaidChoice } from '../character/checkin/checkInModel.ts';
import { ErrorList } from '../character/ErrorList.tsx';
import styles from './events.module.css';

export function StaffCheckInPage() {
  const { key = '', characterId = '' } = useParams();
  const registry = useEvents();
  const state = useSheet(characterId);
  const registrations = useRegistrations(key);
  const event = registry.events.find((e) => e.key === key);
  const reg =
    registrations.status === 'ready'
      ? registrations.items.find((r) => r.characterId === characterId)
      : undefined;
  const loading =
    registry.loading || state.status === 'loading' || registrations.status === 'loading';

  return (
    <Screen title={['Check in', event?.name ?? 'Event']}>
      <div className={styles.page}>
        {loading ? <p>Loading…</p> : null}
        {!loading && (!event || state.status !== 'ready' || !reg) ? (
          <>
            <h1>Check in</h1>
            <p role="alert">
              {!event
                ? 'There is no such event.'
                : !reg
                  ? 'This character has not pre-registered for this event. Use Check in on the event page.'
                  : 'The character could not be read.'}
            </p>
            <Link to={event ? `/events/${event.key}` : '/events'} className={styles.back}>
              Back to the event
            </Link>
          </>
        ) : null}
        {!loading && event && state.status === 'ready' && reg ? (
          <CheckInForm
            key={reg.updatedAt}
            event={event}
            reg={reg}
            character={state.character}
            sheet={state.sheet}
            ruleset={state.ruleset}
            reload={registrations.reload}
          />
        ) : null}
      </div>
    </Screen>
  );
}

interface Receipt {
  attendance: string;
  awards: readonly Award[];
  notCredited: readonly Award[];
  upkeep: string;
  handedOut: readonly string[];
  purchases: readonly string[];
}

/** The receipt from the saved log: the check-in and the Mist Token purchases made with it. */
function receiptFrom(
  ruleset: Ruleset,
  character: StoredCharacter,
  eventKey: string,
  before: number,
): Receipt | null {
  const added = character.actions.slice(before);
  const checkIn = added.find((a) => a.type === 'event.checkedIn' && a.eventKey === eventKey);
  const p = checkIn ? (readPayload(checkIn) as EventCheckedInPayload | null) : null;
  if (!p) return null;
  const purchases = added
    .filter((a) => a.type === 'mt.spent')
    .map((a) => readPayload(a) as MtSpentPayload | null)
    .filter((x): x is MtSpentPayload => x !== null)
    .map((x) => {
      const name = ruleset.mtPurchasesById[x.purchaseId]?.name ?? x.purchaseId;
      return `${x.qty} x ${name}: ${amountText(ruleset, 'mt', x.mtCost)}`;
    });
  const up = p.upkeep ?? { dueSilver: 0, coveredBy: null };
  return {
    attendance: ruleset.attendanceById[p.attendance]?.name ?? p.attendance,
    awards: p.awards,
    notCredited: p.notCredited ?? [],
    upkeep:
      up.dueSilver === 0
        ? 'No upkeep due.'
        : up.coveredBy === null || up.coveredBy === 'paid'
          ? `Upkeep: ${up.dueSilver} Silver, paid at the desk.`
          : `Upkeep: ${up.dueSilver} Silver, covered by ${ruleset.skillsById[up.coveredBy]?.name ?? up.coveredBy}.`,
    handedOut: p.handedOut ?? [],
    purchases,
  };
}

function CheckInForm({
  event,
  reg,
  character,
  sheet,
  ruleset,
  reload,
}: {
  event: GameEvent;
  reg: RegistrationEntry;
  character: StoredCharacter;
  sheet: Sheet;
  ruleset: Ruleset;
  reload: () => Promise<void>;
}) {
  const toast = useToast();
  const repository = useRepository();
  const formId = useId();
  const [attendance, setAttendance] = useState(reg.plan.attendance);
  const [paidChoice, setPaidChoice] = useState<'skills' | 'silver'>(
    reg.plan.choices.paidChoice ?? 'skills',
  );
  const [npcHours, setNpcHours] = useState(0);
  const [extras, setExtras] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [pulled, setPulled] = useState<ReadonlySet<number>>(new Set());
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const name = sheet.profile.characterName;
  const bundle = ruleset.attendanceById[attendance];
  const paid = bundle?.paidChoice ? paidChoice : undefined;

  // The plan as staff confirm it at the desk: the attendance and paid NPC choice from this form.
  const confirmed = useMemo(
    () => ({
      ...reg.plan,
      attendance,
      choices: {
        ...withoutPaidChoice(reg.plan.choices),
        ...(paid ? { paidChoice: paid } : {}),
      },
    }),
    [reg.plan, attendance, paid],
  );
  const check = useMemo(
    () => checkRegistration(ruleset, character.actions, event, confirmed),
    [ruleset, character.actions, event, confirmed],
  );
  // Previewed on the sheet after the pre-registered Mist Token purchases, which the server saves
  // first: XP bought with them counts toward the earned cap, so the numbers match the save.
  const after = check.sheetAfterPurchases;
  const awards = useMemo(
    () =>
      preview(ruleset, after, {
        type: 'checkIn',
        event,
        attendance,
        npcHours,
        extras,
        ...(paid ? { paidChoice: paid } : {}),
        ...(check.upkeep.coveredBy ? { upkeep: check.upkeep.coveredBy } : {}),
      }),
    [ruleset, after, event, attendance, npcHours, extras, paid, check.upkeep.coveredBy],
  );

  async function start() {
    setProblems([]);
    try {
      await api.startCheckIn(event.key, character.id);
      await reload();
    } catch (error) {
      setProblems([error instanceof Error ? error.message : String(error)]);
    }
  }

  async function finish() {
    if (busy) return;
    setBusy(true);
    setProblems([]);
    try {
      const before = character.actions.length;
      const result = await api.finishCheckIn(event.key, character.id, {
        attendance,
        npcHours,
        extras,
        ...(paid ? { paidChoice: paid } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      const saved = result.character.character;
      setReceipt(receiptFrom(ruleset, saved, event.key, before));
      publishCharacterSaved(repository, saved);
      toast.show(`Checked in ${name} to ${event.name}.`);
    } catch (error) {
      setProblems(
        error instanceof ApiError && error.details.length > 0
          ? error.details
          : [error instanceof Error ? error.message : String(error)],
      );
    } finally {
      setBusy(false);
    }
  }

  const toggle = (index: number) =>
    setPulled((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  if (receipt)
    return (
      <ReceiptView
        event={event}
        name={name}
        receipt={receipt}
        id={character.id}
        ruleset={ruleset}
      />
    );

  const blocked = check.errors.length > 0 || !awards.allowed;
  const finishBlocked: string | undefined =
    reg.status === 'checked-in'
      ? 'Already checked in.'
      : reg.status !== 'started'
        ? 'Start the check-in first.'
        : blocked
          ? 'Fix the problems listed above.'
          : undefined;
  const handOutTexts = check.items.filter((i) => i.what !== 'upkeep');
  return (
    <>
      <div className={styles.heading}>
        <h1>Check in {name}</h1>
        <p className={styles.meta}>
          {event.name}, {dateText(event.date)}
          {reg.ownerName ? `. Player: ${reg.ownerName}` : ''}
        </p>
      </div>
      <p className={styles.regRow}>
        <Badge kind={reg.status === 'checked-in' ? 'approved' : 'pending'}>
          {STATUS_TEXT[reg.status]}
        </Badge>
        {reg.startedBy && reg.status === 'started' ? (
          <span className={styles.meta}>Started by {reg.startedBy}</span>
        ) : null}
      </p>
      {reg.status === 'registered' ? (
        <div className={styles.actions}>
          <Button variant="primary" onClick={() => void start()}>
            Start check-in
          </Button>
        </div>
      ) : null}
      {reg.plan.note ? (
        <Alert kind="info" title="Note from the player">
          <p>{reg.plan.note}</p>
        </Alert>
      ) : null}

      <Card title="Pull these items" headingLevel={2}>
        {handOutTexts.length === 0 ? (
          <p>Nothing to hand over.</p>
        ) : (
          <ul className={styles.checklist} aria-label="Items to pull">
            {handOutTexts.map((item, index) => (
              <li key={index}>
                <label className={styles.radio}>
                  <input
                    type="checkbox"
                    checked={pulled.has(index)}
                    onChange={() => toggle(index)}
                  />
                  <span>{item.text}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.meta}>
          {pulled.size} of {handOutTexts.length} ticked. The ticks are a checklist on this screen
          only.
        </p>
      </Card>

      <Card title="Mist Token purchases and choices" headingLevel={2}>
        {check.purchases.length === 0 ? <p>No Mist Token purchases.</p> : null}
        <ul className={styles.plainList}>
          {check.purchases.map((p) => (
            <li key={p.purchaseId}>
              {p.qty} x {p.name}: <span className="num">{p.cost}</span> Mist Tokens
            </li>
          ))}
          {check.picks.map((pick) => (
            <li key={pick}>{pick}</li>
          ))}
        </ul>
        <p>
          Mist Tokens: <span className="num">{check.mtCost}</span> of{' '}
          <span className="num">{check.mtBalance}</span>.
        </p>
        <p>{upkeepLine(ruleset, check.upkeep, check.upkeep.coveredBy)}</p>
        <ButtonLink
          to={`/events/${event.key}/register/${character.id}`}
          aria-label={`Change choices: ${name}`}
        >
          Change choices
        </ButtonLink>
      </Card>

      <Card title="Attendance" headingLevel={2}>
        <div className={styles.form}>
          <Field
            label="Attended as"
            hint={`The player chose ${ruleset.attendanceById[reg.plan.attendance]?.name ?? reg.plan.attendance}.`}
          >
            {(control) => (
              <select
                {...control}
                value={attendance}
                onChange={(e) => setAttendance(e.target.value as typeof attendance)}
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
              <legend>Paid NPC: takes</legend>
              <label className={styles.radio}>
                <input
                  type="radio"
                  name={`${formId}-paid`}
                  checked={paidChoice === 'skills'}
                  onChange={() => setPaidChoice('skills')}
                />
                <span>Use of Crafting, Check-in, or Research skills</span>
              </label>
              <label className={styles.radio}>
                <input
                  type="radio"
                  name={`${formId}-paid`}
                  checked={paidChoice === 'silver'}
                  onChange={() => setPaidChoice('silver')}
                />
                <span>Silver: 1 per {bundle.paidChoice.silverPerXp} XP earned</span>
              </label>
            </fieldset>
          ) : null}
          <Field
            label="NPC hours"
            hint={
              bundle?.npcTimeMax
                ? `${bundle.name} already gets NPC time at its maximum.`
                : undefined
            }
          >
            {(control) => (
              <input
                {...control}
                type="number"
                inputMode="numeric"
                min={0}
                max={200}
                value={npcHours}
                onChange={(e) =>
                  setNpcHours(Math.min(200, Math.max(0, Math.floor(Number(e.target.value) || 0))))
                }
              />
            )}
          </Field>
          <fieldset className={styles.radios}>
            <legend>Extras</legend>
            {ruleset.awards.extras.map((x) => (
              <label key={x.id} className={styles.radio}>
                <input
                  type="checkbox"
                  checked={extras.includes(x.id)}
                  onChange={(e) =>
                    setExtras((list) =>
                      e.target.checked ? [...list, x.id] : list.filter((id) => id !== x.id),
                    )
                  }
                />
                <span>
                  {x.name} <span className={styles.meta}>({extraText(ruleset, x.id)})</span>
                </span>
              </label>
            ))}
          </fieldset>
          <Field
            label="Staff note"
            hint="Optional. The player's note is saved with the check-in when this is empty."
          >
            {(control) => (
              <textarea {...control} value={note} onChange={(e) => setNote(e.target.value)} />
            )}
          </Field>
        </div>
      </Card>

      <Card title="Points this check-in awards" headingLevel={2}>
        <div aria-live="polite" className={styles.form}>
          <AwardList ruleset={ruleset} awards={awards.awards ?? []} />
          <NotCreditedLine ruleset={ruleset} awards={awards.notCredited ?? []} />
          {awards.notices
            .filter((n) => !n.code.endsWith('_CAPPED'))
            .map((n) => (
              <p key={n.code} className={styles.meta}>
                {n.message}
              </p>
            ))}
        </div>
      </Card>

      <ErrorList
        title="Check-in cannot finish yet:"
        messages={[...check.errors, ...awards.reasons, ...problems].filter(
          (m, i, a) => a.indexOf(m) === i,
        )}
      />
      <div className={styles.actions}>
        <Button
          variant="primary"
          icon={<Check />}
          disabled={blocked || reg.status !== 'started'}
          aria-disabled={busy || undefined}
          {...(finishBlocked ? { disabledReason: finishBlocked } : {})}
          onClick={() => void finish()}
        >
          Finish check-in
        </Button>
        <Link to={`/events/${event.key}`} className={styles.back}>
          Back to the event
        </Link>
      </div>
    </>
  );
}

function ReceiptView({
  event,
  name,
  receipt,
  id,
  ruleset,
}: {
  event: GameEvent;
  name: string;
  receipt: Receipt;
  id: string;
  ruleset: Ruleset;
}) {
  // Focus the receipt heading, so screen reader users hear the result.
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <>
      <div className={styles.heading}>
        <h1 ref={ref} tabIndex={-1}>
          Checked in {name}
        </h1>
        <p className={styles.meta}>
          {event.name}, {dateText(event.date)}. {receipt.attendance}.
        </p>
      </div>
      <Card title="Receipt" headingLevel={2}>
        <div className={styles.form}>
          <AwardList ruleset={ruleset} awards={receipt.awards} />
          <NotCreditedLine ruleset={ruleset} awards={receipt.notCredited} />
          <p>{receipt.upkeep}</p>
          {receipt.purchases.length > 0 ? (
            <div>
              <p className={styles.subhead}>Mist Token purchases</p>
              <ul className={styles.plainList}>
                {receipt.purchases.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <HandOutList texts={receipt.handedOut} />
        </div>
      </Card>
      <div className={styles.actions}>
        <ButtonLink to={`/events/${event.key}`} variant="primary">
          Back to the event
        </ButtonLink>
        <Link
          to={`/c/${id}/print?show=receipt&event=${encodeURIComponent(event.key)}`}
          className={styles.back}
        >
          Print receipt
        </Link>
        <Link to={`/c/${id}/log`} className={styles.back}>
          See the log
        </Link>
      </div>
    </>
  );
}
