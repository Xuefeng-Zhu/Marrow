import type { Family } from './tests';
import type { AgeBand } from './data/prefs';

/** Shown after every rendered reference (R9.3). */
export const NON_DIAGNOSIS_LINE =
  'This is not a diagnosis. Talk to your physical therapist or doctor about your results.';

export interface AgeBandThreshold {
  band: AgeBand;
  /** Scores below this are shown as "below average" in the CDC table. */
  men: number;
  women: number;
}

export interface ReferenceEntry {
  testFamily: Family;
  text: string;
  /** Source name, shown with the text. */
  source: string;
  url?: string;
  /** Short note, shown with the text. */
  note: string;
  /** Chair stand only: threshold per age band. */
  ageBands?: readonly AgeBandThreshold[];
}

/**
 * Reference context as data, so it can be corrected without code changes.
 *
 * Only numbers that were checked against the cited source belong here. The sources below
 * could not be opened when this file was written (the CDC site refused automated requests),
 * so no figures are included yet. To add them, copy each value from the cited page, for
 * example the CDC STEADI 30-Second Chair Stand "below average" table into `ageBands`.
 * The result model and its tests already handle a populated table.
 */
export const REFERENCES: readonly ReferenceEntry[] = [
  {
    testFamily: 'shoulder-flexion',
    text: 'Typical shoulder flexion is usually described as reaching close to straight overhead. A smaller range is common with age or after an injury.',
    source: 'Standard goniometry texts (for example AAOS joint motion guidance)',
    note: 'Add the typical range in degrees from the cited text.',
  },
  {
    testFamily: 'knee-flexion',
    text: 'Typical knee flexion is usually described as bending the heel most of the way to the buttock. Your own range may differ.',
    source: 'Standard goniometry texts (for example AAOS joint motion guidance)',
    note: 'Add the typical range in degrees from the cited text.',
  },
  {
    testFamily: 'chair-stand',
    text: 'For comparison, the CDC STEADI 30-Second Chair Stand table lists scores by age band and sex. Scores below the listed number are often a prompt to talk to a health professional.',
    source: 'CDC STEADI, 30-Second Chair Stand',
    url: 'https://www.cdc.gov/steadi/',
    note: 'Fill ageBands from the CDC table. The card shows both columns.',
    ageBands: [],
  },
  {
    testFamily: 'single-leg-stance',
    text: 'For comparison, holding a single-leg stance for longer is usually easier for people with good balance. Times vary a lot with age and with whether the eyes are open.',
    source: 'Published single-leg stance studies (for example Springer et al., 2007)',
    note: 'Add the typical times in seconds from the cited paper.',
  },
];
