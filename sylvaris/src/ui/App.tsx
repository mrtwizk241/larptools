import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { HashRouter, Route, Routes } from 'react-router';
import type { UserInfo } from '../api/contract.ts';
import { LOCAL_MODE, LOCAL_USER } from '../localMode.ts';
import { PUBLIC_MODE } from '../publicMode.ts';
import { createLocalRepository } from '../storage/local.ts';
import { createRemoteRepository } from '../storage/remote.ts';
import type { Repository } from '../storage/repository.ts';
import { AuthProvider } from './auth/AuthProvider.tsx';
import { useOptionalAuth } from './auth/authContext.ts';
import { RequireAuth } from './auth/RequireAuth.tsx';
import { ToastProvider } from './components/index.ts';
import { RepositoryProvider } from './data/RepositoryProvider.tsx';
import { RulesetProvider } from './data/RulesetProvider.tsx';
import { useRouteFocus } from './lib/routeFocus.ts';
import { NotFoundPage } from './routes/NotFoundPage.tsx';
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
  remote ??= LOCAL_MODE ? createLocalRepository() : createRemoteRepository();
  return remote;
}

/** `#/`: the character list when signed in, the welcome page when not. */
function Home() {
  const auth = useOptionalAuth();
  if (!auth || LOCAL_MODE) return <RosterPage />;
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
  // The no-login builder is one file with no service worker; the public site has one.
  useEffect(() => (LOCAL_MODE && !PUBLIC_MODE ? undefined : appUpdates.start()), []);
  // The no-login builder always has its one built-in account (full edit powers, no server).
  const fixedUser = LOCAL_MODE ? { ...LOCAL_USER } : user;
  return (
    <AuthProvider {...(fixedUser !== undefined ? { fixedUser } : {})}>
      <RepositoryProvider repository={repository ?? remoteRepository()}>
        <RulesetProvider>
          <HashRouter>
            <ToastProvider>
              <Suspense fallback={<ScreenFallback />}>
                {PUBLIC_MODE ? <PublicRoutes /> : LOCAL_MODE ? <LocalRoutes /> : <ServerRoutes />}
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
 * The no-login builder: characters, their screens, the wiki, and settings. No sign-in pages,
 * staff tools, admin, learning requests, or events (those need a server and other people).
 */
function LocalRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/wiki" element={<WikiPage />} />
      <Route path="/wiki/:slug" element={<WikiPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/new" element={<CreatePage />} />
      <Route path="/c/:id/*" element={<CharacterLayout />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

/**
 * The public site (docs/PUBLIC-SITE-PLAN.md): the no-login app hosted, with the calculator as the
 * start page and the visitor's test builds at `#/test-builds`. No sign-in, staff, events, or
 * requests.
 */
function PublicRoutes() {
  return (
    <Routes>
      <Route path="/" element={<CalculatorPage />} />
      <Route path="/test-builds" element={<PublicHomePage />} />
      <Route path="/wiki" element={<WikiPage />} />
      <Route path="/wiki/:slug" element={<WikiPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/new" element={<CreatePage />} />
      <Route path="/c/:id/*" element={<CharacterLayout />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

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
