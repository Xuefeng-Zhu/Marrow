/** Presentation data per movement. The rules live in the JSON specs, not here. */

export type Target = { kind: 'reps'; reps: number } | { kind: 'hold'; seconds: number };

export interface WorkoutPresentation {
  kind: 'reps' | 'hold';
  defaultTarget: Target;
  /** Hold workouts: id of the hold in the spec. */
  holdId?: string;
  /** Phase id to cue text. */
  phaseCues: Record<string, string>;
  /** Rule id to spoken line. Falls back to the rule message. */
  ruleVoice?: Record<string, string>;
  fixtureId: string;
  blurb: string;
  /** Where to put the camera for the pose to be read well. */
  cameraTip: string;
}

export const PRESENTATION: Readonly<Record<string, WorkoutPresentation>> = {
  squat: {
    kind: 'reps',
    defaultTarget: { kind: 'reps', reps: 10 },
    phaseCues: { standing: 'Stand tall', bottom: 'Down' },
    ruleVoice: {
      'knees-caving': 'Push your knees out',
      'shallow-depth': 'Sink a little deeper',
    },
    fixtureId: 'squat',
    blurb: 'Sit back and down, then stand tall. Bones rattle on every rep.',
    cameraTip: 'Face the camera and step back until your whole body is in view.',
  },
  'push-up': {
    kind: 'reps',
    defaultTarget: { kind: 'reps', reps: 8 },
    phaseCues: { up: 'Push up', down: 'Down' },
    ruleVoice: {
      'hips-sagging': 'Lift your hips',
      'shallow-depth': 'Go a bit lower',
    },
    fixtureId: 'push-up',
    blurb: 'Lower your chest, press back up, and keep your body in one line.',
    cameraTip: 'Put the camera on the floor to your left side so your whole body is in view.',
  },
  lunge: {
    kind: 'reps',
    defaultTarget: { kind: 'reps', reps: 8 },
    phaseCues: { standing: 'Stand tall', bottom: 'Down' },
    ruleVoice: {
      'knee-past-ankle': 'Keep your knee over your ankle',
      'torso-lean': 'Stay tall',
    },
    fixtureId: 'lunge',
    blurb: 'Left foot forward. Step down until the front knee bends, then rise.',
    cameraTip: 'Stand side-on with your left foot forward, facing right, and keep your whole body in view.',
  },
  'jumping-jack': {
    kind: 'reps',
    defaultTarget: { kind: 'reps', reps: 15 },
    phaseCues: { closed: 'Feet together', open: 'Arms up' },
    ruleVoice: {
      'arms-low': 'Reach overhead',
      'feet-narrow': 'Jump wider',
    },
    fixtureId: 'jumping-jack',
    blurb: 'Jump wide with arms overhead, then back together.',
    cameraTip: 'Face the camera with room to spread your arms and legs, whole body in view.',
  },
  plank: {
    kind: 'hold',
    defaultTarget: { kind: 'hold', seconds: 30 },
    holdId: 'plank-hold',
    phaseCues: { off: 'Get into plank', plank: 'Hold it' },
    ruleVoice: {
      'hips-sagging': 'Lift your hips',
      'hips-piking': 'Lower your hips',
    },
    fixtureId: 'plank',
    blurb: 'Hold a straight line from shoulders to ankles for as long as you can.',
    cameraTip: 'Put the camera on the floor to your left side so your whole body is in view.',
  },
};
