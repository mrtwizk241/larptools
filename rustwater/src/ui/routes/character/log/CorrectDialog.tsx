// "Correct this" on a point award, a skill purchase, or a check-in: a points adjustment (the
// negative amount), a skill refund, or a check-in void, each with a required reason. History is
// never edited; the correction is a new log entry.
import { useId, useMemo, useState, type FormEvent } from 'react';
import {
  preview,
  skillLevel,
  type PointsAwardedPayload,
  type SheetEvent,
  type SkillLearnedPayload,
} from '../../../../engine/index.ts';
import type { Action } from '../../../../engine/model.ts';
import { Button, Dialog, Field } from '../../../components/index.ts';
import { useCommand } from '../../../data/engineHooks.ts';
import { describeAction } from '../../../lib/describeAction.ts';
import { activeCheckIn, awardPayload, learnedPayload } from './correction.ts';
import { amountText, currencyAbbr, skillPartName } from '../../../lib/names.ts';
import { ErrorList } from '../ErrorList.tsx';
import type { CharacterView } from '../view.ts';
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
  const summary = describeAction(view.ruleset, action).summary;
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
    const result = await command.run(
      {
        type: 'adjustPoints',
        currency: payload.currency,
        amount: Number(value),
        reason: reason.trim(),
        ...(action.eventKey ? { eventKey: action.eventKey } : {}),
      },
      {
        success: `Correction saved: ${Number(value) > 0 ? '+' : ''}${amountText(view.ruleset, payload.currency, Number(value))}.`,
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
        <>
          <Button
            variant="primary"
            type="submit"
            form={formId}
            aria-disabled={command.running || undefined}
          >
            Save correction
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
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
  const name = skillPartName(view.ruleset, payload.skillId, payload.part);
  const current = skillLevel(view.sheet, payload.skillId, payload.part);
  const [level, setLevel] = useState(String(Math.max(0, payload.toLevel - 1)));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ level?: string; reason?: string }>({});
  const toLevel = /^\d+$/.test(level.trim()) ? Number(level.trim()) : null;

  const check = useMemo(
    () =>
      toLevel === null || toLevel >= current
        ? null
        : preview(view.ruleset, view.sheet, {
            type: 'refundSkill',
            skillId: payload.skillId,
            part: payload.part,
            toLevel,
          }),
    [view.ruleset, view.sheet, payload.skillId, payload.part, toLevel, current],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (command.running) return;
    const found: { level?: string; reason?: string } = {};
    if (toLevel === null || toLevel >= current)
      found.level = `Enter a level from 0 to ${current - 1}.`;
    if (reason.trim() === '') found.reason = 'Enter a reason for the refund.';
    setErrors(found);
    if (found.level || found.reason || toLevel === null) return;
    const result = await command.run(
      {
        type: 'refundSkill',
        skillId: payload.skillId,
        part: payload.part,
        toLevel,
        reason: reason.trim(),
      },
      { success: toLevel === 0 ? `${name} removed.` : `${name} is now level ${toLevel}.` },
    );
    if (result.ok) onClose();
  }

  const refund = check?.refund;
  return (
    <Dialog
      open
      onClose={onClose}
      title="Refund a skill"
      actions={
        <>
          <Button
            variant="primary"
            type="submit"
            form={formId}
            aria-disabled={command.running || undefined}
          >
            Save refund
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={styles.form} onSubmit={(e) => void submit(e)}>
        <p>Correcting: {summary}</p>
        <p>
          {name} is now level <span className="num">{current}</span>.
        </p>
        <Field label="Lower to level" hint={`0 removes ${name}.`} required error={errors.level}>
          {(control) => (
            <input
              {...control}
              inputMode="numeric"
              autoComplete="off"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            />
          )}
        </Field>
        {refund ? (
          <p aria-live="polite">
            Gives back <span className="num">{refund.amount}</span>{' '}
            {currencyAbbr(view.ruleset, refund.currency)}.
          </p>
        ) : null}
        {check && !check.allowed ? (
          <ErrorList title="Cannot refund yet" messages={check.reasons} />
        ) : null}
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

function VoidForm({ view, checkIn, summary, onClose }: FormProps & { checkIn: SheetEvent }) {
  const formId = useId();
  const command = useCommand(view.id);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();

  const check = useMemo(
    () =>
      preview(view.ruleset, view.sheet, {
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
        <>
          <Button
            variant="primary"
            type="submit"
            form={formId}
            aria-disabled={command.running || !check.allowed || undefined}
          >
            Void check-in
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={styles.form} onSubmit={(e) => void submit(e)}>
        <p>Correcting: {summary}</p>
        <p>
          Takes back the points and items from this check-in. The check-in stays in the log, and{' '}
          {view.sheet.profile.characterName} can be checked in to {checkIn.name} again.
        </p>
        {!check.allowed ? <ErrorList title="Cannot void yet" messages={check.reasons} /> : null}
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
