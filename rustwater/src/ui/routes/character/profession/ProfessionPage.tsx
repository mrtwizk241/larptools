import { useState, type FormEvent } from 'react';
import { CircleCheck, CircleX } from 'lucide-react';
import {
  eventsPlayedBefore,
  preview,
  professionLevelCost,
  type ProfessionSection,
  type ProfessionSkillView,
  type Sheet,
} from '../../../../engine/index.ts';
import { Badge, Button, Card, Field, LevelStepper, PointsChip } from '../../../components/index.ts';
import { useCommand } from '../../../data/engineHooks.ts';
import { ChoiceCard } from '../../create/ChoiceCard.tsx';
import { ErrorList } from '../ErrorList.tsx';
import { frequencyText, usesText } from '../format.ts';
import type { CharacterView } from '../view.ts';
import { eventLabel, eventsNewestFirst } from './events.ts';
import shared from '../character.module.css';
import create from '../../create/create.module.css';
import styles from './profession.module.css';

const TIER_NAMES = { basic: 'Basic', adept: 'Adept', advanced: 'Advanced' } as const;

/** `#/c/:id/profession`: the profession, its two skills, and PXP. Staff start and level it. */
export function ProfessionPage({ view }: { view: CharacterView }) {
  const { sheet } = view;
  const events = eventsNewestFirst(sheet);
  const [chosenEvent, setChosenEvent] = useState('');
  const eventKey = events.some((e) => e.key === chosenEvent) ? chosenEvent : (events[0]?.key ?? '');
  const pxp = sheet.points.pxp;
  return (
    <section aria-labelledby="profession-heading" className={shared.section}>
      <h2 id="profession-heading">Profession</h2>
      <ul className={styles.chips} aria-label="Profession points">
        <li>
          <PointsChip
            label="PXP"
            value={pxp.available}
            suffix="left"
            {...(pxp.available < 0 ? { warning: 'Overspent' } : {})}
          />
        </li>
        <li>
          <PointsChip label="PXP spent" value={pxp.spent} />
        </li>
      </ul>
      {view.isStaff ? (
        <EventPicker view={view} eventKey={eventKey} onChange={setChosenEvent} />
      ) : null}
      {sheet.profession ? (
        <ProfessionDetails view={view} profession={sheet.profession} eventKey={eventKey} />
      ) : view.isStaff ? (
        <StartProfession view={view} eventKey={eventKey} />
      ) : (
        <Card>
          <p>No profession yet.</p>
        </Card>
      )}
    </section>
  );
}

/** The event purchases are recorded at (one level per skill per event). */
function EventPicker({
  view,
  eventKey,
  onChange,
}: {
  view: CharacterView;
  eventKey: string;
  onChange: (key: string) => void;
}) {
  const events = eventsNewestFirst(view.sheet);
  if (events.length === 0)
    return (
      <Card>
        <p>
          Profession purchases are made at an event, and this character has no check-ins yet. Check
          in to an event first.
        </p>
      </Card>
    );
  return (
    <Field
      label="Event"
      hint="Purchases are recorded at this event. Each skill goes up one level per event."
    >
      {(control) => (
        <select {...control} value={eventKey} onChange={(e) => onChange(e.target.value)}>
          {events.map((e) => (
            <option key={e.key} value={e.key}>
              {e.name} ({e.date})
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

function StartProfession({ view, eventKey }: { view: CharacterView; eventKey: string }) {
  const { ruleset, sheet } = view;
  const command = useCommand(view.id);
  const [professionId, setProfessionId] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [formError, setFormError] = useState('');
  const needed = ruleset.professions.rules.start.eventsPlayedBefore;
  const played = eventKey ? eventsPlayedBefore(sheet, eventKey) : 0;
  const enough = eventKey !== '' && played >= needed;
  const profession = professionId ? ruleset.professionsById[professionId] : undefined;
  const levelOneCost = professionLevelCost(ruleset, 1);

  function choose(id: string) {
    setProfessionId(id);
    setSkills([]);
    setFormError('');
    command.clear();
  }

  function toggle(id: string, on: boolean) {
    setSkills((list) =>
      on ? [...list.filter((s) => s !== id), id] : list.filter((s) => s !== id),
    );
    setFormError('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!profession) return setFormError('Choose a profession.');
    if (skills.length === 0) return setFormError('Choose at least one skill to buy at level 1.');
    if (!eventKey) return setFormError('Check in to an event first.');
    const ordered = profession.skills.map((s) => s.id).filter((id) => skills.includes(id));
    await command.run(
      { type: 'startProfession', professionId: profession.id, eventKey, skills: ordered },
      { success: `${sheet.profile.characterName} started the ${profession.name} profession.` },
    );
  }

  return (
    <Card title="Start a profession">
      <form noValidate className={shared.form} onSubmit={(e) => void submit(e)}>
        <p className={styles.status}>
          {enough ? (
            <CircleCheck aria-hidden="true" className={`${styles.statusIcon} ${styles.ok}`} />
          ) : (
            <CircleX aria-hidden="true" className={`${styles.statusIcon} ${styles.blocked}`} />
          )}
          <span>
            Needs {needed} events played before the start event.{' '}
            {eventKey
              ? `${played} played before ${eventLabel(sheet, eventKey)}.`
              : 'No check-ins yet.'}
          </span>
        </p>
        <p className={shared.muted}>
          Starting buys level 1 of one or both skills ({levelOneCost} PXP each) and grants the
          passive. A character has one profession.
        </p>
        <fieldset className={create.group}>
          <legend className={create.legend}>Profession</legend>
          <div className={create.choices}>
            {ruleset.professions.professions.map((p) => (
              <ChoiceCard
                key={p.id}
                name="profession"
                value={p.id}
                checked={professionId === p.id}
                onSelect={choose}
                title={p.name}
              >
                {p.kind === 'patron' ? (
                  <p className={create.meta}>Patron profession{p.patron ? `: ${p.patron}` : ''}.</p>
                ) : null}
                <p className={create.rule}>
                  <span className={create.ruleName}>Passive, {p.passive.name}:</span>{' '}
                  {p.passive.text}
                </p>
                {p.skills.map((s) => (
                  <p key={s.id} className={create.rule}>
                    <span className={create.ruleName}>
                      {s.name} ({frequencyText(s.frequency).toLowerCase()}):
                    </span>{' '}
                    {s.text ?? s.tiers?.basic.text}
                  </p>
                ))}
              </ChoiceCard>
            ))}
          </div>
        </fieldset>
        {profession ? (
          <fieldset className={create.group}>
            <legend className={create.legend}>Buy level 1 of</legend>
            {profession.skills.map((s) => (
              <label key={s.id} className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={skills.includes(s.id)}
                  onChange={(e) => toggle(s.id, e.target.checked)}
                />
                <span>
                  {s.name} ({frequencyText(s.frequency).toLowerCase()}), {levelOneCost} PXP
                </span>
              </label>
            ))}
            <p className={shared.muted}>
              Cost: <span className="num">{skills.length * levelOneCost}</span> PXP of{' '}
              <span className="num">{sheet.points.pxp.available}</span> available.
            </p>
          </fieldset>
        ) : null}
        <ErrorList
          messages={[...(formError ? [formError] : []), ...command.errors.map((e) => e.message)]}
        />
        <div className={styles.actions}>
          <Button variant="primary" type="submit">
            Start profession
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ProfessionDetails({
  view,
  profession,
  eventKey,
}: {
  view: CharacterView;
  profession: ProfessionSection;
  eventKey: string;
}) {
  const command = useCommand(view.id);
  const { sheet } = view;
  return (
    <div className={styles.cards}>
      <Card
        title={
          <>
            {profession.name}
            {profession.kind === 'patron' ? (
              <>
                {' '}
                <Badge kind="player">Patron</Badge>
              </>
            ) : null}
          </>
        }
        className={`${shared.card} ${styles.wide}`}
      >
        <div className={shared.stack}>
          <p className={shared.muted}>
            Started{' '}
            {eventLabel(sheet, profession.startedEventKey) ?? profession.startedAt.slice(0, 10)}.
          </p>
          <div className={shared.rule}>
            <h3 className={shared.ruleName}>Passive: {profession.passive.name}</h3>
            <p className={shared.text}>{profession.passive.text}</p>
          </div>
        </div>
      </Card>
      {profession.skills.map((skill) => (
        <SkillCard
          key={skill.id}
          view={view}
          skill={skill}
          eventKey={eventKey}
          onLevel={(next) =>
            void command.run(
              { type: 'levelProfession', skillId: skill.id, eventKey },
              { success: `${skill.name} is now level ${next}.` },
            )
          }
        />
      ))}
      {command.errors.length > 0 ? (
        <div className={styles.wide}>
          <ErrorList messages={command.errors.map((e) => e.message)} />
        </div>
      ) : null}
      <HistoryCard sheet={sheet} profession={profession} />
    </div>
  );
}

function SkillCard({
  view,
  skill,
  eventKey,
  onLevel,
}: {
  view: CharacterView;
  skill: ProfessionSkillView;
  eventKey: string;
  onLevel: (next: number) => void;
}) {
  const tiered = skill.tiers.length > 0;
  const facts = [
    `${frequencyText(skill.frequency)}.`,
    `Level ${skill.level} of ${skill.maxLevel}.`,
    skill.level > 0 ? `${usesText(skill.uses)}.` : 'Not bought yet.',
  ].join(' ');
  return (
    <Card title={skill.name} headingLevel={3} className={shared.card ?? ''}>
      <div className={shared.stack}>
        <p className={shared.muted}>{facts}</p>
        {tiered ? (
          <p className={shared.muted}>
            Adept upgrades: <span className="num">{skill.adeptUpgrades}</span>. Advanced upgrades:{' '}
            <span className="num">{skill.advancedUpgrades}</span>.
          </p>
        ) : null}
        {view.isStaff ? (
          <ProfessionStepper view={view} skill={skill} eventKey={eventKey} onLevel={onLevel} />
        ) : null}
        {skill.text ? <p className={shared.text}>{skill.text}</p> : null}
        {tiered ? (
          <ul className={styles.tiers} aria-label={`${skill.name} tiers`}>
            {skill.tiers.map((t) => (
              <li
                key={t.tier}
                className={`${styles.tier} ${t.unlocked ? styles.tierUnlocked : ''}`}
              >
                <span className={styles.tierName}>
                  {TIER_NAMES[t.tier]}: {t.unlocked ? 'Unlocked' : `Unlocks at level ${t.minLevel}`}
                </span>
                <span className={shared.text}>{t.text}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}

function ProfessionStepper({
  view,
  skill,
  eventKey,
  onLevel,
}: {
  view: CharacterView;
  skill: ProfessionSkillView;
  eventKey: string;
  onLevel: (next: number) => void;
}) {
  if (!eventKey) return <p className={shared.muted}>Check in to an event to level this skill.</p>;
  // A test build (ADR 0007) may overspend PXP.
  const result = preview(
    view.ruleset,
    view.sheet,
    { type: 'levelProfession', skillId: skill.id, eventKey },
    { testBuild: view.meta?.kind === 'test' },
  );
  const cost = result.cost?.amount ?? skill.nextCost ?? 0;
  return (
    <LevelStepper
      label={skill.name}
      value={skill.level}
      min={skill.level}
      max={skill.maxLevel}
      onChange={(next) => {
        if (next > skill.level) onLevel(next);
      }}
      nextCostLabel={`Next level: ${cost} PXP`}
      {...(result.allowed || skill.level >= skill.maxLevel
        ? {}
        : { blockedReason: result.reasons.join(' ') })}
    />
  );
}

function HistoryCard({ sheet, profession }: { sheet: Sheet; profession: ProfessionSection }) {
  const names = new Map(profession.skills.map((s) => [s.id, s.name]));
  const rows = [...profession.history].reverse();
  return (
    <Card title="History" className={`${shared.card} ${styles.wide}`}>
      {rows.length === 0 ? (
        <p>No levels bought yet.</p>
      ) : (
        <ol className={styles.history} reversed>
          {rows.map((h) => (
            <li key={h.actionId}>
              {names.get(h.skillId) ?? h.skillId} to level <span className="num">{h.toLevel}</span>
              {h.eventKey ? ` at ${eventLabel(sheet, h.eventKey)}` : ''}.
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
