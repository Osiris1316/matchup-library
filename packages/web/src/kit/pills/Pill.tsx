// Element pills, as pure presentation: everything they show comes in as props.
// The app's components/Pill.tsx works out what an element looks like (its icon,
// type and intent) and renders these.
import type { ReactNode } from 'react';
import type { ElType, Intent } from '@matchup-library/core';
import { cx } from '../cx';
import s from './Pill.module.css';

export type TileSize = 'sm' | 'mini' | 'lg' | 'xl';

// An age-up with no landmark: two rising chevrons.
function AgeGlyph() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={s.glyph}>
      <path d="M5 11.5 L10 6.5 L15 11.5" /><path d="M5 15.5 L10 10.5 L15 15.5" />
    </svg>
  );
}

// The icon tile, colored by type.
export function PillTile({ src, type, size = 'sm' }: { src: string | null; type: ElType | null; size?: TileSize }) {
  return (
    <span className={s.tile} data-type={type || 'none'} data-size={size}>
      {src
        ? <img src={src} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
        : type === 'age_tech' ? <AgeGlyph /> : null}
    </span>
  );
}

export interface PillProps { type: ElType | null; intent: Intent | null; src: string | null; name: string; title?: string; size?: 'sm' | 'lg' }

// A split pill: the tile, then the name colored by intent.
export function Pill({ type, intent, src, name, title, size = 'sm' }: PillProps) {
  return (
    <span className={s.pill} data-pill="" data-size={size} data-type={type || 'none'} data-intent={intent || 'none'} title={title}>
      <PillTile src={src} type={type} size={size} /><span className={s.name}>{name}</span>
    </span>
  );
}

// The tile alone with a thin intent bar under it, for tight spaces.
export function PillMini({ type, intent, src, label, title }: { type: ElType | null; intent: Intent | null; src: string | null; label: string; title?: string }) {
  return (
    <span className={s.mini} data-pill-mini="" data-type={type || 'none'} data-intent={intent || 'none'} title={title} role="img" aria-label={label}>
      <PillTile src={src} type={type} size="mini" />
    </span>
  );
}

// A row of pills. wrap={false} keeps them on one line.
export function PillRow({ mini, wrap = true, className, children }: { mini?: boolean; wrap?: boolean; className?: string; children: ReactNode }) {
  return <span className={cx(s.row, className)} data-pill-row="" data-mini={mini ? '' : undefined} data-wrap={wrap ? undefined : 'no'}>{children}</span>;
}

// Between two steps: a chevron for "then", a plus for "with" (at the same time).
export function PillSep({ kind }: { kind: 'then' | 'with' }) {
  return kind === 'with'
    ? <span className={s.with} aria-label="with">+</span>
    : <svg className={s.then} width="8" height="10" viewBox="0 0 8 10" aria-label="then"><path d="M2 1 L6 5 L2 9" /></svg>;
}
