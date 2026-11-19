/** MediaPipe Pose landmark names, in index order. */
export const LANDMARK_NAMES = [
  'nose',
  'leftEyeInner',
  'leftEye',
  'leftEyeOuter',
  'rightEyeInner',
  'rightEye',
  'rightEyeOuter',
  'leftEar',
  'rightEar',
  'mouthLeft',
  'mouthRight',
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftPinky',
  'rightPinky',
  'leftIndex',
  'rightIndex',
  'leftThumb',
  'rightThumb',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle',
  'leftHeel',
  'rightHeel',
  'leftFootIndex',
  'rightFootIndex',
] as const;

export type LandmarkName = (typeof LANDMARK_NAMES)[number];

/** Name to index map, for example `LM.leftKnee === 25`. */
export const LM = Object.fromEntries(
  LANDMARK_NAMES.map((name, i) => [name, i]),
) as { readonly [K in LandmarkName]: number };

export function isLandmarkName(name: string): name is LandmarkName {
  return Object.prototype.hasOwnProperty.call(LM, name);
}
