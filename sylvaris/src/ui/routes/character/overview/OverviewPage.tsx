// `#/c/:id`: the sheet overview. Warnings first, then Life and Armor Points, skills, profile, race,
// passive damage, slots and languages, Spirit Fragments, upkeep and income, Calling, and points.
import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Minus, Plus, TriangleAlert } from 'lucide-react';
import type { StatLine } from '../../../../engine/index.ts';
import { Button, Card, Dialog, Field } from '../../../components/index.ts';
import { useCommand } from '../../../data/engineHooks.ts';
import { currencyAbbr } from '../../../lib/names.ts';
import type { CharacterScreenProps } from '../screen.tsx';
import { ErrorList } from '../ErrorList.tsx';
import { TableScroll } from '../TableScroll.tsx';
import type { CharacterView } from '../view.ts';
import {
  capText,
  conditionalText,
  damageRows,
  dualWieldLines,
  durationText,
  incomeLine,
  languagesText,
  pointsRows,
  slotRows,
  sourcesText,
  upkeepText,
  weaponName,
} from './overviewModel.ts';
import { LOCAL_MODE } from '../../../../localMode.ts';
import { ProfileCard } from './ProfileCard.tsx';
import { RaceCard } from './RaceCard.tsx';
import { SkillsCard } from './SkillsCard.tsx';
import styles from '../character.module.css';
import own from './overview.module.css';

export function OverviewPage({ view }: CharacterScreenProps) {
  return (
    <div className={styles.overview}>
      {shownWarnings(view).length > 0 ? <WarningsCard view={view} /> : null}
      <BodyCard view={view} />
      <SkillsCard view={view} />
      <ProfileCard view={view} />
      <RaceCard view={view} />
      <DamageCard view={view} />
      <SlotsCard view={view} />
      <SpiritCard view={view} />
      <UpkeepCard view={view} />
      <CallingCard view={view} />
      {LOCAL_MODE ? null : <PointsCard view={view} />}
    </div>
  );
}

/** Over-budget codes: the Character Playground shows those in its header instead. */
const BUDGET_WARNINGS: ReadonlySet<string> = new Set([
  'NEGATIVE_XP',
  'NEGATIVE_CXP',
  'NEGATIVE_AXP',
]);

function shownWarnings(view: CharacterView) {
  const { warnings } = view.sheet;
  return LOCAL_MODE ? warnings.filter((w) => !BUDGET_WARNINGS.has(w.code)) : warnings;
}

function WarningsCard({ view }: { view: CharacterView }) {
  const warnings = shownWarnings(view);
  return (
    <Card
      title={
        <span className={styles.warnTitle}>
          <TriangleAlert aria-hidden="true" className={styles.warnIcon} />
          {warnings.length === 1 ? 'Warning' : `Warnings (${warnings.length})`}
        </span>
      }
      className={styles.warningCard ?? ''}
    >
      <p className={styles.muted}>Something in this character's log does not add up.</p>
      <ul className={styles.warningList}>
        {warnings.map((w, index) => (
          <li key={`${w.actionId ?? 'log'}-${w.code}-${index}`}>{w.message}</li>
        ))}
      </ul>
    </Card>
  );
}

/** A number with its sources, cap, and the sources that only apply sometimes. */
function LineDetails({ line }: { line: StatLine }) {
  const cap = capText(line);
  return (
    <>
      {line.sources.length > 0 ? (
        <span className={styles.from}>From: {sourcesText(line.sources)}</span>
      ) : null}
      {cap ? <span className={styles.from}>{cap}</span> : null}
      {line.conditional.length > 0 ? (
        <span className={styles.from}>Sometimes: {conditionalText(line.conditional)}</span>
      ) : null}
    </>
  );
}

function BodyCard({ view }: { view: CharacterView }) {
  const { stats } = view.sheet;
  return (
    <Card title="Life and armor" className={styles.card ?? ''}>
      <dl className={own.body}>
        <div>
          <dt>Life Points</dt>
          <dd>
            <span className={own.big}>{stats.lifePoints.value}</span>
            <LineDetails line={stats.lifePoints} />
          </dd>
        </div>
        <div>
          <dt>Armor Points</dt>
          <dd>
            <span className={own.big}>{stats.armorPoints.value}</span>
            <LineDetails line={stats.armorPoints} />
            <span className={styles.from}>Plus worn armor, from its tag.</span>
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function DamageCard({ view }: { view: CharacterView }) {
  const { sheet } = view;
  const caps = view.ruleset.ruleset.caps;
  const dual = dualWieldLines(sheet);
  // Only the kinds of attack that get something; the caps are in the line above.
  const rows = damageRows(sheet).filter(
    (r) => r.line.value > 0 || r.line.sources.length > 0 || r.line.conditional.length > 0,
  );
  return (
    <Card title="Passive damage" className={styles.card ?? ''}>
      <p className={styles.muted}>
        Added to every hit of that kind. Passive damage stops at {caps.passiveDamage}, from behind
        at {caps.passiveDamageFromBehind}.
      </p>
      <dl className={styles.facts}>
        {rows.length === 0 ? (
          <div>
            <dt>Weapons, ranged, and Relic</dt>
            <dd>No passive damage yet</dd>
          </div>
        ) : null}
        {rows.map((row) => (
          <div key={row.id}>
            <dt>{row.label}</dt>
            <dd>
              <span className={styles.statValue}>{row.line.value}</span>
              <LineDetails line={row.line} />
            </dd>
          </div>
        ))}
        {sheet.stats.naturalWeapons.length > 0 ? (
          <div>
            <dt>Natural weapons</dt>
            <dd>
              {sheet.stats.naturalWeapons
                .map(
                  (w) =>
                    `${weaponName(w.id)}${w.greatclaw ? ' (Greatclaw)' : ''}, base ${w.baseDamage} damage, from ${w.source}`,
                )
                .join('; ')}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Dual wield</dt>
          <dd>
            {dual.length > 0 ? (
              <ul className={own.lines}>
                {dual.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              'Not from race or skills'
            )}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function SlotsCard({ view }: { view: CharacterView }) {
  const { stats } = view.sheet;
  return (
    <Card title="Slots and languages" className={styles.card ?? ''}>
      <dl className={styles.facts}>
        {slotRows(view.sheet).map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd className="num">{row.value}</dd>
          </div>
        ))}
        <div>
          <dt>Languages read and written</dt>
          <dd>{languagesText(view.sheet)}</dd>
        </div>
        <div>
          <dt>Bleed-out time</dt>
          <dd>
            {durationText(stats.bleedOutSeconds.value)}
            {stats.bleedOutSeconds.sources.length > 1 ? (
              <span className={styles.from}>
                From: {sourcesText(stats.bleedOutSeconds.sources)}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function SpiritCard({ view }: { view: CharacterView }) {
  const { spirit } = view.sheet;
  const [change, setChange] = useState<1 | -1 | null>(null);
  const last = spirit.history[spirit.history.length - 1];
  return (
    <Card title="Spirit Fragments" className={styles.card ?? ''}>
      <p className={own.spirit}>
        <span className={own.big}>{spirit.current}</span>
        <span>of {spirit.max}</span>
      </p>
      {spirit.current === 0 ? (
        <p className={styles.lead}>At 0 Spirit Fragments the character can never be raised.</p>
      ) : null}
      {last ? (
        <p className={styles.muted}>
          Last change: {last.delta > 0 ? `+${last.delta}` : last.delta}, {last.reason}
        </p>
      ) : null}
      {view.isStaff ? (
        <div className={styles.cardActions}>
          <Button
            variant="secondary"
            icon={<Plus />}
            disabled={spirit.current >= spirit.max}
            disabledReason="Already at the maximum"
            onClick={() => setChange(1)}
          >
            Add Spirit Fragment
          </Button>
          <Button
            variant="secondary"
            icon={<Minus />}
            disabled={spirit.current <= 0}
            disabledReason="None left"
            onClick={() => setChange(-1)}
          >
            Remove Spirit Fragment
          </Button>
        </div>
      ) : null}
      {change ? (
        <SpiritDialog view={view} direction={change} onClose={() => setChange(null)} />
      ) : null}
    </Card>
  );
}

function SpiritDialog({
  view,
  direction,
  onClose,
}: {
  view: CharacterView;
  direction: 1 | -1;
  onClose: () => void;
}) {
  const formId = useId();
  const command = useCommand(view.id);
  const { current, max } = view.sheet.spirit;
  const room = direction > 0 ? max - current : current;
  const [amount, setAmount] = useState('1');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; reason?: string }>({});
  const verb = direction > 0 ? 'Add' : 'Remove';

  async function submit(event: FormEvent) {
    event.preventDefault();
    const n = Number(amount);
    const found: { amount?: string; reason?: string } = {};
    if (!/^\d+$/.test(amount.trim()) || n < 1 || n > room)
      found.amount = `Enter a whole number from 1 to ${room}.`;
    if (reason.trim() === '') found.reason = 'Give a reason.';
    setErrors(found);
    if (found.amount || found.reason) return;
    const result = await command.run(
      { type: 'changeSpirit', delta: direction * n, reason: reason.trim() },
      { success: 'Spirit Fragments saved.' },
    );
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${verb} Spirit Fragments`}
      actions={
        <>
          <Button variant="primary" type="submit" form={formId} aria-busy={command.running}>
            {verb} Spirit Fragments
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={styles.form} onSubmit={(e) => void submit(e)}>
        <p>
          Now {current} of {max}.
        </p>
        <Field label="How many" required error={errors.amount}>
          {(control) => (
            <input
              {...control}
              inputMode="numeric"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
        </Field>
        <Field label="Reason" required error={errors.reason}>
          {(control) => (
            <input
              {...control}
              autoComplete="off"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}

function UpkeepCard({ view }: { view: CharacterView }) {
  const { stats } = view.sheet;
  return (
    <Card title="Upkeep and check-in income" className={styles.card ?? ''}>
      <dl className={styles.facts}>
        <div>
          <dt>Upkeep due</dt>
          <dd>{upkeepText(view.sheet)}</dd>
        </div>
        <div>
          <dt>What covers it</dt>
          <dd>
            {stats.upkeep.covers.length > 0 ? (
              <ul className={own.lines}>
                {stats.upkeep.covers.map((c) => (
                  <li key={c.id}>
                    {c.summary}
                    {c.automatic ? ' (applied at check-in)' : ''}
                  </li>
                ))}
              </ul>
            ) : (
              'Paid in coin at check-in'
            )}
          </dd>
        </div>
        <div>
          <dt>Check-in income</dt>
          <dd>
            {stats.checkInIncome.length > 0 ? (
              <ul className={own.lines}>
                {stats.checkInIncome.map((s) => (
                  <li key={s.id}>{incomeLine(s)}</li>
                ))}
              </ul>
            ) : (
              'None'
            )}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function CallingCard({ view }: { view: CharacterView }) {
  const { calling, callingEligibility: e } = view.sheet;
  return (
    <Card title="Calling" className={styles.card ?? ''}>
      {calling ? (
        <dl className={styles.facts}>
          <div>
            <dt>Calling</dt>
            <dd>{calling.name}</dd>
          </div>
          <div>
            <dt>Innate</dt>
            <dd>
              {calling.innate.name}: {calling.innate.summary}
            </dd>
          </div>
          {calling.detriment ? (
            <div>
              <dt>Detriment</dt>
              <dd>{calling.detriment}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p>
          No Calling yet. Full events: {e.fullEvents} of the {e.needed} needed
          {e.eligible ? ', so the character can start one.' : '.'}
        </p>
      )}
      <ul className={own.links}>
        <li>
          <Link className={own.link} to={`/c/${view.id}/calling`}>
            Calling details
          </Link>
        </li>
        <li>
          <Link className={own.link} to={`/c/${view.id}/skills`}>
            Skills
          </Link>
        </li>
        <li>
          <Link className={own.link} to={`/c/${view.id}/journals`}>
            Magic and journals
          </Link>
        </li>
      </ul>
    </Card>
  );
}

function PointsCard({ view }: { view: CharacterView }) {
  return (
    <Card title="Points" className={styles.card ?? ''}>
      <TableScroll label="Points by currency">
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Points</th>
              <th scope="col">Earned</th>
              <th scope="col">Spent</th>
              <th scope="col">Left</th>
            </tr>
          </thead>
          <tbody>
            {pointsRows(view.sheet).map((row) => (
              <tr key={row.currency}>
                <th scope="row">{currencyAbbr(view.ruleset, row.currency)}</th>
                <td className="num">
                  {row.earned}
                  {row.cap !== null ? <span className={styles.muted}> of {row.cap}</span> : null}
                </td>
                <td className="num">{row.spent}</td>
                <td className={row.available < 0 ? styles.negative : 'num'}>
                  {row.available}
                  {row.available < 0 ? <span className={styles.flag}> Overspent</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </Card>
  );
}
