import { useCallback, useEffect, useRef, useState } from 'react';
import { shouldEmit } from '../session/cues';
import { useReducedMotion } from '../theme/useReducedMotion';
import type { EffectKind, EffectRequest } from './effectTriggers';
import styles from './Effects.module.css';

/** Effects remove themselves after this long, under the 2 s limit of R17.2. */
export const EFFECT_LIFE_MS = 1800;

interface Item extends EffectRequest {
  id: number;
}

export interface EffectsProps {
  /** The latest request. A request with a new `key` starts an effect, if the rate limit allows it. */
  request: EffectRequest | null;
  now?: () => number;
}

function Bone() {
  return (
    <svg viewBox="0 0 40 16" width="40" height="16" focusable="false" aria-hidden="true">
      <path
        d="M6 2a4 4 0 0 1 4 4h20a4 4 0 1 1 4 4 4 4 0 1 1-4 4H10a4 4 0 1 1-4-4 4 4 0 0 1 0-8z"
        fill="currentColor"
        transform="translate(0 -1)"
      />
    </svg>
  );
}

function Pumpkin() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" focusable="false" aria-hidden="true">
      <ellipse cx="16" cy="19" rx="12" ry="10" fill="currentColor" />
      <rect x="14.5" y="5" width="3" height="6" rx="1.5" fill="currentColor" />
    </svg>
  );
}

const PARTICLES: readonly { kind: 'bone' | 'pumpkin'; dx: number; dy: number }[] = [
  { kind: 'bone', dx: -60, dy: 70 },
  { kind: 'pumpkin', dx: 0, dy: 90 },
  { kind: 'bone', dx: 55, dy: 65 },
  { kind: 'pumpkin', dx: -30, dy: 40 },
  { kind: 'bone', dx: 30, dy: 45 },
];

function particleCount(kind: EffectKind): number {
  return kind === 'rep' ? 2 : kind === 'milestone' ? 4 : 5;
}

/**
 * Short-lived SVG and CSS celebrations in a corner overlay. They never take focus or pointer events,
 * live at most 2 s, and start at most 3 times per second (R17). Under reduced motion they only fade, and the
 * information is also given as text.
 */
export function Effects({ request, now = () => performance.now() }: EffectsProps) {
  const reduced = useReducedMotion();
  const [items, setItems] = useState<Item[]>([]);
  const starts = useRef<number[]>([]);
  const seen = useRef<number | null>(null);
  const nextId = useRef(1);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: number) => setItems((cur) => cur.filter((i) => i.id !== id)), []);

  useEffect(() => {
    if (!request || request.key === seen.current) return;
    seen.current = request.key;
    const t = now();
    starts.current = starts.current.filter((s) => s > t - 1000);
    if (!shouldEmit(starts.current, t)) return;
    starts.current.push(t);
    const id = nextId.current++;
    setItems((cur) => [...cur, { ...request, id }]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      remove(id);
    }, EFFECT_LIFE_MS);
    timers.current.add(timer);
  }, [request, now, remove]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) clearTimeout(t);
      pending.clear();
    };
  }, []);

  return (
    <div className={styles.overlay} aria-hidden="true" style={{ pointerEvents: 'none' }} data-testid="effects">
      {items.map((item) => (
        <div
          key={item.id}
          className={`${styles.effect} ${styles[item.kind]} ${reduced ? styles.still : styles.moving}`}
          data-testid="effect"
          onAnimationEnd={() => remove(item.id)}
        >
          {item.kind !== 'rep' && <span className={styles.badge}>{item.text}</span>}
          {!reduced &&
            PARTICLES.slice(0, particleCount(item.kind)).map((p, i) => (
              <span
                key={i}
                className={styles.particle}
                style={{ ['--dx' as string]: `${p.dx}px`, ['--dy' as string]: `${p.dy}px` }}
              >
                {p.kind === 'bone' ? <Bone /> : <Pumpkin />}
              </span>
            ))}
        </div>
      ))}
    </div>
  );
}
