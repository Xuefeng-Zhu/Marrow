import { describe, expect, it } from 'vitest';
import { VERSION } from './index';

describe('marrow-core', () => {
  it('exports a version string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
