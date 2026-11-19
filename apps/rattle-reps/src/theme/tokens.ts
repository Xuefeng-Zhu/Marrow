/** Token values mirrored from `global.css`, so tests can check contrast and that the two agree. */
export const TOKENS = {
  '--bg': '#0b0820',
  '--bg-raised': '#171235',
  '--bone': '#f4f1e6',
  '--muted': '#b9b3d6',
  '--pumpkin': '#ff8a1f',
  '--toxic': '#7dff5a',
  '--ghost': '#b58cff',
  '--warn': '#ff4d6d',
  '--focus': '#ffe14d',
} as const;

export type TokenName = keyof typeof TOKENS;

/** Text on background pairs used by the UI, with the minimum ratio each needs (WCAG AA). */
export interface ContrastPair {
  fg: TokenName;
  bg: TokenName;
  /** 4.5 for text, 3 for large text, focus rings and graphical objects. */
  min: 4.5 | 3;
}

export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { fg: '--bone', bg: '--bg', min: 4.5 },
  { fg: '--bone', bg: '--bg-raised', min: 4.5 },
  { fg: '--muted', bg: '--bg', min: 4.5 },
  { fg: '--muted', bg: '--bg-raised', min: 4.5 },
  { fg: '--ghost', bg: '--bg', min: 4.5 },
  { fg: '--ghost', bg: '--bg-raised', min: 4.5 },
  { fg: '--toxic', bg: '--bg', min: 4.5 },
  { fg: '--toxic', bg: '--bg-raised', min: 4.5 },
  { fg: '--warn', bg: '--bg', min: 4.5 },
  { fg: '--warn', bg: '--bg-raised', min: 4.5 },
  { fg: '--pumpkin', bg: '--bg', min: 4.5 },
  { fg: '--pumpkin', bg: '--bg-raised', min: 4.5 },
  // Button labels: dark text on an accent fill.
  { fg: '--bg', bg: '--pumpkin', min: 4.5 },
  { fg: '--bg', bg: '--toxic', min: 4.5 },
  { fg: '--bg', bg: '--ghost', min: 4.5 },
  { fg: '--bg', bg: '--warn', min: 4.5 },
  // The focus ring is drawn with an offset, so it sits on the page or card surface, not on the control fill.
  { fg: '--focus', bg: '--bg', min: 3 },
  { fg: '--focus', bg: '--bg-raised', min: 3 },
];

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a `#rrggbb` color. */
export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
