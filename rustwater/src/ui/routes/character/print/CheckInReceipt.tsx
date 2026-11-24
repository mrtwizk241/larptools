// The printable check-in receipt for one event: about half a US Letter page.
import { Fragment } from 'react';
import { UNNAMED_CHARACTER } from '../../../data/summary.ts';
import { currencyAbbr, dateText, signed, signedTotals } from '../../../lib/names.ts';
import type { CharacterView } from '../view.ts';
import { UNOFFICIAL } from './PrintSheet.tsx';
import type { ReceiptAward, ReceiptData } from './receipt.ts';
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
  const award = (a: ReceiptAward, i: number) => (
    <tr key={`${a.label}-${a.currency}-${i}`}>
      <th scope="row">{a.label}</th>
      <td className={styles.n}>
        {signed(a.amount)} {currencyAbbr(ruleset, a.currency)}
      </td>
    </tr>
  );
  const attendance = [
    receipt.attendance,
    receipt.npcHours > 0 ? `${receipt.npcHours} NPC hours` : null,
    receipt.preSignedShift ? 'pre-signed shift' : null,
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
                    <Fragment key={part}>
                      {i > 0 ? ', ' : null}
                      <span>{part}</span>
                    </Fragment>
                  ))}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
        <table className={styles.table} aria-label="Shiny purchases">
          <thead>
            <tr>
              <th scope="col">Shiny purchases</th>
              <th scope="col" className={styles.right}>
                Shinies
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
              const got = [
                ...p.grants.map((g) => `${signed(g.amount)} ${currencyAbbr(ruleset, g.currency)}`),
                ...p.items,
              ];
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
              <th scope="row">Cost</th>
              <td className={styles.n}>{receipt.shiniesSpent} Shinies</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {receipt.handedOut.length > 0 ? (
        <section className={styles.block} aria-label="Check-in skill items">
          <h4 className={styles.h}>Check-in skill items</h4>
          <ul className={styles.checks}>
            {receipt.handedOut.map((text, i) => (
              <li key={`out-${i}`}>
                <span className={styles.box} aria-hidden="true">
                  ✓
                </span>
                <span className={styles.checkText}>{text}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {receipt.picks.length > 0 ? (
        <section className={styles.block} aria-label="Choices for this event">
          <h4 className={styles.h}>Choices for this event</h4>
          <ul className={styles.checks}>
            {receipt.picks.map((text, i) => (
              <li key={`pick-${i}`}>
                <span className={styles.checkText}>{text}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className={styles.block} aria-label="Items owed">
        <h4 className={styles.h}>Items owed</h4>
        {receipt.owed.length === 0 && receipt.owedEarlier.length === 0 ? (
          <p className={styles.muted}>None.</p>
        ) : (
          <ul className={styles.checks}>
            {receipt.owed.map((o, i) => (
              <li key={`here-${i}`}>
                <span className={styles.box} aria-hidden="true">
                  {o.delivered ? '✓' : ''}
                </span>
                <span className={styles.checkText}>
                  {o.text}
                  {o.delivered ? <span className={styles.muted}> (delivered)</span> : null}
                </span>
              </li>
            ))}
            {receipt.owedEarlier.map((o, i) => (
              <li key={`earlier-${i}`}>
                <span className={styles.box} aria-hidden="true" />
                <span className={styles.checkText}>
                  {o.text} <span className={styles.muted}>(from {o.eventName})</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className={styles.upkeep}>
        {receipt.upkeep.covered ? (
          <>
            <span className={styles.box} role="img" aria-label="Ticked box">
              ✓
            </span>
            {receipt.upkeep.text}
          </>
        ) : receipt.upkeep.due ? (
          <>
            {receipt.upkeep.text}{' '}
            <span className={styles.tick}>
              <span className={styles.box} role="img" aria-label="Unticked box" />
              Paid
            </span>
          </>
        ) : (
          receipt.upkeep.text
        )}
      </p>
      <div className={styles.signature}>
        <span>Staff signature</span>
        <span className={styles.line} />
        <span>Date</span>
        <span className={styles.lineShort} />
      </div>
      <p className={styles.footer}>
        Printed {dateText(printedAt.toISOString())} · Ruleset {view.sheet.rulesetId} · {UNOFFICIAL}
      </p>
    </article>
  );
}
