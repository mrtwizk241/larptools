import { lazy, Suspense } from 'react';
import { Link, Navigate, Route, Routes, useParams } from 'react-router';
import type { CharacterMeta } from '../../../api/contract.ts';
import { PUBLIC_MODE } from '../../../publicMode.ts';
import { characterMetaFor } from '../../../storage/remote.ts';
import {
  Briefcase,
  ClipboardCheck,
  Coins,
  FlaskConical,
  History,
  Inbox,
  PawPrint,
  Printer,
  ScrollText,
  Share2,
  Sparkles,
  Swords,
  TriangleAlert,
  WandSparkles,
} from 'lucide-react';
import type { Ruleset, Sheet } from '../../../engine/index.ts';
import { Alert, Badge, CharacterNav, type CharacterNavItem } from '../../components/index.ts';
import { dateText } from '../../lib/names.ts';
import { useSheet } from '../../data/engineHooks.ts';
import { useSettings } from '../../data/hooks.ts';
import { UNNAMED_CHARACTER } from '../../data/summary.ts';
import { Screen } from '../../Screen.tsx';
import { BackLink } from '../PlaceholderPage.tsx';
import { RouteFallback } from '../RouteFallback.tsx';
import { OverspendNotice } from '../testBuilds/OverspendNotice.tsx';
import { eventsEstimateText } from '../testBuilds/testBuilds.ts';
import { TestBuildBanner } from '../testBuilds/TestBuildBanner.tsx';
import { ancestryLine } from './format.ts';
import { CharacterNotFound } from './CharacterNotFound.tsx';
import { OverviewPage } from './OverviewPage.tsx';
import { characterScreenName } from './screenTitle.ts';
import type { CharacterView } from './view.ts';
import styles from './character.module.css';

// The overview (the index screen) ships with this layout. Every other sub-screen is its own
// chunk, loaded on first use and precached by the service worker.
const CharacterRequestsPage = lazy(() =>
  import('./CharacterRequestsPage.tsx').then((m) => ({ default: m.CharacterRequestsPage })),
);
const CheckInPage = lazy(() =>
  import('./checkin/CheckInPage.tsx').then((m) => ({ default: m.CheckInPage })),
);
const ExtrasPage = lazy(() =>
  import('./extras/ExtrasPage.tsx').then((m) => ({ default: m.ExtrasPage })),
);
const LogPage = lazy(() => import('./log/LogPage.tsx').then((m) => ({ default: m.LogPage })));
const SpellsPage = lazy(() =>
  import('./memory/MemoryListPage.tsx').then((m) => ({ default: m.SpellsPage })),
);
const RecipesPage = lazy(() =>
  import('./memory/MemoryListPage.tsx').then((m) => ({ default: m.RecipesPage })),
);
const PlayPage = lazy(() => import('./play/PlayPage.tsx').then((m) => ({ default: m.PlayPage })));
const PointsPage = lazy(() =>
  import('./points/PointsPage.tsx').then((m) => ({ default: m.PointsPage })),
);
const PrintPage = lazy(() =>
  import('./print/PrintPage.tsx').then((m) => ({ default: m.PrintPage })),
);
const ProfessionPage = lazy(() =>
  import('./profession/ProfessionPage.tsx').then((m) => ({ default: m.ProfessionPage })),
);
const SkillDetailPage = lazy(() =>
  import('./skills/SkillDetailPage.tsx').then((m) => ({ default: m.SkillDetailPage })),
);
const SharePage = lazy(() => import('./SharePage.tsx').then((m) => ({ default: m.SharePage })));
const SkillsPage = lazy(() =>
  import('./skills/SkillsPage.tsx').then((m) => ({ default: m.SkillsPage })),
);

/**
 * Robert's order (2026-11-08, More split up 2026-11-20): Sheet, Play Tracker, Skills, Spells,
 * Recipes, Professions, Familiars and Boons, Log, Requests, Share; staff also get Check-in and
 * Points; Print is last. Phones show short labels in a scrolling bottom bar.
 */
function navItems(id: string, isStaff: boolean): CharacterNavItem[] {
  const base = `/c/${id}`;
  return [
    { icon: ScrollText, label: 'Sheet', route: base },
    { icon: Sparkles, label: 'Play Tracker', shortLabel: 'Play', route: `${base}/play` },
    { icon: Swords, label: 'Skills', route: `${base}/skills`, end: false },
    { icon: WandSparkles, label: 'Spells', route: `${base}/spells` },
    { icon: FlaskConical, label: 'Recipes', route: `${base}/recipes` },
    {
      icon: Briefcase,
      label: 'Professions',
      route: `${base}/profession`,
    },
    {
      icon: PawPrint,
      label: 'Familiars and Boons',
      shortLabel: 'Familiars',
      route: `${base}/extras`,
    },
    { icon: History, label: 'Log', route: `${base}/log` },
    // The public site has no staff to send a request to.
    ...(PUBLIC_MODE ? [] : [{ icon: Inbox, label: 'Requests', route: `${base}/requests` }]),
    { icon: Share2, label: 'Share', route: `${base}/share` },
    ...(isStaff
      ? [
          { icon: ClipboardCheck, label: 'Check-in', route: `${base}/checkin` },
          { icon: Coins, label: 'Points', route: `${base}/points` },
        ]
      : []),
    { icon: Printer, label: 'Print', route: `${base}/print` },
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
  // The owner's test build (ADR 0007): every edit control shows, as for staff.
  const testBuild = meta?.kind === 'test';
  const view: CharacterView = {
    id,
    character: state.character,
    sheet: state.sheet,
    ruleset: state.ruleset,
    isStaff: settings.mode === 'staff' || testBuild,
    ...(meta ? { status: meta.status, meta } : {}),
  };

  return (
    <Screen
      nav={<CharacterNav items={navItems(id, view.isStaff)} />}
      title={[
        characterScreenName(rest),
        state.sheet.profile.characterName.trim() || UNNAMED_CHARACTER,
      ]}
    >
      <div className={styles.page}>
        <CharacterHeader sheet={state.sheet} ruleset={state.ruleset} testBuild={testBuild} />
        {meta ? <ReviewBanner meta={meta} isStaff={view.isStaff} /> : null}
        {testBuild ? <TestBuildBanner view={view} /> : null}
        {testBuild ? <OverspendNotice key={id} view={view} /> : null}
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route index element={<OverviewPage view={view} />} />
            <Route path="skills" element={<SkillsPage view={view} />} />
            <Route path="skills/:skillId" element={<SkillDetailPage view={view} />} />
            <Route path="play" element={<PlayPage view={view} />} />
            <Route path="log" element={<LogPage view={view} />} />
            <Route path="requests" element={<CharacterRequestsPage view={view} />} />
            <Route path="share" element={<SharePage view={view} />} />
            <Route path="more" element={<Navigate to={`/c/${id}`} replace />} />
            <Route path="spells" element={<SpellsPage view={view} />} />
            <Route path="recipes" element={<RecipesPage view={view} />} />
            <Route path="memory" element={<Navigate to={`/c/${id}/spells`} replace />} />
            <Route path="profession" element={<ProfessionPage view={view} />} />
            <Route path="extras" element={<ExtrasPage view={view} />} />
            <Route path="checkin" element={<CheckInPage view={view} />} />
            <Route path="points" element={<PointsPage view={view} />} />
            <Route path="print" element={<PrintPage view={view} />} />
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
 * One header points tile: the name on top, then "99 / 250 left" (left, then the total
 * received). Below zero (a test build can overspend) the tile turns red with a warning icon,
 * never color alone: "-25 / 998 left". Spaces between the parts keep the read-out
 * "CXP 99 / 250 left".
 */
function PointsStat({ label, value, total }: { label: string; value: number; total?: number }) {
  const over = value < 0;
  return (
    <li className={over ? `${styles.point} ${styles.pointOver}` : styles.point}>
      <span className={styles.pointLabel}>
        {label}
        {over ? (
          <>
            {' '}
            <TriangleAlert aria-hidden="true" className={styles.pointIcon} />
            <span className="visually-hidden">(overspent)</span>
          </>
        ) : null}
      </span>{' '}
      <span className={styles.pointAmount}>
        <span className={styles.pointValue}>{value}</span>
        {total !== undefined ? (
          <>
            {' '}
            <span className={styles.pointSuffix}>/ {total} left</span>
          </>
        ) : null}
      </span>
    </li>
  );
}

/** Archetypes the character has earned AP in, with what is left ("Warrior AP 12"). */
function archetypePoints(
  ruleset: Ruleset,
  sheet: Sheet,
): { id: string; label: string; available: number; earned: number }[] {
  return ruleset.archetypes.flatMap((archetype) => {
    const pool = sheet.points.ap[archetype.id];
    return pool && pool.earned > 0
      ? [
          {
            id: archetype.id,
            label: `${archetype.name} AP`,
            available: pool.available,
            earned: pool.earned,
          },
        ]
      : [];
  });
}

function CharacterHeader({
  sheet,
  ruleset,
  testBuild,
}: {
  sheet: Sheet;
  ruleset: Ruleset;
  /** A test build can overspend CXP and PXP; a line under the points says what earns it. */
  testBuild: boolean;
}) {
  const { profile, ancestry, points } = sheet;
  const name = profile.characterName.trim() || UNNAMED_CHARACTER;
  const estimate = testBuild ? eventsEstimateText(ruleset, sheet) : null;
  const line = [
    ancestry ? `${ancestryLine(ancestry.ancestryName, ancestry.subtypeName)}.` : null,
    profile.playerName ? `Player: ${profile.playerName}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <header className={styles.header}>
      <div className={styles.nameRow}>
        <h1 className={styles.name}>{name}</h1>
        {sheet.retired ? <Badge kind="player">Retired</Badge> : null}
      </div>
      {line ? <p className={styles.line}>{line}</p> : null}
      <ul className={styles.points} aria-label="Points">
        <PointsStat label="CXP" value={points.cxp.available} total={points.cxp.total} />
        <PointsStat label="LXP" value={points.lxp.available} total={points.lxp.total} />
        <PointsStat label="PXP" value={points.pxp.available} total={points.pxp.total} />
        <PointsStat label="FP" value={points.fp.available} total={points.fp.total} />
        <PointsStat label="Shinies" value={points.shinies.balance} />
        {archetypePoints(ruleset, sheet).map((ap) => (
          <PointsStat key={ap.id} label={ap.label} value={ap.available} total={ap.earned} />
        ))}
      </ul>
      {estimate ? <p className={styles.estimate}>{estimate}</p> : null}
    </header>
  );
}
