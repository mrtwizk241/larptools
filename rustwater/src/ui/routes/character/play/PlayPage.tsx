import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Check, ChevronDown, X } from 'lucide-react';
import type { UsePeriod } from '../../../../engine/index.ts';
import {
  Button,
  Card,
  ConfirmDialog,
  ScrollRow,
  SectionHeading,
  useToast,
} from '../../../components/index.ts';
import type { CharacterView } from '../view.ts';
import { CombatPanel } from './CombatPanel.tsx';
import {
  filterByArchetype,
  groupByPeriod,
  leftOf,
  leftText,
  masteryMoves,
  movesLeft,
  PERIOD_ORDER,
  PERIOD_TITLES,
  pipLabel,
  PLAY_ARCHETYPES,
  resetPeriods,
  RESET_SCOPE,
  restoreFrom,
  restoreUse,
  spendUse,
  basicToSpend,
  restoreOne,
  upgradeBlocked,
  trackedUses,
  spendMove,
  type MasteryMove,
  type Spent,
  type TrackedUse,
} from './usage.ts';
import { useTracker, type TrackerApi } from './useTracker.ts';
import shared from '../character.module.css';
import chips from '../skills/skills.module.css';
import styles from './play.module.css';

const RESET_LABELS: Record<UsePeriod, string> = {
  encounter: 'Reset encounter',
  repop: 'Reset repop',
  event: 'Reset event',
};

const RESET_DONE: Record<UsePeriod, string> = {
  encounter: 'Encounter uses restored.',
  repop: 'Repop and encounter uses restored.',
  event: 'Event uses restored.',
};

type Confirming = 'repop' | 'event' | 'all' | null;

/**
 * `#/c/:id/play`: the game day tracker. Health, armor, and damage with buffs, mastery magic, and
 * every use per encounter, repop, and event. Players and staff alike.
 */
export function PlayPage({ view }: { view: CharacterView }) {
  const { sheet, ruleset } = view;
  const items = useMemo(() => trackedUses(sheet, ruleset), [sheet, ruleset]);
  const moves = useMemo(() => masteryMoves(sheet, ruleset), [sheet, ruleset]);
  const [archetypes, setArchetypes] = useState<string[]>([]);
  const groups = useMemo(
    () => groupByPeriod(filterByArchetype(items, archetypes)),
    [items, archetypes],
  );
  const showMoves = archetypes.length === 0 || archetypes.includes('magic');
  const tracker = useTracker(view.id, items);
  const toast = useToast();
  const [confirming, setConfirming] = useState<Confirming>(null);

  const reset = (periods: readonly UsePeriod[], done: string) => {
    const before = tracker.current();
    if (before === null) return;
    tracker.commit(resetPeriods(before, items, periods));
    toast.show(done, {
      onUndo: () => {
        const now = tracker.current();
        if (now !== null) tracker.commit(restoreFrom(now, before, items, periods));
      },
    });
  };

  const header = (
    <>
      <h2 id="play-heading">Play Tracker</h2>
      <CombatPanel view={view} />
    </>
  );

  if (items.length === 0)
    return (
      <section aria-labelledby="play-heading" className={shared.section}>
        {header}
        <Card>
          <p>Skills and abilities with uses per encounter, repop, or event appear here.</p>
        </Card>
      </section>
    );

  const { state } = tracker;
  if (state.status !== 'ready')
    return (
      <section aria-labelledby="play-heading" className={shared.section}>
        {header}
        {state.status === 'loading' ? <p>Loading uses…</p> : null}
        {state.status === 'error' ? (
          <p role="alert">Spent uses could not be read: {state.message}</p>
        ) : null}
      </section>
    );

  return (
    <section aria-labelledby="play-heading" className={shared.section}>
      {header}
      {tracker.saveError ? (
        <p role="alert" className={styles.error}>
          Spent uses could not be saved: {tracker.saveError}
        </p>
      ) : null}
      <ScrollRow as="div" group label="Filter uses by archetype" wrapOnDesktop>
        <button
          type="button"
          aria-pressed={archetypes.length === 0}
          className={chips.filterChip}
          onClick={() => setArchetypes([])}
        >
          {archetypes.length === 0 ? (
            <Check aria-hidden="true" className={chips.filterIcon} />
          ) : null}
          All
        </button>
        {PLAY_ARCHETYPES.map((id) => {
          const pressed = archetypes.includes(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={pressed}
              className={chips.filterChip}
              onClick={() =>
                setArchetypes((a) => (pressed ? a.filter((x) => x !== id) : [...a, id]))
              }
            >
              {pressed ? <Check aria-hidden="true" className={chips.filterIcon} /> : null}
              {ruleset.archetypesById[id]?.name ?? id}
            </button>
          );
        })}
      </ScrollRow>
      {groups.length === 0 && !(showMoves && moves.length > 0) ? (
        <p className={styles.note}>No uses to track for these archetypes.</p>
      ) : null}
      {showMoves && moves.length > 0 ? (
        <section aria-labelledby="play-mastery" className={styles.group}>
          <div className={styles.groupHead}>
            <div className={styles.groupTitle}>
              <SectionHeading level={3} id="play-mastery">
                Mastery magic
              </SectionHeading>
            </div>
          </div>
          <p className={styles.note}>Using an ability spends every use it needs below.</p>
          <ul className={styles.items}>
            {moves.map((move) => (
              <MoveRow
                key={move.id}
                move={move}
                items={items}
                spent={state.spent}
                tracker={tracker}
              />
            ))}
          </ul>
        </section>
      ) : null}
      {groups.map(({ period, items: groupItems }) => (
        <section key={period} aria-labelledby={`play-${period}`} className={styles.group}>
          <div className={styles.groupHead}>
            <div className={styles.groupTitle}>
              <SectionHeading level={3} id={`play-${period}`}>
                {PERIOD_TITLES[period]}
              </SectionHeading>
            </div>
            <Button
              onClick={() => {
                if (period === 'encounter') reset(RESET_SCOPE.encounter, RESET_DONE.encounter);
                else setConfirming(period);
              }}
            >
              {RESET_LABELS[period]}
            </Button>
          </div>
          <ul className={styles.items}>
            {groupItems.map((item) => (
              <UseRow
                key={item.key}
                item={item}
                items={items}
                groupPeriod={period}
                spent={state.spent}
                tracker={tracker}
                characterId={view.id}
              />
            ))}
          </ul>
        </section>
      ))}
      <div className={styles.footer}>
        <Button onClick={() => setConfirming('all')}>Reset everything</Button>
      </div>
      <ConfirmDialog
        open={confirming === 'repop'}
        title="Reset repop?"
        confirmLabel="Reset repop"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          setConfirming(null);
          reset(RESET_SCOPE.repop, RESET_DONE.repop);
        }}
      >
        <p>Every per-repop and per-encounter use comes back. Per-event uses stay spent.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirming === 'event'}
        title="Reset event?"
        confirmLabel="Reset event"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          setConfirming(null);
          reset(RESET_SCOPE.event, RESET_DONE.event);
        }}
      >
        <p>Every per-event use comes back. Do this when a new event starts.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirming === 'all'}
        title="Reset everything?"
        confirmLabel="Reset everything"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          setConfirming(null);
          reset(PERIOD_ORDER, 'All uses restored.');
        }}
      >
        <p>Every use comes back: per encounter, per repop, and per event.</p>
      </ConfirmDialog>
    </section>
  );
}

/** A mastery magic ability: Use spends the uses of both schools it needs, with Undo. */
function MoveRow({
  move,
  items,
  spent,
  tracker,
}: {
  move: MasteryMove;
  items: readonly TrackedUse[];
  spent: Spent;
  tracker: TrackerApi;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const left = movesLeft(spent, items, move);
  const needs = move.spends.map((s) => `${s.count} ${s.name}`).join(', ');

  const use = () => {
    const now = tracker.current();
    if (now === null) return;
    const next = spendMove(now, items, move);
    if (next === now) return;
    tracker.commit(next);
    toast.show(`Used ${move.name}: spent ${needs}.`, {
      onUndo: () => {
        const latest = tracker.current();
        if (latest !== null) tracker.commit(restoreFrom(latest, now, items, PERIOD_ORDER));
      },
    });
  };

  return (
    <li className={styles.item}>
      <div className={styles.itemHead}>
        <button
          type="button"
          className={styles.nameButton}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={styles.name}>{move.name}</span>
          <ChevronDown
            aria-hidden="true"
            className={open ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron}
          />
        </button>
        <span className={styles.left}>{left === 1 ? '1 use left' : `${left} uses left`}</span>
      </div>
      <p className={styles.note}>Spends {needs}.</p>
      {open ? (
        <div id={panelId} className={styles.details}>
          <p className={styles.detailText}>{move.text}</p>
        </div>
      ) : null}
      <div className={styles.moveHead}>
        <Button
          variant="primary"
          disabled={left < 1}
          {...(left < 1 ? { disabledReason: 'One of the uses it needs is spent.' } : {})}
          aria-label={`Use ${move.name}`}
          onClick={use}
        >
          Use
        </Button>
      </div>
    </li>
  );
}

function UseRow({
  item,
  items,
  groupPeriod,
  spent,
  tracker,
  characterId,
}: {
  item: TrackedUse;
  items: readonly TrackedUse[];
  groupPeriod: UsePeriod;
  spent: Spent;
  tracker: TrackerApi;
  characterId: string;
}) {
  const toast = useToast();
  const left = leftOf(spent, item);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const blockedId = useId();
  const details = item.details ?? [];
  const blocked = left > 0 && upgradeBlocked(spent, items, item);
  const basicName = items.find((i) => i.key === item.upgradeOf)?.name;

  const spend = () => {
    const now = tracker.current();
    if (now === null) return;
    const basic = basicToSpend(now, items, item);
    const next = spendUse(now, items, item);
    if (next === now) return;
    tracker.commit(next);
    const also = basicName ? `, plus one ${basicName} use` : '';
    toast.show(`Spent ${item.name}${also}. ${leftText(leftOf(next, item), item.count)}.`, {
      onUndo: () => {
        const latest = tracker.current();
        if (latest === null) return;
        const restored = restoreOne(latest, item);
        tracker.commit(basic && restored !== latest ? restoreOne(restored, basic) : restored);
      },
    });
  };

  const restore = () => {
    const now = tracker.current();
    if (now !== null) tracker.commit(restoreUse(now, items, item));
  };

  // An upgrade sits under its Basic use; its own reset period may differ from the group's.
  const attached = item.upgradeOf !== undefined && basicName !== undefined;
  return (
    <li className={attached ? `${styles.item} ${styles.upgrade}` : styles.item}>
      <div className={styles.itemHead}>
        {details.length > 0 ? (
          // The name opens what the skill does; aria-expanded says whether it is open.
          <button
            type="button"
            className={styles.nameButton}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
          >
            <span className={styles.name}>{item.name}</span>
            <ChevronDown
              aria-hidden="true"
              className={open ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron}
            />
          </button>
        ) : (
          <span className={styles.name}>{item.name}</span>
        )}
        <span className={styles.left}>{leftText(left, item.count)}</span>
      </div>
      {open && details.length > 0 ? (
        <div id={panelId} className={styles.details}>
          {details.map((detail, index) => (
            <div key={index}>
              {detail.title ? <p className={styles.detailTitle}>{detail.title}</p> : null}
              <p className={styles.detailText}>{detail.text}</p>
            </div>
          ))}
          {item.skillId ? (
            <Link
              to={`/c/${characterId}/skills?open=${item.skillId}`}
              className={styles.detailLink}
            >
              Open in Skills
            </Link>
          ) : null}
        </div>
      ) : null}
      {item.note ? <p className={styles.note}>{item.note}</p> : null}
      {attached && item.period !== groupPeriod ? (
        <p className={styles.note}>{PERIOD_TITLES[item.period]}.</p>
      ) : null}
      {blocked ? (
        <p id={blockedId} className={styles.blocked}>
          No Basic use left.
        </p>
      ) : null}
      <ul className={styles.pips} aria-label={`${item.name} uses`}>
        {Array.from({ length: item.count }, (_, index) => {
          const isSpent = index >= left;
          const stuck = blocked && !isSpent;
          return (
            <li key={index}>
              <button
                type="button"
                className={styles.pip}
                data-spent={isSpent ? '' : undefined}
                data-blocked={stuck ? '' : undefined}
                aria-label={pipLabel(item, index, isSpent)}
                aria-disabled={stuck ? true : undefined}
                aria-describedby={stuck ? blockedId : undefined}
                onClick={isSpent ? restore : stuck ? undefined : spend}
              >
                {isSpent ? <X aria-hidden="true" className={styles.cross} /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
