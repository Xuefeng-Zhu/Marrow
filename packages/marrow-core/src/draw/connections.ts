import { LM } from '../landmarks';

/** Pairs of landmark indices that form the bones of the MediaPipe Pose skeleton. */
export const POSE_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  // face
  [LM.leftEar, LM.leftEye],
  [LM.leftEye, LM.nose],
  [LM.nose, LM.rightEye],
  [LM.rightEye, LM.rightEar],
  [LM.mouthLeft, LM.mouthRight],
  // torso
  [LM.leftShoulder, LM.rightShoulder],
  [LM.leftShoulder, LM.leftHip],
  [LM.rightShoulder, LM.rightHip],
  [LM.leftHip, LM.rightHip],
  // arms
  [LM.leftShoulder, LM.leftElbow],
  [LM.leftElbow, LM.leftWrist],
  [LM.rightShoulder, LM.rightElbow],
  [LM.rightElbow, LM.rightWrist],
  // hands
  [LM.leftWrist, LM.leftPinky],
  [LM.leftWrist, LM.leftIndex],
  [LM.leftWrist, LM.leftThumb],
  [LM.rightWrist, LM.rightPinky],
  [LM.rightWrist, LM.rightIndex],
  [LM.rightWrist, LM.rightThumb],
  // legs
  [LM.leftHip, LM.leftKnee],
  [LM.leftKnee, LM.leftAnkle],
  [LM.rightHip, LM.rightKnee],
  [LM.rightKnee, LM.rightAnkle],
  // feet
  [LM.leftAnkle, LM.leftHeel],
  [LM.leftHeel, LM.leftFootIndex],
  [LM.leftAnkle, LM.leftFootIndex],
  [LM.rightAnkle, LM.rightHeel],
  [LM.rightHeel, LM.rightFootIndex],
  [LM.rightAnkle, LM.rightFootIndex],
];
