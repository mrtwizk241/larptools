// Players on `#/events`: upcoming events, and pre-registration for each of their characters.
import { useMemo } from 'react';
import { ButtonLink, Badge, Card } from '../../components/index.ts';
import { useCharacters } from '../../data/hooks.ts';
import { STATUS_TEXT, useRegistrations } from '../../data/registrations.ts';
import { useRuleset } from '../../data/rulesetContext.ts';
import { summarizeCharacter } from '../../data/summary.ts';
import { dateText } from '../../lib/names.ts';
import { useEvents } from '../../lib/useEvents.ts';
import styles from './events.module.css';

/** YYYY-MM-DD for yesterday, so an event stays listed on its own day in every time zone. */
function cutoff(): string {
  const d = new Date(Date.now() - 24 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function PlayerEvents() {
  const registry = useEvents();
  const characters = useCharacters();
  const registrations = useRegistrations();
  const ruleset = useRuleset();
  const upcoming = useMemo(() => {
    const from = cutoff();
    return registry.events
      .filter((e) => e.date >= from && e.closed !== true)
      .sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
  }, [registry.events]);
  const mine =
    characters.status === 'ready'
      ? characters.characters
          .map((c) => ({ character: c, summary: summarizeCharacter(c, ruleset) }))
          .filter((c) => !c.summary.retired)
      : [];

  if (registry.loading || characters.status === 'loading') return <p>Loading…</p>;
  if (registry.error) return <p role="alert">Events could not be read: {registry.error}</p>;
  return (
    <>
      <p>
        Pre-register for an event to choose your Shiny purchases and check-in skill items ahead of
        time. Staff pull everything before you arrive.
      </p>
      {upcoming.length === 0 ? <p>No upcoming events yet.</p> : null}
      {mine.length === 0 && upcoming.length > 0 ? (
        <p>You need an approved character to pre-register.</p>
      ) : null}
      <ul className={styles.cards} aria-label="Upcoming events">
        {upcoming.map((event) => (
          <li key={event.key}>
            <Card title={event.name} headingLevel={2}>
              <p className={styles.meta}>{dateText(event.date)}</p>
              <ul className={styles.plainList}>
                {mine.map(({ character, summary }) => {
                  const reg =
                    registrations.status === 'ready'
                      ? registrations.items.find(
                          (r) => r.eventKey === event.key && r.characterId === character.id,
                        )
                      : undefined;
                  const link = `/events/${event.key}/register/${character.id}`;
                  return (
                    <li key={character.id} className={styles.regRow}>
                      <span className={styles.regName}>{summary.characterName}</span>
                      {reg ? (
                        <Badge kind={reg.status === 'checked-in' ? 'approved' : 'pending'}>
                          {STATUS_TEXT[reg.status]}
                        </Badge>
                      ) : null}
                      {reg?.status === 'checked-in' ? null : (
                        <ButtonLink
                          to={link}
                          variant={reg ? 'secondary' : 'primary'}
                          aria-label={
                            reg
                              ? `Change pre-registration: ${summary.characterName}`
                              : `Pre-register: ${summary.characterName}`
                          }
                        >
                          {reg ? 'Change pre-registration' : 'Pre-register'}
                        </ButtonLink>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
