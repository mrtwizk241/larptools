import { lazy, Suspense } from 'react';
import { Link, Navigate, Route, Routes, useParams } from 'react-router';
import type { CharacterMeta } from '../../../api/contract.ts';
import { characterMetaFor } from '../../../storage/remote.ts';
import {
  BookOpen,
  Compass,
  Ellipsis,
  History,
  PawPrint,
  Printer,
  ScrollText,
  Share2,
  Sparkles,
  Swords,
  TriangleAlert,
} from 'lucide-react';
import type { Ruleset, Sheet } from '../../../engine/index.ts';
import { LOCAL_MODE } from '../../../localMode.ts';
import { Alert, Badge, CharacterNav, type CharacterNavItem } from '../../components/index.ts';
import { dateText } from '../../lib/names.ts';
import { useSheet } from '../../data/engineHooks.ts';
import { useSettings } from '../../data/hooks.ts';
import { UNNAMED_CHARACTER } from '../../data/summary.ts';
import { eventsEstimateText } from './playground.ts';
import { OverspendNotice } from './testBuild/OverspendNotice.tsx';
import { TestBuildBanner } from './testBuild/TestBuildBanner.tsx';
import { Screen } from '../../Screen.tsx';
import { BackLink } from '../NotFoundPage.tsx';
import { RouteFallback } from '../RouteFallback.tsx';
import { CharacterNotFound, NotInBuilderNotice, StaffOnlyNotice } from './screen.tsx';
import { MorePage } from './MorePage.tsx';
import { characterScreenName } from './screenTitle.ts';
import type { CharacterView } from './view.ts';
import styles from './character.module.css';

// More ships with this layout. Every other sub-screen lives in its own folder and is its own
// chunk, loaded on first use and precached by the service worker. A screen developer changes only
// their folder: the route, the nav entry, and the props (`{ view }`) are set here.
const OverviewPage = lazy(() =>
  import('./overview/OverviewPage.tsx').then((m) => ({ default: m.OverviewPage })),
);
const SkillsPage = lazy(() =>
  import('./skills/SkillsPage.tsx').then((m) => ({ default: m.SkillsPage })),
);
const SkillDetailPage = lazy(() =>
  import('./skills/SkillDetailPage.tsx').then((m) => ({ default: m.SkillDetailPage })),
);
const JournalsPage = lazy(() =>
  import('./journals/JournalsPage.tsx').then((m) => ({ default: m.JournalsPage })),
);
const CallingPage = lazy(() =>
  import('./calling/CallingPage.tsx').then((m) => ({ default: m.CallingPage })),
);
const ExtrasPage = lazy(() =>
  import('./extras/ExtrasPage.tsx').then((m) => ({ default: m.ExtrasPage })),
);
const LogPage = lazy(() => import('./log/LogPage.tsx').then((m) => ({ default: m.LogPage })));
const PointsPage = lazy(() =>
  import('./points/PointsPage.tsx').then((m) => ({ default: m.PointsPage })),
);
const CheckInPage = lazy(() =>
  import('./checkin/CheckInPage.tsx').then((m) => ({ default: m.CheckInPage })),
);
const RetirePage = lazy(() =>
  import('./retire/RetirePage.tsx').then((m) => ({ default: m.RetirePage })),
);
const SharePage = lazy(() => import('./SharePage.tsx').then((m) => ({ default: m.SharePage })));
const PlayPage = lazy(() => import('./play/PlayPage.tsx').then((m) => ({ default: m.PlayPage })));
const PrintPage = lazy(() =>
  import('./print/PrintPage.tsx').then((m) => ({ default: m.PrintPage })),
);

/** The character bottom bar (phones) and left rail (from 900px). */
function navItems(id: string): CharacterNavItem[] {
  const base = `/c/${id}`;
  // The no-login builds use Rustwater's order, with no More page: Sheet, Play Tracker, Skills,
  // Magic, Calling, Extras, Log, Share, Print. Phones show short labels in a scrolling bar.
  if (LOCAL_MODE)
    return [
      { icon: ScrollText, label: 'Sheet', route: base },
      { icon: Sparkles, label: 'Play Tracker', shortLabel: 'Play', route: `${base}/play` },
      { icon: Swords, label: 'Skills', route: `${base}/skills`, end: false },
      { icon: BookOpen, label: 'Magic', route: `${base}/journals` },
      { icon: Compass, label: 'Calling', route: `${base}/calling` },
      { icon: PawPrint, label: 'Extras', route: `${base}/extras` },
      { icon: History, label: 'Log', route: `${base}/log` },
      { icon: Share2, label: 'Share', route: `${base}/share` },
      { icon: Printer, label: 'Print', route: `${base}/print` },
    ];
  return [
    { icon: ScrollText, label: 'Sheet', route: base },
    { icon: Swords, label: 'Skills', route: `${base}/skills`, end: false },
    { icon: BookOpen, label: 'Magic', route: `${base}/journals` },
    { icon: Sparkles, label: 'Play', route: `${base}/play` },
    { icon: Ellipsis, label: 'More', route: `${base}/more`, end: false },
  ];
}

/** `#/c/:id/*`: character header, points chips, character navigation, and the sub-screens. */
export function CharacterLayout() {
  const { id = '', '*': rest = '' } = useParams();
  const state = useSheet(id);
  const { settings } = useSettings();

  if (state.status !== 'ready' || settings === undefined) {
    return (
      <Screen title="Character">
        <div className={styles.page}>
          <h1>Character</h1>
          {state.status === 'loading' || (state.status === 'ready' && !settings) ? (
            <p>Loading…</p>
          ) : null}
          {state.status === 'error' ? (
            <p role="alert">This character could not be read: {state.message}</p>
          ) : null}
          {state.status === 'missing' ? (
            <p>There is no character at this link that you can see.</p>
          ) : null}
          <BackLink />
        </div>
      </Screen>
    );
  }

  const meta = characterMetaFor(id);
  const view: CharacterView = {
    id,
    character: state.character,
    sheet: state.sheet,
    ruleset: state.ruleset,
    isStaff: settings.mode === 'staff',
    ...(meta ? { status: meta.status, meta } : {}),
  };

  return (
    <Screen
      nav={<CharacterNav items={navItems(id)} />}
      title={[
        characterScreenName(rest),
        state.sheet.profile.characterName.trim() || UNNAMED_CHARACTER,
      ]}
    >
      <div className={styles.page}>
        <CharacterHeader sheet={state.sheet} ruleset={state.ruleset} />
        {meta ? <ReviewBanner meta={meta} isStaff={view.isStaff} /> : null}
        {LOCAL_MODE ? <TestBuildBanner view={view} /> : null}
        {LOCAL_MODE ? <OverspendNotice key={id} view={view} /> : null}
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route index element={<OverviewPage view={view} />} />
            <Route path="skills" element={<SkillsPage view={view} />} />
            <Route path="skills/:skillId" element={<SkillDetailPage view={view} />} />
            <Route path="journals" element={<JournalsPage view={view} />} />
            <Route path="calling" element={<CallingPage view={view} />} />
            <Route path="extras" element={<ExtrasPage view={view} />} />
            <Route path="log" element={<LogPage view={view} />} />
            <Route
              path="points"
              element={
                LOCAL_MODE ? (
                  <Navigate to={`/c/${id}`} replace />
                ) : view.isStaff ? (
                  <PointsPage view={view} />
                ) : (
                  <StaffOnlyNotice title="Points" />
                )
              }
            />
            <Route
              path="checkin"
              element={
                LOCAL_MODE ? (
                  <NotInBuilderNotice title="Check-in" view={view} />
                ) : view.isStaff ? (
                  <CheckInPage view={view} />
                ) : (
                  <StaffOnlyNotice title="Check-in" />
                )
              }
            />
            <Route
              path="retire"
              element={
                LOCAL_MODE ? (
                  <NotInBuilderNotice title="Retirement" view={view} />
                ) : view.isStaff ? (
                  <RetirePage view={view} />
                ) : (
                  <StaffOnlyNotice title="Retirement" />
                )
              }
            />
            <Route path="play" element={<PlayPage view={view} />} />
            <Route path="print" element={<PrintPage view={view} />} />
            <Route path="share" element={<SharePage view={view} />} />
            <Route
              path="more"
              element={LOCAL_MODE ? <Navigate to={`/c/${id}`} replace /> : <MorePage view={view} />}
            />
            <Route path="*" element={<CharacterNotFound />} />
          </Routes>
        </Suspense>
      </div>
    </Screen>
  );
}

/** A new character that staff have not approved yet, or sent back to the player. */
function ReviewBanner({ meta, isStaff }: { meta: CharacterMeta; isStaff: boolean }) {
  if (meta.status === 'pending')
    return (
      <Alert kind="info" title="Waiting for staff approval">
        <p>
          Sent{meta.ownerName ? ` by ${meta.ownerName}` : ''}
          {meta.submittedAt ? ` on ${dateText(meta.submittedAt)}` : ''}. Nothing here counts until
          staff approve it.
        </p>
        {isStaff ? <Link to="/staff/approvals">Approve or send back in Staff tools</Link> : null}
      </Alert>
    );
  if (meta.status === 'rejected')
    return (
      <Alert title="Staff sent this character back">
        {meta.reviewNote ? <p>{meta.reviewNote}</p> : null}
        {isStaff ? null : (
          <Link to={`/new?edit=${encodeURIComponent(meta.id)}`}>Change it and send it again</Link>
        )}
      </Alert>
    );
  return null;
}

/**
 * One header points entry in the app with accounts. Under 900px it is a stat tile (label on top,
 * value below), as many per row as fit; from 900px it is a chip in a wrapped row. A negative
 * value adds a warning icon and the word "over" (never color alone). Spaces between the parts
 * keep the read-out "XP 45 left".
 */
function PointsStat({
  label,
  value,
  suffix,
  over = value < 0,
}: {
  label: string;
  value: number;
  suffix?: string;
  over?: boolean;
}) {
  return (
    <li className={over ? `${styles.point} ${styles.pointOver}` : styles.point}>
      <span className={styles.pointLabel}>{label}</span>{' '}
      <span className={styles.pointAmount}>
        <span className={styles.pointValue}>{value}</span>
        {suffix ? (
          <>
            {' '}
            <span className={styles.pointSuffix}>{suffix}</span>
          </>
        ) : null}
      </span>
      {over ? (
        <>
          {' '}
          <span className={styles.pointWarn}>
            <TriangleAlert aria-hidden="true" className={styles.pointIcon} />
            over
          </span>
        </>
      ) : null}
    </li>
  );
}

/**
 * One points tile in the no-login builds (as on Rustwater): the name on top, then "99 / 150 left"
 * (left, then earned). Below zero the tile turns red with a warning icon, never color alone:
 * "-25 / 150 left". Spaces between the parts keep the read-out "XP 99 / 150 left".
 */
function PointsTile({ label, value, total }: { label: string; value: number; total?: number }) {
  const over = value < 0;
  return (
    <li className={over ? `${styles.tile} ${styles.pointOver}` : styles.tile}>
      <span className={styles.pointLabel}>
        {label}
        {over ? (
          <>
            {' '}
            <TriangleAlert aria-hidden="true" className={styles.tileIcon} />
            <span className="visually-hidden">(overspent)</span>
          </>
        ) : null}
      </span>{' '}
      <span className={styles.tileAmount}>
        <span className={styles.tileValue}>{value}</span>
        {total !== undefined ? (
          <>
            {' '}
            <span className={styles.tileSuffix}>/ {total} left</span>
          </>
        ) : null}
      </span>
    </li>
  );
}

/**
 * The no-login builds' header points: XP, CXP, and AXP left of earned, Mist Tokens as a balance,
 * and while any is below zero, about how many events would earn the build.
 */
function TestBuildPoints({ sheet, ruleset }: { sheet: Sheet; ruleset: Ruleset }) {
  const { points } = sheet;
  const estimate = eventsEstimateText(ruleset, sheet);
  return (
    <>
      <ul className={styles.tiles} aria-label="Points">
        <PointsTile label="XP" value={points.xp.available} total={points.xp.earned} />
        <PointsTile label="CXP" value={points.cxp.available} total={points.cxp.earned} />
        <PointsTile label="AXP" value={points.axp.available} total={points.axp.earned} />
        <PointsTile label="MT" value={points.mt.balance} />
      </ul>
      {estimate ? <p className={styles.estimate}>{estimate}</p> : null}
    </>
  );
}

/** "Human. Calling: The Protector. Player: Robin Vale". */
function headerLine(sheet: Sheet): string {
  const { profile, race, calling } = sheet;
  return [
    race ? `${race.name}.` : null,
    calling ? `Calling: ${calling.name}.` : null,
    profile.playerName ? `Player: ${profile.playerName}` : null,
  ]
    .filter(Boolean)
    .join(' ');
}

function CharacterHeader({ sheet, ruleset }: { sheet: Sheet; ruleset: Ruleset }) {
  const { profile, points } = sheet;
  const name = profile.characterName.trim() || UNNAMED_CHARACTER;
  const line = headerLine(sheet);
  return (
    <header className={styles.header}>
      <div className={styles.nameRow}>
        <h1 className={styles.name}>{name}</h1>
        {sheet.retired ? <Badge kind="player">Retired</Badge> : null}
      </div>
      {line ? <p className={styles.line}>{line}</p> : null}
      {LOCAL_MODE ? (
        <TestBuildPoints sheet={sheet} ruleset={ruleset} />
      ) : (
        <ul className={styles.points} aria-label="Points">
          <PointsStat label="XP" value={points.xp.available} suffix="left" />
          <PointsStat label="CXP" value={points.cxp.available} suffix="left" />
          <PointsStat label="AXP" value={points.axp.available} suffix="left" />
          <PointsStat label="MT" value={points.mt.balance} />
        </ul>
      )}
    </header>
  );
}
