// `#/c/:id/play`: the game day use tracker, for players and staff. Every skill with uses is a row
// of pips (one per level) with one-tap spend buttons for its unlocked named abilities; racial
// innate actives renew per encounter; castable spells spend uses of their magic skill. Spent
// uses live in the use tracker (outside the action log) and survive reloads and no signal.
import { useId, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronDown, X } from 'lucide-react';
import {
  Button,
  Card,
  ConfirmDialog,
  SectionHeading,
  useToast,
} from '../../../components/index.ts';
import type { CharacterScreenProps } from '../screen.tsx';
import {
  castLabel,
  castableSpells,
  leftOf,
  leftText,
  pipLabel,
  resetPeriods,
  RESET_SCOPE,
  restoreFrom,
  restoreUses,
  spendLabel,
  spendUses,
  trackedUses,
  usesText,
  type CastableSpell,
  type Spent,
  type TrackedUse,
} from './usage.ts';
import { useTracker, type TrackerApi } from './useTracker.ts';
import { CombatPanel } from './CombatPanel.tsx';
import shared from '../character.module.css';
import styles from './play.module.css';

export const CALLING_NOTE = 'Renews only at re-pop.';

export function PlayPage({ view }: CharacterScreenProps) {
  const { sheet, ruleset } = view;
  const items = useMemo(() => trackedUses(sheet), [sheet]);
  const spells = useMemo(() => castableSpells(sheet, ruleset, items), [sheet, ruleset, items]);
  const tracker = useTracker(view.id, items);
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  const encounter = items.filter((i) => i.period === 'encounter');
  const skills = items.filter((i) => i.period === 'repop' && !i.calling);
  const calling = items.filter((i) => i.period === 'repop' && i.calling);

  const reset = (scope: 'encounter' | 'repop') => {
    const before = tracker.current();
    if (before === null) return;
    const periods = RESET_SCOPE[scope];
    tracker.commit(resetPeriods(before, items, periods));
    toast.show(
      scope === 'encounter'
        ? 'New encounter: innate uses renewed.'
        : 'New re-pop: every use renewed.',
      {
        onUndo: () => {
          const now = tracker.current();
          if (now !== null) tracker.commit(restoreFrom(now, before, items, periods));
        },
      },
    );
  };

  const header = <h2 id="play-heading">Play</h2>;

  if (items.length === 0)
    return (
      <section aria-labelledby="play-heading" className={shared.section}>
        {header}
        <Card>
          <p>This character has no skills or innate abilities with uses yet.</p>
        </Card>
        <CombatPanel view={view} />
      </section>
    );

  const { state } = tracker;
  if (state.status !== 'ready')
    return (
      <section aria-labelledby="play-heading" className={shared.section}>
        {header}
        {state.status === 'loading' ? <p>Loading uses...</p> : null}
        {state.status === 'error' ? (
          <p role="alert">Spent uses could not be read: {state.message}</p>
        ) : null}
      </section>
    );

  const rows = (list: readonly TrackedUse[]) => (
    <ul className={styles.items}>
      {list.map((item) => (
        <UseRow
          key={item.key}
          item={item}
          spent={state.spent}
          tracker={tracker}
          characterId={view.id}
        />
      ))}
    </ul>
  );

  return (
    <section aria-labelledby="play-heading" className={shared.section}>
      <div className={styles.head}>
        {header}
        <div className={styles.resets}>
          <Button onClick={() => reset('encounter')}>New encounter</Button>
          <Button onClick={() => setConfirming(true)}>New re-pop</Button>
        </div>
      </div>
      {tracker.saveError ? (
        <p role="alert" className={styles.error}>
          Spent uses could not be saved: {tracker.saveError}
        </p>
      ) : null}
      <CombatPanel view={view} />
      {encounter.length > 0 ? (
        <Group id="play-encounter" title="Per encounter" hint="Renews at each new encounter.">
          {rows(encounter)}
        </Group>
      ) : null}
      {skills.length > 0 ? (
        <Group id="play-skills" title="Skills" hint="Uses renew at re-pop.">
          {rows(skills)}
        </Group>
      ) : null}
      {calling.length > 0 ? (
        <Group id="play-calling" title="Calling skills" hint={CALLING_NOTE}>
          {rows(calling)}
        </Group>
      ) : null}
      {spells.length > 0 ? (
        <Group id="play-spells" title="Spells" hint="Casting spends uses of the magic skill.">
          <ul className={styles.spells}>
            {spells.map((spell) => (
              <SpellRow
                key={spell.id}
                spell={spell}
                item={items.find((i) => i.key === spell.poolKey)}
                spent={state.spent}
                tracker={tracker}
              />
            ))}
          </ul>
        </Group>
      ) : null}
      <ConfirmDialog
        open={confirming}
        title="Start a new re-pop?"
        confirmLabel="New re-pop"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          reset('repop');
        }}
      >
        <p>Every spent use comes back, Calling skills included.</p>
      </ConfirmDialog>
    </section>
  );
}

function Group({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={styles.group}>
      <SectionHeading level={3} id={id}>
        {title}
      </SectionHeading>
      <p className={styles.hint}>{hint}</p>
      {children}
    </section>
  );
}

/** Spends `cost` uses of `item` with an Undo toast, or says why it cannot. */
function useSpend(tracker: TrackerApi) {
  const toast = useToast();
  return (item: TrackedUse, cost: number, what: string) => {
    const now = tracker.current();
    if (now === null) return;
    const next = spendUses(now, item, cost);
    if (next === now) {
      toast.show(
        `Not enough uses for ${what}: needs ${usesText(cost)}, ${leftOf(now, item)} left.`,
      );
      return;
    }
    tracker.commit(next);
    toast.show(`Spent ${usesText(cost)}: ${what}. ${leftText(leftOf(next, item), item.count)}.`, {
      onUndo: () => {
        const latest = tracker.current();
        if (latest !== null) tracker.commit(restoreUses(latest, item, cost));
      },
    });
  };
}

function UseRow({
  item,
  spent,
  tracker,
  characterId,
}: {
  item: TrackedUse;
  spent: Spent;
  tracker: TrackerApi;
  characterId: string;
}) {
  const spend = useSpend(tracker);
  const left = leftOf(spent, item);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const hasDetails = item.details.length > 0;

  const restore = () => {
    const now = tracker.current();
    if (now !== null) tracker.commit(restoreUses(now, item, 1));
  };

  return (
    <li className={styles.item}>
      <div className={styles.itemHead}>
        {hasDetails ? (
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((o) => !o)}
          >
            <ChevronDown aria-hidden="true" className={styles.chevron} />
            <span className={styles.name}>{item.name}</span>
          </button>
        ) : (
          <span className={styles.name}>{item.name}</span>
        )}
        <span className={styles.left}>{leftText(left, item.count)}</span>
      </div>
      {hasDetails ? (
        <div id={panelId} hidden={!open} className={styles.details}>
          <dl>
            {item.details.map((d) => (
              <div key={d.label}>
                <dt>{d.label}</dt>
                <dd>{d.summary}</dd>
              </div>
            ))}
          </dl>
          {item.notLearned.length > 0 ? (
            <p className={styles.note}>Not learned yet: {item.notLearned.join(', ')}.</p>
          ) : null}
          {item.skillId ? (
            <Link to={`/c/${characterId}/skills/${item.skillId}`}>Open {item.name}</Link>
          ) : null}
        </div>
      ) : null}
      {item.note ? <p className={styles.note}>{item.note}</p> : null}
      {item.calling ? <p className={styles.note}>{CALLING_NOTE}</p> : null}
      <ul className={styles.pips} aria-label={`${item.name} uses`}>
        {Array.from({ length: item.count }, (_, index) => {
          const isSpent = index >= left;
          return (
            <li key={index}>
              <button
                type="button"
                className={styles.pip}
                data-spent={isSpent ? '' : undefined}
                aria-label={pipLabel(item, index, isSpent)}
                onClick={isSpent ? restore : () => spend(item, 1, item.name)}
              >
                {isSpent ? <X aria-hidden="true" className={styles.cross} /> : null}
              </button>
            </li>
          );
        })}
      </ul>
      {item.abilities.length > 0 ? (
        <div className={styles.abilities}>
          {item.abilities.map((option) => (
            <Button
              key={option.named}
              className={styles.spend}
              data-short={left < option.cost ? '' : undefined}
              onClick={() => spend(item, option.cost, option.name)}
            >
              {spendLabel(option)}
            </Button>
          ))}
        </div>
      ) : null}
    </li>
  );
}

function SpellRow({
  spell,
  item,
  spent,
  tracker,
}: {
  spell: CastableSpell;
  item: TrackedUse | undefined;
  spent: Spent;
  tracker: TrackerApi;
}) {
  const spend = useSpend(tracker);
  if (!item) return null;
  const short = leftOf(spent, item) < spell.cost;
  return (
    <li className={styles.spell}>
      <Button
        className={styles.spend}
        data-short={short ? '' : undefined}
        onClick={() => spend(item, spell.cost, spell.name)}
      >
        {castLabel(spell)}
      </Button>
      {spell.pending ? <span className={styles.note}>Pending tag</span> : null}
    </li>
  );
}
