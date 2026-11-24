// Player: "I learned this skill" from the + on the skills list or the skill page. Sends the
// request to staff right away (they approve it in Staff tools). A multi-archetype skill not owned
// yet asks for the archetype to buy it in.
import { useId, useState, type FormEvent } from 'react';
import { preview } from '../../../../engine/index.ts';
import type { Request, SkillPart } from '../../../../engine/model.ts';
import { Button, Dialog, Field, useToast } from '../../../components/index.ts';
import { useRepository } from '../../../data/hooks.ts';
import { newRequest } from '../../../data/requests.ts';
import type { CharacterView } from '../view.ts';
import { requestableParts } from './requestParts.ts';
import { archetypeName, costText, needsArchetypeChoice, type Skill } from './skillInfo.ts';
import characterStyles from '../character.module.css';

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function unique(value: string, index: number, list: readonly string[]): boolean {
  return list.indexOf(value) === index;
}

/**
 * Part, target level, archetype, teacher, note; sent to staff through the repository. Opened from
 * a level's + (`part`), the part is fixed; otherwise the player picks it.
 */
export function RequestSkillDialog({
  view,
  skill,
  part: fixedPart,
  onClose,
}: {
  view: CharacterView;
  skill: Skill;
  part?: SkillPart;
  onClose: () => void;
}) {
  const formId = useId();
  const repository = useRepository();
  const toast = useToast();
  const parts = requestableParts(view, skill);
  const [part, setPart] = useState<SkillPart | ''>(fixedPart ?? parts[0]?.part ?? '');
  const chosen = parts.find((p) => p.part === part) ?? parts[0];
  const [toLevel, setToLevel] = useState(chosen?.targets[0] ?? 1);
  const [teacher, setTeacher] = useState('');
  const [archetype, setArchetype] = useState('');
  const [note, setNote] = useState('');
  const [teacherError, setTeacherError] = useState<string | undefined>(undefined);
  const [archetypeError, setArchetypeError] = useState<string | undefined>(undefined);
  const chooseArchetype = needsArchetypeChoice(view.sheet, skill);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!chosen) return null;
  const single = chosen.single;
  const target = chosen.targets.includes(toLevel) ? toLevel : (chosen.targets[0] ?? 1);

  // The same check staff run when they approve, on a draft that is not saved yet.
  const draft: Request = {
    id: 'draft',
    characterId: view.id,
    createdAt: new Date(0).toISOString(),
    kind: 'learn-skill',
    skillId: skill.id,
    part: chosen.part,
    toLevel: target,
    ...(chooseArchetype && archetype !== '' ? { archetype } : {}),
    teacher,
    note: '',
    status: 'draft',
  };
  const check = preview(view.ruleset, view.sheet, { type: 'approveRequest', request: draft });
  const teacherRequired = check.teacherRequired === true;
  // The archetype field reports its own missing value.
  const reasons = check.errors
    .filter((e) => !(chooseArchetype && e.code === 'ARCHETYPE_REQUIRED'))
    .map((e) => e.message)
    .filter(unique);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !chosen) return;
    const missingArchetype = chooseArchetype && archetype === '';
    const missingTeacher = teacherRequired && teacher.trim() === '';
    setArchetypeError(missingArchetype ? `Choose the archetype for ${skill.name}.` : undefined);
    setTeacherError(missingTeacher ? "Enter the teacher's name." : undefined);
    if (missingArchetype || missingTeacher) return;
    setSaving(true);
    try {
      await repository.saveRequest(
        newRequest({
          characterId: view.id,
          skillId: skill.id,
          part: chosen.part,
          toLevel: target,
          ...(chooseArchetype ? { archetype } : {}),
          teacher,
          note,
        }),
      );
      toast.show(`Sent ${skill.name} to staff. Their answer shows under My learning requests.`);
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
      title={`I learned ${fixedPart ? chosen.label : skill.name}`}
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
        <p>Tell staff who taught you. They approve it and it goes on your sheet.</p>
        {parts.length > 1 && !fixedPart ? (
          <Field label="Part">
            {(control) => (
              <select
                {...control}
                value={chosen.part}
                onChange={(e) => {
                  const next = parts.find((p) => p.part === e.target.value);
                  setPart(next?.part ?? '');
                  setToLevel(next?.targets[0] ?? 1);
                }}
              >
                {parts.map((p) => (
                  <option key={p.part} value={p.part}>
                    {p.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
        {single ? null : (
          <Field
            label="Target level"
            hint={
              chosen.level > 0
                ? `${chosen.label} is level ${chosen.level} now.`
                : `${chosen.label} is not learned yet.`
            }
          >
            {(control) => (
              <select
                {...control}
                value={target}
                onChange={(e) => setToLevel(Number(e.target.value))}
              >
                {chosen.targets.map((n) => (
                  <option key={n} value={n}>
                    Level {n}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {chooseArchetype ? (
          <Field
            label="Archetype"
            hint={`Every later purchase of ${skill.name} uses this archetype's AP.`}
            required
            error={archetypeError}
          >
            {(control) => (
              <select {...control} value={archetype} onChange={(e) => setArchetype(e.target.value)}>
                <option value="">Choose an archetype</option>
                {(skill.archetypeOptions ?? []).map((id) => (
                  <option key={id} value={id}>
                    {`${archetypeName(view.ruleset, id)} (${view.sheet.points.ap[id]?.available ?? 0} AP left)`}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
        <Field
          label="Who taught you?"
          hint={
            teacherRequired
              ? 'Required: who taught you.'
              : 'Optional: leave blank when self-taught.'
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
        <Field label="Note" hint="Optional: anything staff should know.">
          {(control) => (
            <textarea
              {...control}
              maxLength={5000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>
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
