// A grid that fits as many columns as the width allows, each at least `min`
// pixels wide. For cards: civs, Check's results.
import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../cx';
import s from './AutoGrid.module.css';

export function AutoGrid({ min = 280, gap, className, children }: { min?: number; gap?: 'lg'; className?: string; children: ReactNode }) {
  return <div className={cx(s.grid, className)} data-gap={gap} style={{ '--min': min + 'px' } as CSSProperties}>{children}</div>;
}
