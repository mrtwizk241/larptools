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
import { costText, dateText } from '../../lib/names.ts';
import { ErrorList } from '../character/ErrorList.tsx';
import characterStyles from '../character/character.module.css';

export interface DecisionTarget {
  request: Request;
  ruleset: Ruleset;
  sheet: Sheet;
  characterName: string;
  /** "Toughness level 3". */
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
 * "Approve Toughness level 3 for Mira Voss?" with the teacher from the request, editable. The
 * engine checks the step order, prerequisites, Calling rules, and cost (approveRequest).
 */
export function ApproveDialog({ target, onClose, onDone }: DialogProps) {
  const formId = useId();
  const { request, ruleset, sheet, characterName, title } = target;
  const decision = useDecision(request);
  const [teacher, setTeacher] = useState(request.teacher);
  const [teacherError, setTeacherError] = useState<string | undefined>(undefined);
  const [eventKey, setEventKey] = useState('');
  const atEvent: { eventKey?: string } = eventKey ? { eventKey } : {};
  const callingTechnique =
    ruleset.skillsById[request.skillId]?.category === 'calling' && 'technique' in request.step;
  const events = [...sheet.events].sort((a, b) => b.date.localeCompare(a.date));

  const result = preview(ruleset, sheet, { type: 'approveRequest', request, teacher, ...atEvent });
  const teacherRequired = result.teacherRequired === true;
  const reasons = result.errors.map((e) => e.message);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const missingTeacher = teacherRequired && teacher.trim() === '';
    setTeacherError(missingTeacher ? "Enter the teacher's name." : undefined);
    if (missingTeacher) return;
    const ok = await decision.decide(
      { type: 'approveRequest', request, teacher: teacher.trim(), ...atEvent },
      { decision: 'approve', teacher: teacher.trim(), ...atEvent },
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
        {result.cost ? <p>Costs {costText(ruleset, result.cost)}.</p> : null}
        <Field
          label="Teacher"
          hint={
            teacherRequired
              ? 'Required: who taught this Basic or Technique. Filled in from the request.'
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
        <ErrorList messages={[...reasons, ...decision.errors].filter(unique)} />
      </form>
    </Dialog>
  );
}

/** "Reject Toughness level 3 for Mira Voss?" with a required reason for the player. */
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
