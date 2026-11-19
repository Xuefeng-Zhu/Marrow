import { describe, expect, it, vi } from 'vitest';
import { TEST_BY_ID } from '../tests';
import { describeSourceError, createSource } from './source';

describe('source service', () => {
  it('demo source never touches the camera (R2.5)', async () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    const src = await createSource('demo', TEST_BY_ID['chair-stand']);
    await src.start();
    src.stop();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('camera source is created only on request and asks nothing until started', async () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    const src = await createSource('camera', TEST_BY_ID['chair-stand']);
    expect(typeof src.start).toBe('function');
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('every typed camera error has a plain message and offers the demo (R3.5)', () => {
    for (const code of ['camera-denied', 'camera-unavailable', 'model-load-failed'] as const) {
      const p = describeSourceError(code);
      expect(p.code).toBe(code);
      expect(p.message.length).toBeGreaterThan(10);
      expect(p.message.toLowerCase()).toContain('demo clip');
      expect(p.offerDemo).toBe(true);
    }
  });
});
