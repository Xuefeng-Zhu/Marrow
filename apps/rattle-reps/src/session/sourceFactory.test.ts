import { describe, expect, it } from 'vitest';
import { cameraSupport } from './sourceFactory';

describe('cameraSupport', () => {
  it('needs a secure context and mediaDevices', () => {
    expect(cameraSupport({ isSecureContext: true, mediaDevices: {} })).toEqual({ ok: true });
    expect(cameraSupport({ isSecureContext: false, mediaDevices: {} })).toMatchObject({ ok: false });
    expect(cameraSupport({ isSecureContext: true, mediaDevices: undefined })).toMatchObject({ ok: false });
  });
});
