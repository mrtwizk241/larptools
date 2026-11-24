import { useRequests } from '../../data/requests.ts';
import { PlayerRequests } from '../requests/PlayerRequests.tsx';
import { StaffRequests } from '../requests/StaffRequests.tsx';
import type { CharacterView } from './view.ts';
import styles from './character.module.css';

/**
 * `#/c/:id/requests`: this character's learning requests. Players see staff's answers and can
 * withdraw one still waiting; staff approve or reject the waiting ones.
 */
export function CharacterRequestsPage({ view }: { view: CharacterView }) {
  const requests = useRequests();
  const groups =
    requests.status === 'ready' ? requests.groups.filter((g) => g.character.id === view.id) : [];
  return (
    <section aria-labelledby="requests-heading" className={styles.section}>
      <h2 id="requests-heading">Requests</h2>
      {requests.status === 'loading' ? <p>Loading requests…</p> : null}
      {requests.status === 'error' ? (
        <p role="alert">Requests could not be read: {requests.message}</p>
      ) : null}
      {requests.status === 'ready' ? (
        view.isStaff ? (
          <StaffRequests
            groups={groups}
            reload={requests.reload}
            filter={() => true}
            noun={{ one: 'request', many: 'requests' }}
            intro="Requests from this character's player waiting for a decision."
            empty="No requests waiting."
          />
        ) : (
          <PlayerRequests groups={groups} reload={requests.reload} />
        )
      ) : null}
    </section>
  );
}
