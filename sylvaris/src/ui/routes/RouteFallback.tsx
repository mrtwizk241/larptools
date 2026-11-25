// Suspense fallback while a lazily loaded screen's code arrives. The service worker precaches every
// chunk, so after the first visit this shows for a moment at most, online or offline.
import { Screen } from '../Screen.tsx';

/** Inside a screen that is already drawn (the character sub-screens). */
export function RouteFallback() {
  return <p role="status">Loading…</p>;
}

/** For a whole screen: the app shell with the same loading line. */
export function ScreenFallback() {
  return (
    <Screen>
      <RouteFallback />
    </Screen>
  );
}
