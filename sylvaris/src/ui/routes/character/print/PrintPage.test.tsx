import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../test/renderApp.tsx';
import { ash } from '../../../test/veteran.ts';

async function openPrint(query = '') {
  const character = ash();
  renderApp(`/c/${character.id}/print${query}`, { characters: [character] });
  return screen.findByRole('article', { name: 'Character sheet for Ash Merrow' });
}

describe('print page', () => {
  it('shows the paper sheet with header, points, stats, skills, and the footer', async () => {
    const paper = await openPrint();
    expect(paper).toHaveTextContent('Player: Robin Vale');
    expect(paper).toHaveTextContent('The Protector');
    const points = within(paper).getByRole('table', { name: 'Points' });
    expect(within(points).getByRole('row', { name: /^XP/ })).toHaveTextContent('XP510130380');
    expect(within(points).getByRole('row', { name: /^MT/ })).toHaveTextContent('MT20050150');
    const stats = within(paper).getByRole('table', { name: 'Stats' });
    expect(stats).toHaveTextContent('Life Points30');
    expect(stats).toHaveTextContent('Armor Points20');
    expect(stats).toHaveTextContent('Spirit Fragments9 of 10');
    const skills = within(paper).getByRole('table', { name: 'Skills' });
    expect(within(skills).getByRole('row', { name: /^Toughness/ })).toHaveTextContent(
      'Toughness3Expert3/re-pop: B1',
    );
    expect(paper).toHaveTextContent('Life Dart (Basic, Life), Pending tag');
    expect(paper).toHaveTextContent('Basic Shield repair kit');
    expect(paper).toHaveTextContent('Unofficial fan tool');
    expect(screen.getByRole('button', { name: 'Print' })).toBeVisible();
  });

  it('shows the check-in receipt for the chosen event', async () => {
    const user = userEvent.setup();
    await openPrint();
    await user.click(screen.getByRole('tab', { name: 'Check-in receipt' }));
    const receipt = screen.getByRole('article', { name: 'Check-in receipt for Ash Merrow' });
    expect(receipt).toHaveTextContent('Upkeep: 1 Silver, paid.');
    await user.selectOptions(screen.getByLabelText('Event'), '2026-08-15-ember-night');
    const after = screen.getByRole('article', { name: 'Check-in receipt for Ash Merrow' });
    expect(within(after).getByRole('table', { name: 'Mist Token purchases' })).toHaveTextContent(
      'Basic Component x2 (2 Basic Components)',
    );
    expect(after).toHaveTextContent('Basic Shield repair kit');
  });
});
