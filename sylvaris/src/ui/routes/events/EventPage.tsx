// `#/events/:key` (staff): every active character with its status at one event, search, a full
// check-in link (preselects the event and returns here), a one-tap player check-in with Undo
// (voids the check-in), the pre-registrations with their pull list, counts, and a summary.
import { useEffect, useId, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { deriveSheet } from '../../../engine/index.ts';
import type { GameEvent, StoredCharacter } from '../../../engine/model.ts';
import { Badge, Button, ButtonLink, Card, Field, useToast } from '../../components/index.ts';
import { useCommand } from '../../data/engineHooks.ts';
import { useCharacters, useRepository, useSettings } from '../../data/hooks.ts';
import { useRuleset } from '../../data/rulesetContext.ts';
import { CURRENCY_ORDER, amountText, dateText } from '../../lib/names.ts';
import { pageTitle, useDocumentTitle } from '../../lib/routeFocus.ts';
import { useEvents } from '../../lib/useEvents.ts';
import { ErrorList } from '../character/ErrorList.tsx';
import { Screen } from '../../Screen.tsx';
import {
  checkInLink,
  eventRows,
  eventSummary,
  findEvent,
  matchesQuery,
  quickCheckIn,
  rosterEntries,
  undoCheckIn,
  type EventRow,
} from './eventRoster.ts';
import { EventRegistrations } from './EventRegistrations.tsx';
import styles from './events.module.css';
import { voidBlockReasons } from './voidReasons.ts';

const NO_CHARACTERS: StoredCharacter[] = [];

export function EventPage() {
  const { settings } = useSettings();
  // Staff see the event's name in the title (set by EventRoster).
  useDocumentTitle(settings?.mode === 'staff' ? undefined : pageTitle('Event'));
  // Players pre-register from the events list.
  if (settings !== undefined && settings.mode !== 'staff') return <Navigate to="/events" replace />;
  return (
    <Screen>
      <div className={styles.page}>
        {settings === undefined ? <p>Loading…</p> : null}
        {settings?.mode === 'staff' ? <EventRoster /> : null}
        <Link to="/events" className={styles.back}>
          All events
        </Link>
      </div>
    </Screen>
  );
}

function EventRoster() {
  const { key = '' } = useParams();
  const registry = useEvents();
  const characters = useCharacters();
  const ruleset = useRuleset();
  const list = characters.status === 'ready' ? characters.characters : NO_CHARACTERS;
  const entries = useMemo(() => rosterEntries(list), [list]);
  const [query, setQuery] = useState('');

  const loading = registry.loading || characters.status === 'loading';
  const event = useMemo(
    () => (loading ? undefined : findEvent(key, registry.events, entries)),
    [loading, key, registry.events, entries],
  );
  const rows = useMemo(() => eventRows(entries, key), [entries, key]);
  useDocumentTitle(pageTitle(event ? event.name : loading ? 'Event' : 'Event not found', 'Events'));
  const summary = useMemo(() => eventSummary(entries, key), [entries, key]);

  // An event known only from a character's check-ins joins the registry, so the check-in screen
  // can preselect it.
  const { save, error: registryError } = registry;
  const missing = event && !registry.events.some((e) => e.key === event.key) ? event : null;
  useEffect(() => {
    if (missing && !registryError) save(missing).catch(() => undefined);
  }, [missing, registryError, save]);

  if (characters.status === 'error')
    return (
      <>
        <h1>Event</h1>
        <p role="alert">Characters could not be read: {characters.message}</p>
      </>
    );
  if (loading)
    return (
      <>
        <h1>Event</h1>
        <p>Loading the event…</p>
      </>
    );
  if (!event)
    return (
      <>
        <h1>Event not found</h1>
        <p>No event with this link is saved.</p>
      </>
    );

  const visible = rows.filter((row) => matchesQuery(row.entry.summary, query));
  const checkedIn = rows.filter((row) => row.attendance !== null).length;
  const credited = CURRENCY_ORDER.filter((c) => summary.credited[c] !== 0);

  return (
    <>
      <div className={styles.heading}>
        <h1>{event.name}</h1>
        <p className={styles.meta}>{dateText(event.date)}</p>
      </div>
      <p className={styles.count}>
        Checked in <span className="num">{checkedIn}</span> of{' '}
        <span className="num">{rows.length}</span>
      </p>
      <EventRegistrations event={event} characters={list} />
      <h2>Everyone</h2>
      {rows.length === 0 ? (
        <p>No active characters yet.</p>
      ) : (
        <>
          <Field label="Search">
            {(control) => (
              <input
                {...control}
                type="search"
                placeholder="Character or player name"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
          </Field>
          {visible.length > 0 ? (
            <ul className={styles.cards} aria-label="Characters">
              {visible.map((row) => (
                <CharacterRow
                  key={row.entry.character.id}
                  row={row}
                  event={event}
                  reload={characters.reload}
                />
              ))}
            </ul>
          ) : (
            <p role="status">No characters match “{query.trim()}”.</p>
          )}
        </>
      )}
      <Card title="Staff summary">
        <div className={styles.form}>
          <div>
            <p className={styles.subhead}>Checked in by attendance</p>
            {Object.keys(summary.byAttendance).length === 0 ? (
              <p>Nobody is checked in yet.</p>
            ) : (
              <ul className={styles.plainList}>
                {ruleset.awards.attendance
                  .filter((a) => summary.byAttendance[a.id])
                  .map((a) => (
                    <li key={a.id}>
                      {a.name}: <span className="num">{summary.byAttendance[a.id]}</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <p>
            Points credited at check-in:{' '}
            {credited.length === 0
              ? 'none'
              : credited.map((c) => amountText(ruleset, c, summary.credited[c])).join(', ')}
            .
          </p>
          <div>
            <p className={styles.subhead}>Items owed</p>
            {summary.owed.length === 0 ? (
              <p>No items owed for this event.</p>
            ) : (
              <ul className={styles.plainList}>
                {summary.owed.map((o) => (
                  <li key={o.id}>
                    {o.characterName}: {o.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}

function CharacterRow({
  row,
  event,
  reload,
}: {
  row: EventRow;
  event: GameEvent;
  reload: () => Promise<void>;
}) {
  const { entry, attendance } = row;
  const { character, summary, sheet } = entry;
  const ruleset = useRuleset();
  const command = useCommand(character.id);
  const repository = useRepository();
  const toast = useToast();
  const nameId = useId();
  const [undoErrors, setUndoErrors] = useState<string[]>([]);
  const name = summary.characterName;

  async function undo(checkInActionId: string | null) {
    setUndoErrors([]);
    if (!checkInActionId) {
      setUndoErrors([
        `The check-in for ${name} could not be found. Use Correct this on the check-in in the character's Log to void it.`,
      ]);
      return;
    }
    const outcome = await command.run(undoCheckIn(checkInActionId));
    await reload();
    if (outcome.ok) toast.show(`Undid the check-in for ${name}.`);
    else if (entry.sheet) {
      // Name what depends on the check-in, and when (points spent since, a Calling, a teaching).
      const latest = (await repository.getCharacter(character.id)) ?? character;
      const sheetNow = deriveSheet(ruleset, latest.actions);
      setUndoErrors(
        voidBlockReasons(ruleset, latest.actions, sheetNow, checkInActionId, outcome.errors),
      );
      command.clear();
    }
  }

  async function quick() {
    // aria-disabled, not disabled, while running: a disabled button would drop focus.
    if (command.running) return;
    setUndoErrors([]);
    const outcome = await command.run(quickCheckIn(event));
    if (!outcome.ok) return;
    await reload();
    const action = [...outcome.character.actions]
      .reverse()
      .find((a) => a.type === 'event.checkedIn' && a.eventKey === event.key);
    toast.show(`Checked in ${name} as Player.`, { onUndo: () => void undo(action?.id ?? null) });
  }

  const attendanceName = attendance
    ? (ruleset.attendanceById[attendance]?.name ?? attendance)
    : null;

  return (
    <li className={styles.card}>
      <div className={styles.cardHead}>
        <div className={styles.rowMain}>
          <Link id={nameId} to={`/c/${character.id}`} className={styles.nameLink}>
            {name}
          </Link>
          {summary.playerName ? (
            <span className={styles.meta}>Player: {summary.playerName}</span>
          ) : null}
        </div>
        <div className={styles.status}>
          {attendanceName ? (
            <>
              <Badge kind="approved">Checked in</Badge>
              <span className={styles.meta}>{attendanceName}</span>
            </>
          ) : (
            <span className={styles.meta}>Not checked in</span>
          )}
        </div>
      </div>
      {!attendanceName && sheet ? (
        <div className={styles.actions}>
          <Button
            variant="secondary"
            aria-label={`Check in as player: ${name}`}
            aria-disabled={command.running || undefined}
            onClick={() => void quick()}
          >
            Check in as player
          </Button>
          <ButtonLink
            variant="ghost"
            aria-label={`Check in: ${name}`}
            to={checkInLink(character.id, event.key)}
          >
            Check in
          </ButtonLink>
        </div>
      ) : null}
      {!sheet ? (
        <p className={styles.meta}>
          This character uses rules this version of the app does not have.
        </p>
      ) : null}
      <ErrorList messages={[...command.errors.map((e) => e.message), ...undoErrors]} />
    </li>
  );
}
