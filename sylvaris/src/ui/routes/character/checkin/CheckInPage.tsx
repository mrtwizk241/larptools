// `#/c/:id/checkin` (staff): check the character in to one event. Attendance type, NPC hours,
// extras, a live preview of every award with the earned caps, upkeep and what covers it, what
// the desk hands over (check-in income with the choices), then a receipt. `?event=<key>`
// preselects a known event; `?back=<path>` returns there after a successful check-in.
// CharacterLayout shows players a staff-only notice instead.
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Minus, Plus } from 'lucide-react';
import {
  preview,
  upkeepFor,
  type Award,
  type CheckInChoices,
  type CheckInCommand,
  type EventCheckedInPayload,
  type Ruleset,
} from '../../../../engine/index.ts';
import { eventKey, type GameEvent } from '../../../../engine/model.ts';
import { Button, Card, Field, IconButton } from '../../../components/index.ts';
import { useCommand } from '../../../data/engineHooks.ts';
import { readPayload } from '../../../lib/describeAction.ts';
import { amountText, dateText, ledgerKindName, signed } from '../../../lib/names.ts';
import { useEvents } from '../../../lib/useEvents.ts';
import type { CharacterScreen } from '../screen.tsx';
import { ErrorList } from '../ErrorList.tsx';
import type { CharacterView } from '../view.ts';
import {
  attendanceText,
  backPath,
  defaultCheckInEvent,
  defaultCover,
  extraText,
  handedOutTexts,
  handOut,
  isUpcoming,
  today,
  upkeepLine,
} from './checkInModel.ts';
import { IncomeChoices } from './IncomeChoices.tsx';
import styles from './checkin.module.css';

const NEW_EVENT = '__new__';
const MAX_HOURS = 200;

interface Receipt {
  event: GameEvent;
  attendance: string;
  awards: readonly Award[];
  notCredited: readonly Award[];
  upkeep: string;
  handedOut: readonly string[];
}

/** Check-in (staff). */
export const CheckInPage: CharacterScreen = ({ view }) => (
  <section aria-labelledby="checkin-heading" className={styles.section}>
    <h2 id="checkin-heading">Check-in</h2>
    <CheckInForm view={view} />
  </section>
);

function CheckInForm({ view }: { view: CharacterView }) {
  const { ruleset, sheet } = view;
  const formId = useId();
  const registry = useEvents();
  const command = useCommand(view.id);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preset = params.get('event');
  const back = backPath(params.get('back'));
  const bundles = ruleset.awards.attendance;

  // The staff's pick is tied to the `?event=` it was made under: a new link starts afresh (AC-2).
  const [picked, setPicked] = useState<{ key: string; preset: string | null } | undefined>(
    undefined,
  );
  const choice = picked && picked.preset === preset ? picked.key : undefined;
  const setChoice = (key: string) => setPicked({ key, preset });
  const todayIso = today();
  const [name, setName] = useState('');
  const [date, setDate] = useState(today);
  const [attendance, setAttendance] = useState<string>(bundles[0]?.id ?? 'player');
  const [paidChoice, setPaidChoice] = useState<'skills' | 'silver'>('skills');
  const [hours, setHours] = useState(0);
  const [extras, setExtras] = useState<string[]>([]);
  const [income, setIncome] = useState<CheckInChoices>({});
  const [cover, setCover] = useState<string | undefined>(undefined);
  const [note, setNote] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; date?: string }>({});
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const checkedIn = new Set(sheet.events.map((e) => e.key));
  /** Today's event, else the newest past one not checked in to, else a new event (AC-2). */
  const nextEvent = (alsoDone?: string): string =>
    defaultCheckInEvent(registry.events, checkedIn, todayIso, alsoDone) ?? NEW_EVENT;

  const presetKey = registry.events.some((e) => e.key === preset) ? preset : null;
  const selected = choice ?? (registry.loading ? NEW_EVENT : (presetKey ?? nextEvent()));
  const known = registry.events.find((e) => e.key === selected);
  const isNew = selected === NEW_EVENT || !known;

  const event: GameEvent | null = useMemo(() => {
    if (!isNew && known) return known;
    const trimmed = name.trim();
    if (trimmed === '' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    return { key: eventKey(date, trimmed), name: trimmed, date };
  }, [isNew, known, name, date]);

  const bundle = ruleset.attendanceById[attendance];
  const paid = bundle?.paidChoice ? paidChoice : undefined;
  const upkeep = useMemo(
    () => upkeepFor(ruleset, sheet, event?.key ?? NEW_EVENT),
    [ruleset, sheet, event],
  );
  const coveredBy = upkeep.due
    ? cover !== undefined && (cover === 'paid' || upkeep.covers.some((c) => c.id === cover))
      ? cover
      : defaultCover(upkeep)
    : null;
  const items = useMemo(
    () =>
      handOut(ruleset, sheet, attendance, paid, {
        ...income,
        ...(coveredBy !== null ? { upkeep: coveredBy } : {}),
      }),
    [ruleset, sheet, attendance, paid, income, coveredBy],
  );

  const commandFor = (e: GameEvent): CheckInCommand => ({
    type: 'checkIn',
    event: e,
    attendance: attendance as CheckInCommand['attendance'],
    npcHours: hours,
    extras,
    ...(paid ? { paidChoice: paid } : {}),
    ...(coveredBy !== null ? { upkeep: coveredBy } : {}),
    handedOut: handedOutTexts(items.items),
    ...(note.trim() ? { note: note.trim() } : {}),
  });

  const result = useMemo(
    () => (event ? preview(ruleset, sheet, commandFor(event)) : null),
    // commandFor reads only the state listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ruleset, sheet, event, attendance, paid, hours, extras, coveredBy, items, note],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (command.running) return;
    const found: { name?: string; date?: string } = {};
    if (isNew) {
      if (name.trim() === '') found.name = 'Enter the event name.';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) found.date = 'Enter the event date.';
    }
    setFieldErrors(found);
    if (found.name || found.date || !event) return;
    const outcome = await command.run(commandFor(event), {
      success: back
        ? `Checked in ${sheet.profile.characterName.trim() || 'the character'} to ${event.name}.`
        : `Checked in to ${event.name}.`,
    });
    if (!outcome.ok) return;
    try {
      await registry.save(event);
    } catch {
      // The check-in is saved; the registry only feeds the picker.
    }
    if (back) {
      void navigate(back);
      return;
    }
    const action = [...outcome.character.actions]
      .reverse()
      .find((a) => a.type === 'event.checkedIn');
    const payload = action ? (readPayload(action) as EventCheckedInPayload | null) : null;
    setReceipt({
      event,
      attendance: bundle?.name ?? attendance,
      awards: payload?.awards ?? result?.awards ?? [],
      notCredited: payload?.notCredited ?? result?.notCredited ?? [],
      upkeep: upkeepLine(ruleset, upkeep, coveredBy),
      handedOut: payload?.handedOut ?? handedOutTexts(items.items),
    });
    // Move on to the next event, so the form does not sit on the one just attended.
    setChoice(nextEvent(event.key));
    setName('');
    setHours(0);
    setExtras([]);
    setNote('');
  }

  return (
    <div className={styles.layout}>
      {receipt ? (
        <ReceiptCard view={view} receipt={receipt} onDismiss={() => setReceipt(null)} />
      ) : null}
      <form id={formId} noValidate className={styles.form} onSubmit={(e) => void submit(e)}>
        <Card title="Event" headingLevel={3}>
          <div className={styles.fields}>
            <Field
              label="Event"
              hint={
                registry.error
                  ? `Known events could not be read: ${registry.error}`
                  : known && isUpcoming(known, todayIso)
                    ? 'This event has not happened yet.'
                    : undefined
              }
            >
              {(control) => (
                <select
                  {...control}
                  value={selected}
                  onChange={(e) => {
                    setChoice(e.target.value);
                    setReceipt(null);
                  }}
                >
                  {registry.events.map((e) => (
                    <option key={e.key} value={e.key}>
                      {e.name}, {dateText(e.date)}
                      {checkedIn.has(e.key)
                        ? ' (checked in)'
                        : isUpcoming(e, todayIso)
                          ? ' (upcoming)'
                          : ''}
                    </option>
                  ))}
                  <option value={NEW_EVENT}>New event</option>
                </select>
              )}
            </Field>
            {isNew ? (
              <>
                <Field label="Event name" required error={fieldErrors.name}>
                  {(control) => (
                    <input
                      {...control}
                      autoComplete="off"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  )}
                </Field>
                <Field label="Event date" required error={fieldErrors.date}>
                  {(control) => (
                    <input
                      {...control}
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  )}
                </Field>
              </>
            ) : null}
          </div>
        </Card>

        <Card title="Attendance" headingLevel={3}>
          <div className={styles.fields}>
            <fieldset className={styles.group}>
              <legend className="visually-hidden">Attendance type</legend>
              {bundles.map((a) => (
                <label key={a.id} className={styles.check}>
                  <input
                    type="radio"
                    name={`${formId}-attendance`}
                    value={a.id}
                    checked={attendance === a.id}
                    onChange={() => setAttendance(a.id)}
                  />
                  <span>
                    {a.name} <span className={styles.hint}>({attendanceText(ruleset, a.id)})</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {bundle?.paidChoice ? (
              <fieldset className={styles.group}>
                <legend className={styles.legend}>Paid NPC: takes</legend>
                <label className={styles.check}>
                  <input
                    type="radio"
                    name={`${formId}-paid`}
                    checked={paidChoice === 'skills'}
                    onChange={() => setPaidChoice('skills')}
                  />
                  <span>Use of Crafting, Check-in, or Research skills</span>
                </label>
                <label className={styles.check}>
                  <input
                    type="radio"
                    name={`${formId}-paid`}
                    checked={paidChoice === 'silver'}
                    onChange={() => setPaidChoice('silver')}
                  />
                  <span>
                    Silver: 1 per {bundle.paidChoice.silverPerXp} XP earned (
                    {Math.floor(sheet.points.xp.earned / bundle.paidChoice.silverPerXp)} Silver)
                  </span>
                </label>
              </fieldset>
            ) : null}
          </div>
        </Card>

        <Card title="NPC time and extras" headingLevel={3}>
          <div className={styles.fields}>
            <HoursStepper
              value={hours}
              onChange={setHours}
              hint={
                bundle?.npcTimeMax
                  ? `${bundle.name} already gets NPC time at its maximum.`
                  : npcHint(ruleset)
              }
            />
            <fieldset className={styles.group}>
              <legend className={styles.legend}>Extras</legend>
              {ruleset.awards.extras.map((x) => (
                <label key={x.id} className={styles.check}>
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
                    {x.name} <span className={styles.hint}>({extraText(ruleset, x.id)})</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <Field label="Note" hint="Optional. Shown in the log.">
              {(control) => (
                <textarea {...control} value={note} onChange={(e) => setNote(e.target.value)} />
              )}
            </Field>
          </div>
        </Card>

        <Card title="Upkeep" headingLevel={3}>
          <div className={styles.fields}>
            {!upkeep.due ? (
              <p>{upkeepLine(ruleset, upkeep, null)}</p>
            ) : (
              <fieldset className={styles.group}>
                <legend className={styles.legend}>
                  Upkeep due: {upkeep.dueSilver} Silver. Covered by
                </legend>
                <label className={styles.check}>
                  <input
                    type="radio"
                    name={`${formId}-upkeep`}
                    checked={coveredBy === 'paid'}
                    onChange={() => setCover('paid')}
                  />
                  <span>Paid at the desk</span>
                </label>
                {upkeep.covers.map((c) => (
                  <label key={c.id} className={styles.check}>
                    <input
                      type="radio"
                      name={`${formId}-upkeep`}
                      checked={coveredBy === c.id}
                      onChange={() => setCover(c.id)}
                    />
                    <span>{c.summary}</span>
                  </label>
                ))}
              </fieldset>
            )}
          </div>
        </Card>

        <Card title="Items handed out" headingLevel={3}>
          <div className={styles.fields}>
            <IncomeChoices
              sources={sheet.stats.checkInIncome}
              choices={income}
              onChange={setIncome}
              upkeepBy={coveredBy}
            />
            <HandOutList texts={handedOutTexts(items.items)} />
            <ErrorList messages={items.problems} />
          </div>
        </Card>

        <Card title="Summary" headingLevel={3}>
          <div aria-live="polite" className={styles.fields}>
            {result === null ? (
              <p>Choose or name the event to see the awards.</p>
            ) : (
              <>
                <AwardList ruleset={ruleset} awards={result.awards ?? []} />
                <NotCreditedLine ruleset={ruleset} awards={result.notCredited ?? []} />
                <p>{upkeepLine(ruleset, upkeep, coveredBy)}</p>
                {result.notices.length > 0 ? (
                  <ul className={styles.notices}>
                    {result.notices
                      .filter((n) => !n.code.endsWith('_CAPPED'))
                      .map((n) => (
                        <li key={n.code + n.message}>{n.message}</li>
                      ))}
                  </ul>
                ) : null}
                {!result.allowed ? (
                  <ErrorList title="Cannot check in" messages={result.reasons} />
                ) : null}
              </>
            )}
            <ErrorList
              messages={command.errors
                .map((e) => e.message)
                .filter((m) => !(result?.reasons ?? []).includes(m))}
            />
            <div>
              {/* aria-disabled, not disabled, so focus stays on the button while saving. */}
              <Button variant="primary" type="submit" aria-disabled={command.running || undefined}>
                Check in
              </Button>
            </div>
          </div>
        </Card>
      </form>
    </div>
  );
}

function npcHint(ruleset: Ruleset): string {
  const t = ruleset.awards.npcTime;
  return `${t.xpPerHour} XP and ${t.cxpPerHour} CXP per hour up to ${t.maxHours} hours, then ${t.mtPerHourAfterMax} Mist Tokens per hour, at most ${t.mtCap}.`;
}

export function AwardList({ ruleset, awards }: { ruleset: Ruleset; awards: readonly Award[] }) {
  if (awards.length === 0) return <p>No points to award.</p>;
  return (
    <ul className={styles.awards} aria-label="Awards">
      {awards.map((a, i) => (
        <li key={`${a.kind}-${a.currency}-${i}`}>
          <span>{ledgerKindName(ruleset, a.kind)}</span>
          <span className={styles.amount}>
            {signed(a.amount)} {amountText(ruleset, a.currency, a.amount).replace(/^\d+ /, '')}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Amounts above the XP or CXP earned cap, in words. */
export function NotCreditedLine({
  ruleset,
  awards,
}: {
  ruleset: Ruleset;
  awards: readonly Award[];
}) {
  if (awards.length === 0) return null;
  return (
    <p className={styles.notices}>
      Not credited, earned cap reached:{' '}
      {awards
        .map(
          (a) =>
            `${amountText(ruleset, a.currency, a.amount)} (${ledgerKindName(ruleset, a.kind)})`,
        )
        .join(', ')}
      .
    </p>
  );
}

export function HandOutList({ texts }: { texts: readonly string[] }) {
  if (texts.length === 0) return <p>Nothing to hand out.</p>;
  return (
    <div>
      <p className={styles.subhead}>The desk hands out</p>
      <ul className={styles.plainList}>
        {texts.map((t, i) => (
          <li key={`${t}-${i}`}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

function HoursStepper({
  value,
  onChange,
  hint,
}: {
  value: number;
  onChange: (next: number) => void;
  hint: string;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={`${id}-label`} className={styles.stepper}>
      <span id={`${id}-label`} className={styles.legend}>
        NPC hours
      </span>
      <p id={`${id}-hint`} className={styles.hint}>
        {hint}
      </p>
      <div className={styles.stepperControls}>
        <IconButton
          variant="ghost"
          aria-label="Fewer NPC hours"
          aria-disabled={value <= 0 ? true : undefined}
          icon={<Minus />}
          onClick={() => {
            if (value > 0) onChange(value - 1);
          }}
        />
        <output className={styles.stepperValue} aria-live="polite" aria-describedby={`${id}-hint`}>
          {value}
        </output>
        <IconButton
          variant="ghost"
          aria-label="More NPC hours"
          aria-disabled={value >= MAX_HOURS ? true : undefined}
          icon={<Plus />}
          onClick={() => {
            if (value < MAX_HOURS) onChange(value + 1);
          }}
        />
      </div>
    </div>
  );
}

function ReceiptCard({
  view,
  receipt,
  onDismiss,
}: {
  view: CharacterView;
  receipt: Receipt;
  onDismiss: () => void;
}) {
  // Focus the "Checked in" heading when a receipt appears, so the next Tab continues from it.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const heading = ref.current?.querySelector<HTMLElement>('h3');
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus();
  }, [receipt]);

  return (
    <div ref={ref} className={styles.receiptWrap}>
      <Card title="Checked in" headingLevel={3} className={styles.receipt ?? ''}>
        <div className={styles.fields}>
          <p>
            {receipt.event.name}, {dateText(receipt.event.date)}. {receipt.attendance}.
          </p>
          <AwardList ruleset={view.ruleset} awards={receipt.awards} />
          <NotCreditedLine ruleset={view.ruleset} awards={receipt.notCredited} />
          <p>{receipt.upkeep}</p>
          <HandOutList texts={receipt.handedOut} />
          <div className={styles.actions}>
            <Link
              to={`/c/${view.id}/print?show=receipt&event=${encodeURIComponent(receipt.event.key)}`}
            >
              Print receipt
            </Link>
            <Link to={`/c/${view.id}/log`}>See the log</Link>
            <Button variant="ghost" onClick={onDismiss}>
              Close receipt
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
