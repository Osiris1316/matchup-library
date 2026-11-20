// One reference, as the pane beside the list (or the whole page on a phone):
// what it is and its link, then what happened on the age board. Anything with
// no place on the board is listed under it.
import { useState } from 'react';
import { SOURCE_NAME, fmtDate, fmtTime, safeUrl, timed } from '@matchup-library/core';
import { L } from '../../store';
import { openMoment, type RefCtx } from '../../actions';
import { Flag, FlagOr, hasFlag } from '../../components/Flag';
import { OUTCOME, REF_KIND } from '../../components/refs';
import { RefBoard, unplacedOf } from './RefBoard';
import s from './Refs.module.css';

function summaryOf(r: RefCtx): string {
  if (r.kind === 'game') {
    const g = r.g;
    const map = g.map && L.map(g.map) ? ' on ' + L.map(g.map)?.name : '';
    return g.mine
      ? `You played ${L.civName(g.playerCiv, 'a civ not set yet')} against ${L.civName(g.oppCiv, 'a civ not set yet')}${g.oppName ? ' (' + g.oppName + ')' : ''}${map}.${g.result ? (g.result === 'win' ? ' You won.' : ' You lost.') : ''}`
      : `${g.playerName || 'The player'} played ${L.civName(g.playerCiv, 'a civ not set yet')} against ${g.oppName || 'their opponent'} on ${L.civName(g.oppCiv, 'a civ not set yet')}${map}.${g.result ? ' ' + (g.playerName || 'The player') + (g.result === 'win' ? ' won.' : ' lost.') : ''}`;
  }
  const gl = r.l;
  return (gl.civ ? 'About ' + L.civName(gl.civ) : 'Not tied to one civ') + (gl.map && L.map(gl.map) ? ', on ' + L.map(gl.map)?.name : '') + '.';
}

export function RefDetail({ r }: { r: RefCtx }) {
  const g = r.kind === 'game' ? r.g : null;
  const l = r.kind === 'game' ? L.mainLink(r.id) : r.l;
  const count = r.kind === 'game' ? (r.g.plays || []).length : (r.l.marks || []).length;
  // A reference with nothing in it yet opens ready to pick.
  const [picking, setPicking] = useState(count === 0);
  const notes = g ? g.notes : l ? l.notes : '';
  const href = l ? safeUrl(l.url) : null;
  const unplaced = unplacedOf(r);
  return (
    <div className={s.detail}>
      <section className={s.summary}>
        <div className={s.summaryText}>
          <span className="label">{g ? REF_KIND[g.mine ? 'mine' : 'game'] : 'Guide'}{g && g.date ? ' · ' + fmtDate(g.date) : ''}</span>
          <span>{r.kind === 'guide' && hasFlag(r.l.civ) && <><Flag id={r.l.civ} />{' '}</>}{summaryOf(r)}</span>
          {notes && <span className="hint">{notes}</span>}
          {!href && g && <span className="hint">No link yet. Add one in Edit details to give moments a time.</span>}
        </div>
        {href && l && <a className="btn btn-outline" href={href} target="_blank" rel="noopener">Open on {SOURCE_NAME[l.source] || 'the site'}</a>}
      </section>

      <section className={s.happened}>
        <div className={s.happenedHead}>
          <h2 className="label">What happened</h2>
          <span className="sublabel">{count ? count + (count === 1 ? ' moment' : ' moments') : 'Nothing yet'}</span>
          <button type="button" className={'btn btn-sm ' + (picking ? 'btn-primary' : 'btn-outline') + ' ' + s.pickToggle} data-act="ref-picking" aria-pressed={picking} onClick={() => setPicking(!picking)}>
            {picking ? 'Done adding' : 'Add what happened'}
          </button>
        </div>
        {picking && (
          <p className="hint">
            Pick what each side did in each age; plays that go with what's already picked come first. A pick goes in straight away. Open a card to add {l && timed(l) ? 'its time, ' : ''}how it went and notes, or to take it out.
          </p>
        )}
        <RefBoard r={r} picking={picking} />
      </section>

      {unplaced.length > 0 && (
        <section className="block" data-unplaced="">
          <div className="block-head"><h2 className="label">Not on the board</h2><span className="sublabel">{unplaced.length}</span></div>
          <p className="hint">Nothing picked yet, an Imperial play, or an element in more than one age with none given. Open one to say what it was.</p>
          <div className="list">
            {unplaced.map(({ mo }) => (
              <div key={mo.key} className="lrow">
                {mo.at != null && <span className="time">{fmtTime(mo.at)}</span>}
                <span className="lead-flag">{mo.civ && <FlagOr id={mo.civ} />}</span>
                <button type="button" className="main-btn" data-act="mo-open" data-key={mo.key} onClick={() => openMoment(mo.key)}>
                  <span className="t">{L.momentName(mo)}</span>
                  <span className="s">{[L.civName(mo.civ, r.kind === 'game' ? 'Side not set' : 'Not one civ'), mo.outcome ? OUTCOME[mo.outcome] : '', mo.note].filter(Boolean).join(' · ')}</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// The pane when nothing is open yet.
export function NoRefOpen({ count }: { count: number }) {
  return (
    <div className={s.nothing}>
      <h2 className={s.nothingTitle}>{count ? 'Pick a reference' : 'No references yet'}</h2>
      <p className="hint">{count ? 'What happened in it opens here, age by age, and the list stays beside it.' : 'Paste a link, or log one of your games from memory, with the box on the left.'}</p>
    </div>
  );
}
