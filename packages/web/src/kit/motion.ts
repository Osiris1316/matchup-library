// Motion: when a change moves things on the page, slide them to their new
// places instead of jumping, so you can see where they went. Uses the browser's
// view transitions; anything with a view-transition-name animates. Without
// support, or when the system asks for less motion, the change just happens.
import { flushSync } from 'react-dom';

export const motionOk = (): boolean =>
  typeof document !== 'undefined' && 'startViewTransition' in document && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Runs a change that redraws the page (a store change and its emit), animated.
export function animate(change: () => void): void {
  if (!motionOk()) { change(); return; }
  document.startViewTransition(() => { flushSync(change); });
}

// A view-transition-name from parts, safe for CSS: each must be unique on the page.
export const vtName = (...parts: string[]): string => 'vt-' + parts.join('-').replace(/[^a-zA-Z0-9_-]/g, '_');
