// The Life and Damage Calculator on the public site's start page: opens on Totals, a Character
// input changes a total, choices stay on this device, and Reset clears them after a confirm.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/renderApp.tsx';
import { CALCULATOR_KEY } from './calculatorInputs.ts';

vi.mock('../../../publicMode.ts', async (original) => ({
  ...(await original<typeof import('../../../publicMode.ts')>()),
  PUBLIC_MODE: true,
}));

const TITLE = 'Life and Damage Calculator';

/** The text of a calculator's button, for example "Life 10". */
function total(name: 'Life' | 'Armor' | 'Damage'): string {
  return screen.getByRole('button', { name: new RegExp(`^${name} `) }).textContent ?? '';
}

async function open() {
  renderApp('/', { user: null });
  await screen.findByRole('heading', { level: 1, name: TITLE });
}

describe('Life and Damage Calculator', () => {
  afterEach(() => localStorage.clear());

  it('opens on Totals with the unofficial note, and Toughness adds Life', async () => {
    const user = userEvent.setup();
    await open();
    expect(screen.getByText(/Unofficial, player-made tool/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Totals' })).toHaveAttribute('aria-selected', 'true');
    expect(total('Life')).toBe('Life 10');
    expect(total('Armor')).toBe('Armor 0');
    expect(total('Damage')).toMatch(/^Damage \d+ /);

    await user.click(screen.getByRole('tab', { name: 'Character' }));
    for (let n = 0; n < 3; n += 1)
      await user.click(screen.getByRole('button', { name: 'Raise Toughness' }));
    await user.click(screen.getByRole('checkbox', { name: 'Toughness Expert' }));
    await user.click(screen.getByRole('tab', { name: 'Totals' }));
    // hand-derived: 10 base + 20 for the Expert Technique
    expect(total('Life')).toBe('Life 30');
    expect(JSON.parse(localStorage.getItem(CALCULATOR_KEY) ?? '{}')).toMatchObject({
      inputs: { skills: { toughness: { level: 3, techniques: ['expert'] } } },
    });
  });

  it('shows racial and Calling skills for the race and Calling picked', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByRole('tab', { name: 'Character' }));
    expect(screen.queryByRole('group', { name: 'Armor Plating level' })).toBeNull();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Race' }), 'clockwork');
    expect(screen.getByRole('group', { name: 'Armor Plating level' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Wear Armor level' })).toBeNull();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Calling' }), 'protector');
    expect(screen.getByRole('heading', { name: 'The Protector skills' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Totals' }));
    // hand-derived: the Clockwork innate gives 10 Armor
    expect(total('Armor')).toBe('Armor 10');
  });

  it('keeps choices on this device and resets them after a confirm', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      CALCULATOR_KEY,
      JSON.stringify({
        inputs: {
          raceId: 'totemic',
          skills: { 'wear-armor': { level: 3, techniques: ['expert'] } },
        },
      }),
    );
    await open();
    // hand-derived: Totemic innate +10 Life; Wear Armor Expert +20 Armor
    expect(total('Life')).toBe('Life 20');
    expect(total('Armor')).toBe('Armor 20');
    await user.click(screen.getByRole('button', { name: 'Reset calculator' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reset the calculator?' });
    await user.click(within(dialog).getByRole('button', { name: 'Reset calculator' }));
    expect(screen.getByRole('tab', { name: 'Totals' })).toHaveAttribute('aria-selected', 'true');
    expect(total('Life')).toBe('Life 10');
    expect(total('Armor')).toBe('Armor 0');
    await user.click(screen.getByRole('tab', { name: 'Character' }));
    expect(screen.getByRole('combobox', { name: 'Race' })).toHaveValue('human');
  });
});
