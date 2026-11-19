import { afterEach, beforeEach, vi } from 'vitest';

/** Any `console.error` during a test (React warnings, act() warnings) fails that test. */
let spy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  spy = vi.spyOn(console, 'error');
});

afterEach(() => {
  const calls = spy?.mock.calls ?? [];
  spy?.mockRestore();
  spy = null;
  if (calls.length > 0) throw new Error(`console.error was called: ${calls.map((c) => String(c[0])).join(' | ')}`);
});
