import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from './index.ts';

describe('engine', () => {
  it('exposes a semver version string', () => {
    expect(ENGINE_VERSION).toBe('0.1.0');
  });
});
