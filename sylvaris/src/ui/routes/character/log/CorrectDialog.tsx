// "Correct this" on a point award, a skill purchase, or a check-in: a points adjustment (the
// negative amount), a skill refund, or a check-in void, each with a required reason. History is
// never edited; the correction is a new log entry.
import { useId, useMemo, useState, type FormEvent } from 'react';
import {
  type PointsAwardedPayload,
  type SheetEvent,
  type SkillLearnedPayload,
} from '../../../../engine/index.ts';
import type { Action } from '../../../../engine/model.ts';
import { Button, Dialog, Field } from '../../../components/index.ts';
import { previewCommand, useCommand } from '../../../data/engineHooks.ts';
import { actionLookup, describeAction } from '../../../lib/describeAction.ts';
import { amountText, currencyAbbr, skillStepName } from '../../../lib/names.ts';
import { voidBlockReasons } from '../../events/voidReasons.ts';
import { ErrorList } from '../ErrorList.tsx';
import type { CharacterView } from '../view.ts';
import { activeCheckIn, awardPayload, learnedPayload } from './correction.ts';
import styles from './log.module.css';

export function CorrectDialog({
  view,
  action,
  onClose,
}: {
  view: CharacterView;
  action: Action;
  onClose: () => void;
}) {
  const a = awardPayload(action);
  const s = learnedPayload(action);
  const c = activeCheckIn(view.sheet, action);
  const summary = describeAction(
    view.ruleset,
    action,
    actionLookup(view.character.actions),
  ).summary;
  if (a)
    return (
      <AdjustForm view={view} action={action} payload={a} summary={summary} onClose={onClose} />
    );
  if (s) return <RefundForm view={view} payload={s} summary={summary} onClose={onClose} />;
  if (c) return <VoidForm view={view} checkIn={c} summary={summary} onClose={onClose} />;
  return null;
}

interface FormProps {
  view: CharacterView;
  summary: string;
  onClose: () => void;
}

function DialogActions({
  formId,
  label,
  busy,
  onClose,
}: {
  formId: string;
  label: string;
  busy: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* aria-disabled, not disabled, so focus stays on the button while saving. */}
      <Button variant="primary" type="submit" form={formId} aria-disabled={busy || undefined}>
        {label}
      </Button>
      <Button variant="ghost" onClick={onClose}>
        Cancel
      </Button>
    </>
  );
}

function AdjustForm({
  view,
  action,
  payload,
  summary,
  onClose,
}: FormProps & { action: Action; payload: PointsAwardedPayload }) {
  const formId = useId();
  const command = useCommand(view.id);
  const abbr = currencyAbbr(view.ruleset, payload.currency);
  const [amount, setAmount] = useState(String(-payload.amount));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; reason?: string }>({});

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (command.running) return;
    const found: { amount?: string; reason?: string } = {};
    const value = amount.trim();
    if (!/^-?\d+$/.test(value) || Number(value) === 0)
      found.amount = 'Enter a whole number other than 0, for example -5.';
    if (reason.trim() === '') found.reason = 'Enter a reason for the correction.';
    setErrors(found);
    if (found.amount || found.reason) return;
    const n = Number(value);
    const result = await command.run(
      {
        type: 'adjustPoints',
        currency: payload.currency,
        amount: n,
        reason: reason.trim(),
        ...(action.eventKey ? { eventKey: action.eventKey } : {}),
      },
      {
        success: `Correction saved: ${n > 0 ? '+' : ''}${amountText(view.ruleset, payload.currency, n)}.`,
      },
    );
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Correct an award"
      actions={
        <DialogActions
          formId={formId}
          label="Save correction"
          busy={command.running}
          onClose={onClose}
        />
      }
    >
      <form id={formId} noValidate className={styles.form} onSubmit={(e) => void submit(e)}>
        <p>Correcting: {summary}</p>
        <Field
          label={`Adjust ${abbr} by`}
          hint="Negative takes points away. The award stays in the log."
          required
          error={errors.amount}
        >
          {(control) => (
            <input
              {...control}
              inputMode="text"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
        </Field>
        <Field label="Reason" hint="Recorded in the log." required error={errors.reason}>
          {(control) => (
            <textarea {...control} value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </Field>
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}

function RefundForm({
  view,
  payload,
  summary,
  onClose,
}: FormProps & { payload: SkillLearnedPayload }) {
  const formId = useId();
  const command = useCommand(view.id);
  const name = skillStepName(view.ruleset, payload.skillId, payload.step);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();

  const check = useMemo(
    () =>
      previewCommand(view.ruleset, view.sheet, {
        type: 'refundSkill',
        skillId: payload.skillId,
        step: payload.step,
      }),
    [view.ruleset, view.sheet, payload.skillId, payload.step],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (command.running || !check.allowed) return;
    const missing = reason.trim() === '' ? 'Enter a reason for the refund.' : undefined;
    setError(missing);
    if (missing) return;
    const result = await command.run(
      { type: 'refundSkill', skillId: payload.skillId, step: payload.step, reason: reason.trim() },
      { success: `Refunded ${name}.` },
    );
    if (result.ok) onClose();
  }

  const refund = check.refund;
  return (
    <Dialog
      open
      onClose={onClose}
      title="Refund a skill purchase"
      actions={
        <DialogActions
          formId={formId}
          label="Save refund"
          busy={command.running || !check.allowed}
          onClose={onClose}
        />
      }
    >
      <form id={formId} noValidate className={styles.form} onSubmit={(e) => void submit(e)}>
        <p>Correcting: {summary}</p>
        <p>Takes back {name}. The purchase stays in the log.</p>
        {refund ? (
          <p>
            Gives back <span className="num">{refund.amount}</span>{' '}
            {currencyAbbr(view.ruleset, refund.currency)}.
          </p>
        ) : null}
        {!check.allowed ? <ErrorList title="Cannot refund yet" messages={check.reasons} /> : null}
        <Field label="Reason" hint="Recorded in the log." required error={error}>
          {(control) => (
            <textarea {...control} value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </Field>
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}

function VoidForm({ view, checkIn, summary, onClose }: FormProps & { checkIn: SheetEvent }) {
  const formId = useId();
  const command = useCommand(view.id);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();

  const check = useMemo(
    () =>
      previewCommand(view.ruleset, view.sheet, {
        type: 'voidCheckIn',
        checkInActionId: checkIn.actionId,
      }),
    [view.ruleset, view.sheet, checkIn.actionId],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (command.running || !check.allowed) return;
    const missing = reason.trim() === '' ? 'Enter a reason for voiding the check-in.' : undefined;
    setError(missing);
    if (missing) return;
    const result = await command.run(
      { type: 'voidCheckIn', checkInActionId: checkIn.actionId, reason: reason.trim() },
      { success: `Check-in to ${checkIn.name} voided.` },
    );
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Void this check-in"
      actions={
        <DialogActions
          formId={formId}
          label="Void check-in"
          busy={command.running || !check.allowed}
          onClose={onClose}
        />
      }
    >
      <form id={formId} noValidate className={styles.form} onSubmit={(e) => void submit(e)}>
        <p>Correcting: {summary}</p>
        <p>
          Takes back the points from this check-in. The check-in stays in the log, and{' '}
          {view.sheet.profile.characterName} can be checked in to {checkIn.name} again. Items handed
          out are not taken back.
        </p>
        {!check.allowed ? (
          <ErrorList
            title="Cannot void yet"
            messages={voidBlockReasons(
              view.ruleset,
              view.character.actions,
              view.sheet,
              checkIn.actionId,
              check.errors,
            )}
          />
        ) : null}
        <Field label="Reason" hint="Recorded in the log." required error={error}>
          {(control) => (
            <textarea {...control} value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </Field>
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}
