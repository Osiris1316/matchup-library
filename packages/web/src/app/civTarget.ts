// The civ to open when no civ is named: the last one looked at, else the one
// Check compares against, else the first. Used by the menu's Civs and by /civs.
import { L, S } from '../store';

export function civTarget(): string {
  const ok = (id: string) => !!id && !!L.civ(id);
  return [S.lastCiv, S.ui.check.opp].find(ok) || (L.activeCivs()[0] ? L.activeCivs()[0]!.id : '');
}
