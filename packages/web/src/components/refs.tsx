// Small pieces shared by the reference pages and the sheets: what a reference
// is called, how a moment went, and a game's title.
import type { Game } from '@matchup-library/core';
import { L, type RefKind } from '../store';
import { FlagOr } from './Flag';

export const REF_KIND: Record<RefKind, string> = { mine: 'My game', game: 'Other game', guide: 'Guide' };
export const OUTCOME = { worked: 'Worked', mixed: 'Mixed', failed: 'Failed' } as const;

// A game's title: its own title, or the two flags and the map.
export function GameTitle({ g, lg = false }: { g: Game; lg?: boolean }) {
  if (g.title) return <>{g.title}</>;
  const m = g.map ? L.map(g.map) : null;
  return (
    <span className="vs">
      <FlagOr id={g.playerCiv} lg={lg} /><span className="muted fw5">vs</span><FlagOr id={g.oppCiv} lg={lg} />{m && <span>{m.name}</span>}
    </span>
  );
}
