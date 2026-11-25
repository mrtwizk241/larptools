// The printable check-in receipt for one event: about half a US Letter page.
import { UNNAMED_CHARACTER } from '../../../data/summary.ts';
import { amountText, dateText, signedTotals } from '../../../lib/names.ts';
import type { CharacterView } from '../view.ts';
import type { ReceiptAward, ReceiptData } from './receipt.ts';
import { PLAYER_TOOL_FOOTER } from './sheetModel.ts';
import styles from './print.module.css';

export function CheckInReceipt({
  view,
  receipt,
  printedAt,
}: {
  view: CharacterView;
  receipt: ReceiptData;
  printedAt: Date;
}) {
  const { ruleset } = view;
  const name = receipt.characterName.trim() || UNNAMED_CHARACTER;
  const amount = (a: ReceiptAward) =>
    `${a.amount > 0 ? '+' : ''}${amountText(ruleset, a.currency, a.amount)}`;
  const award = (a: ReceiptAward, i: number) => (
    <tr key={`${a.label}-${a.currency}-${i}`}>
      <th scope="row">{a.label}</th>
      <td className={styles.n}>{amount(a)}</td>
    </tr>
  );
  const attendance = [
    receipt.attendance,
    receipt.npcHours > 0 ? `${receipt.npcHours} NPC hours` : null,
    receipt.extras.length > 0 ? `extras: ${receipt.extras.join(', ')}` : null,
  ].filter((f): f is string => f !== null);
  const total = signedTotals(ruleset, [...receipt.awards, ...receipt.otherPoints]);

  return (
    <article
      className={`${styles.paper} ${styles.receipt}`}
      aria-label={`Check-in receipt for ${name}`}
    >
      <div className={styles.top}>
        <div>
          <h3 className={styles.title}>Check-in receipt</h3>
          <p>
            <strong>{name}</strong>
            {receipt.playerName ? ` · Player: ${receipt.playerName}` : ''}
          </p>
        </div>
        <dl className={styles.vitals}>
          <div>
            <dt>Event</dt>
            <dd>{receipt.event.name}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{dateText(receipt.event.date)}</dd>
          </div>
        </dl>
      </div>
      <p>
        <strong>Attendance:</strong> {attendance.join(', ')}.
      </p>
      <div className={styles.tables}>
        <table className={styles.table} aria-label="Awards">
          <thead>
            <tr>
              <th scope="col">Awards (after caps)</th>
              <th scope="col" className={styles.right}>
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {receipt.awards.length === 0 && receipt.otherPoints.length === 0 ? (
              <tr>
                <td colSpan={2}>No points awarded.</td>
              </tr>
            ) : null}
            {receipt.awards.map(award)}
            {receipt.otherPoints.map(award)}
          </tbody>
          {total ? (
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td className={`${styles.n} ${styles.totals}`}>
                  {total.split(', ').map((part, i) => (
                    <span key={part}>
                      {i > 0 ? ', ' : null}
                      {part}
                    </span>
                  ))}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
        <table className={styles.table} aria-label="Mist Token purchases">
          <thead>
            <tr>
              <th scope="col">Mist Token purchases</th>
              <th scope="col" className={styles.right}>
                MT
              </th>
            </tr>
          </thead>
          <tbody>
            {receipt.purchases.length === 0 ? (
              <tr>
                <td colSpan={2}>None.</td>
              </tr>
            ) : null}
            {receipt.purchases.map((p, i) => {
              const got = [...p.grants.map(amount), ...p.items];
              return (
                <tr key={`${p.name}-${i}`}>
                  <th scope="row">
                    {p.name} x{p.qty}
                    {got.length > 0 ? (
                      <span className={styles.muted}> ({got.join(', ')})</span>
                    ) : null}
                  </th>
                  <td className={styles.n}>{p.cost}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Spent</th>
              <td className={styles.n}>{amountText(ruleset, 'mt', receipt.mtSpent)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {receipt.notCredited.length > 0 ? (
        <p>
          <strong>Above the earned cap, not credited:</strong>{' '}
          {receipt.notCredited.map((a) => amount(a)).join(', ')}.
        </p>
      ) : null}
      <section className={styles.block} aria-label="Items handed out">
        <h4 className={styles.h}>Items handed out</h4>
        {receipt.handedOut.length === 0 ? (
          <p className={styles.muted}>None.</p>
        ) : (
          <ul className={styles.checks}>
            {receipt.handedOut.map((text, i) => (
              <li key={`out-${i}`}>
                <span className={styles.box} aria-hidden="true" />
                <span className={styles.checkText}>{text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {receipt.owed.length > 0 ? (
        <section className={styles.block} aria-label="Items owed">
          <h4 className={styles.h}>Items owed</h4>
          <ul className={styles.checks}>
            {receipt.owed.map((o, i) => (
              <li key={`owed-${i}`}>
                <span className={styles.box} aria-hidden="true">
                  {o.delivered ? '✓' : ''}
                </span>
                <span className={styles.checkText}>
                  {o.text}
                  {o.delivered ? <span className={styles.muted}> (delivered)</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className={styles.upkeep}>{receipt.upkeep.text}</p>
      <div className={styles.signature}>
        <span>Staff signature</span>
        <span className={styles.line} />
        <span>Date</span>
        <span className={styles.lineShort} />
      </div>
      <p className={styles.footer}>
        Printed {dateText(printedAt.toISOString())} · Ruleset {view.sheet.rulesetId} ·{' '}
        {PLAYER_TOOL_FOOTER}
      </p>
    </article>
  );
}
