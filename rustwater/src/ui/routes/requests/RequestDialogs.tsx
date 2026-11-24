// Staff decisions on a pending request. With the server, one call approves or rejects (the
// server runs the rules engine). Without it (tests), useCommand plans the decision and the
// request's new status is stored after.
import { useId, useState, type FormEvent } from 'react';
import { ApiError } from '../../../api/client.ts';
import type { DecisionBody } from '../../../api/contract.ts';
import { preview, type Command, type Ruleset, type Sheet } from '../../../engine/index.ts';
import type { Request, RequestStatus } from '../../../engine/model.ts';
import { Button, Dialog, Field, useToast } from '../../components/index.ts';
import { publishCharacterSaved } from '../../data/characterEvents.ts';
import { useCommand } from '../../data/engineHooks.ts';
import { useRepository } from '../../data/hooks.ts';
import { ErrorList } from '../character/ErrorList.tsx';
import { archetypeName, costText, needsArchetypeChoice } from '../character/skills/skillInfo.ts';
import characterStyles from '../character/character.module.css';

export interface DecisionTarget {
  request: Request;
  ruleset: Ruleset;
  sheet: Sheet;
  characterName: string;
  /** "Assault level 2". */
  title: string;
}

interface DialogProps {
  target: DecisionTarget;
  onClose: () => void;
  /** Called after the decision and the request status are saved. */
  onDone: () => Promise<void>;
}

function unique(value: string, index: number, list: readonly string[]): boolean {
  return list.indexOf(value) === index;
}

function useDecision(request: Request) {
  const repository = useRepository();
  const command = useCommand(request.characterId);
  const toast = useToast();
  const [serverErrors, setServerErrors] = useState<string[]>([]);

  async function decide(
    local: Command,
    server: DecisionBody,
    status: RequestStatus,
    success: string,
  ): Promise<boolean> {
    if (repository.decideRequest) {
      setServerErrors([]);
      try {
        const result = await repository.decideRequest(request.id, server);
        publishCharacterSaved(repository, result.character);
        toast.show(success);
        return true;
      } catch (error) {
        setServerErrors(
          error instanceof ApiError && error.details.length > 0
            ? error.details
            : [error instanceof Error ? error.message : String(error)],
        );
        return false;
      }
    }
    const outcome = await command.run(local, { success });
    if (!outcome.ok) return false;
    // The log now holds the decision, so a failed status write is fixed on the next read.
    await repository.saveRequest({ ...request, status }).catch(() => undefined);
    return true;
  }

  return { decide, errors: [...command.errors.map((e) => e.message), ...serverErrors] };
}

/**
 * "Approve Assault level 2 for Mira Voss?" with the teacher from the request, editable. A
 * multi-archetype skill still open (or a request that names an archetype) also shows the
 * archetype, filled in from the request and editable.
 */
export function ApproveDialog({ target, onClose, onDone }: DialogProps) {
  const formId = useId();
  const { request, ruleset, sheet, characterName, title } = target;
  const decision = useDecision(request);
  const [teacher, setTeacher] = useState(request.teacher);
  const asked = request.kind === 'learn-skill' ? request.archetype : undefined;
  const [archetype, setArchetype] = useState(asked ?? '');
  const [teacherError, setTeacherError] = useState<string | undefined>(undefined);
  const [archetypeError, setArchetypeError] = useState<string | undefined>(undefined);

  const skill = request.kind === 'learn-skill' ? ruleset.skillsById[request.skillId] : undefined;
  const chooseArchetype =
    skill !== undefined &&
    skill.archetype === undefined &&
    (skill.archetypeOptions ?? []).length > 0 &&
    (needsArchetypeChoice(sheet, skill) || asked !== undefined);
  const override = chooseArchetype && archetype !== '' ? { archetype } : {};
  const result = preview(ruleset, sheet, {
    type: 'approveRequest',
    request,
    teacher,
    ...override,
  });
  const teacherRequired = result.teacherRequired === true;
  // The archetype field reports its own missing value.
  const reasons = result.errors
    .filter((e) => !(chooseArchetype && e.code === 'ARCHETYPE_REQUIRED'))
    .map((e) => e.message);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const missingArchetype = chooseArchetype && archetype === '';
    const missingTeacher = teacherRequired && teacher.trim() === '';
    setArchetypeError(
      missingArchetype && skill ? `Choose the archetype for ${skill.name}.` : undefined,
    );
    setTeacherError(missingTeacher ? "Enter the teacher's name." : undefined);
    if (missingArchetype || missingTeacher) return;
    const ok = await decision.decide(
      { type: 'approveRequest', request, teacher: teacher.trim(), ...override },
      { decision: 'approve', teacher: teacher.trim(), ...override },
      'approved',
      `Approved ${title} for ${characterName}.`,
    );
    if (ok) await onDone();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Approve ${title} for ${characterName}?`}
      actions={
        <>
          <Button variant="primary" type="submit" form={formId}>
            Approve
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
        {result.cost && result.cost.amount > 0 ? (
          <p>Costs {costText(ruleset, result.cost)}.</p>
        ) : null}
        {chooseArchetype ? (
          <Field
            label="Archetype"
            hint={`Every later purchase of ${skill.name} uses this archetype's AP. Filled in from the request.`}
            required
            error={archetypeError}
          >
            {(control) => (
              <select {...control} value={archetype} onChange={(e) => setArchetype(e.target.value)}>
                <option value="">Choose an archetype</option>
                {(skill.archetypeOptions ?? []).map((id) => (
                  <option key={id} value={id}>
                    {`${archetypeName(ruleset, id)} (${sheet.points.ap[id]?.available ?? 0} AP left)`}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
        <Field
          label={request.kind === 'boon' ? 'Given by' : 'Teacher'}
          hint={
            request.kind === 'boon'
              ? 'Optional: who gave the boon.'
              : teacherRequired
                ? 'Required: who taught it. Filled in from the request.'
                : 'Optional: leave blank when self-taught.'
          }
          required={teacherRequired}
          error={teacherError}
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
        <ErrorList messages={[...reasons, ...decision.errors].filter(unique)} />
      </form>
    </Dialog>
  );
}

/** "Reject Assault level 2 for Mira Voss?" with a required reason for the player. */
export function RejectDialog({ target, onClose, onDone }: DialogProps) {
  const formId = useId();
  const { request, characterName, title } = target;
  const decision = useDecision(request);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim() === '') {
      setError('Enter a reason for the player.');
      return;
    }
    setError(undefined);
    const ok = await decision.decide(
      { type: 'rejectRequest', request, reason: reason.trim() },
      { decision: 'reject', reason: reason.trim() },
      'rejected',
      `Rejected ${title} for ${characterName}.`,
    );
    if (ok) await onDone();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Reject ${title} for ${characterName}?`}
      actions={
        <>
          <Button variant="danger" type="submit" form={formId}>
            Reject
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
        <Field label="Reason" hint="The player sees this with the request." required error={error}>
          {(control) => (
            <textarea {...control} value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </Field>
        <ErrorList messages={decision.errors} />
      </form>
    </Dialog>
  );
}
