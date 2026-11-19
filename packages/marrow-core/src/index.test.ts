import { describe, expect, it } from 'vitest';
import * as api from './index';

describe('marrow-core public entry', () => {
  it('exports a version string', () => {
    expect(api.VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('exports the documented runtime API', () => {
    for (const name of [
      'LM',
      'LANDMARK_NAMES',
      'angleAt',
      'distance',
      'bodyScale',
      'OneEuroFilter',
      'LandmarkSmoother',
      'MovementSpecSchema',
      'parseMovementSpec',
      'createEngine',
      'createFixturePlayer',
      'replay',
      'parseFixture',
      'createPipeline',
    ]) {
      expect(api, name).toHaveProperty(name);
    }
  });

  it('does not export test helpers', () => {
    for (const name of ['angleFrame', 'cleanCycleFrames', 'witness', 'arbSpecJson']) {
      expect(api).not.toHaveProperty(name);
    }
  });
});
