// Staff, on an event's page: who pre-registered, their check-in status, and the event's pull sheet
// (everything to pull for characters not checked in yet, added up).
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, errorMessage } from '../../../api/client.ts';
import type { RegistrationEntry } from '../../../api/contract.ts';
import { checkRegistration, type PullItem } from '../../../engine/index.ts';
import type { GameEvent, StoredCharacter } from '../../../engine/model.ts';
import { Alert, Badge, Button, ButtonLink, Card } from '../../components/index.ts';
import { pullTotals, STATUS_TEXT, useRegistrations } from '../../data/registrations.ts';
import { rulesetFor, useRuleset } from '../../data/rulesetContext.ts';
import styles from './events.module.css';

export function EventRegistrations({
  event,
  characters,
}: {
  event: GameEvent;
  characters: readonly StoredCharacter[];
}) {
  const registrations = useRegistrations(event.key);
  const fallback = useRuleset();
  const navigate = useNavigate();
  const [problem, setProblem] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (registrations.status !== 'ready') return [];
    const byId = new Map(characters.map((c) => [c.id, c]));
    return registrations.items.map((reg) => {
      const character = byId.get(reg.characterId);
      const ruleset = (character && rulesetFor(character.rulesetId)) ?? fallback;
      const check = character
        ? checkRegistration(ruleset, character.actions, event, reg.plan)
        : null;
      return { reg, check };
    });
  }, [registrations, characters, event, fallback]);

  const totals = useMemo(() => {
    const items: PullItem[] = rows
      .filter((r) => r.reg.status !== 'checked-in')
      .flatMap((r) => r.check?.items ?? []);
    return pullTotals(items, {
      rarity: (id) => fallback.ruleset.rarities.find((r) => r.id === id)?.name ?? id,
      type: (id) => fallback.ruleset.resourceTypes.find((r) => r.id === id)?.name ?? id,
    });
  }, [rows, fallback]);

  if (registrations.status === 'none') return null;

  async function start(reg: RegistrationEntry) {
    setProblem(null);
    try {
      if (reg.status === 'registered') await api.startCheckIn(event.key, reg.characterId);
      void navigate(`/events/${event.key}/check-in/${reg.characterId}`);
    } catch (error) {
      setProblem(errorMessage(error));
    }
  }

  const waiting = rows.filter((r) => r.reg.status !== 'checked-in').length;
  return (
    <section aria-labelledby="prereg-heading" className={styles.section}>
      <h2 id="prereg-heading">Pre-registered ({rows.length})</h2>
      {registrations.status === 'loading' ? <p>Loading…</p> : null}
      {registrations.status === 'error' ? <p role="alert">{registrations.message}</p> : null}
      {problem ? <Alert onDismiss={() => setProblem(null)}>{problem}</Alert> : null}
      {registrations.status === 'ready' && rows.length === 0 ? (
        <p>Nobody has pre-registered yet.</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className={styles.cards} aria-label="Pre-registered characters">
          {rows.map(({ reg, check }) => (
            <li key={reg.characterId}>
              <Card title={reg.characterName || 'Unnamed character'} headingLevel={3}>
                <p className={styles.regRow}>
                  <Badge kind={reg.status === 'checked-in' ? 'approved' : 'pending'}>
                    {STATUS_TEXT[reg.status]}
                  </Badge>
                  <span className={styles.meta}>
                    {reg.ownerName ? `Player: ${reg.ownerName}. ` : ''}
                    {reg.status === 'started' && reg.startedBy
                      ? `Started by ${reg.startedBy}. `
                      : ''}
                    {reg.status === 'checked-in' && reg.checkedInBy
                      ? `By ${reg.checkedInBy}.`
                      : check
                        ? `${check.items.length} items to pull, ${check.shiniesCost} Shinies to spend.`
                        : ''}
                  </span>
                </p>
                {reg.plan.note ? <p>Note: {reg.plan.note}</p> : null}
                <div className={styles.actions}>
                  {reg.status === 'checked-in' ? (
                    <ButtonLink to={`/c/${reg.characterId}/print?show=receipt&event=${event.key}`}>
                      Receipt
                    </ButtonLink>
                  ) : (
                    <Button
                      variant="primary"
                      aria-label={`${reg.status === 'started' ? 'Continue check-in' : 'Start check-in'}: ${reg.characterName}`}
                      onClick={() => void start(reg)}
                    >
                      {reg.status === 'started' ? 'Continue check-in' : 'Start check-in'}
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
      {waiting > 0 ? (
        <Card title="Pull sheet" headingLevel={3}>
          <p>Everything to pull for the {waiting} characters not checked in yet.</p>
          {totals.length === 0 ? (
            <p>Nothing to pull.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((t) => (
                  <tr key={t.label}>
                    <td>{t.label}</td>
                    <td className="num">{t.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ) : null}
    </section>
  );
}
