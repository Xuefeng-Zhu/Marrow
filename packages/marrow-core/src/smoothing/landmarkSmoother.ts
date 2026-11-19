import type { Frame } from '../types';
import { OneEuroFilter, type OneEuroOptions } from './oneEuro';

/** Applies one One-Euro filter per landmark per axis. Keeps `t` and `visibility` unchanged. */
export class LandmarkSmoother {
  private filters: [OneEuroFilter, OneEuroFilter, OneEuroFilter][] = [];

  constructor(private readonly opts: OneEuroOptions = {}) {
    new OneEuroFilter(opts); // validate eagerly
  }

  smooth(frame: Frame): Frame {
    const landmarks = frame.landmarks.map((lm, i) => {
      let f = this.filters[i];
      if (!f) {
        f = [new OneEuroFilter(this.opts), new OneEuroFilter(this.opts), new OneEuroFilter(this.opts)];
        this.filters[i] = f;
      }
      return {
        x: f[0].filter(lm.x, frame.t),
        y: f[1].filter(lm.y, frame.t),
        z: f[2].filter(lm.z, frame.t),
        visibility: lm.visibility,
      };
    });
    return { t: frame.t, landmarks };
  }

  reset(): void {
    this.filters = [];
  }
}
