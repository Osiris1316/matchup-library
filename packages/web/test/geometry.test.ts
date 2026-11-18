import { describe, expect, it } from 'vitest';
import { boxIn, elbow, linkBoxes } from '../src/kit/lines/geometry';

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height });

describe('line geometry', () => {
  it('measures a box relative to its host', () => {
    expect(boxIn(rect(110, 220, 100, 40), { left: 100, top: 200 })).toEqual({ l: 10, r: 110, t: 20, b: 60, m: 40, c: 60 });
  });

  it('draws a straight line when both ends are level', () => {
    expect(elbow(0, 10, 50, 10.5, 100)).toBe('M0 10 H100');
  });

  it('turns down with rounded corners no bigger than the radius', () => {
    expect(elbow(0, 0, 50, 100, 100, 8)).toBe('M0 0 H42 Q50 0 50 8 V92 Q50 100 58 100 H100');
  });

  it('shrinks the corners on a small rise, and turns up as well as down', () => {
    expect(elbow(0, 10, 50, 4, 100, 8)).toBe('M0 10 H47 Q50 10 50 7 V7 Q50 4 53 4 H100');
  });

  it('handles a turn that doubles back to the left', () => {
    // From a card's right edge, out to a turn, then back left into a lane.
    expect(elbow(200, 50, 240, 0, 230, 10)).toBe('M200 50 H230 Q240 50 240 40 V10 Q240 0 230 0 H230');
  });

  it('links two cards through the middle of the gap between them', () => {
    const a = { l: 0, r: 100, t: 0, b: 40, m: 20, c: 50 };
    const b = { l: 156, r: 256, t: 60, b: 100, m: 80, c: 206 };
    expect(linkBoxes(a, b)).toBe('M100 20 H120 Q128 20 128 28 V72 Q128 80 136 80 H156');
  });
});
