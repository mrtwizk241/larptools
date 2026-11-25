import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button.tsx';
import { Dialog } from './Dialog.tsx';
import { Field } from './Field.tsx';
import { LevelStepper } from './LevelStepper.tsx';
import { Tabs } from './Tabs.tsx';
import { ToastProvider } from './Toast.tsx';
import { TOAST_DURATION_MS, useToast } from './toast-context.ts';

describe('Tabs', () => {
  const tabs = [
    { id: 'a', label: 'Overview', content: <p>Panel A</p> },
    { id: 'b', label: 'Skills', content: <p>Panel B</p> },
    { id: 'c', label: 'Gear', content: <p>Panel C</p> },
  ];

  it('has tablist semantics with one tab in the tab order', () => {
    render(<Tabs label="Sections" tabs={tabs} />);
    expect(screen.getByRole('tablist', { name: 'Sections' })).toBeInTheDocument();
    const [first, second] = screen.getAllByRole('tab');
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(first).toHaveAttribute('tabindex', '0');
    expect(second).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel A');
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Overview');
  });

  it('moves and selects with arrow keys, wrapping, and Home and End', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Tabs label="Sections" tabs={tabs} onSelect={onSelect} />);

    await user.tab();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Skills' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Skills' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel B');

    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Gear' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Gear' })).toHaveFocus();

    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel A');
    expect(onSelect.mock.calls.map(([id]) => id as string)).toEqual(['b', 'c', 'a', 'c', 'a']);
  });
});

describe('Dialog', () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open
        </button>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="Hello"
          actions={
            <button type="button" onClick={() => setOpen(false)}>
              Done
            </button>
          }
        >
          <p>Body</p>
        </Dialog>
      </>
    );
  }

  it('moves focus in, closes on Escape, and returns focus to the opener', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });

    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Hello' });
    expect(dialog).toHaveAttribute('open');
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('returns focus to the opener when closed by an action', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

describe('LevelStepper', () => {
  function Stepper(props: { initial: number; blockedReason?: string }) {
    const [value, setValue] = useState(props.initial);
    return (
      <LevelStepper
        label="Assault"
        value={value}
        min={0}
        max={3}
        onChange={setValue}
        nextCostLabel="Next level: 40 CXP"
        {...(props.blockedReason ? { blockedReason: props.blockedReason } : {})}
      />
    );
  }

  it('stays within min and max and says why raising stops', async () => {
    const user = userEvent.setup();
    render(<Stepper initial={1} />);
    const lower = screen.getByRole('button', { name: 'Lower Assault' });
    const raise = screen.getByRole('button', { name: 'Raise Assault' });
    const value = screen.getByRole('status');

    expect(screen.getByText('Next level: 40 CXP')).toBeInTheDocument();
    await user.click(lower);
    expect(value).toHaveTextContent('0');
    expect(lower).toHaveAttribute('aria-disabled', 'true');
    await user.click(lower);
    expect(value).toHaveTextContent('0');

    await user.click(raise);
    await user.click(raise);
    await user.click(raise);
    expect(value).toHaveTextContent('3');
    expect(raise).toHaveAttribute('aria-disabled', 'true');
    expect(raise).toHaveAccessibleDescription('Maximum level 3');
    await user.click(raise);
    expect(value).toHaveTextContent('3');
  });

  it('blocks raising with a visible reason', async () => {
    const user = userEvent.setup();
    render(<Stepper initial={1} blockedReason="Needs 40 CXP, 25 left" />);
    const raise = screen.getByRole('button', { name: 'Raise Assault' });
    expect(raise).toHaveAttribute('aria-disabled', 'true');
    expect(raise).toHaveAccessibleDescription('Needs 40 CXP, 25 left');
    expect(screen.queryByText('Next level: 40 CXP')).not.toBeInTheDocument();
    await user.click(raise);
    expect(screen.getByRole('status')).toHaveTextContent('1');
  });

  it('shows plain text with no buttons when read-only', () => {
    const onChange = vi.fn();
    render(<LevelStepper label="Craft" value={4} min={0} max={5} onChange={onChange} readOnly />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('4', { exact: false })).toHaveTextContent('Craft level 4');
  });
});

describe('Field', () => {
  it('links label, hint, and error to the control', () => {
    render(
      <Field label="Player handle" hint="Shown to staff." error="Enter a player handle.">
        {(control) => <input {...control} type="text" />}
      </Field>,
    );
    const input = screen.getByLabelText('Player handle');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Shown to staff. Enter a player handle.');
    expect(input).toBeInvalid();
  });

  it('has no aria-invalid or describedby without hint and error, and works with select', () => {
    render(
      <Field label="Lineage">
        {(control) => (
          <select {...control}>
            <option>Human</option>
          </select>
        )}
      </Field>,
    );
    const select = screen.getByRole('combobox', { name: 'Lineage' });
    expect(select).not.toHaveAttribute('aria-invalid');
    expect(select).not.toHaveAttribute('aria-describedby');
  });

  it('works with textarea', () => {
    render(
      <Field label="Notes" error="Too long.">
        {(control) => <textarea {...control} />}
      </Field>,
    );
    const textarea = screen.getByRole('textbox', { name: 'Notes' });
    expect(textarea).toHaveAccessibleDescription('Too long.');
  });
});

describe('Button', () => {
  it('shows and links the reason when disabled', () => {
    render(
      <Button disabled disabledReason="Needs Assault level 9">
        Learn Cleave
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Learn Cleave' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Needs Assault level 9');
  });
});

describe('Toast', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function Trigger({ onUndo }: { onUndo?: () => void }) {
    const toast = useToast();
    return (
      <button type="button" onClick={() => toast.show('Skill removed.', onUndo ? { onUndo } : {})}>
        Remove
      </button>
    );
  }

  it('announces in a status region and runs Undo', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <Trigger onUndo={onUndo} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByRole('status')).toHaveTextContent('Skill removed.');

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).not.toHaveTextContent('Skill removed.');
  });

  it('hides itself after 5 seconds', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    act(() => {
      screen.getByRole('button', { name: 'Remove' }).click();
    });
    expect(screen.getByRole('status')).toHaveTextContent('Skill removed.');
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS - 1);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Skill removed.');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
