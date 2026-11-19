import { act, cleanup, render, screen } from '@testing-library/react';
import type { Frame, PoseSource } from 'marrow-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSource } from '../services/source';
import { TEST_BY_ID } from '../tests';
import { PosePreview } from './PosePreview';
import { stubCanvas } from './testUtils';

vi.mock('../services/source', () => ({ createSource: vi.fn() }));

const test = TEST_BY_ID['knee-flexion-left'];

function frame(t: number, visible: boolean): Frame {
  const v = visible ? 1 : 0;
  return {
    t,
    landmarks: Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: v })),
  } as unknown as Frame;
}

beforeEach(() => stubCanvas());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PosePreview readiness', () => {
  it('drops Ready and old samples when the pose is lost', async () => {
    const frameFns = new Set<(f: Frame) => void>();
    const lostFns = new Set<(t: number) => void>();
    const source: PoseSource = {
      start: async () => undefined,
      stop: () => undefined,
      onFrame: (fn) => (frameFns.add(fn), () => frameFns.delete(fn)),
      onPoseLost: (fn) => (lostFns.add(fn), () => lostFns.delete(fn)),
      onError: () => () => undefined,
    };
    vi.mocked(createSource).mockResolvedValue(source);
    render(<PosePreview test={test} mode="camera" onError={() => undefined} />);
    await act(async () => undefined);

    const emit = (f: Frame) => act(() => frameFns.forEach((fn) => fn(f)));
    emit(frame(0, true));
    emit(frame(1200, true));
    expect(screen.getByRole('status').textContent).toBe('Ready');

    act(() => lostFns.forEach((fn) => fn(1500)));
    expect(screen.getByRole('status').textContent).not.toBe('Ready');

    // One visible frame after returning must not be Ready from stale samples.
    emit(frame(3000, true));
    expect(screen.getByRole('status').textContent).not.toBe('Ready');
    emit(frame(4100, true));
    expect(screen.getByRole('status').textContent).toBe('Ready');
  });
});
