# Movement spec reference

A movement is a JSON file validated by `parseMovementSpec` in `marrow-core`. The worked example is `packages/marrow-core/specs/elbow-cycle.json`. Unknown fields are rejected. For the full engine semantics, see the [design](../.kiro/specs/marrow-core/design.md).

```json
{
  "version": 1,
  "id": "elbow-cycle",
  "name": "Elbow bend and extend",
  "minVisibility": 0.5,
  "hysteresis": 8,
  "minRepMs": 600,
  "metrics": {
    "elbowAngle": { "kind": "angle", "points": ["leftShoulder", "leftElbow", "leftWrist"] },
    "elbowDrift": { "kind": "offset", "points": ["leftElbow", "leftHip"], "axis": "x" }
  },
  "phases": [
    { "id": "extended", "metric": "elbowAngle", "min": 150, "max": 180 },
    { "id": "bent", "metric": "elbowAngle", "min": 30, "max": 70 }
  ],
  "holds": [{ "id": "bent-hold", "phase": "bent", "minMs": 1000, "tickMs": 500 }],
  "formRules": [
    {
      "id": "elbow-drift",
      "metric": "elbowDrift",
      "max": 0.25,
      "phases": ["bent"],
      "debounceMs": 300,
      "message": "Keep your elbow close to your side"
    }
  ],
  "rom": [{ "metric": "elbowAngle", "sampleOn": "rep" }]
}
```

## Top-level fields

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `version` | `1` | required | Spec format version. |
| `id` | slug | required | Lowercase letters, digits and hyphens. |
| `name` | string | required | Human-readable name. |
| `minVisibility` | 0 to 1 | `0.5` | Landmarks below this visibility are treated as missing. |
| `hysteresis` | degrees, at least 0 | `5` | Margin for angle metrics when entering or leaving a phase. |
| `normHysteresis` | at least 0 | `0.05` | Same margin for `distance` and `offset` metrics, in torso units. |
| `minRepMs` | ms, at least 0 | `0` | A cycle shorter than this is discarded, not counted. |
| `holdGapMs` | ms, above 0 | `500` | A gap in valid frames longer than this ends a hold with `lost-pose`. |
| `metrics` | map | required | Named measurements taken from landmarks. |
| `phases` | list, at least 2 | required | Ordered phases that make up one rep. |
| `holds` | list | none | Timed holds in a phase. |
| `formRules` | list | none | Bounds on a metric that raise warnings. |
| `rom` | list | none | Range-of-motion sampling. |

## `metrics`

Landmark names are the MediaPipe pose names such as `leftShoulder`, `rightKnee` and `leftHip` (see `LANDMARK_NAMES`).

| `kind` | Fields | Value |
| --- | --- | --- |
| `angle` | `points`: 3 landmarks (the middle one is the vertex), optional `plane`: `xy` or `xyz` | Joint angle in degrees, 0 to 180. |
| `distance` | `points`: 2 landmarks | Distance in torso units (relative to the mid-shoulder to mid-hip length). |
| `offset` | `points`: 2 landmarks, `axis`: `x` or `y` | Offset between the two points along the axis, in torso units. |

## `phases`

Each phase has `id`, `metric`, `min` and `max`. A rep is one pass through every phase in order and back to the first. Values between phases are neutral: the engine keeps the last phase.

## `holds`

`id`, `phase`, `minMs` (time in the phase before `hold:start`) and `tickMs` (interval of `hold:tick`).

## `formRules`

`id`, `metric`, optional `min` and `max`, optional `hysteresis`, optional `phases` (the rule applies only in these phases), `debounceMs` (how long a violation lasts before one warning) and `message`.

## `rom`

`metric` and `sampleOn`: `rep`, `hold:end` or `phase:<phaseId>`. Each trigger emits the min and max seen since the last trigger.

## Events

| Event | Fields |
| --- | --- |
| `phase` | `t`, `from`, `to` |
| `rep` | `t`, `count`, `durationMs`, `phaseEntries` |
| `hold:start` | `t`, `holdId` |
| `hold:tick` | `t`, `holdId`, `elapsedMs` |
| `hold:end` | `t`, `holdId`, `durationMs`, `reason` (`released` or `lost-pose`) |
| `form:warning` | `t`, `ruleId`, `message`, `value` |
| `rom:sample` | `t`, `metric`, `min`, `max`, `trigger` |
