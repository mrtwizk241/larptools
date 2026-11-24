import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/renderApp.tsx';
import { CALCULATOR_KEY } from './calculatorInputs.ts';

/** The big number of the Health or Armor card. */
function total(name: 'Health' | 'Armor'): string {
  const card = screen.getByRole('region', { name });
  const value = card.querySelector('[aria-live="polite"]');
  return value?.textContent ?? '';
}

describe('Soak and Damage Calculator', () => {
  afterEach(() => localStorage.clear());

  it('opens from the header signed out and adds Toughness to Health', async () => {
    const user = userEvent.setup();
    renderApp('/', { user: null });
    await user.click(await screen.findByRole('link', { name: 'Soak and Damage Calculator' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Soak and Damage Calculator' }),
    ).toBeInTheDocument();
    // Even a first visit opens on Totals.
    expect(screen.getByRole('tab', { name: 'Totals' })).toHaveAttribute('aria-selected', 'true');
    expect(total('Health')).toBe('Health 10');
    await user.click(screen.getByRole('tab', { name: 'Character' }));
    await user.click(screen.getByRole('button', { name: 'Raise Toughness (Warrior)' }));
    await user.click(screen.getByRole('button', { name: 'Raise Toughness (Warrior)' }));
    await user.click(screen.getByRole('tab', { name: 'Totals' }));
    expect(total('Health')).toBe('Health 30');
    expect(JSON.parse(localStorage.getItem(CALCULATOR_KEY) ?? '{}')).toMatchObject({
      inputs: { levels: { 'toughness-warrior': 2 } },
    });
  });

  it('keeps choices on this device and resets them after a confirm', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      CALCULATOR_KEY,
      JSON.stringify({ inputs: { levels: { armor: 1 }, boons: ['built-in-armor'] } }),
    );
    renderApp('/calculator');
    await screen.findByRole('heading', { level: 1, name: 'Soak and Damage Calculator' });
    expect(screen.getByRole('tab', { name: 'Totals' })).toHaveAttribute('aria-selected', 'true');
    expect(total('Armor')).toBe('Armor 15');
    await user.click(screen.getByRole('button', { name: 'Reset calculator' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reset the calculator?' });
    await user.click(within(dialog).getByRole('button', { name: 'Reset calculator' }));
    // A reset clears everything and stays on Totals.
    expect(screen.getByRole('tab', { name: 'Totals' })).toHaveAttribute('aria-selected', 'true');
    expect(total('Armor')).toBe('Armor 0');
    await user.click(screen.getByRole('tab', { name: 'Character' }));
    expect(screen.getByRole('checkbox', { name: 'Built-in Armor' })).not.toBeChecked();
  });

  it('offers packets only for a magic school known', async () => {
    const user = userEvent.setup();
    renderApp('/calculator', { user: null });
    await screen.findByRole('heading', { level: 1, name: 'Soak and Damage Calculator' });
    await user.click(screen.getByRole('button', { name: 'Edit lines and buffs' }));
    const attack = screen.getByRole('combobox', { name: 'Weapon or packet' });
    expect(within(attack).queryByRole('option', { name: /packet/ })).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Character' }));
    await user.click(screen.getByRole('checkbox', { name: 'Death Magic' }));
    await user.click(screen.getByRole('tab', { name: 'Totals' }));
    expect(
      within(screen.getByRole('combobox', { name: 'Weapon or packet' })).getByRole('option', {
        name: 'Death packet (1)',
      }),
    ).toBeInTheDocument();
  });
});
