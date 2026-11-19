import { useEffect, useRef, useState } from 'react';

/** Moves focus to the screen heading when the screen appears (R15.4). The heading needs `tabIndex={-1}`. */
export function useHeadingFocus<T extends HTMLElement = HTMLHeadingElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

/** True when the user asks for reduced motion (R15.7). */
export function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const get = () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  const [reduced, setReduced] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const on = () => setReduced(mql.matches);
    mql.addEventListener?.('change', on);
    return () => mql.removeEventListener?.('change', on);
  }, []);
  return reduced;
}
