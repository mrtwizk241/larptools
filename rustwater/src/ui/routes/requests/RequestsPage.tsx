import { Link, Navigate } from 'react-router';
import { useOptionalAuth } from '../../auth/authContext.ts';
import { useSettings } from '../../data/hooks.ts';
import { useRequests } from '../../data/requests.ts';
import { Screen } from '../../Screen.tsx';
import { PlayerRequests } from './PlayerRequests.tsx';
import { StaffRequests } from './StaffRequests.tsx';
import styles from './requests.module.css';

/** `#/requests`: the player's own learning requests. Staff decide them in Staff tools. */
export function RequestsPage() {
  const { settings } = useSettings();
  const requests = useRequests();
  const auth = useOptionalAuth();
  if (auth?.user && auth.user.role !== 'player') return <Navigate to="/staff/approvals" replace />;
  return (
    <Screen title="Requests">
      <div className={styles.page}>
        <h1>{settings?.mode === 'staff' ? 'Requests' : 'My learning requests'}</h1>
        {settings === undefined || requests.status === 'loading' ? <p>Loading requests…</p> : null}
        {requests.status === 'error' ? (
          <p role="alert">Requests could not be read: {requests.message}</p>
        ) : null}
        {settings !== undefined && requests.status === 'ready' ? (
          settings.mode === 'staff' ? (
            <StaffRequests
              groups={requests.groups}
              reload={requests.reload}
              filter={() => true}
              noun={{ one: 'request', many: 'requests' }}
              intro="Requests from players. Tap a player to review theirs."
              empty="No requests waiting."
            />
          ) : (
            <PlayerRequests groups={requests.groups} reload={requests.reload} />
          )
        ) : null}
        <Link to="/" className={styles.back}>
          Back to characters
        </Link>
      </div>
    </Screen>
  );
}
