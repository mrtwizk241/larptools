// `#/c/:id/calling`: eligibility, the active Calling (innate, detriment, choices, its two skills,
// the Technique rules state, Calling numbers), leaving it, and former Callings. Staff start,
// advance, and leave; players read.
import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { CircleCheck, CircleX } from 'lucide-react';
import {
  type CallingSection,
  type LearnSkillCommand,
  type SheetSkill,
} from '../../../../engine/index.ts';
import { Badge, Button, Card, Dialog, Field } from '../../../components/index.ts';
import { previewCommand, type CommandApi, useCommand } from '../../../data/engineHooks.ts';
import { LOCAL_MODE } from '../../../../localMode.ts';
import { PLAYGROUND_REASON } from '../playground.ts';
import type { CharacterScreenProps } from '../screen.tsx';
import { ErrorList } from '../ErrorList.tsx';
import type { CharacterView } from '../view.ts';
import { eventLabel, eventsNewestFirst, levelName } from '../journals/events.ts';
import {
  callingNumbers,
  callingSkills,
  choiceText,
  eligibility,
  eligibilityText,
  skillFacts,
  techniqueState,
} from './callingModel.ts';
import { StartCallingForm } from './StartCallingForm.tsx';
import shared from '../character.module.css';
import styles from '../journals/screens.module.css';

export function CallingPage({ view }: CharacterScreenProps) {
  const { sheet, isStaff } = view;
  const calling = sheet.calling;
  return (
    <section aria-labelledby="calling-heading" className={shared.section}>
      <h2 id="calling-heading">Calling</h2>
      <div className={styles.cards}>
        {calling ? (
          <ActiveCalling view={view} calling={calling} />
        ) : (
          <>
            <EligibilityCard view={view} />
            {isStaff ? <StartCallingForm view={view} /> : null}
          </>
        )}
        {sheet.formerCallings.length > 0 ? <FormerCallings view={view} /> : null}
      </div>
    </section>
  );
}

function YesNo({ met, children }: { met: boolean; children: string }) {
  return (
    <p className={`${styles.status} ${met ? styles.ok : styles.blocked}`}>
      {met ? (
        <CircleCheck aria-hidden="true" className={styles.statusIcon} />
      ) : (
        <CircleX aria-hidden="true" className={styles.statusIcon} />
      )}
      <span>{children}</span>
    </p>
  );
}

function EligibilityCard({ view }: { view: CharacterView }) {
  const e = eligibility(view.ruleset, view.sheet, LOCAL_MODE);
  return (
    <Card title="Eligibility" className={`${shared.card} ${styles.wide}`}>
      <div className={shared.stack}>
        <p className={shared.lead}>
          {view.sheet.formerCallings.length > 0 ? 'No active Calling. ' : 'No Calling yet. '}
          {eligibilityText(e)}
        </p>
        {e.lines.map((line) => (
          <YesNo key={line.text} met={line.met}>
            {line.text}
          </YesNo>
        ))}
        {LOCAL_MODE ? null : (
          <p className={shared.muted}>
            Starting also needs a teacher of the Calling or its book from the Atheneum.
          </p>
        )}
      </div>
    </Card>
  );
}

function ActiveCalling({ view, calling }: { view: CharacterView; calling: CallingSection }) {
  const { ruleset, sheet, isStaff } = view;
  const events = eventsNewestFirst(sheet);
  const [chosenEvent, setChosenEvent] = useState('');
  const [teacher, setTeacher] = useState('Calling book');
  const [leaving, setLeaving] = useState(false);
  const command = useCommand(view.id);
  const eventKey = events.some((e) => e.key === chosenEvent) ? chosenEvent : (events[0]?.key ?? '');
  const data = ruleset.callingsById[calling.callingId];
  const choices = Object.entries(calling.choices);
  const numbers = callingNumbers(sheet);
  const skills = callingSkills(sheet, calling.callingId);

  return (
    <>
      <Card title={calling.name} className={`${shared.card} ${styles.wide}`}>
        <div className={shared.stack}>
          {data ? <p>{data.summary}</p> : null}
          <div className={shared.rule}>
            <h3 className={shared.ruleName}>Innate: {calling.innate.name}</h3>
            <p className={shared.text}>{calling.innate.summary}</p>
          </div>
          <div className={shared.rule}>
            <h3 className={shared.ruleName}>Detriment</h3>
            <p className={shared.text}>{calling.detriment ?? 'None.'}</p>
          </div>
          {choices.length > 0 ? (
            <dl className={shared.facts}>
              {choices.map(([id, value]) => (
                <div key={id}>
                  <dt>{data?.choices?.find((c) => c.id === id)?.label ?? id}</dt>
                  <dd className={shared.wrap}>{choiceText(ruleset, value)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {data ? <p className={shared.muted}>{data.source}.</p> : null}
        </div>
      </Card>
      {isStaff && !LOCAL_MODE ? (
        <Card title="Buying" headingLevel={3} className={`${shared.card} ${styles.wide}`}>
          <div className={shared.form}>
            {events.length === 0 ? (
              <p>No events attended yet.</p>
            ) : (
              <Field
                label="Event"
                hint="Purchases are recorded at this event. Calling Techniques need it."
              >
                {(control) => (
                  <select
                    {...control}
                    value={eventKey}
                    onChange={(e) => {
                      setChosenEvent(e.target.value);
                      command.clear();
                    }}
                  >
                    {events.map((e) => (
                      <option key={e.key} value={e.key}>
                        {e.name} ({e.date})
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            )}
            <Field label="Teacher" hint="Who taught a Technique, or the Calling book.">
              {(control) => (
                <input
                  {...control}
                  value={teacher}
                  maxLength={200}
                  autoComplete="off"
                  onChange={(e) => setTeacher(e.target.value)}
                />
              )}
            </Field>
          </div>
        </Card>
      ) : null}
      {skills.map((skill) => (
        <SkillCard
          key={skill.skillId}
          view={view}
          skill={skill}
          eventKey={LOCAL_MODE ? '' : eventKey}
          teacher={LOCAL_MODE ? '' : teacher.trim()}
          command={command}
        />
      ))}
      {command.errors.length > 0 && !leaving ? (
        <div className={styles.wide}>
          <ErrorList messages={command.errors.map((e) => e.message)} />
        </div>
      ) : null}
      <Card title="Technique rules" headingLevel={3} className={shared.card ?? ''}>
        <dl className={shared.facts}>
          {techniqueState(ruleset, sheet, calling, LOCAL_MODE).map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card title="Calling numbers" headingLevel={3} className={shared.card ?? ''}>
        {numbers.length === 0 ? (
          <p>This Calling changes no sheet numbers.</p>
        ) : (
          <dl className={shared.facts}>
            {numbers.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd className={shared.wrap}>{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>
      {isStaff ? (
        <div className={styles.wide}>
          <Button
            variant="danger"
            onClick={() => {
              command.clear();
              setLeaving(true);
            }}
          >
            Leave the Calling
          </Button>
        </div>
      ) : null}
      {leaving ? (
        <LeaveDialog
          view={view}
          calling={calling}
          command={command}
          onClose={() => setLeaving(false)}
        />
      ) : null}
    </>
  );
}

function SkillCard({
  view,
  skill,
  eventKey,
  teacher,
  command,
}: {
  view: CharacterView;
  skill: SheetSkill;
  eventKey: string;
  teacher: string;
  command: CommandApi;
}) {
  const { ruleset, sheet, isStaff } = view;
  const next = skill.nextTechnique;
  const levelCmd: LearnSkillCommand | null =
    skill.level < skill.maxLevel
      ? {
          type: 'learnSkill',
          skillId: skill.skillId,
          step: { level: skill.level + 1 },
          ...(eventKey ? { eventKey } : {}),
        }
      : null;
  const techCmd: LearnSkillCommand | null = next
    ? {
        type: 'learnSkill',
        skillId: skill.skillId,
        step: { technique: next.technique },
        ...(eventKey ? { eventKey } : {}),
        ...(teacher ? { teacher } : {}),
      }
    : null;
  const levelPreview = isStaff && levelCmd ? previewCommand(ruleset, sheet, levelCmd) : null;
  const techPreview = isStaff && techCmd ? previewCommand(ruleset, sheet, techCmd) : null;

  return (
    <Card title={skill.name} headingLevel={3} className={shared.card ?? ''}>
      <div className={shared.stack}>
        <p>{skillFacts(skill)}</p>
        <p className={shared.muted}>
          {skill.nextLevelCost !== null
            ? `Next level: ${skill.nextLevelCost} CXP.`
            : 'At the top level.'}{' '}
          {next
            ? `Next Technique: ${levelName(next.technique)}, ${next.cost} CXP, needs level ${next.needsLevel}.`
            : 'Every Technique learned.'}
        </p>
        <ul className={styles.bullets} aria-label={`${skill.name} abilities`}>
          {skill.abilities.map((a) => (
            <li key={a.named}>
              {levelName(a.named)} ({a.unlocked ? 'unlocked' : 'locked'}): {a.summary}
            </li>
          ))}
        </ul>
        <Link to={`/c/${view.id}/skills/${skill.skillId}`} className={styles.link}>
          {skill.name} details
        </Link>
        {isStaff && levelCmd && levelPreview ? (
          <div className={styles.actions}>
            <Button
              variant="primary"
              disabled={!levelPreview.allowed}
              disabledReason={levelPreview.reasons.join(' ')}
              onClick={() =>
                void command.run(levelCmd, {
                  success: `${skill.name} is now level ${skill.level + 1}.`,
                })
              }
            >
              {`Buy ${skill.name} level ${skill.level + 1} (${levelPreview.cost?.amount ?? skill.nextLevelCost ?? 0} CXP)`}
            </Button>
          </div>
        ) : null}
        {isStaff && techCmd && techPreview && next ? (
          <div className={styles.actions}>
            <Button
              variant="secondary"
              disabled={!techPreview.allowed}
              disabledReason={techPreview.reasons.join(' ')}
              onClick={() =>
                void command.run(techCmd, {
                  success: `${skill.name} has the ${levelName(next.technique)} Technique.`,
                })
              }
            >
              {`Buy ${skill.name} ${levelName(next.technique)} Technique (${next.cost} CXP)`}
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function LeaveDialog({
  view,
  calling,
  command,
  onClose,
}: {
  view: CharacterView;
  calling: CallingSection;
  command: CommandApi;
  onClose: () => void;
}) {
  const formId = useId();
  const events = eventsNewestFirst(view.sheet);
  const [reason, setReason] = useState('');
  const [eventKey, setEventKey] = useState(events[0]?.key ?? '');
  const [error, setError] = useState('');

  function close() {
    command.clear();
    onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (command.running) return;
    // The no-login builder asks for no reason or event.
    const text = LOCAL_MODE ? PLAYGROUND_REASON : reason.trim();
    if (!text) return setError('Give a reason.');
    setError('');
    const result = await command.run(
      { type: 'leaveCalling', reason: text, ...(eventKey && !LOCAL_MODE ? { eventKey } : {}) },
      { success: `Left ${calling.name}.` },
    );
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={close}
      title={`Leave ${calling.name}?`}
      actions={
        <>
          <Button variant="danger" type="submit" form={formId}>
            Leave the Calling
          </Button>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={shared.form} onSubmit={(e) => void submit(e)}>
        {LOCAL_MODE ? (
          <p>Its skills stay on the sheet, locked. You can start another Calling straight away.</p>
        ) : (
          <p>
            Its skills stay on the sheet, locked. A new Calling, or a return to this one, starts at
            a later event.
          </p>
        )}
        {LOCAL_MODE ? null : (
          <Field label="Reason" required error={error}>
            {(control) => (
              <input
                {...control}
                value={reason}
                maxLength={2000}
                autoComplete="off"
                onChange={(e) => setReason(e.target.value)}
              />
            )}
          </Field>
        )}
        {LOCAL_MODE ? null : (
          <Field label="Event" hint="The event the notice was given at.">
            {(control) => (
              <select {...control} value={eventKey} onChange={(e) => setEventKey(e.target.value)}>
                <option value="">No event</option>
                {events.map((e) => (
                  <option key={e.key} value={e.key}>
                    {e.name} ({e.date})
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}

function FormerCallings({ view }: { view: CharacterView }) {
  const { sheet } = view;
  return (
    <Card title="Former Callings" className={`${shared.card} ${styles.wide}`}>
      <ul className={styles.items}>
        {[...sheet.formerCallings].reverse().map((c) => {
          const left = eventLabel(sheet, c.leftEventKey) ?? (c.leftAt ?? '').slice(0, 10);
          const started = eventLabel(sheet, c.startedEventKey) ?? c.startedAt.slice(0, 10);
          return (
            <li key={`${c.callingId}-${c.startedAt}`} className={styles.item}>
              <div className={styles.itemHead}>
                <h3 className={styles.itemName}>{c.name}</h3>
                <Badge kind="rejected">Left</Badge>
              </div>
              <p className={styles.meta}>
                Started at {started}. Left at {left}.
                {c.leftReason ? ` Reason: ${c.leftReason}` : ''}
              </p>
              <ul className={styles.bullets} aria-label={`${c.name} skills`}>
                {callingSkills(sheet, c.callingId).map((s) => (
                  <li key={s.skillId}>
                    {s.name}: level {s.level}
                    {s.techniques.length > 0
                      ? `, ${s.techniques.map(levelName).join(', ')}`
                      : ''}. {s.locked ? 'Locked.' : 'Active again.'}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      {view.isStaff && !sheet.calling ? (
        <p className={shared.muted}>
          To return to a former Calling, choose it under Start a Calling.
        </p>
      ) : null}
    </Card>
  );
}
