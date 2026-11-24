// `#/events/:key/check-in/:characterId` (staff): check in a pre-registered character. Shows what
// to pull (check-in skill items and Shiny purchases, with resource types), the player's choices
// and note, then Finish check-in spends the Shinies and credits the event's points in one step.
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Check } from 'lucide-react';
import { api, ApiError } from '../../../api/client.ts';
import type { RegistrationEntry } from '../../../api/contract.ts';
import {
  PAYMENT_TEXT,
  checkRegistration,
  preview,
  type Ruleset,
  type Sheet,
} from '../../../engine/index.ts';
import type { GameEvent, StoredCharacter } from '../../../engine/model.ts';
import { Alert, Badge, Button, ButtonLink, Card, Field, useToast } from '../../components/index.ts';
import { publishCharacterSaved } from '../../data/characterEvents.ts';
import { useSheet } from '../../data/engineHooks.ts';
import { useRepository } from '../../data/hooks.ts';
import { STATUS_TEXT, useRegistrations } from '../../data/registrations.ts';
import { amountText, dateText, ledgerKindName } from '../../lib/names.ts';
import { useEvents } from '../../lib/useEvents.ts';
import { Screen } from '../../Screen.tsx';
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
            <Link to={event ? `/events/${event.key}` : '/events'}>Back to the event</Link>
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
  const navigate = useNavigate();
  const toast = useToast();
  const repository = useRepository();
  const [attendance, setAttendance] = useState(reg.plan.attendance);
  const [npcHours, setNpcHours] = useState(0);
  const [preSignedShift, setPreSignedShift] = useState(false);
  const [extras, setExtras] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [pulled, setPulled] = useState<ReadonlySet<number>>(new Set());
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const name = sheet.profile.characterName;

  const check = useMemo(
    () => checkRegistration(ruleset, character.actions, event, reg.plan),
    [ruleset, character.actions, event, reg.plan],
  );
  const awards = useMemo(
    () =>
      preview(ruleset, sheet, {
        type: 'checkIn',
        event,
        attendance,
        npcHours,
        preSignedShift,
        extras,
      }),
    [ruleset, sheet, event, attendance, npcHours, preSignedShift, extras],
  );

  async function start() {
    try {
      await api.startCheckIn(event.key, character.id);
      await reload();
    } catch (error) {
      setProblems([error instanceof Error ? error.message : String(error)]);
    }
  }

  async function finish() {
    setBusy(true);
    setProblems([]);
    try {
      const result = await api.finishCheckIn(event.key, character.id, {
        attendance,
        npcHours,
        preSignedShift,
        extras,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      publishCharacterSaved(repository, result.character.character);
      void navigate(`/c/${character.id}/print?show=receipt&event=${event.key}`);
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

  const blocked = check.errors.length > 0 || !awards.allowed;
  const finishBlocked: string | undefined =
    reg.status !== 'started'
      ? 'Start the check-in first.'
      : blocked
        ? 'Fix the problems above.'
        : undefined;
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
        {check.items.length === 0 ? (
          <p>Nothing to hand over.</p>
        ) : (
          <ul className={styles.checklist} aria-label="Items to pull">
            {check.items.map((item, index) => (
              <li key={index}>
                <label className={styles.radio}>
                  <input
                    type="checkbox"
                    checked={pulled.has(index)}
                    onChange={() => toggle(index)}
                  />
                  <span>
                    <strong>{item.text}</strong>{' '}
                    <span className={styles.meta}>({item.source})</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.meta}>
          {pulled.size} of {check.items.length} ticked. The ticks are a checklist on this screen
          only.
        </p>
      </Card>

      <Card title="Shiny purchases and choices" headingLevel={2}>
        {check.purchases.length === 0 ? <p>No Shiny purchases.</p> : null}
        <ul className={styles.plainList}>
          {check.purchases.map((p) => (
            <li key={p.purchaseId}>
              {p.name} x{p.qty}: <span className="num">{p.cost}</span> Shinies
              {p.typesText ? ` (${p.typesText})` : ''}
              {p.atDesk ? (
                <>
                  {'. '}
                  <strong>Record at the desk on the Points page; Finish check-in does not.</strong>
                </>
              ) : null}
            </li>
          ))}
          {check.picks.map((pick) => (
            <li key={pick}>{pick}</li>
          ))}
        </ul>
        <p>
          Shinies: <span className="num">{check.shiniesCost}</span> of{' '}
          <span className="num">{check.shiniesBalance}</span>.
        </p>
        <p>
          Event payment: {reg.plan.payment ? PAYMENT_TEXT[reg.plan.payment] : 'not given'}.{' '}
          {reg.plan.bookingConfirmed
            ? 'The player confirmed they will book on the website.'
            : 'Booking on the website not confirmed.'}
        </p>
        <ButtonLink to={`/events/${event.key}/register/${character.id}`}>Change choices</ButtonLink>
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
                onChange={(e) => setAttendance(e.target.value)}
              >
                {ruleset.awards.attendance.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="NPC hours">
            {(control) => (
              <input
                {...control}
                type="number"
                inputMode="numeric"
                min={0}
                max={200}
                value={npcHours}
                onChange={(e) => setNpcHours(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              />
            )}
          </Field>
          <label className={styles.radio}>
            <input
              type="checkbox"
              checked={preSignedShift}
              onChange={(e) => setPreSignedShift(e.target.checked)}
            />
            <span>Signed up for an NPC shift before the event</span>
          </label>
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
                <span>{x.name}</span>
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
        {awards.awards && awards.awards.length > 0 ? (
          <ul className={styles.plainList}>
            {awards.awards.map((a, i) => (
              <li key={i}>
                {amountText(ruleset, a.currency, a.amount)} ({ledgerKindName(ruleset, a.kind)})
              </li>
            ))}
          </ul>
        ) : (
          <p>No points.</p>
        )}
        {awards.owed && awards.owed.length > 0 ? <p>Also owed: {awards.owed.join('; ')}</p> : null}
        {awards.notices.map((n) => (
          <p key={n.code} className={styles.meta}>
            {n.message}
          </p>
        ))}
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
          disabled={busy || blocked || reg.status !== 'started'}
          {...(finishBlocked ? { disabledReason: finishBlocked } : {})}
          onClick={() => void finish()}
        >
          Finish check-in
        </Button>
        <Link to={`/events/${event.key}`}>Back to the event</Link>
      </div>
    </>
  );
}
