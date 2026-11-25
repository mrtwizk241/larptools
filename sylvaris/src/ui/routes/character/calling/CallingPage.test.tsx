import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Settings } from '../../../../engine/model.ts';
import { renderApp } from '../../../test/renderApp.tsx';
import { ash } from '../../../test/veteran.ts';
import { ashBeforeCalling } from './testCharacter.ts';

const STAFF: Settings = { mode: 'staff', theme: 'system' };

describe('Calling screen', () => {
  it('shows the active Calling, its skills, rules, and numbers to players', async () => {
    const ASH = ash();
    renderApp(`/c/${ASH.id}/calling`, { characters: [ASH] });
    expect(await screen.findByRole('region', { name: 'The Protector' })).toHaveTextContent(
      'Innate: Wardship',
    );
    const guard = screen.getByRole('region', { name: 'Guardianship' });
    expect(guard).toHaveTextContent('Level 1 of 10. Techniques: none yet. 5 CXP spent.');
    expect(within(guard).getByRole('link', { name: 'Guardianship details' })).toHaveAttribute(
      'href',
      `#/c/${ASH.id}/skills/guardianship`,
    );
    expect(screen.getByRole('region', { name: 'Technique rules' })).toHaveTextContent(
      'Harvest Moon (2026-09-19)',
    );
    expect(screen.getByRole('region', { name: 'Calling numbers' })).toHaveTextContent(
      'Wards at once',
    );
    expect(screen.queryByRole('button', { name: /Buy/ })).not.toBeInTheDocument();
  });

  it('lets staff buy a Calling level', async () => {
    const user = userEvent.setup();
    const ASH = ash();
    renderApp(`/c/${ASH.id}/calling`, { characters: [ASH], settings: STAFF });
    await user.click(
      await screen.findByRole('button', { name: 'Buy Guardianship level 2 (10 CXP)' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Guardianship' })).toHaveTextContent(
        'Level 2 of 10.',
      ),
    );
  });

  it('shows eligibility and lets staff start a Calling at an attended event', async () => {
    const user = userEvent.setup();
    const before = ashBeforeCalling();
    renderApp(`/c/${before.id}/calling`, { characters: [before], settings: STAFF });
    expect(await screen.findByRole('region', { name: 'Eligibility' })).toHaveTextContent(
      'Can start a Calling.',
    );
    const form = within(screen.getByRole('region', { name: 'Start a Calling' }));
    expect(form.getAllByRole('radio')).toHaveLength(13);
    await user.click(form.getByRole('radio', { name: 'The Elemental Mage' }));
    await user.selectOptions(form.getByRole('combobox', { name: /Aligned element/ }), 'fire');
    expect(form.getByRole('combobox', { name: /Start event/ })).toHaveValue(
      '2026-09-19-harvest-moon',
    );
    await user.click(form.getByRole('button', { name: 'Start the Calling (10 CXP)' }));
    expect(await screen.findByRole('region', { name: 'The Elemental Mage' })).toBeVisible();
  });
});
