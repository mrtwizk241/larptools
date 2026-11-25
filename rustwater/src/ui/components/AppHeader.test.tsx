import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppHeader } from './AppHeader.tsx';

describe('AppHeader', () => {
  it('has no LARP Tools hub button in the signed-in app', () => {
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'LARP Tools' })).not.toBeInTheDocument();
  });
});
