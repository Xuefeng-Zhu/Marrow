import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getWorkout } from '../movements/registry';
import { ScriptedSource } from './testSupport';
import { useSession } from './useSession';

describe('useSession', () => {
  it('starts the pipeline and, on unmount, stops it and removes the listeners', async () => {
    const source = new ScriptedSource();
    const workout = getWorkout('squat')!;
    const target = { kind: 'reps', reps: 5 } as const;
    const { result, unmount } = renderHook(() =>
      useSession({
        workout,
        mode: 'demo',
        target,
        createSource: async () => ({ source, pause: () => undefined, resume: () => undefined }),
      }),
    );
    await waitFor(() => expect(result.current.view.status).toBe('running'));
    expect(source.started).toBe(true);
    expect(source.listenerCount).toBeGreaterThan(0);
    unmount();
    expect(source.started).toBe(false);
    expect(source.listenerCount).toBe(0);
  });

  it('exposes the demo fallback when the camera cannot start', async () => {
    const workout = getWorkout('squat')!;
    const target = { kind: 'reps', reps: 5 } as const;
    const { result } = renderHook(() =>
      useSession({ workout, mode: 'camera', target, createSource: () => Promise.reject(new Error('no camera')) }),
    );
    await waitFor(() => expect(result.current.view.status).toBe('error'));
    expect(result.current.view.error?.demoFallback).toBe(true);
  });
});

describe('useSession frame subscription', () => {
  it('delivers frames to a listener added before the controller exists, and stops after unsubscribe', async () => {
    const source = new ScriptedSource();
    const workout = getWorkout('squat')!;
    const target = { kind: 'reps', reps: 5 } as const;
    const { result } = renderHook(() =>
      useSession({
        workout,
        mode: 'demo',
        target,
        createSource: async () => ({ source, pause: () => undefined, resume: () => undefined }),
      }),
    );
    const seen: number[] = [];
    const off = result.current.onFrame((f) => seen.push(f.frame.t));
    await waitFor(() => expect(result.current.view.status).toBe('running'));
    const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
    source.emit({ t: 0, landmarks });
    off();
    source.emit({ t: 50, landmarks });
    expect(seen).toEqual([0]);
  });
});
