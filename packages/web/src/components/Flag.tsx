// Civ flags, from the league manager. Files live in public/flags.
import { L } from '../store';

const FLAG_FILES = new Set(['abbasid-dynasty', 'ayyubids', 'byzantines', 'chinese', 'delhi-sultanate', 'english', 'french', 'golden-horde', 'holy-roman-empire',
  'house-of-lancaster', 'japanese', 'jeanne-darc', 'jin-dynasty', 'knights-templar', 'macedonian-dynasty', 'malians', 'mongols', 'order-of-the-dragon', 'ottomans',
  'rus', 'scots', 'sengoku-daimyo', 'tughlaq-dynasty', 'vikings', 'zhu-xi-legacy']);

export function hasFlag(id: string | null | undefined): boolean {
  const c = L.civ(id);
  return !!c && !!c.flag && FLAG_FILES.has(c.flag);
}

// alone: the flag stands in for the name, so it carries the name as alt text.
export function Flag({ id, alone = false, lg = false }: { id: string | null | undefined; alone?: boolean; lg?: boolean }) {
  const c = L.civ(id);
  if (!c || !c.flag || !FLAG_FILES.has(c.flag)) return null;
  return (
    <img className={'flag' + (lg ? ' lg' : '')} src={'/flags/' + c.flag + '.png'} alt={alone ? c.name : ''} title={alone ? c.name : undefined}
      width={lg ? 37 : 26} height={lg ? 20 : 14} />
  );
}

// The flag, or the short name when there is no flag.
export function FlagOr({ id, lg = false }: { id: string | null | undefined; lg?: boolean }) {
  return hasFlag(id) ? <Flag id={id} alone lg={lg} /> : <span>{L.civShort(id) || '?'}</span>;
}

// Every civ tagged with an element or play, as a row of flags.
export function CivFlags({ field, id }: { field: 'el' | 'play'; id: string }) {
  const ids = [...new Set(L.activeTags().filter((t) => t[field] === id).map((t) => t.civ))]
    .filter((c) => L.civ(c) && L.civ(c)?.active !== false)
    .sort((a, b) => L.civName(a).localeCompare(L.civName(b)));
  if (!ids.length) return null;
  return (
    <span className="flags">
      {ids.slice(0, 12).map((c) => (hasFlag(c) ? <Flag key={c} id={c} alone /> : <span key={c} className="sublabel">{L.civShort(c)}</span>))}
      {ids.length > 12 && <span className="sublabel">and {ids.length - 12} more</span>}
    </span>
  );
}
