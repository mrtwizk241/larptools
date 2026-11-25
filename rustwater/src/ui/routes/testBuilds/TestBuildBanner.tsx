// The banner at the top of every screen of a test build (ADR 0007): what a test build is, Add or
// remove CXP or PXP (a points adjustment), and Delete test build behind a confirm dialog.
import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, Field, useToast } from '../../components/index.ts';
import { useCommand } from '../../data/engineHooks.ts';
import { useRepository } from '../../data/hooks.ts';
import { UNNAMED_CHARACTER } from '../../data/summary.ts';
import { ErrorList } from '../character/ErrorList.tsx';
import type { CharacterView } from '../character/view.ts';
import {
  parsePointsChange,
  pointsChangeCommand,
  pointsChangeText,
  TEST_BUILD_CURRENCIES,
  type TestBuildCurrency,
} from './testBuilds.ts';
import styles from './testBuilds.module.css';
import { CHARACTERS_PATH, PUBLIC_MODE } from '../../../publicMode.ts';

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function TestBuildBanner({ view }: { view: CharacterView }) {
  const headingId = useId();
  const command = useCommand(view.id);
  const repository = useRepository();
  const navigate = useNavigate();
  const toast = useToast();
  const formId = useId();
  const [currency, setCurrency] = useState<TestBuildCurrency>('cxp');
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState<string | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const name = view.sheet.profile.characterName.trim() || UNNAMED_CHARACTER;

  async function changePoints(event: FormEvent) {
    event.preventDefault();
    if (command.running) return;
    const value = parsePointsChange(amount);
    if (value === null) {
      setAmountError('Enter a whole number other than 0, for example 50 or -20.');
      return;
    }
    setAmountError(undefined);
    const result = await command.run(pointsChangeCommand(currency, value), {
      success: pointsChangeText(currency, value),
      undo: pointsChangeCommand(currency, -value),
    });
    if (result.ok) setAmount('');
  }

  async function remove() {
    setConfirming(false);
    setProblem(null);
    try {
      await repository.deleteCharacter(view.id);
      toast.show(`Deleted ${name}.`);
      void navigate(CHARACTERS_PATH);
    } catch (error) {
      setProblem(`The test build could not be deleted: ${message(error)}`);
    }
  }

  return (
    <section aria-labelledby={headingId} className={styles.banner} data-print-hide>
      <p id={headingId}>
        <strong>Test build.</strong>{' '}
        {PUBLIC_MODE
          ? 'Saved only in this browser. Back up in Settings to keep a copy.'
          : 'Changes here never affect your live characters.'}
      </p>
      <form noValidate className={styles.pointsForm} onSubmit={(e) => void changePoints(e)}>
        <fieldset className={styles.currency}>
          <legend>Points</legend>
          <div className={styles.segments}>
            {TEST_BUILD_CURRENCIES.map((c) => (
              <label key={c.id} className={styles.segment}>
                <input
                  type="radio"
                  name={`${formId}-currency`}
                  value={c.id}
                  checked={currency === c.id}
                  onChange={() => setCurrency(c.id)}
                />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field
          className={styles.amount ?? ''}
          label="Amount to add or remove"
          hint="Use a minus sign to remove, for example -20."
          error={amountError}
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
        <div>
          <Button type="submit" variant="primary" aria-disabled={command.running || undefined}>
            Add or remove points
          </Button>
        </div>
      </form>
      <ErrorList
        messages={[...command.errors.map((e) => e.message), ...(problem ? [problem] : [])]}
      />
      <div>
        <Button icon={<Trash2 />} onClick={() => setConfirming(true)}>
          Delete test build
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={`Delete ${name}?`}
        confirmLabel="Delete test build"
        danger
        onCancel={() => setConfirming(false)}
        onConfirm={() => void remove()}
      >
        <p>This removes the test build and its log. Your live characters do not change.</p>
      </ConfirmDialog>
    </section>
  );
}
