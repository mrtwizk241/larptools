// `#/c/:id/checkin` (staff): record attendance at one event with NPC hours and extras, preview the
// awards with caps applied, then check in and show a receipt. `?event=<key>` preselects a known
// event; `?back=<path>` returns there after a successful check-in (the staff Events list).
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Minus, Plus } from 'lucide-react';
import {
  preview,
  type Award,
  type CheckInCommand,
  type EventCheckedInPayload,
} from '../../../../engine/index.ts';
import { eventKey, type GameEvent } from '../../../../engine/model.ts';
import { Button, Card, Field, IconButton } from '../../../components/index.ts';
import { useCommand } from '../../../data/engineHooks.ts';
import { readPayload } from '../../../lib/describeAction.ts';
import { currencyAbbr, dateText, ledgerKindName, signed } from '../../../lib/names.ts';
import { useEvents } from '../../../lib/useEvents.ts';
import { ErrorList } from '../ErrorList.tsx';
import type { CharacterView } from '../view.ts';
import styles from './checkin.module.css';

const NEW_EVENT = '__new__';
const MAX_HOURS = 200;

/** An in-app path to return to, or null when `value` is missing or not a plain app path. */
function backPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return null;
  return value;
}

interface Receipt {
  event: GameEvent;
  attendance: string;
  awards: readonly Award[];
  owed: readonly string[];
}

export function CheckInPage({ view }: { view: CharacterView }) {
  return (
    <section aria-labelledby="checkin-heading" className={styles.section}>
      <h2 id="checkin-heading">Check-in</h2>
      {view.isStaff ? (
        <CheckInForm view={view} />
      ) : (
        <Card>
          <p>Only staff can check a character in. Ask at the check-in desk.</p>
        </Card>
      )}
    </section>
  );
}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function CheckInForm({ view }: { view: CharacterView }) {
  const { ruleset, sheet } = view;
  const formId = useId();
  const registry = useEvents();
  const command = useCommand(view.id);
  const awardsRules = ruleset.awards;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preset = params.get('event');
  const back = backPath(params.get('back'));

  const [choice, setChoice] = useState<string | undefined>(undefined);
  const [name, setName] = useState('');
  const [date, setDate] = useState(today);
  const [attendance, setAttendance] = useState(awardsRules.attendance[0]?.id ?? 'player');
  const [hours, setHours] = useState(0);
  const [preSigned, setPreSigned] = useState(false);
  const [extras, setExtras] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; date?: string }>({});
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const checkedIn = new Set(sheet.events.map((e) => e.key));
  /** Newest known event this character is not checked in to, else a new event. */
  const nextEvent = (alsoDone?: string): string =>
    registry.events.find((e) => !checkedIn.has(e.key) && e.key !== alsoDone)?.key ?? NEW_EVENT;

  // Until staff pick: the event from the link, else the newest known event this character has not
  // attended, else a new one (never an event it is already checked in to).
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

  const commandFor = (e: GameEvent): CheckInCommand => ({
    type: 'checkIn',
    event: e,
    attendance,
    npcHours: hours,
    preSignedShift: preSigned,
    extras,
    ...(note.trim() ? { note: note.trim() } : {}),
  });

  const result = useMemo(
    () => (event ? preview(ruleset, sheet, commandFor(event)) : null),
    // commandFor reads only the state listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ruleset, sheet, event, attendance, hours, preSigned, extras, note],
  );

  const bundle = ruleset.attendanceById[attendance];
  const npc = awardsRules.npcTime;

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
      owed: payload?.owed ?? result?.owed ?? [],
    });
    // Move on to the next event to check in to, so the form does not sit on one just attended.
    setChoice(nextEvent(event.key));
    setName('');
    setHours(0);
    setPreSigned(false);
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
                registry.error ? `Known events could not be read: ${registry.error}` : undefined
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
                      {checkedIn.has(e.key) ? ' (checked in)' : ''}
                    </option>
                  ))}
                  <option value={NEW_EVENT}>New event…</option>
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
          <fieldset className={styles.group}>
            <legend className="visually-hidden">Attendance type</legend>
            {awardsRules.attendance.map((a) => (
              <label key={a.id} className={styles.check}>
                <input
                  type="radio"
                  name={`${formId}-attendance`}
                  value={a.id}
                  checked={attendance === a.id}
                  onChange={() => setAttendance(a.id)}
                />
                <span>{a.name}</span>
              </label>
            ))}
          </fieldset>
        </Card>

        <Card title="NPC time and extras" headingLevel={3}>
          <div className={styles.fields}>
            <HoursStepper
              value={hours}
              onChange={setHours}
              hint={
                bundle?.npcTimeMax
                  ? `${bundle.name} already gets NPC time at its maximum.`
                  : `Up to ${npc.maxHours} hours earn CXP and PXP; Shinies are capped at ${npc.shiniesCap}.`
              }
            />
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={preSigned}
                onChange={(e) => setPreSigned(e.target.checked)}
              />
              <span>
                Signed up for a {npc.preSignedShift.shiftHours} hour NPC shift before the event
                (counts as at least {npc.preSignedShift.creditedHours} hours)
              </span>
            </label>
            <fieldset className={styles.group}>
              <legend className={styles.legend}>Extras</legend>
              {awardsRules.extras.map((x) => (
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
                    {x.name} (
                    {x.grants
                      .map((g) => `${signed(g.amount)} ${currencyAbbr(ruleset, g.currency)}`)
                      .join(', ')}
                    )
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

        <Card title="Summary" headingLevel={3}>
          <div aria-live="polite" className={styles.fields}>
            {result === null ? (
              <p>Choose or name the event to see the awards.</p>
            ) : (
              <>
                <AwardList view={view} awards={result.awards ?? []} />
                {result.owed && result.owed.length > 0 ? (
                  <div>
                    <p className={styles.subhead}>Items owed</p>
                    <ul className={styles.plainList}>
                      {result.owed.map((o) => (
                        <li key={o}>{o}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {result.notices.length > 0 ? (
                  <ul className={styles.notices}>
                    {result.notices.map((n) => (
                      <li key={n.code + n.message}>{n.message}</li>
                    ))}
                  </ul>
                ) : null}
                {!result.allowed ? (
                  <ErrorList title="Cannot check in" messages={result.reasons} />
                ) : null}
              </>
            )}
            <ErrorList messages={command.errors.map((e) => e.message)} />
            <div>
              {/* aria-disabled, not disabled, so focus stays on the button while saving (A-04). */}
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

function AwardList({ view, awards }: { view: CharacterView; awards: readonly Award[] }) {
  if (awards.length === 0) return <p>No points to award.</p>;
  return (
    <ul className={styles.awards} aria-label="Awards">
      {awards.map((a, i) => (
        <li key={`${a.kind}-${a.currency}-${i}`}>
          <span>{ledgerKindName(view.ruleset, a.kind)}</span>
          <span className={styles.amount}>
            {signed(a.amount)} {currencyAbbr(view.ruleset, a.currency)}
          </span>
        </li>
      ))}
    </ul>
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
  // Focus the "Checked in" heading when a receipt appears, so the next Tab continues from the
  // receipt instead of the top of the page (a11y A-04).
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const heading = ref.current?.querySelector<HTMLElement>('h3');
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus();
  }, [receipt]);

  return (
    <div ref={ref} className={styles.receiptWrap}>
      <ReceiptBody view={view} receipt={receipt} onDismiss={onDismiss} />
    </div>
  );
}

function ReceiptBody({
  view,
  receipt,
  onDismiss,
}: {
  view: CharacterView;
  receipt: Receipt;
  onDismiss: () => void;
}) {
  return (
    <Card title="Checked in" headingLevel={3} className={styles.receipt ?? ''}>
      <div className={styles.fields} role="status">
        <p>
          {receipt.event.name}, {dateText(receipt.event.date)}. {receipt.attendance}.
        </p>
        <AwardList view={view} awards={receipt.awards} />
        {receipt.owed.length > 0 ? (
          <div>
            <p className={styles.subhead}>Items owed</p>
            <ul className={styles.plainList}>
              {receipt.owed.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className={styles.actions}>
          <Link to={`/c/${view.id}/log`}>See the log</Link>
          <Button variant="ghost" onClick={onDismiss}>
            Close receipt
          </Button>
        </div>
      </div>
    </Card>
  );
}
