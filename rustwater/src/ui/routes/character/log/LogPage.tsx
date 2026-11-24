import { useMemo, useState } from 'react';
import type { LedgerCurrency, Ruleset } from '../../../../engine/index.ts';
import type { Action } from '../../../../engine/model.ts';
import { Button, Card, PointsChip, Tabs } from '../../../components/index.ts';
import {
  ACTION_GROUPS,
  GROUP_LABELS,
  actionLookup,
  describeAction,
  type ActionDescription,
  type ActionGroup,
} from '../../../lib/describeAction.ts';
import {
  CURRENCY_ORDER,
  currencyAbbr,
  dateText,
  dateTimeText,
  ledgerKindName,
  signed,
} from '../../../lib/names.ts';
import { eventNames, useEvents } from '../../../lib/useEvents.ts';
import { DESKTOP_QUERY, useMediaQuery } from '../../../lib/useMediaQuery.ts';
import type { CharacterView } from '../view.ts';
import { CorrectDialog } from './CorrectDialog.tsx';
import { correctable } from './correction.ts';
import { FilterChips } from './FilterChips.tsx';
import { ledgerEntries, type LedgerEntry } from './ledger.ts';
import styles from './log.module.css';

/** `#/c/:id/log`: the points ledger and the full action log, newest first. */
export function LogPage({ view }: { view: CharacterView }) {
  const { events } = useEvents();
  const names = useMemo(() => eventNames(view.sheet.events, events), [view.sheet.events, events]);
  const dates = useMemo(() => eventDates(view.sheet.events, events), [view.sheet.events, events]);
  return (
    <section aria-labelledby="log-heading" className={styles.section}>
      <h2 id="log-heading">Log</h2>
      <Tabs
        label="Log views"
        tabs={[
          {
            id: 'points',
            label: 'Points',
            content: <PointsTab view={view} names={names} dates={dates} />,
          },
          { id: 'actions', label: 'All actions', content: <ActionsTab view={view} /> },
        ]}
      />
    </section>
  );
}

// ---- Points ----

function eventLabel(names: ReadonlyMap<string, string>, key: string | null): string | null {
  if (key === null) return null;
  return names.get(key) ?? key;
}

/** Event dates by key: the character's check-ins first, then the registry. */
function eventDates(
  ...sources: readonly (readonly { key: string; date: string }[])[]
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const list of sources) for (const e of list) if (!map.has(e.key)) map.set(e.key, e.date);
  return map;
}

/** "Nov 7", with the year when it differs from `than`. */
function shortDate(iso: string, than: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const sameYear = than.slice(0, 4) === String(date.getFullYear());
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** Main date, plus "recorded Nov 7" under it for entries dated by their event. */
function EntryDate({ entry }: { entry: LedgerEntry }) {
  return (
    <>
      <span className={styles.mainDate}>{dateText(entry.date)}</span>
      {entry.eventDated ? (
        <span className={styles.recorded}>
          recorded{' '}
          <time dateTime={entry.recordedAt}>{shortDate(entry.recordedAt, entry.date)}</time>
        </span>
      ) : null}
    </>
  );
}

function PointsTab({
  view,
  names,
  dates,
}: {
  view: CharacterView;
  names: ReadonlyMap<string, string>;
  dates: ReadonlyMap<string, string>;
}) {
  const { ruleset, sheet } = view;
  const [currency, setCurrency] = useState<'all' | LedgerCurrency>('all');
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const all = useMemo(() => ledgerEntries(sheet.ledger, dates), [sheet.ledger, dates]);
  const entries = currency === 'all' ? all : all.filter((e) => e.amounts[currency] !== undefined);
  const columns = currency === 'all' ? CURRENCY_ORDER : [currency];

  return (
    <div className={styles.tab}>
      <FilterChips
        label="Show currency"
        value={currency}
        onChange={(id) => setCurrency(id as 'all' | LedgerCurrency)}
        options={[
          { id: 'all', label: 'All' },
          ...CURRENCY_ORDER.map((c) => ({ id: c, label: currencyAbbr(ruleset, c) })),
        ]}
      />
      {entries.length === 0 ? (
        <Card>
          <p>
            No points recorded{currency === 'all' ? '' : ` in ${currencyAbbr(ruleset, currency)}`}{' '}
            yet.
          </p>
        </Card>
      ) : desktop ? (
        <LedgerTable ruleset={ruleset} entries={entries} columns={columns} names={names} />
      ) : (
        <ul className={styles.ledgerList} aria-label="Points ledger">
          {entries.map((entry) => (
            <li key={entry.key} className={styles.ledgerItem}>
              <p className={styles.dates}>
                <EntryDate entry={entry} />
              </p>
              <What ruleset={ruleset} entry={entry} names={names} />
              <ul className={styles.amounts} aria-label="Amounts">
                {columns
                  .filter((c) => entry.amounts[c] !== undefined)
                  .map((c) => (
                    <li key={c}>
                      <PointsChip
                        label={currencyAbbr(ruleset, c)}
                        value={signed(entry.amounts[c] ?? 0)}
                        suffix={`total ${entry.totals[c] ?? 0}`}
                      />
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function What({
  ruleset,
  entry,
  names,
}: {
  ruleset: Ruleset;
  entry: LedgerEntry;
  names: ReadonlyMap<string, string>;
}) {
  const event = eventLabel(names, entry.eventKey);
  return (
    <div className={styles.what}>
      <p className={styles.kind}>
        {ledgerKindName(ruleset, entry.kind)}
        {event ? <span className={styles.event}> · {event}</span> : null}
      </p>
      {entry.note ? <p className={styles.note}>{entry.note}</p> : null}
    </div>
  );
}

function LedgerTable({
  ruleset,
  entries,
  columns,
  names,
}: {
  ruleset: Ruleset;
  entries: LedgerEntry[];
  columns: readonly LedgerCurrency[];
  names: ReadonlyMap<string, string>;
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="visually-hidden">
          Points ledger, newest first by event date. Each amount shows the running total under it.
        </caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">What</th>
            {columns.map((c) => (
              <th key={c} scope="col" className={styles.numCol}>
                {currencyAbbr(ruleset, c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.key}>
              <td className={styles.dateCell}>
                <EntryDate entry={entry} />
              </td>
              <td>
                <What ruleset={ruleset} entry={entry} names={names} />
              </td>
              {columns.map((c) => {
                const amount = entry.amounts[c];
                return (
                  <td key={c} className={styles.numCol}>
                    {amount === undefined ? null : (
                      <>
                        <span className={styles.amount}>{signed(amount)}</span>
                        <span className={styles.total}>total {entry.totals[c] ?? 0}</span>
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- All actions ----

function actorText(action: Action): string {
  const role =
    action.actor.role === 'staff' ? 'Staff' : action.actor.role === 'player' ? 'Player' : 'System';
  return action.actor.name ? `${role}: ${action.actor.name}` : role;
}

function ActionsTab({ view }: { view: CharacterView }) {
  const { ruleset, sheet, character } = view;
  const [group, setGroup] = useState<'all' | ActionGroup>('all');
  const [correcting, setCorrecting] = useState<Action | null>(null);
  const described = useMemo(() => {
    const lookup = actionLookup(character.actions);
    return [...character.actions]
      .reverse()
      .map((action) => ({ action, d: describeAction(ruleset, action, lookup) }));
  }, [character.actions, ruleset]);
  const present = new Set(described.map((x) => x.d.group));
  const groups = ACTION_GROUPS.filter((g) => present.has(g));
  const shown = group === 'all' ? described : described.filter((x) => x.d.group === group);

  return (
    <div className={styles.tab}>
      <FilterChips
        label="Show type"
        value={group}
        onChange={(id) => setGroup(id as 'all' | ActionGroup)}
        options={[
          { id: 'all', label: 'All' },
          ...groups.map((g) => ({ id: g, label: GROUP_LABELS[g] })),
        ]}
      />
      {shown.length === 0 ? (
        <Card>
          <p>No actions of this type.</p>
        </Card>
      ) : (
        <ol className={styles.actionList} aria-label="Actions, newest first">
          {shown.map(({ action, d }) => (
            <ActionItem
              key={action.id}
              action={action}
              d={d}
              canCorrect={view.isStaff && correctable(sheet, action)}
              onCorrect={() => setCorrecting(action)}
            />
          ))}
        </ol>
      )}
      {correcting ? (
        <CorrectDialog view={view} action={correcting} onClose={() => setCorrecting(null)} />
      ) : null}
    </div>
  );
}

function ActionItem({
  action,
  d,
  canCorrect,
  onCorrect,
}: {
  action: Action;
  d: ActionDescription;
  canCorrect: boolean;
  onCorrect: () => void;
}) {
  return (
    <li className={styles.actionItem}>
      <div className={styles.actionHead}>
        <span className={styles.typeBadge}>{d.label}</span>
        <span className={styles.meta}>
          <time dateTime={action.at}>{dateTimeText(action.at)}</time> · {actorText(action)}
        </span>
      </div>
      <p className={styles.summary}>{d.summary}</p>
      {action.note ? <p className={styles.note}>Note: {action.note}</p> : null}
      {canCorrect ? (
        <div>
          <Button variant="ghost" onClick={onCorrect} aria-label={`Correct this: ${d.summary}`}>
            Correct this
          </Button>
        </div>
      ) : null}
    </li>
  );
}
