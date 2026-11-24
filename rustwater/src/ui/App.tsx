import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router';
import type { UserInfo } from '../api/contract.ts';
import { PUBLIC_MODE, PUBLIC_USER } from '../publicMode.ts';
import { createIdbRepository } from '../storage/idb.ts';
import { createRemoteRepository } from '../storage/remote.ts';
import type { Repository } from '../storage/repository.ts';
import { AuthProvider } from './auth/AuthProvider.tsx';
import { useOptionalAuth } from './auth/authContext.ts';
import { RequireAuth } from './auth/RequireAuth.tsx';
import { ToastProvider } from './components/index.ts';
import { RepositoryProvider } from './data/RepositoryProvider.tsx';
import { RulesetProvider } from './data/RulesetProvider.tsx';
import { useRouteFocus } from './lib/routeFocus.ts';
import { NotFoundPage } from './routes/PlaceholderPage.tsx';
import { ScreenFallback } from './routes/RouteFallback.tsx';
import { RosterPage } from './routes/RosterPage.tsx';
import { ResetPage, SignInPage, SignUpPage, WelcomePage } from './routes/auth/AuthPages.tsx';
import { Screen } from './Screen.tsx';
import { appUpdates } from './pwa/updates.ts';

// The roster is the start screen and stays in the main chunk. Every other screen is its own
// chunk, loaded on first use (docs/audits/performance.md). The service worker precaches them all.
const CharacterLayout = lazy(() =>
  import('./routes/character/CharacterLayout.tsx').then((m) => ({ default: m.CharacterLayout })),
);
const CreatePage = lazy(() =>
  import('./routes/create/CreatePage.tsx').then((m) => ({ default: m.CreatePage })),
);
const NewTestBuildPage = lazy(() =>
  import('./routes/testBuilds/NewTestBuildPage.tsx').then((m) => ({
    default: m.NewTestBuildPage,
  })),
);
const EventPage = lazy(() =>
  import('./routes/events/EventPage.tsx').then((m) => ({ default: m.EventPage })),
);
const EventsPage = lazy(() =>
  import('./routes/events/EventsPage.tsx').then((m) => ({ default: m.EventsPage })),
);
const RegistrationPage = lazy(() =>
  import('./routes/events/RegistrationPage.tsx').then((m) => ({ default: m.RegistrationPage })),
);
const StaffCheckInPage = lazy(() =>
  import('./routes/events/StaffCheckInPage.tsx').then((m) => ({ default: m.StaffCheckInPage })),
);
const RequestsPage = lazy(() =>
  import('./routes/requests/RequestsPage.tsx').then((m) => ({ default: m.RequestsPage })),
);
const SettingsPage = lazy(() =>
  import('./routes/SettingsPage.tsx').then((m) => ({ default: m.SettingsPage })),
);
const StaffPage = lazy(() =>
  import('./routes/staff/StaffPage.tsx').then((m) => ({ default: m.StaffPage })),
);
const AdminPage = lazy(() =>
  import('./routes/admin/AdminPage.tsx').then((m) => ({ default: m.AdminPage })),
);
const WikiPage = lazy(() =>
  import('./routes/wiki/WikiPage.tsx').then((m) => ({ default: m.WikiPage })),
);
const CalculatorPage = lazy(() =>
  import('./routes/calculator/CalculatorPage.tsx').then((m) => ({ default: m.CalculatorPage })),
);
const PublicHomePage = lazy(() =>
  import('./routes/public/PublicHomePage.tsx').then((m) => ({ default: m.PublicHomePage })),
);
const StyleguidePage = lazy(() =>
  import('./routes/StyleguidePage.tsx').then((m) => ({ default: m.StyleguidePage })),
);

/** After a route change, focus goes to the new screen's heading (a11y A-07). */
function RouteFocus() {
  useRouteFocus();
  return null;
}

export interface AppProps {
  /** Defaults to the server repository. Tests pass an in-memory one. */
  repository?: Repository;
  /** Tests: a fixed signed-in account (or null for signed out), with no server calls. */
  user?: UserInfo | null;
}

let remote: Repository | undefined;
function remoteRepository(): Repository {
  // The public site keeps test builds in this browser's IndexedDB (src/publicMode.ts).
  remote ??= PUBLIC_MODE ? createIdbRepository() : createRemoteRepository();
  return remote;
}

/** `#/`: the character list when signed in, the welcome page when not. */
function Home() {
  const auth = useOptionalAuth();
  if (!auth) return <RosterPage />;
  if (auth.state.status === 'loading')
    return (
      <Screen>
        <p role="status">Loading…</p>
      </Screen>
    );
  return auth.user ? <RosterPage /> : <WelcomePage />;
}

function Private({ children, need }: { children: ReactNode; need?: 'staff' | 'admin' }) {
  return <RequireAuth {...(need ? { role: need } : {})}>{children}</RequireAuth>;
}

// Hash routing: the app is static and offline, so there are no server rewrites.
export function App({ repository, user }: AppProps) {
  // Service worker in prompt mode; Screen shows a banner when a new version waits (audit S-05).
  useEffect(() => appUpdates.start(), []);
  // The public site has one built-in visitor and never asks the server who is signed in.
  const fixedUser = PUBLIC_MODE ? PUBLIC_USER : user;
  return (
    <AuthProvider {...(fixedUser !== undefined ? { fixedUser } : {})}>
      <RepositoryProvider repository={repository ?? remoteRepository()}>
        <RulesetProvider>
          <HashRouter>
            <ToastProvider>
              <Suspense fallback={<ScreenFallback />}>
                {PUBLIC_MODE ? <PublicRoutes /> : <ServerRoutes />}
              </Suspense>
              <RouteFocus />
            </ToastProvider>
          </HashRouter>
        </RulesetProvider>
      </RepositoryProvider>
    </AuthProvider>
  );
}

/**
 * The public site (docs/PUBLIC-SITE-PLAN.md): test builds and the calculator. No sign-in, staff,
 * events, requests, or Rules Wiki.
 */
function PublicRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicHomePage />} />
      <Route path="/calculator" element={<CalculatorPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/new" element={<CreatePage />} />
      <Route path="/test-builds/new" element={<Navigate to="/new?test=1" replace />} />
      <Route path="/c/:id/*" element={<CharacterLayout />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

/** The full app with accounts and the server (ADR 0006). */
function ServerRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<SignInPage portal="player" />} />
      <Route path="/staff/login" element={<SignInPage portal="staff" />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/reset" element={<ResetPage />} />
      <Route path="/wiki" element={<WikiPage />} />
      <Route path="/wiki/:slug" element={<WikiPage />} />
      <Route path="/calculator" element={<CalculatorPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route
        path="/new"
        element={
          <Private>
            <CreatePage />
          </Private>
        }
      />
      <Route
        path="/test-builds/new"
        element={
          <Private>
            <NewTestBuildPage />
          </Private>
        }
      />
      <Route
        path="/c/:id/*"
        element={
          <Private>
            <CharacterLayout />
          </Private>
        }
      />
      <Route
        path="/requests"
        element={
          <Private>
            <RequestsPage />
          </Private>
        }
      />
      <Route
        path="/events"
        element={
          <Private>
            <EventsPage />
          </Private>
        }
      />
      <Route
        path="/events/:key"
        element={
          <Private>
            <EventPage />
          </Private>
        }
      />
      <Route
        path="/events/:key/register/:characterId"
        element={
          <Private>
            <RegistrationPage />
          </Private>
        }
      />
      <Route
        path="/events/:key/check-in/:characterId"
        element={
          <Private need="staff">
            <StaffCheckInPage />
          </Private>
        }
      />
      <Route
        path="/staff"
        element={
          <Private need="staff">
            <StaffPage />
          </Private>
        }
      />
      <Route
        path="/staff/:tab"
        element={
          <Private need="staff">
            <StaffPage />
          </Private>
        }
      />
      <Route
        path="/admin"
        element={
          <Private need="admin">
            <AdminPage />
          </Private>
        }
      />
      <Route path="/styleguide/*" element={<StyleguidePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
