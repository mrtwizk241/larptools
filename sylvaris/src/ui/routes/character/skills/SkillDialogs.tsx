// Staff dialogs on the skill page: learn a level or a Technique (teacher, event) and refund the
// top level or Technique (reason). Both plan through the engine; errors show inline.
import { useId, useState, type FormEvent } from 'react';
import { type LearnSkillCommand } from '../../../../engine/index.ts';
import type { SkillStep } from '../../../../engine/model.ts';
import { Button, Dialog, Field } from '../../../components/index.ts';
import { previewCommand, useCommand } from '../../../data/engineHooks.ts';
import { costText, dateText } from '../../../lib/names.ts';
import { ErrorList } from '../ErrorList.tsx';
import type { CharacterView } from '../view.ts';
import { eventsNewestFirst, skillName, stepText, type Skill } from './skillInfo.ts';
import characterStyles from '../character.module.css';

interface DialogProps {
  view: CharacterView;
  skill: Skill;
  step: SkillStep;
  onClose: () => void;
}

function unique(value: string, index: number, list: readonly string[]): boolean {
  return list.indexOf(value) === index;
}

/** Learn command for a step, with the optional teacher and event. */
function learnCommand(
  skill: Skill,
  step: SkillStep,
  teacher: string,
  eventKey: string,
): LearnSkillCommand {
  return {
    type: 'learnSkill',
    skillId: skill.id,
    step,
    ...(teacher.trim() ? { teacher: teacher.trim() } : {}),
    ...(eventKey ? { eventKey } : {}),
  };
}

/** "Learn Toughness level 4 for 20 XP?" with Teacher (Basic and Techniques) and Event. */
export function LearnDialog({ view, skill, step, onClose }: DialogProps) {
  const formId = useId();
  const command = useCommand(view.id);
  const { ruleset, sheet } = view;
  const [teacher, setTeacher] = useState('');
  const [eventKey, setEventKey] = useState('');

  const result = previewCommand(ruleset, sheet, learnCommand(skill, step, teacher, eventKey));
  const what = `${skillName(view.ruleset, view.sheet, skill.id)} ${stepText(step)}`;
  const title = result.cost
    ? `Learn ${what} for ${costText(ruleset, result.cost)}?`
    : `Learn ${what}?`;
  const taught = result.teacherRequired === true;
  const callingTechnique = skill.category === 'calling' && 'technique' in step;
  const events = eventsNewestFirst(sheet);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const outcome = await command.run(learnCommand(skill, step, teacher, eventKey), {
      success: `Learned ${what}.`,
    });
    if (outcome.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      actions={
        <>
          <Button variant="primary" type="submit" form={formId}>
            Learn
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className={characterStyles.form}
        onSubmit={(e) => void submit(e)}
      >
        {taught ? (
          <Field
            label="Teacher"
            hint="Who taught it, for the Log of Learning. Leave blank to record it as unverified."
          >
            {(control) => (
              <input
                {...control}
                autoComplete="off"
                maxLength={200}
                value={teacher}
                onChange={(e) => setTeacher(e.target.value)}
              />
            )}
          </Field>
        ) : (
          <p>Levels 2 to 10 are self-taught: no teacher needed.</p>
        )}
        <Field
          label="Event"
          hint={
            callingTechnique
              ? 'Required: a Calling Technique is learned at an event after the Calling started.'
              : 'Optional: the event it was learned at.'
          }
          required={callingTechnique}
        >
          {(control) => (
            <select {...control} value={eventKey} onChange={(e) => setEventKey(e.target.value)}>
              <option value="">{callingTechnique ? 'Choose an event' : 'No event'}</option>
              {events.map((e) => (
                <option key={e.key} value={e.key}>
                  {`${e.name} (${dateText(e.date)})`}
                </option>
              ))}
            </select>
          )}
        </Field>
        <ErrorList
          messages={[...result.reasons, ...command.errors.map((e) => e.message)].filter(unique)}
        />
      </form>
    </Dialog>
  );
}

/** "Refund Toughness level 4?" with a required reason. */
export function RefundDialog({ view, skill, step, onClose }: DialogProps) {
  const formId = useId();
  const command = useCommand(view.id);
  const { ruleset, sheet } = view;
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const what = `${skillName(view.ruleset, view.sheet, skill.id)} ${stepText(step)}`;
  const result = previewCommand(ruleset, sheet, { type: 'refundSkill', skillId: skill.id, step });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim() === '') {
      setError('Enter a reason for the refund.');
      return;
    }
    setError(undefined);
    const outcome = await command.run(
      { type: 'refundSkill', skillId: skill.id, step, reason: reason.trim() },
      { success: `Refunded ${what}.` },
    );
    if (outcome.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Refund ${what}?`}
      actions={
        <>
          <Button variant="danger" type="submit" form={formId}>
            Refund
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className={characterStyles.form}
        onSubmit={(e) => void submit(e)}
      >
        {result.refund ? <p>Returns {costText(ruleset, result.refund)}.</p> : null}
        <Field label="Reason" hint="Recorded in the log." required error={error}>
          {(control) => (
            <textarea
              {...control}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
        <ErrorList
          messages={[...result.reasons, ...command.errors.map((e) => e.message)].filter(unique)}
        />
      </form>
    </Dialog>
  );
}
