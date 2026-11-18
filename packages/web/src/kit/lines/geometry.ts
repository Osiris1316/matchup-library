// Geometry for lines drawn between cards. Pure functions, so they can be tested
// without a browser.

// A box measured relative to the element the lines are drawn in.
export interface Box { l: number; r: number; t: number; b: number; m: number; c: number }

type Rect = { left: number; right: number; top: number; bottom: number; height: number; width: number };
export function boxIn(rect: Rect, host: Pick<Rect, 'left' | 'top'>): Box {
  return {
    l: rect.left - host.left, r: rect.right - host.left, t: rect.top - host.top, b: rect.bottom - host.top,
    m: rect.top + rect.height / 2 - host.top, c: rect.left + rect.width / 2 - host.left
  };
}

// An elbow: across from (x1, y1) to the turn at xm, along to y2, then across to
// x2, with rounded corners of at most `radius` (less when the rise is small).
// Level ends make a straight line.
export function elbow(x1: number, y1: number, xm: number, y2: number, x2: number, radius = 8): string {
  const dy = y2 - y1;
  if (Math.abs(dy) < 1) return `M${x1} ${y1} H${x2}`;
  const s = dy > 0 ? 1 : -1, r = Math.min(radius, Math.abs(dy) / 2);
  const sx1 = xm >= x1 ? 1 : -1, sx2 = x2 >= xm ? 1 : -1;
  return `M${x1} ${y1} H${xm - sx1 * r} Q${xm} ${y1} ${xm} ${y1 + s * r} V${y2 - s * r} Q${xm} ${y2} ${xm + sx2 * r} ${y2} H${x2}`;
}

// From the right edge of one box to the left edge of the next, turning halfway
// across the gap between them.
export function linkBoxes(a: Box, b: Box, radius = 8): string {
  return elbow(a.r, a.m, Math.round((a.r + b.l) / 2), b.m, b.l, radius);
}
