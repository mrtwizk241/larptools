// `#/c/:id/points` (staff): award points, spend Shinies, and adjust points with a reason.
import { useId, useMemo, useState, type FormEvent } from 'react';
import {
  LEDGER_CURRENCIES,
  preview,
  type LedgerCurrency,
  type Ruleset,
  type SpendShiniesCommand,
} from '../../../../engine/index.ts';
import type { GameEvent } from '../../../../engine/model.ts';
import { Button, Card, Field } from '../../../components/index.ts';
import { useCommand } from '../../../data/engineHooks.ts';
import { amountText, currencyAbbr, dateText, signed } from '../../../lib/names.ts';
import { useEvents } from '../../../lib/useEvents.ts';
import { ErrorList } from '../ErrorList.tsx';
import type { CharacterView } from '../view.ts';
import styles from './points.module.css';

/** Ledger kinds that other commands record (the engine refuses them as awards). */
const RESERVED_KINDS = new Set([
  'transfer',
  'start',
  'infection-bonus',
  'retirement-carry',
  'shiny-purchase',
  'shiny-spend',
  'adjustment',
  'penalty',
]);

/**
 * Currencies each award kind is given in, from the rules (Event CXP is CXP only, attendance is FP,
 * NPC time and staff work are CXP, PXP, and Shinies, the Shiny earning lines are Shinies). Kinds
 * not listed here (Other award) fit every currency.
 */
const KIND_CURRENCIES: Readonly<Record<string, readonly LedgerCurrency[]>> = {
  event: ['cxp'],
  attendance: ['fp'],
  npc: ['cxp', 'pxp', 'shinies'],
  staff: ['cxp', 'pxp', 'shinies'],
  volunteer: ['shinies'],
  donation: ['shinies'],
  grades: ['shinies'],
};

/** True when an award of `kind` makes sense in `currency`. */
function kindFitsCurrency(kind: string, currency: LedgerCurrency): boolean {
  return KIND_CURRENCIES[kind]?.includes(currency) ?? true;
}

const WHOLE = /^\d+$/;
const SIGNED = /^-?\d+$/;

export function PointsPage({ view }: { view: CharacterView }) {
  const registry = useEvents();
  // Known events plus this character's check-ins, newest first.
  const events = useMemo(() => {
    const map = new Map<string, GameEvent>();
    for (const e of [...registry.events, ...view.sheet.events])
      if (!map.has(e.key)) map.set(e.key, { key: e.key, name: e.name, date: e.date });
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [registry.events, view.sheet.events]);

  return (
    <section aria-labelledby="points-heading" className={styles.section}>
      <h2 id="points-heading">Points</h2>
      {view.isStaff ? (
        <div className={styles.cards}>
          <AwardCard view={view} events={events} />
          <ShiniesCard view={view} events={events} />
          <AdjustCard view={view} />
        </div>
      ) : (
        <Card>
          <p>Only staff can award, spend, or adjust points. The Log shows how they were earned.</p>
        </Card>
      )}
    </section>
  );
}

function CurrencySelect({
  ruleset,
  value,
  onChange,
}: {
  ruleset: Ruleset;
  value: LedgerCurrency;
  onChange: (c: LedgerCurrency) => void;
}) {
  return (
    <Field label="Currency">
      {(control) => (
        <select
          {...control}
          value={value}
          onChange={(e) => onChange(e.target.value as LedgerCurrency)}
        >
          {LEDGER_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {currencyAbbr(ruleset, c)}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

function EventSelect({
  label,
  hint,
  events,
  value,
  onChange,
  emptyLabel,
  error,
}: {
  label: string;
  hint?: string;
  events: readonly GameEvent[];
  value: string;
  onChange: (key: string) => void;
  emptyLabel: string;
  error?: string | undefined;
}) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(control) => (
        <select {...control} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{emptyLabel}</option>
          {events.map((e) => (
            <option key={e.key} value={e.key}>
              {e.name}, {dateText(e.date)}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

// ---- Award points ----

function AwardCard({ view, events }: { view: CharacterView; events: readonly GameEvent[] }) {
  const { ruleset } = view;
  const formId = useId();
  const command = useCommand(view.id);
  const [currency, setCurrency] = useState<LedgerCurrency>('cxp');
  const kinds = ruleset.ruleset.ledgerKinds.filter(
    (k) => !RESERVED_KINDS.has(k.id) && kindFitsCurrency(k.id, currency),
  );
  const [amount, setAmount] = useState('');
  const [chosenKind, setKind] = useState('other-award');
  // A kind that does not fit a newly chosen currency falls back to Other award.
  const kind = kinds.some((k) => k.id === chosenKind)
    ? chosenKind
    : (kinds.find((k) => k.id === 'other-award')?.id ?? kinds[0]?.id ?? '');
  const [eventKey, setEventKey] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (command.running) return;
    const value = amount.trim();
    const bad = !WHOLE.test(value) || Number(value) < 1;
    setError(bad ? 'Enter a whole number of 1 or more.' : undefined);
    if (bad) return;
    const result = await command.run(
      {
        type: 'awardPoints',
        currency,
        amount: Number(value),
        kind,
        ...(eventKey ? { eventKey } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      },
      { success: `Awarded ${amountText(ruleset, currency, Number(value))}.` },
    );
    if (result.ok) {
      setAmount('');
      setNote('');
    }
  }

  return (
    <Card title="Award points" headingLevel={3}>
      <form id={formId} noValidate className={styles.form} onSubmit={(e) => void submit(e)}>
        <div className={styles.row}>
          <CurrencySelect ruleset={ruleset} value={currency} onChange={setCurrency} />
          <Field label="Amount" required error={error}>
            {(control) => (
              <input
                {...control}
                inputMode="numeric"
                autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label="Kind">
          {(control) => (
            <select {...control} value={kind} onChange={(e) => setKind(e.target.value)}>
              {kinds.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <EventSelect
          label="Event"
          hint="Optional. Event CXP needs one."
          events={events}
          value={eventKey}
          onChange={setEventKey}
          emptyLabel="No event"
        />
        <Field label="Note" hint="Optional. Shown in the log.">
          {(control) => (
            <textarea {...control} value={note} onChange={(e) => setNote(e.target.value)} />
          )}
        </Field>
        <ErrorList messages={command.errors.map((x) => x.message)} />
        <div>
          <Button variant="primary" type="submit" aria-disabled={command.running || undefined}>
            Award points
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---- Spend Shinies ----

function ShiniesCard({ view, events }: { view: CharacterView; events: readonly GameEvent[] }) {
  const { ruleset, sheet } = view;
  const formId = useId();
  const command = useCommand(view.id);
  const purchases = ruleset.awards.shinyPurchases;
  const [purchaseId, setPurchaseId] = useState(purchases[0]?.id ?? '');
  const [qty, setQty] = useState('1');
  const [eventKey, setEventKey] = useState('');
  const [missedKey, setMissedKey] = useState('');
  const [altName, setAltName] = useState('');
  const [attended, setAttended] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ qty?: string; attended?: string }>({});

  const purchase = ruleset.shinyPurchasesById[purchaseId];
  const single = purchase?.condition !== undefined || purchase?.eventCxp === true;
  const missed = purchase?.condition === 'missed-event';
  const alt = purchase?.condition === 'alt-character';
  const qtyNumber = single ? 1 : WHOLE.test(qty.trim()) ? Number(qty.trim()) : null;
  const attendedNumber = WHOLE.test(attended.trim()) ? Number(attended.trim()) : undefined;
  const checkedIn = new Set(sheet.events.map((e) => e.key));
  const missable = events.filter((e) => !checkedIn.has(e.key));
  const forEvent = missed ? events.find((e) => e.key === missedKey) : undefined;

  const cmd: SpendShiniesCommand | null =
    purchase && qtyNumber !== null && qtyNumber >= 1
      ? {
          type: 'spendShinies',
          purchaseId: purchase.id,
          qty: qtyNumber,
          ...(eventKey ? { eventKey } : {}),
          ...(forEvent ? { forEvent } : {}),
          ...(alt && altName.trim() ? { altCharacter: { name: altName.trim() } } : {}),
          ...((missed || alt) && attendedNumber !== undefined
            ? { playerEventsAttendedInYear: attendedNumber }
            : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        }
      : null;
  const check = useMemo(
    () => (cmd ? preview(ruleset, sheet, cmd) : null),
    // The command is rebuilt from the state below on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ruleset, sheet, purchaseId, qtyNumber, eventKey, missedKey, altName, attendedNumber, note],
  );

  const bought =
    purchase?.capPerEvent !== undefined && eventKey
      ? sheet.shinyPurchases
          .filter((p) => p.purchaseId === purchase.id && p.eventKey === eventKey)
          .reduce((sum, p) => sum + p.qty, 0)
      : null;
  const condition = ruleset.awards.conditions.find((c) => c.id === purchase?.condition);

  // The live check already says it cannot buy: the button is aria-disabled with that reason.
  const blocked = check !== null && !check.allowed;
  const reasonId = `${formId}-cannot-buy`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (command.running || blocked) return;
    const found: { qty?: string; attended?: string } = {};
    if (qtyNumber === null || qtyNumber < 1) found.qty = 'Enter a whole number of 1 or more.';
    if (attended.trim() !== '' && attendedNumber === undefined)
      found.attended = 'Enter a whole number, or leave it empty.';
    setErrors(found);
    if (found.qty || found.attended || !cmd || !purchase) return;
    const result = await command.run(cmd, {
      success: `Spent ${amountText(ruleset, 'shinies', purchase.price * (qtyNumber ?? 1))} on ${purchase.name}.`,
    });
    if (result.ok) {
      setQty('1');
      setNote('');
      setAltName('');
      setMissedKey('');
    }
  }

  return (
    <Card title="Spend Shinies" headingLevel={3}>
      <form id={formId} noValidate className={styles.form} onSubmit={(e) => void submit(e)}>
        <p>
          Balance: <span className="num">{sheet.points.shinies.balance}</span>{' '}
          {currencyAbbr(ruleset, 'shinies')}.
        </p>
        <Field label="Buy">
          {(control) => (
            <select {...control} value={purchaseId} onChange={(e) => setPurchaseId(e.target.value)}>
              {purchases.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.price} {currencyAbbr(ruleset, 'shinies')}
                  {p.condition === undefined && !p.eventCxp ? ' each' : ''})
                </option>
              ))}
            </select>
          )}
        </Field>
        {condition ? <p className={styles.rule}>{condition.text}</p> : null}
        {single ? null : (
          <Field label="Quantity" required error={errors.qty}>
            {(control) => (
              <input
                {...control}
                inputMode="numeric"
                autoComplete="off"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            )}
          </Field>
        )}
        <EventSelect
          label={alt ? 'Event the other character played' : 'Event bought at'}
          {...(purchase?.capPerEvent !== undefined
            ? { hint: `At most ${purchase.capPerEvent} per event.` }
            : {})}
          events={events}
          value={eventKey}
          onChange={setEventKey}
          emptyLabel={purchase?.capPerEvent !== undefined || alt ? 'Choose the event' : 'No event'}
        />
        {missed ? (
          <EventSelect
            label="Event missed"
            hint="Events this character has not checked in to."
            events={missable}
            value={missedKey}
            onChange={setMissedKey}
            emptyLabel="Choose the event missed"
          />
        ) : null}
        {alt ? (
          <Field label="Other character" hint="Gets the Event CXP. Record it on their sheet too.">
            {(control) => (
              <input
                {...control}
                autoComplete="off"
                value={altName}
                onChange={(e) => setAltName(e.target.value)}
              />
            )}
          </Field>
        ) : null}
        {missed || alt ? (
          <Field
            label="Events the player attended that year"
            hint="Optional: across all their characters. Leave empty to count this character's."
            error={errors.attended}
          >
            {(control) => (
              <input
                {...control}
                inputMode="numeric"
                autoComplete="off"
                value={attended}
                onChange={(e) => setAttended(e.target.value)}
              />
            )}
          </Field>
        ) : null}
        <Field label="Note" hint="Optional. Shown in the log.">
          {(control) => (
            <textarea {...control} value={note} onChange={(e) => setNote(e.target.value)} />
          )}
        </Field>
        <div aria-live="polite" className={styles.preview}>
          {purchase && qtyNumber !== null && qtyNumber >= 1 ? (
            <p>
              Price: <span className="num">{purchase.price * qtyNumber}</span>{' '}
              {currencyAbbr(ruleset, 'shinies')}
              {bought !== null && purchase.capPerEvent !== undefined ? (
                <>
                  . Left this event:{' '}
                  <span className="num">{Math.max(0, purchase.capPerEvent - bought)}</span> of{' '}
                  <span className="num">{purchase.capPerEvent}</span>
                </>
              ) : null}
              .
            </p>
          ) : null}
          {check && !check.allowed ? (
            <div id={reasonId}>
              <ErrorList title="Cannot buy yet" messages={check.reasons} />
            </div>
          ) : null}
        </div>
        {/* Each message once: errors the live check already shows are not repeated. */}
        <ErrorList
          messages={command.errors
            .map((x) => x.message)
            .filter((m) => !(check?.reasons ?? []).includes(m))}
        />
        <div>
          <Button
            variant="primary"
            type="submit"
            aria-disabled={command.running || blocked || undefined}
            aria-describedby={blocked ? reasonId : undefined}
            className={blocked ? styles.blocked : undefined}
          >
            Spend Shinies
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---- Adjust points ----

function AdjustCard({ view }: { view: CharacterView }) {
  const { ruleset } = view;
  const formId = useId();
  const command = useCommand(view.id);
  const [currency, setCurrency] = useState<LedgerCurrency>('cxp');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; reason?: string }>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (command.running) return;
    const value = amount.trim();
    const found: { amount?: string; reason?: string } = {};
    if (!SIGNED.test(value) || Number(value) === 0)
      found.amount = 'Enter a whole number other than 0, for example -5.';
    if (reason.trim() === '') found.reason = 'Enter a reason for the adjustment.';
    setErrors(found);
    if (found.amount || found.reason) return;
    const result = await command.run(
      { type: 'adjustPoints', currency, amount: Number(value), reason: reason.trim() },
      { success: `Adjusted ${currencyAbbr(ruleset, currency)} by ${signed(Number(value))}.` },
    );
    if (result.ok) {
      setAmount('');
      setReason('');
    }
  }

  return (
    <Card title="Adjust points" headingLevel={3}>
      <form id={formId} noValidate className={styles.form} onSubmit={(e) => void submit(e)}>
        <p className={styles.rule}>
          For corrections and penalties: a negative amount takes points away. The log keeps the
          original entry and this one.
        </p>
        <div className={styles.row}>
          <CurrencySelect ruleset={ruleset} value={currency} onChange={setCurrency} />
          <Field label="Amount" required error={errors.amount}>
            {(control) => (
              <input
                {...control}
                inputMode="text"
                autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label="Reason" hint="Recorded in the log." required error={errors.reason}>
          {(control) => (
            <textarea {...control} value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </Field>
        <ErrorList messages={command.errors.map((x) => x.message)} />
        <div>
          <Button variant="primary" type="submit" aria-disabled={command.running || undefined}>
            Adjust points
          </Button>
        </div>
      </form>
    </Card>
  );
}
