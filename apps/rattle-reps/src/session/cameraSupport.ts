/* Kept apart from the source factory so that the mode screen does not pull in the demo clips. */

export type CameraSupport = { ok: true } | { ok: false; reason: string };

/** Whether the camera can be used: a secure context with `navigator.mediaDevices` (R21.6). */
export function cameraSupport(
  env: { isSecureContext?: boolean; mediaDevices?: unknown } = {
    isSecureContext: globalThis.isSecureContext,
    mediaDevices: globalThis.navigator?.mediaDevices,
  },
): CameraSupport {
  if (!env.isSecureContext) return { ok: false, reason: 'The camera needs a secure (HTTPS) page.' };
  if (!env.mediaDevices) return { ok: false, reason: 'This browser does not give access to a camera.' };
  return { ok: true };
}
