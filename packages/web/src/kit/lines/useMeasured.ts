// Measures the page after layout and keeps the result while it stays the same.
// Lines between cards depend on where the cards end up, which only the browser
// knows, so `measure` runs after every render, on resize, and whenever the host
// changes size (fonts loading, a panel opening). It only runs on wide screens;
// below that the cards stack and nothing is drawn.
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { isWide } from '../breakpoints';

export function useMeasured<T>(host: RefObject<HTMLElement | null>, measure: (host: HTMLElement) => T, empty: T): T {
  const [value, setValue] = useState<T>(empty);
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener('resize', bump);
    const el = host.current;
    const ro = el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(bump) : null;
    if (ro && el) ro.observe(el);
    return () => { window.removeEventListener('resize', bump); if (ro) ro.disconnect(); };
  }, [host]);
  useLayoutEffect(() => {
    const el = host.current;
    const next = el && isWide() ? measure(el) : empty;
    // Only a real change re-renders, so this settles after one pass.
    if (JSON.stringify(next) !== JSON.stringify(value)) setValue(next);
  });
  return value;
}
