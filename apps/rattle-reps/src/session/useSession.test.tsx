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
