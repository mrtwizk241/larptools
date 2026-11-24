// `#/events/:key` (staff): every non-retired character with its status at one event, a full
// check-in link (preselects the event and returns here), a one-tap player check-in with Undo, and
// a read-only staff summary.
import { useEffect, useId, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import type { GameEvent, StoredCharacter } from '../../../engine/model.ts';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  Field,
  useToast,
} from '../../components/index.ts';
import { useCommand } from '../../data/engineHooks.ts';
import { useCharacters, useSettings } from '../../data/hooks.ts';
import { useRuleset } from '../../data/rulesetContext.ts';
import { dateText } from '../../lib/names.ts';
import { pageTitle, useDocumentTitle } from '../../lib/routeFocus.ts';
import { useEvents } from '../../lib/useEvents.ts';
import { ErrorList } from '../character/ErrorList.tsx';
import { Screen } from '../../Screen.tsx';
import {
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
        <p>No event with this link is saved on this device.</p>
      </>
    );

  const visible = rows.filter((row) => matchesQuery(row.entry.summary, query));
  const checkedIn = rows.filter((row) => row.attendance !== null).length;

  return (
    <>
      <div className={styles.heading}>
        <h1>{event.name}</h1>
        <p className={styles.meta}>{dateText(event.date)}</p>
      </div>
      <CloseOut event={event} save={registry.save} />
      <p className={styles.count}>
        Checked in <span className="num">{checkedIn}</span> of{' '}
        <span className="num">{rows.length}</span>
      </p>
      <EventRegistrations event={event} characters={list} />
      <h2>Everyone</h2>
      {rows.length === 0 ? (
        <p>No characters on this device yet.</p>
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
          <p>
            Event CXP awarded: <span className="num">{summary.eventCxp}</span>
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

function checkInLink(characterId: string, key: string): string {
  const params = new URLSearchParams({ event: key, back: `/events/${key}` });
  return `/c/${characterId}/checkin?${params.toString()}`;
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
  const { entry, attendance, reversed } = row;
  const { character, summary, sheet } = entry;
  const ruleset = useRuleset();
  const command = useCommand(character.id);
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
  }

  async function quick() {
    // aria-disabled, not disabled, while running: a disabled button would drop focus (a11y A-04).
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
              {reversed ? <span className={styles.meta}>Points taken back</span> : null}
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
            aria-describedby={nameId}
            aria-disabled={command.running || undefined}
            onClick={() => void quick()}
          >
            Check in as player
          </Button>
          <ButtonLink
            variant="ghost"
            aria-describedby={nameId}
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

/** Staff: close out an event so players no longer see it or pre-register; reopen it again. */
function CloseOut({
  event,
  save,
}: {
  event: GameEvent;
  save: (event: GameEvent) => Promise<void>;
}) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function setClosed(closed: boolean) {
    setConfirming(false);
    setProblem(null);
    try {
      const rest: GameEvent = { key: event.key, name: event.name, date: event.date };
      await save(closed ? { ...rest, closed: true } : rest);
      toast.show(closed ? `Closed out ${event.name}.` : `Reopened ${event.name}.`);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <>
      {event.closed ? (
        <Alert kind="info" title="Closed out">
          <p>Players no longer see this event or pre-register for it.</p>
        </Alert>
      ) : null}
      <div className={styles.actions}>
        {event.closed ? (
          <Button onClick={() => void setClosed(false)}>Reopen event</Button>
        ) : (
          <Button onClick={() => setConfirming(true)}>Close out event</Button>
        )}
      </div>
      {problem ? <p role="alert">{problem}</p> : null}
      <ConfirmDialog
        open={confirming}
        title={`Close out ${event.name}?`}
        confirmLabel="Close out"
        onConfirm={() => void setClosed(true)}
        onCancel={() => setConfirming(false)}
      >
        <p>
          Players will no longer see {event.name} or pre-register for it. Staff can still open it,
          check characters in, and reopen it.
        </p>
      </ConfirmDialog>
    </>
  );
}
