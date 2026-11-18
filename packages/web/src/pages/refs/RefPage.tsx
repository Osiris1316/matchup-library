// One reference: a game or a guide, with its moments in order.
import {
  AGE_NAME, SOURCE_NAME, STAGE_NAME, fmtDate, fmtTime, guideTitle, safeUrl, timed, type Moment
} from '@matchup-library/core';
import { L, useStore } from '../../store';
import { openMoment, openRefDetails, refFromView } from '../../actions';
import { paths } from '../../app/paths';
import { Flag, FlagOr, hasFlag } from '../../components/Flag';
import { Icon } from '../../components/Icon';
import { PageHead } from '../../components/bits';
import { SplitPill } from '../../components/Pill';
import { GameTitle, OUTCOME, REF_KIND } from '../../components/refs';

export function RefPage() {
  useStore();
  const r = refFromView();
  if (!r) return <><PageHead title="Reference" back={paths.refs()} /><main className="main"><p className="empty">That reference isn't in the library. It may have been deleted.</p></main></>;
  const isGame = r.kind === 'game';
  const g = r.kind === 'game' ? r.g : null;
  const l = r.kind === 'game' ? L.mainLink(r.id) : r.l;
  let summary: string;
  if (g) {
    const map = g.map && L.map(g.map) ? ' on ' + L.map(g.map)?.name : '';
    summary = g.mine
      ? `You played ${L.civName(g.playerCiv, 'a civ not set yet')} against ${L.civName(g.oppCiv, 'a civ not set yet')}${g.oppName ? ' (' + g.oppName + ')' : ''}${map}.${g.result ? (g.result === 'win' ? ' You won.' : ' You lost.') : ''}`
      : `${g.playerName || 'The player'} played ${L.civName(g.playerCiv, 'a civ not set yet')} against ${g.oppName || 'their opponent'} on ${L.civName(g.oppCiv, 'a civ not set yet')}${map}.${g.result ? ' ' + (g.playerName || 'The player') + (g.result === 'win' ? ' won.' : ' lost.') : ''}`;
  } else {
    const gl = r.kind === 'guide' ? r.l : null;
    summary = (gl && gl.civ ? 'About ' + L.civName(gl.civ) : 'Not tied to one civ') + (gl && gl.map && L.map(gl.map) ? ', on ' + L.map(gl.map)?.name : '') + '.';
  }
  const notes = g ? g.notes : l ? l.notes : '';
  const href = l ? safeUrl(l.url) : null;
  const mos: Moment[] = r.kind === 'game' ? L.gameMoments(r.id, r.g) : L.guideMoments(r.l);
  const anyTime = mos.some((mo) => mo.at != null);
  const title = g ? <GameTitle g={g} lg /> : guideTitle(l);
  return (
    <>
      <PageHead title={title} back={paths.refs()} aside={<button type="button" className="head-link" data-act="rf-edit" onClick={() => openRefDetails(null, r)}>Edit details</button>} />
      <main className="main">
        <section className="panel">
          <span className="label">{g ? REF_KIND[g.mine ? 'mine' : 'game'] : 'Guide'}{g && g.date ? ' · ' + fmtDate(g.date) : ''}</span>
          <span>{!isGame && l && hasFlag(l.civ) && <><Flag id={l.civ} />{' '}</>}{summary}</span>
          {notes && <span className="hint">{notes}</span>}
          {href && l
            ? <a className="btn btn-outline" href={href} target="_blank" rel="noopener">Open on {SOURCE_NAME[l.source] || 'the site'}</a>
            : isGame && <span className="hint">No link yet. Add one in Edit details to give moments a time.</span>}
        </section>
        <section className="block">
          <div className="block-head"><h2 className="label">Moments</h2><span className="sublabel">{mos.length}</span></div>
          {mos.length
            ? <div className="list">
                {mos.map((mo) => (
                  <div key={mo.key} className="lrow">
                    {anyTime && <span className="time">{mo.at != null ? fmtTime(mo.at) : ''}</span>}
                    <span className="lead-flag">{mo.civ && <FlagOr id={mo.civ} />}</span>
                    <button type="button" className="main-btn" data-act="mo-open" data-key={mo.key} onClick={() => openMoment(mo.key)}>
                      <span className="t">{mo.elementId && !mo.playId && !mo.planId ? <><SplitPill el={mo.elementId} use={mo} />{mo.age && L.elAges(mo.elementId).length > 1 ? <span className="muted fw5"> · {AGE_NAME[mo.age]} Age</span> : null}</> : L.momentName(mo)}{mo.playId && L.play(mo.playId) ? <span className="muted fw5"> · {STAGE_NAME[(L.play(mo.playId) as NonNullable<ReturnType<typeof L.play>>).age]}</span> : mo.planId ? <span className="muted fw5"> · game plan</span> : null}</span>
                      <span className="s">{[L.civName(mo.civ, isGame ? 'Side not set' : 'Not one civ'), mo.outcome ? OUTCOME[mo.outcome] : '', mo.note].filter(Boolean).join(' · ')}</span>
                    </button>
                  </div>
                ))}
              </div>
            : <p className="hint">{isGame ? 'Add what each side did, in order.' : 'Add each thing the guide shows.'}{href && timed(l) ? ' Give each one the time it starts, so Check can open the video right there.' : ''}</p>}
          <button type="button" className="btn btn-primary" data-act="mo-new" onClick={() => openMoment(null)}><Icon name="plus" size={16} w={2} /> Add a moment</button>
        </section>
      </main>
    </>
  );
}
