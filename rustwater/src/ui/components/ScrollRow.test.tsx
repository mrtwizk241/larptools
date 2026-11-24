import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScrollRow } from './ScrollRow.tsx';

/** jsdom has no layout: fake the sizes the row measures. */
function fakeSize(el: HTMLElement, scrollWidth: number, clientWidth: number) {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
}

describe('ScrollRow', () => {
  it('renders a labelled list that is not a tab stop when nothing overflows', () => {
    render(
      <ScrollRow label="Points" focusable>
        <li>CXP 10</li>
        <li>LXP 2</li>
      </ScrollRow>,
    );
    const list = screen.getByRole('list', { name: 'Points' });
    expect(list).not.toHaveAttribute('tabindex');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('joins the tab order and shows the fade when items are hidden', () => {
    const { rerender } = render(
      <ScrollRow label="Points" focusable>
        <li>CXP 10</li>
      </ScrollRow>,
    );
    const list = screen.getByRole('list', { name: 'Points' });
    fakeSize(list, 600, 300);
    rerender(
      <ScrollRow label="Points" focusable>
        <li>CXP 10</li>
        <li>LXP 2</li>
      </ScrollRow>,
    );
    expect(list).toHaveAttribute('tabindex', '0');
    expect(list.parentElement?.className).toMatch(/more/);
  });

  it('renders a group of buttons without making the row a tab stop', () => {
    render(
      <ScrollRow as="div" group label="Filter">
        <button type="button">Warrior</button>
      </ScrollRow>,
    );
    expect(screen.getByRole('group', { name: 'Filter' })).not.toHaveAttribute('tabindex');
  });
});
