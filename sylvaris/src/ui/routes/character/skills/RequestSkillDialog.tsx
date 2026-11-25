// Player: "+ Request" on a skill row or the skill page. Asks staff for the next level or the
// next Technique, with the teacher (required for Basic and Techniques) and a note. Saved as a
// request through the repository; staff approve or reject it in Staff tools.
import { useId, useState, type FormEvent } from 'react';
import { preview } from '../../../../engine/index.ts';
import type { Request, SkillStep } from '../../../../engine/model.ts';
import { Button, Dialog, Field, useToast } from '../../../components/index.ts';
import { useRepository } from '../../../data/hooks.ts';
import { newRequest } from '../../../data/requests.ts';
import { costText } from '../../../lib/names.ts';
import type { CharacterView } from '../view.ts';
import { buildDraft, callingTechniqueNote, stepKey } from './requestParts.ts';
import { nextSteps, skillName, stepText, stepTitle, type Skill } from './skillInfo.ts';
import characterStyles from '../character.module.css';
import styles from './skills.module.css';

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function unique(value: string, index: number, list: readonly string[]): boolean {
  return list.indexOf(value) === index;
}

export function RequestSkillDialog({
  view,
  skill,
  onClose,
}: {
  view: CharacterView;
  skill: Skill;
  onClose: () => void;
}) {
  const formId = useId();
  const repository = useRepository();
  const toast = useToast();
  const steps = nextSteps(view.ruleset, view.sheet, skill);
  const [chosenKey, setChosenKey] = useState(steps[0] ? stepKey(steps[0]) : '');
  const [teacher, setTeacher] = useState('');
  const [note, setNote] = useState('');
  const [teacherError, setTeacherError] = useState<string | undefined>(undefined);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const step: SkillStep | undefined = steps.find((s) => stepKey(s) === chosenKey) ?? steps[0];
  if (!step) return null;

  // The same check staff run when they approve, on a draft that is not saved yet.
  const draft: Request = buildDraft(view.id, skill.id, step, teacher);
  const check = preview(view.ruleset, view.sheet, { type: 'approveRequest', request: draft });
  const teacherRequired = check.teacherRequired === true;
  const reasons = check.errors.map((e) => e.message).filter(unique);
  const what = `${skillName(view.ruleset, view.sheet, skill.id)} ${stepText(step)}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !step) return;
    const missing = teacherRequired && teacher.trim() === '';
    setTeacherError(missing ? 'Enter who taught you.' : undefined);
    if (missing) return;
    setSaving(true);
    try {
      await repository.saveRequest(
        newRequest({ characterId: view.id, skillId: skill.id, step, teacher, note }),
      );
      toast.show(`Sent ${what} to staff. Their answer shows under Requests.`);
      onClose();
    } catch (error) {
      setSaveError(`The request could not be sent: ${message(error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Request ${skillName(view.ruleset, view.sheet, skill.id)}`}
      actions={
        <>
          <Button variant="primary" type="submit" form={formId}>
            Send to staff
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
        <p>Learned this in game? Tell staff who taught you. They approve it for your sheet.</p>
        {steps.length > 1 ? (
          <fieldset className={styles.choices}>
            <legend>What did you learn?</legend>
            {steps.map((s) => (
              <label key={stepKey(s)} className={styles.radio}>
                <input
                  type="radio"
                  name={`${formId}-step`}
                  value={stepKey(s)}
                  checked={stepKey(s) === stepKey(step)}
                  onChange={() => setChosenKey(stepKey(s))}
                />
                <span>{stepTitle(s)}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <p className={characterStyles.lead}>{stepTitle(step)}</p>
        )}
        <Field
          label="Who taught you?"
          hint={
            teacherRequired
              ? 'Required for Basic (level 1) and each Technique.'
              : 'Optional: levels 2 to 10 are self-taught.'
          }
          required={teacherRequired}
          error={teacherError}
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
        <Field label="Note" hint="Optional: the event or anything staff should know.">
          {(control) => (
            <textarea
              {...control}
              maxLength={5000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>
        {skill.category === 'calling' && 'technique' in step ? (
          <p>{callingTechniqueNote(view.ruleset.ruleset.calling.techniquesPerEvent)}</p>
        ) : null}
        {check.cost ? <p>If approved: {costText(view.ruleset, check.cost)}.</p> : null}
        {reasons.length > 0 ? (
          <div className={characterStyles.stack}>
            <p className={characterStyles.lead}>Staff may not be able to approve this yet:</p>
            <ul className={characterStyles.warningList}>
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {saveError ? <p role="alert">{saveError}</p> : null}
      </form>
    </Dialog>
  );
}
