---
inclusion: fileMatch
fileMatchPattern: ["apps/**/*.tsx", "apps/**/*.css"]
---
# Accessibility and design rules for both apps
- Everything works by keyboard; visible focus rings; no keyboard traps in modals.
- WCAG AA contrast on theme tokens (a test checks the token pairs).
- Honour `prefers-reduced-motion`: no shake, confetti or bone-rattle animation when set.
- Every spoken cue also appears as on-screen text (aria-live polite); never sound-only feedback.
- Large targets (44px+), readable from 2 m away during exercise.
- No camera frames leave the device: never upload, never log landmarks remotely.
