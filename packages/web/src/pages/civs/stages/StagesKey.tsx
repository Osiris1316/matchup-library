// How to read the stages page: what the tile and name colors mean, and what a
// card's outline says about the evidence. Opened from the top bar.
import type { ElType, Intent } from '@matchup-library/core';
import { S, emit } from '../../../store';
import { PillFace } from '../../../components/Pill';
import { Icon } from '../../../components/Icon';
import s from './CivStages.module.css';

const PILLS: { type: ElType; intent: Intent | null; name: string; text: string }[] = [
  { type: 'unit', intent: 'offensive', name: 'Unit', text: 'Red name: offensive' },
  { type: 'structure', intent: 'defensive', name: 'Structure', text: 'Blue name: defensive' },
  { type: 'economy', intent: 'economic', name: 'Economy', text: 'Green name: economic' },
  { type: 'age_tech', intent: null, name: 'Age-up', text: 'Grey name: no intent' }
];
const OUTLINES: { tier: string; text: string }[] = [
  { tier: 'documented', text: 'Standard or tagged' },
  { tier: 'parts', text: 'From parts, never seen together' },
  { tier: 'open', text: 'Not seen: possible, nothing documented' }
];

export function StagesKey() {
  const close = () => { S.ui.civ.showKey = false; emit(); };
  return (
    <section className={s.key} aria-label="How to read">
      <button type="button" className={s.keyClose} data-act="stg-key-close" aria-label="Close" onClick={close}><Icon name="x" size={16} w={2} /></button>
      <div className={s.keyGroup}>
        <span className="label">Cards</span>
        <p className="hint">Each card is one way to play an age. Elements read left to right in the order they happen. The icon names the exact unit, building or landmark; the column gives the age.</p>
        <p className="hint">Pick a card to narrow the page: the rest of its age fades, and other ages keep what a game plan, branch or game has with it. Pick a game plan to fill in all three ages.</p>
        <p className="hint">While you narrow, each column puts your pick and what goes with it at the top, and folds the groups with nothing but faded cards. Open or fold any group from its heading; what you fold by hand stays folded on every civ.</p>
      </div>
      <div className={s.keyGroup}>
        <span className="label">Tile is type, name is intent</span>
        {PILLS.map((x) => (
          <span key={x.type} className={s.keyItem}><span className={s.keyPill}><PillFace type={x.type} intent={x.intent} icon={null} name={x.name} /></span><span className="hint">{x.text}</span></span>
        ))}
      </div>
      <div className={s.keyGroup}>
        <span className="label">Card outline is evidence</span>
        {OUTLINES.map((x) => <span key={x.tier} className={s.keyItem}><span className={s.swatch} data-tier={x.tier} /><span className="hint">{x.text}</span></span>)}
        <span className={s.keyItem}><span className={s.swatch} data-picked="" /><span className="hint">Picked</span></span>
        <span className={s.keyItem}><span className={s.swatch} data-tier="documented" data-dim="" /><span className="hint">Faded: not on the path you picked</span></span>
      </div>
    </section>
  );
}
