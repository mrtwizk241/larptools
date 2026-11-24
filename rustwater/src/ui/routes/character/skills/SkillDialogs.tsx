// Staff dialogs on the skill detail page: learn the next level (teacher, archetype) and refund
// a level (reason). Both plan through the engine; errors show inline, notices as toasts.
import { useId, useState, type FormEvent } from 'react';
import { TEST_BUILD_TEACHER } from '../../../../engine/commands/plan.ts';
import { maxLevelOf, preview } from '../../../../engine/index.ts';
import type { SkillPart } from '../../../../engine/model.ts';
import { Button, Dialog, Field } from '../../../components/index.ts';
import { useCommand } from '../../../data/engineHooks.ts';
import { ErrorList } from '../ErrorList.tsx';
import type { CharacterView } from '../view.ts';
import {
  archetypeName,
  costText,
  needsArchetypeChoice,
  ownedPart,
  partLabel,
  previewLearn,
  type Skill,
} from './skillInfo.ts';
import characterStyles from '../character.module.css';

interface DialogProps {
  view: CharacterView;
  skill: Skill;
  part: SkillPart;
  onClose: () => void;
}

function currentLevel(view: CharacterView, skill: Skill, part: SkillPart): number {
  const owned = view.sheet.skills.find((s) => s.skillId === skill.id);
  return ownedPart(owned, part)?.level ?? 0;
}

/** "Learn Assault level 4 for 40 CXP?" with a Teacher field and, when open, an archetype choice. */
export function LearnDialog({ view, skill, part, onClose }: DialogProps) {
  const formId = useId();
  const command = useCommand(view.id);
  const { ruleset, sheet } = view;
  const chooseArchetype = needsArchetypeChoice(sheet, skill);
  // A test build (ADR 0007) records "Test build" as the teacher; prefill it so staff-style
  // learning there needs no typing.
  const [teacher, setTeacher] = useState(view.meta?.kind === 'test' ? TEST_BUILD_TEACHER : '');
  const [archetype, setArchetype] = useState('');
  const [errors, setErrors] = useState<{ teacher?: string; archetype?: string }>({});

  const def = skill.parts[part];
  const level = currentLevel(view, skill, part);
  const next = level + 1;
  const result = previewLearn(ruleset, sheet, skill, part, archetype || undefined);
  const name = partLabel(ruleset, skill, part);
  const single = def !== undefined && maxLevelOf(ruleset, def.costKind) === 1;
  const what = single ? name : `${name} level ${next}`;
  const title = result.cost
    ? `Learn ${what} for ${costText(ruleset, result.cost)}?`
    : `Learn ${what}?`;
  const teacherRequired = result.teacherRequired === true;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found: { teacher?: string; archetype?: string } = {};
    if (chooseArchetype && archetype === '')
      found.archetype = `Choose the archetype for ${skill.name}.`;
    if (teacherRequired && teacher.trim() === '') found.teacher = "Enter the teacher's name.";
    setErrors(found);
    if (found.teacher || found.archetype) return;
    const outcome = await command.run(
      {
        type: 'learnSkill',
        skillId: skill.id,
        part,
        ...(teacher.trim() ? { teacher: teacher.trim() } : {}),
        ...(chooseArchetype ? { archetype } : {}),
      },
      { success: `Learned ${what}.` },
    );
    if (outcome.ok) onClose();
  }

  // Reasons the purchase is blocked, apart from the inputs this form collects.
  const blocked = result.allowed
    ? []
    : result.errors.filter((e) => e.code !== 'ARCHETYPE_REQUIRED').map((e) => e.message);

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
        {chooseArchetype ? (
          <Field
            label="Archetype"
            hint={`Every later purchase of ${skill.name} uses this archetype's AP.`}
            required
            error={errors.archetype}
          >
            {(control) => (
              <select {...control} value={archetype} onChange={(e) => setArchetype(e.target.value)}>
                <option value="">Choose an archetype</option>
                {(skill.archetypeOptions ?? []).map((id) => (
                  <option key={id} value={id}>
                    {archetypeName(ruleset, id)} ({sheet.points.ap[id]?.available ?? 0} AP left)
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
        <Field
          label="Teacher"
          hint={
            teacherRequired
              ? 'Required: who taught this skill.'
              : 'Optional: leave blank when self-taught.'
          }
          required={teacherRequired}
          error={errors.teacher}
        >
          {(control) => (
            <input
              {...control}
              autoComplete="off"
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
            />
          )}
        </Field>
        <ErrorList
          messages={[...blocked, ...command.errors.map((e) => e.message)].filter(unique)}
        />
      </form>
    </Dialog>
  );
}

/** "Refund Assault level 4?" with a required reason. */
export function RefundDialog({ view, skill, part, onClose }: DialogProps) {
  const formId = useId();
  const command = useCommand(view.id);
  const { ruleset, sheet } = view;
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const def = skill.parts[part];
  const level = currentLevel(view, skill, part);
  const name = partLabel(ruleset, skill, part);
  const single = def !== undefined && maxLevelOf(ruleset, def.costKind) === 1;
  const what = single ? name : `${name} level ${level}`;
  const result = preview(ruleset, sheet, { type: 'refundSkill', skillId: skill.id, part });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim() === '') {
      setError('Enter a reason for the refund.');
      return;
    }
    setError(undefined);
    const outcome = await command.run(
      { type: 'refundSkill', skillId: skill.id, part, reason: reason.trim() },
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
            <textarea {...control} value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </Field>
        <ErrorList
          messages={[...result.reasons, ...command.errors.map((e) => e.message)].filter(unique)}
        />
      </form>
    </Dialog>
  );
}

function unique(value: string, index: number, list: readonly string[]): boolean {
  return list.indexOf(value) === index;
}
