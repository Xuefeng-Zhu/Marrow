export type Vec3 = { x: number; y: number; z: number };

/** One normalised pose point. x and y are in [0, 1] image space, z is relative depth. */
export type Landmark = Vec3 & { visibility: number };

/** A timestamp in milliseconds plus the landmark array (33 for MediaPipe Pose). */
export type Frame = { t: number; landmarks: Landmark[] };
