export const VERSION = '0.1.0';

export type { Frame, Landmark, Vec3 } from './types';
export { LANDMARK_NAMES, LM, isLandmarkName } from './landmarks';
export type { LandmarkName } from './landmarks';
export { angleAt, bodyScale, distance } from './geometry';
export type { AnglePlane } from './geometry';

export { OneEuroFilter, ONE_EURO_DEFAULTS } from './smoothing/oneEuro';
export type { OneEuroOptions } from './smoothing/oneEuro';
export { LandmarkSmoother } from './smoothing/landmarkSmoother';

export { MovementSpecSchema } from './spec/schema';
export type { MovementSpec, Metric, Phase, Hold, FormRule, RomDef } from './spec/schema';
export { parseMovementSpec } from './spec/parse';
export type { ParseResult, SpecIssue } from './spec/parse';

export { evaluateMetrics } from './engine/metrics';
export type { MetricValues } from './engine/metrics';
export { createEngine } from './engine/engine';
export type { Engine } from './engine/engine';
export type { MarrowEvent, MarrowEventType } from './engine/events';

export type { PoseSource, SourceError, SourceErrorCode } from './sources/types';
export { createFixturePlayer, replay } from './sources/fixturePlayer';
export type { Clock, FixturePlayerOptions } from './sources/fixturePlayer';
export { createMediaPipeSource } from './sources/mediapipeSource';
export type { MediaPipeSourceOptions } from './sources/mediapipeSource';
export { FixtureError, FixtureSchema, parseFixture } from './fixtures/schema';
export type { Fixture } from './fixtures/schema';

export { createPipeline } from './pipeline';
export type { Pipeline, PipelineOptions, ProcessedFrame } from './pipeline';

export { POSE_CONNECTIONS } from './draw/connections';
export { drawSkeleton } from './draw/drawSkeleton';
export type { SkeletonStyle } from './draw/drawSkeleton';
