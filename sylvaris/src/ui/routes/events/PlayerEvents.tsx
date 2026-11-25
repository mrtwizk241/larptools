// Players on `#/events`: upcoming events, and pre-registration for each of their characters.
import { useMemo } from 'react';
import { ButtonLink, Badge, Card } from '../../components/index.ts';
import { useCharacters } from '../../data/hooks.ts';
import { STATUS_TEXT, useRegistrations } from '../../data/registrations.ts';
import { useRuleset } from '../../data/rulesetContext.ts';
import { summarizeCharacter } from '../../data/summary.ts';
import { dateText } from '../../lib/names.ts';
import { useEvents } from '../../lib/useEvents.ts';
import { today } from '../character/checkin/checkInModel.ts';
import styles from './events.module.css';
import { checkedInKeys } from './preRegister.ts';

export function PlayerEvents() {
  const registry = useEvents();
  const characters = useCharacters();
  const registrations = useRegistrations();
  const ruleset = useRuleset();
  const upcoming = useMemo(() => {
    // Only events still to come (today included) take pre-registrations (AC-6).
    const from = today();
    return registry.events
      .filter((e) => e.date >= from)
      .sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
  }, [registry.events]);
  const mine =
    characters.status === 'ready'
      ? characters.characters
          .map((c) => ({
            character: c,
            summary: summarizeCharacter(c, ruleset),
            checkedIn: checkedInKeys(ruleset, c),
          }))
          .filter((c) => !c.summary.retired)
      : [];

  if (registry.loading || characters.status === 'loading') return <p>Loading…</p>;
  if (registry.error) return <p role="alert">Events could not be read: {registry.error}</p>;
  return (
    <>
      <p>
        Pre-register for an event to choose your Mist Token purchases and check-in items ahead of
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
                {mine.map(({ character, summary, checkedIn }) => {
                  const reg =
                    registrations.status === 'ready'
                      ? registrations.items.find(
                          (r) => r.eventKey === event.key && r.characterId === character.id,
                        )
                      : undefined;
                  const link = `/events/${event.key}/register/${character.id}`;
                  const attended = checkedIn.has(event.key);
                  return (
                    <li key={character.id} className={styles.regRow}>
                      <span className={styles.regName}>{summary.characterName}</span>
                      {attended ? (
                        <Badge kind="approved">{STATUS_TEXT['checked-in']}</Badge>
                      ) : reg ? (
                        <Badge kind={reg.status === 'checked-in' ? 'approved' : 'pending'}>
                          {STATUS_TEXT[reg.status]}
                        </Badge>
                      ) : null}
                      {reg?.status === 'checked-in' || attended ? null : (
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
