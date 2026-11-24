import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Settings } from '../../../../engine/model.ts';
import { mira } from '../../../test/fixtures.ts';
import { renderApp } from '../../../test/renderApp.tsx';
import { ash, ashAfter, ASH_LATEST_EVENT } from '../../../test/veteran.ts';

const STAFF: Settings = { mode: 'staff', theme: 'system' };

describe('profession page', () => {
  it('lists the 19 professions with the 3-event rule and the character count', async () => {
    renderApp(`/c/${ash().id}/profession`, { characters: [ash()], settings: STAFF });
    expect(await screen.findByRole('heading', { level: 2, name: 'Profession' })).toBeVisible();
    const start = screen.getByRole('region', { name: 'Start a profession' });
    const group = within(start).getByRole('group', { name: 'Profession' });
    expect(within(group).getAllByRole('radio')).toHaveLength(19);
    expect(start).toHaveTextContent(
      'Needs 3 events played before the start event. 3 played before Harvest Moon (2026-09-19).',
    );
    expect(screen.getByRole('list', { name: 'Profession points' })).toHaveTextContent('PXP');
  });

  it('blocks a start with too few events and says why', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${ash().id}/profession`, { characters: [ash()], settings: STAFF });
    await screen.findByRole('region', { name: 'Start a profession' });
    await user.selectOptions(screen.getByLabelText('Event'), 'Spring Flood (2026-05-16)');
    expect(screen.getByText(/1 played before Spring Flood/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Medic' }));
    await user.click(screen.getByRole('checkbox', { name: /Get back in there!/ }));
    await user.click(screen.getByRole('button', { name: 'Start profession' }));
    expect(
      await screen.findByText(
        'Starting a profession needs 3 events played before this one; 1 so far.',
      ),
    ).toBeInTheDocument();
  });

  it('asks for a profession and a skill before starting', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${ash().id}/profession`, { characters: [ash()], settings: STAFF });
    await user.click(await screen.findByRole('button', { name: 'Start profession' }));
    expect(screen.getByText('Choose a profession.')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Sniper' }));
    await user.click(screen.getByRole('button', { name: 'Start profession' }));
    expect(screen.getByText('Choose at least one skill to buy at level 1.')).toBeInTheDocument();
  });

  it('starts a profession, then blocks a second level in the same event', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(`/c/${ash().id}/profession`, {
      characters: [ash()],
      settings: STAFF,
    });
    await user.click(await screen.findByRole('radio', { name: 'Medic' }));
    await user.click(screen.getByRole('checkbox', { name: /Get back in there!/ }));
    await user.click(screen.getByRole('button', { name: 'Start profession' }));
    expect(await screen.findByText('Ash Merrow started the Medic profession.')).toBeVisible();
    const skill1 = screen.getByRole('region', { name: 'Get back in there!' });
    expect(skill1).toHaveTextContent('Level 1 of 5.');
    expect(
      within(skill1).getByText(
        'Get back in there! already went up a level at this event; one level per skill per event.',
      ),
    ).toBeInTheDocument();
    const skill2 = screen.getByRole('region', { name: 'Stitch em up' });
    expect(within(skill2).getByText('Next level: 10 PXP')).toBeInTheDocument();
    await user.click(within(skill2).getByRole('button', { name: 'Raise Stitch em up' }));
    expect(await screen.findByText('Stitch em up is now level 1.')).toBeVisible();
    await waitFor(() => expect(skill2).toHaveTextContent('Level 1 of 5.'));
    expect(within(skill2).getByText(/already went up a level at this event/)).toBeInTheDocument();
    expect(within(skill2).getByRole('list', { name: 'Stitch em up tiers' })).toHaveTextContent(
      'Basic: Unlocked',
    );
    expect(screen.getByRole('region', { name: 'History' })).toHaveTextContent(
      'Stitch em up to level 1 at Harvest Moon (2026-09-19).',
    );
    const stored = repository.data.characters.get(ash().id);
    expect(stored?.actions.at(-1)?.type).toBe('profession.leveled');
  });

  it('player mode is read only', async () => {
    const character = ashAfter([
      {
        type: 'startProfession',
        professionId: 'scout',
        eventKey: ASH_LATEST_EVENT,
        skills: ['scout-quick-feet', 'scout-scouting'],
      },
    ]);
    renderApp(`/c/${character.id}/profession`, { characters: [character] });
    expect(await screen.findByRole('region', { name: 'Scout' })).toBeVisible();
    expect(screen.getByText(/Passive: Outdoor Camouflage/)).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByLabelText('Event')).not.toBeInTheDocument();
  });

  it('player mode without a profession says so', async () => {
    renderApp(`/c/${mira().id}/profession`, { characters: [mira()] });
    expect(await screen.findByText('No profession yet.')).toBeVisible();
  });
});
