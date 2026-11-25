import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY, readStoredTheme, useTheme } from './theme.ts';

describe('useTheme', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('saves the choice and sets html[data-theme]; system removes both', () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setTheme('dark'));
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    act(() => result.current.setTheme('system'));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('ignores invalid saved values', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(readStoredTheme()).toBe('system');
  });
});
