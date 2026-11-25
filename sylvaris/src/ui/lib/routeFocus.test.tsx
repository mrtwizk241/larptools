import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../components/AppShell.tsx';
import { characterScreenName } from '../routes/character/screenTitle.ts';
import {
  DEFAULT_TITLE,
  findRouteHeading,
  pageTitle,
  routeFocusKind,
  useDocumentTitle,
  useRouteFocus,
} from './routeFocus.ts';

describe('page titles', () => {
  it('joins the parts, most specific first, and ends with the app name', () => {
    expect(pageTitle('Skills', 'Ash Merrow')).toBe('Skills · Ash Merrow · Sylvaris');
    expect(pageTitle('Settings')).toBe('Settings · Sylvaris');
  });

  it('skips empty parts and falls back to the default title', () => {
    expect(pageTitle('', 'Ash Merrow', null, undefined)).toBe('Ash Merrow · Sylvaris');
    expect(pageTitle()).toBe(DEFAULT_TITLE);
  });

  it('names the character sub-screens', () => {
    expect(characterScreenName('')).toBe('Sheet');
    expect(characterScreenName('skills/toughness')).toBe('Skills');
    expect(characterScreenName('journals')).toBe('Magic');
    expect(characterScreenName('calling')).toBe('Calling');
    expect(characterScreenName('extras')).toBe('Extras');
    expect(characterScreenName('checkin')).toBe('Check-in');
    expect(characterScreenName('constructor')).toBe('Page not found');
  });

  it('sets document.title while the screen is shown', () => {
    function Titled({ title }: { title: string }) {
      useDocumentTitle(title);
      return null;
    }
    const { rerender } = render(<Titled title="Skills · Ash Merrow · Sylvaris" />);
    expect(document.title).toBe('Skills · Ash Merrow · Sylvaris');
    rerender(<Titled title="Play · Ash Merrow · Sylvaris" />);
    expect(document.title).toBe('Play · Ash Merrow · Sylvaris');
  });
});

describe('skip link', () => {
  it('comes first, moves focus to main, and the nav follows main in the DOM', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AppShell nav={<nav aria-label="Character" data-bottom-nav="" />}>
          <h1>Ash Merrow</h1>
        </AppShell>
      </MemoryRouter>,
    );
    await user.tab();
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveFocus();
    await user.keyboard('{Enter}');
    const main = screen.getByRole('main');
    expect(main).toHaveFocus();
    expect(main).toHaveAttribute('tabindex', '-1');
    const nav = screen.getByRole('navigation', { name: 'Character' });
    expect(main.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('focus after a route change', () => {
  it('targets the sub-screen heading within one character, the h1 elsewhere', () => {
    expect(routeFocusKind('/c/1', '/c/1/skills')).toBe('subscreen');
    expect(routeFocusKind('/c/1/skills', '/c/1/skills/toughness')).toBe('subscreen');
    expect(routeFocusKind('/c/1', '/c/2')).toBe('page');
    expect(routeFocusKind('/', '/c/1')).toBe('page');
    expect(routeFocusKind('/c/1', '/settings')).toBe('page');
  });

  it('finds the heading, and waits while the screen is loading', () => {
    document.body.innerHTML = `<main><h1>Ash</h1><section aria-labelledby="s-h"><h2 id="s-h">Skills</h2></section></main>`;
    expect(findRouteHeading(document, 'subscreen')?.textContent).toBe('Skills');
    expect(findRouteHeading(document, 'page')?.textContent).toBe('Ash');
    document.body.innerHTML = `<main><h1>Ash</h1><p role="status">Loading…</p></main>`;
    expect(findRouteHeading(document, 'subscreen')).toBeNull();
    document.body.innerHTML = `<main><h1>Ash</h1></main>`;
    expect(findRouteHeading(document, 'subscreen')?.textContent).toBe('Ash');
    document.body.innerHTML = '';
  });

  function Focus() {
    useRouteFocus();
    return null;
  }

  it('focuses the new heading on navigation but not on the first load', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/c/1']}>
        <Focus />
        <main>
          <Routes>
            <Route
              path="/c/1"
              element={
                <>
                  <h1>Ash Merrow</h1>
                  <Link to="/c/1/skills">Skills</Link>
                </>
              }
            />
            <Route
              path="/c/1/skills"
              element={
                <>
                  <h1>Ash Merrow</h1>
                  <section aria-labelledby="skills-heading">
                    <h2 id="skills-heading">Skills</h2>
                  </section>
                </>
              }
            />
          </Routes>
        </main>
      </MemoryRouter>,
    );
    expect(document.activeElement).toBe(document.body);
    await user.click(screen.getByRole('link', { name: 'Skills' }));
    const heading = screen.getByRole('heading', { level: 2, name: 'Skills' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(heading).toHaveAttribute('tabindex', '-1');
  });
});
