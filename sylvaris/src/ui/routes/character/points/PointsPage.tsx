// `#/c/:id/points` (staff): award points with a live preview of what the earned cap allows, spend
// Mist Tokens (price, caps left, back-buys, teaching, missed and alternate character event XP),
// and adjust points with a reason. CharacterLayout shows players a staff-only notice instead.
import { useId, useMemo, useState, type FormEvent } from 'react';
import {
  LEDGER_CURRENCIES,
  type LedgerCurrency,
  type PreviewResult,
  type Ruleset,
} from '../../../../engine/index.ts';
import type { GameEvent, NamedLevelId } from '../../../../engine/model.ts';
import { Button, Card, Field } from '../../../components/index.ts';
import { previewCommand, useCommand } from '../../../data/engineHooks.ts';
import { amountText, currencyAbbr, dateText, ledgerKindName, signed } from '../../../lib/names.ts';
import { useEvents } from '../../../lib/useEvents.ts';
import type { CharacterScreen } from '../screen.tsx';
import { ErrorList } from '../ErrorList.tsx';
import { TableScroll } from '../TableScroll.tsx';
import type { CharacterView } from '../view.ts';
import tableStyles from '../character.module.css';
import {
  attendedInYear,
  awardKinds,
  capLeft,
  capText,
  forEventOptions,
  isSingle,
  isTeaching,
  levelName,
  priceText,
  soldLevels,
  spendCommand,
  teachableSkills,
} from './purchases.ts';
import styles from './points.module.css';

const WHOLE = /^\d+$/;
const SIGNED = /^-?\d+$/;

/** Points (staff): award, spend Mist Tokens, adjust. */
export const PointsPage: CharacterScreen = ({ view }) => {
  const registry = useEvents();
  // Known events plus this character's check-ins, newest first.
  const events = useMemo(() => {
    const map = new Map<string, GameEvent>();
    for (const e of [...view.sheet.events, ...registry.events])
      if (!map.has(e.key)) map.set(e.key, { key: e.key, name: e.name, date: e.date });
    return [...map.values()].sort(
      (a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key),
    );
  }, [registry.events, view.sheet.events]);

  return (
    <section aria-labelledby="points-heading" className={styles.section}>
      <h2 id="points-heading">Points</h2>
      <div className={styles.cards}>
        <AwardCard view={view} events={events} />
        <MistTokensCard view={view} events={events} />
        <AdjustCard view={view} events={events} />
      </div>
    </section>
  );
};

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
  hint?: string | undefined;
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

function NoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Note" hint="Optional. Shown in the log.">
      {(control) => (
        <textarea {...control} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}

/** The live check's reasons, once, with the id the blocked button points to. */
function Blocked({ id, check, title }: { id: string; check: PreviewResult | null; title: string }) {
  if (!check || check.allowed) return null;
  return (
    <div id={id}>
      <ErrorList title={title} messages={check.reasons} />
    </div>
  );
}

// ---- Award points ----

function AwardCard({ view, events }: { view: CharacterView; events: readonly GameEvent[] }) {
  const { ruleset, sheet } = view;
  const formId = useId();
  const command = useCommand(view.id);
  const [currency, setCurrency] = useState<LedgerCurrency>('xp');
  const kinds = awardKinds(ruleset, currency);
  const [amount, setAmount] = useState('');
  const [chosenKind, setKind] = useState('gm-award');
  // A kind that does not fit a newly chosen currency falls back to GM award.
  const kind = kinds.some((k) => k.id === chosenKind)
    ? chosenKind
    : (kinds.find((k) => k.id === 'gm-award')?.id ?? kinds[0]?.id ?? '');
  const [eventKey, setEventKey] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const value = amount.trim();
  const n = WHOLE.test(value) && Number(value) >= 1 ? Number(value) : null;

  const check = useMemo(
    () =>
      n === null
        ? null
        : previewCommand(ruleset, sheet, {
            type: 'awardPoints',
            currency,
            amount: n,
            kind,
            ...(eventKey ? { eventKey } : {}),
          }),
    [ruleset, sheet, currency, n, kind, eventKey],
  );
  const capped = currency === 'xp' || currency === 'cxp' ? sheet.points[currency] : null;
  const blocked = check !== null && !check.allowed;
  const reasonId = `${formId}-cannot-award`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (command.running || blocked) return;
    setError(n === null ? 'Enter a whole number of 1 or more.' : undefined);
    if (n === null) return;
    const credited = check?.awards?.[0]?.amount ?? n;
    const result = await command.run(
      {
        type: 'awardPoints',
        currency,
        amount: n,
        kind,
        ...(eventKey ? { eventKey } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      },
      { success: `Awarded ${amountText(ruleset, currency, credited)}.` },
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
                  {ledgerKindName(ruleset, k.id)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <EventSelect
          label="Event"
          hint="Optional. Event attendance needs one."
          events={events}
          value={eventKey}
          onChange={setEventKey}
          emptyLabel="No event"
        />
        <NoteField value={note} onChange={setNote} />
        <div aria-live="polite" className={styles.preview}>
          {capped ? (
            <p className={styles.rule}>
              Earned {currencyAbbr(ruleset, currency)}: <span className="num">{capped.earned}</span>{' '}
              of the <span className="num">{capped.cap}</span> cap;{' '}
              <span className="num">{capped.capRemaining}</span> more can be credited.
            </p>
          ) : null}
          {check?.allowed && check.awards ? (
            <p>
              Credits{' '}
              {check.awards.map((a) => amountText(ruleset, a.currency, a.amount)).join(', ')}
              {check.notCredited && check.notCredited.length > 0
                ? `. Not credited, earned cap reached: ${check.notCredited
                    .map((a) => amountText(ruleset, a.currency, a.amount))
                    .join(', ')}`
                : ''}
              .
            </p>
          ) : null}
          <Blocked id={reasonId} check={check} title="Cannot award" />
        </div>
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
            Award points
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---- Spend Mist Tokens ----

function MistTokensCard({ view, events }: { view: CharacterView; events: readonly GameEvent[] }) {
  const { ruleset, sheet } = view;
  const formId = useId();
  const command = useCommand(view.id);
  const purchases = ruleset.awards.mtPurchases;
  const [purchaseId, setPurchaseId] = useState(purchases[0]?.id ?? '');
  const [qty, setQty] = useState('1');
  const [levelChoice, setLevel] = useState<NamedLevelId | ''>('');
  const [skillId, setSkillId] = useState('');
  const [eventKey, setEventKey] = useState('');
  const [forChoice, setForEventKey] = useState('');
  const [attendedText, setAttended] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ qty?: string; attended?: string }>({});

  const purchase = ruleset.mtPurchasesById[purchaseId];
  const single = purchase ? isSingle(purchase) : true;
  const condition = purchase?.condition;
  const levels = purchase ? soldLevels(purchase) : [];
  const namedLevel = levels.includes(levelChoice as NamedLevelId) ? levelChoice : (levels[0] ?? '');
  const forOptions = purchase ? forEventOptions(purchase, sheet, events, eventKey) : [];
  const forEventKey = forOptions.some((e) => e.key === forChoice) ? forChoice : '';
  const offersFor =
    purchase !== undefined && (purchase.backBuy === true || condition !== undefined);
  const yearKey = forEventKey || eventKey;
  // Missed and alternate character purchases: defaults to this character's events that year.
  const attendedDefault = yearKey ? String(attendedInYear(sheet, forEventKey || eventKey)) : '';
  const attended = attendedText ?? attendedDefault;
  const attendedNumber = WHOLE.test(attended.trim()) ? Number(attended.trim()) : null;
  const qtyNumber = single ? 1 : WHOLE.test(qty.trim()) ? Number(qty.trim()) : null;
  const skills = purchase && isTeaching(purchase) ? teachableSkills(ruleset, purchase) : [];
  const conditionText = ruleset.awards.conditions.find((c) => c.id === condition)?.text;

  const cmd =
    purchase && qtyNumber !== null && qtyNumber >= 1
      ? spendCommand(purchase, {
          purchaseId,
          qty: qtyNumber,
          namedLevel,
          skillId,
          eventKey,
          forEventKey,
          attended: condition !== undefined ? attendedNumber : null,
          note,
        })
      : null;
  const check = useMemo(
    () => (cmd ? previewCommand(ruleset, sheet, cmd) : null),
    // The command is rebuilt from the state below on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      ruleset,
      sheet,
      purchaseId,
      qtyNumber,
      namedLevel,
      skillId,
      eventKey,
      forEventKey,
      attendedNumber,
    ],
  );
  const capKey = forEventKey || eventKey || null;
  const unit = purchase
    ? (purchase.mtCost ?? (namedLevel ? purchase.mtByNamedLevel?.[namedLevel] : undefined))
    : undefined;

  const blocked = check !== null && !check.allowed;
  const reasonId = `${formId}-cannot-buy`;
  const missingEvent = offersFor && condition !== undefined && (!eventKey || !forEventKey);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (command.running || blocked) return;
    const found: { qty?: string; attended?: string } = {};
    if (qtyNumber === null || qtyNumber < 1) found.qty = 'Enter a whole number of 1 or more.';
    if (condition !== undefined && attendedNumber === null)
      found.attended = 'Enter the number of events, for example 2.';
    setErrors(found);
    if (found.qty || found.attended || !cmd || !purchase) return;
    const result = await command.run(cmd, {
      success: `Spent ${amountText(ruleset, 'mt', (unit ?? 0) * (qtyNumber ?? 1))} on ${purchase.name}.`,
    });
    if (result.ok) {
      setQty('1');
      setNote('');
      setForEventKey('');
    }
  }

  return (
    <Card title="Spend Mist Tokens" headingLevel={3}>
      <form id={formId} noValidate className={styles.form} onSubmit={(e) => void submit(e)}>
        <p>
          Balance: <span className="num">{sheet.points.mt.balance}</span> Mist Tokens.
        </p>
        <EventSelect
          label="Event bought at"
          hint="Caps count per event. Choose it for every capped purchase."
          events={events}
          value={eventKey}
          onChange={setEventKey}
          emptyLabel="Choose the event"
        />
        <PurchaseTable view={view} capKey={eventKey || null} />
        <Field label="Buy">
          {(control) => (
            <select {...control} value={purchaseId} onChange={(e) => setPurchaseId(e.target.value)}>
              {purchases.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({priceText(p)})
                </option>
              ))}
            </select>
          )}
        </Field>
        {conditionText ? <p className={styles.rule}>{conditionText}</p> : null}
        {levels.length > 0 ? (
          <Field label="Named level">
            {(control) => (
              <select
                {...control}
                value={namedLevel}
                onChange={(e) => setLevel(e.target.value as NamedLevelId)}
              >
                {levels.map((l) => (
                  <option key={l} value={l}>
                    {levelName(l)} ({purchase?.mtByNamedLevel?.[l] ?? 0} Mist Tokens)
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
        {purchase && isTeaching(purchase) ? (
          <Field label="Skill taught" hint="Used instead of a teacher when the skill is learned.">
            {(control) => (
              <select {...control} value={skillId} onChange={(e) => setSkillId(e.target.value)}>
                <option value="">Choose the skill</option>
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
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
        {offersFor ? (
          <EventSelect
            label={
              condition === 'missed-event'
                ? 'Event missed'
                : condition === 'alt-character'
                  ? 'Event played with another character'
                  : 'For an earlier event'
            }
            hint={
              eventKey === ''
                ? 'Choose the event bought at first. Both must be in the same year.'
                : condition === 'missed-event'
                  ? 'Known events of the same year this character has no credit for.'
                  : condition === 'alt-character'
                    ? 'Known events of the same year this character did not attend.'
                    : 'Optional back-buy: an event this character attended earlier the same year.'
            }
            events={forOptions}
            value={forEventKey}
            onChange={setForEventKey}
            emptyLabel={condition !== undefined ? 'Choose the event' : 'This event'}
          />
        ) : null}
        {condition !== undefined ? (
          <Field
            label="Events the player attended that year"
            hint={
              condition === 'alt-character'
                ? 'Across all their characters. One use per event attended, at most 3 a year.'
                : 'Across all their characters. At least 1 other event is needed.'
            }
            required
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
        <NoteField value={note} onChange={setNote} />
        <div aria-live="polite" className={styles.preview}>
          {purchase && unit !== undefined && qtyNumber !== null && qtyNumber >= 1 ? (
            <p>
              Price: <span className="num">{unit * qtyNumber}</span> Mist Tokens.{' '}
              {capText(purchase, capLeft(ruleset, sheet, purchase, capKey))}
            </p>
          ) : null}
          {missingEvent ? (
            <p className={styles.rule}>Choose both events to check this purchase.</p>
          ) : null}
          <Blocked id={reasonId} check={check} title="Cannot buy yet" />
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
            Spend Mist Tokens
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Every purchase with its price and the cap left at the chosen event. */
function PurchaseTable({ view, capKey }: { view: CharacterView; capKey: string | null }) {
  const { ruleset, sheet } = view;
  return (
    <TableScroll label="Mist Token prices">
      <table className={`${tableStyles.table ?? ''} ${styles.priceTable ?? ''}`}>
        <caption className="visually-hidden">
          Mist Token purchases: price and the cap left for the event chosen above.
        </caption>
        <thead>
          <tr>
            <th scope="col">Purchase</th>
            <th scope="col">Price</th>
            <th scope="col">Cap left</th>
          </tr>
        </thead>
        <tbody>
          {ruleset.awards.mtPurchases.map((p) => {
            const left = capLeft(ruleset, sheet, p, capKey);
            const parts: string[] = [];
            if (p.capPerEvent !== undefined)
              parts.push(
                left.perEvent
                  ? `${left.perEvent.left} of ${p.capPerEvent} this event`
                  : `${p.capPerEvent} per event`,
              );
            if (p.capPerYear !== undefined)
              parts.push(
                left.perYear
                  ? `${left.perYear.left} of ${p.capPerYear} in ${left.perYear.year}`
                  : `${p.capPerYear} per year`,
              );
            return (
              <tr key={p.id}>
                <th scope="row">{p.name}</th>
                <td>{priceText(p)}</td>
                <td>{parts.length > 0 ? parts.join(', ') : 'No cap'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableScroll>
  );
}

// ---- Adjust points ----

function AdjustCard({ view, events }: { view: CharacterView; events: readonly GameEvent[] }) {
  const { ruleset } = view;
  const formId = useId();
  const command = useCommand(view.id);
  const [currency, setCurrency] = useState<LedgerCurrency>('xp');
  const [kind, setKind] = useState<'adjustment' | 'penalty'>('adjustment');
  const [amount, setAmount] = useState('');
  const [eventKey, setEventKey] = useState('');
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
      {
        type: 'adjustPoints',
        currency,
        amount: Number(value),
        kind,
        reason: reason.trim(),
        ...(eventKey ? { eventKey } : {}),
      },
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
          original entry and this one. Adjustments are not held to the earned caps.
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
        <Field label="Type">
          {(control) => (
            <select
              {...control}
              value={kind}
              onChange={(e) => setKind(e.target.value as 'adjustment' | 'penalty')}
            >
              <option value="adjustment">Correction</option>
              <option value="penalty">Penalty</option>
            </select>
          )}
        </Field>
        <EventSelect
          label="Event"
          hint="Optional."
          events={events}
          value={eventKey}
          onChange={setEventKey}
          emptyLabel="No event"
        />
        <Field label="Reason" hint="Required. Recorded in the log." required error={errors.reason}>
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
