// `#/events`: staff see known events newest first with check-in counts and a form for a new
// event; players see upcoming events and pre-register their characters.
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronRight } from 'lucide-react';
import type { StoredCharacter } from '../../../engine/model.ts';
import { eventKey } from '../../../engine/model.ts';
import { Button, Card, Field } from '../../components/index.ts';
import { useCharacters, useSettings } from '../../data/hooks.ts';
import { dateText } from '../../lib/names.ts';
import { useEvents } from '../../lib/useEvents.ts';
import { Screen } from '../../Screen.tsx';
import { PlayerEvents } from './PlayerEvents.tsx';
import { knownEvents, rosterEntries } from './eventRoster.ts';
import styles from './events.module.css';

const NO_CHARACTERS: StoredCharacter[] = [];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function EventsPage() {
  const { settings } = useSettings();
  return (
    <Screen title="Events">
      <div className={styles.page}>
        <h1>{settings?.mode === 'staff' ? 'Events' : 'Upcoming events'}</h1>
        {settings === undefined ? <p>Loading…</p> : null}
        {settings?.mode === 'staff' ? <EventList /> : null}
        {settings !== undefined && settings.mode !== 'staff' ? <PlayerEvents /> : null}
        <Link to="/" className={styles.back}>
          Back to characters
        </Link>
      </div>
    </Screen>
  );
}

/** Shown to players on both Events screens. */
export function StaffOnly() {
  return (
    <Card>
      <p>Only staff can check characters in at an event. Ask at the check-in desk.</p>
    </Card>
  );
}

function EventList() {
  const registry = useEvents();
  const characters = useCharacters();
  const navigate = useNavigate();
  const list = characters.status === 'ready' ? characters.characters : NO_CHARACTERS;
  const entries = useMemo(() => rosterEntries(list), [list]);
  const events = useMemo(() => knownEvents(registry.events, entries), [registry.events, entries]);

  const [name, setName] = useState('');
  const [date, setDate] = useState(today);
  const [errors, setErrors] = useState<{ name?: string; date?: string; save?: string }>({});
  const [saving, setSaving] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    // aria-disabled, not disabled, while saving: a disabled button would drop focus (a11y A-04).
    if (saving) return;
    const found: { name?: string; date?: string } = {};
    const trimmed = name.trim();
    if (trimmed === '') found.name = 'Enter the event name.';
    if (!DATE.test(date)) found.date = 'Enter the event date.';
    setErrors(found);
    if (found.name || found.date) return;
    const event = { key: eventKey(date, trimmed), name: trimmed, date };
    const existing = events.find((x) => x.key === event.key);
    setSaving(true);
    try {
      if (!existing) await registry.save(event);
      void navigate(`/events/${event.key}`);
    } catch (error) {
      setErrors({
        save: `The event could not be saved: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setSaving(false);
    }
  }

  const loading = registry.loading || characters.status === 'loading';

  return (
    <>
      {registry.error ? <p role="alert">Known events could not be read: {registry.error}</p> : null}
      {characters.status === 'error' ? (
        <p role="alert">Characters could not be read: {characters.message}</p>
      ) : null}
      {loading ? <p>Loading events…</p> : null}
      {!loading && events.length === 0 ? <p>No events yet. Create the first one below.</p> : null}
      {!loading && events.length > 0 ? (
        <ul className={styles.list} aria-label="Known events">
          {events.map((event) => (
            <li key={event.key} className={styles.row}>
              <Link to={`/events/${event.key}`} className={styles.rowLink}>
                <span className={styles.rowMain}>
                  <span className={styles.name}>{event.name}</span>
                  <span className={styles.meta}>{dateText(event.date)}</span>
                  <span className={styles.meta}>
                    <span className="num">{event.checkedIn}</span>{' '}
                    {event.checkedIn === 1 ? 'character' : 'characters'} checked in
                  </span>
                </span>
                <ChevronRight aria-hidden="true" className={styles.chevron} />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <Card title="New event">
        <form noValidate className={styles.form} onSubmit={(e) => void create(e)}>
          <Field label="Event name" required error={errors.name}>
            {(control) => (
              <input
                {...control}
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
          <Field label="Event date" required error={errors.date}>
            {(control) => (
              <input
                {...control}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
          </Field>
          {errors.save ? <p role="alert">{errors.save}</p> : null}
          <div>
            <Button variant="primary" type="submit" aria-disabled={saving || undefined}>
              Create event
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
