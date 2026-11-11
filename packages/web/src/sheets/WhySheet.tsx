// Check detail: every reason an element or play is listed for a civ.
import { cap, fmtTime, parsePlace, urlAt, type Place } from '@matchup-library/core';
import { L, S, civSlug, type WhySheet as WhySheetT } from '../store';
import { openTagSheet, whyNewTag } from '../actions';
import { Flag } from '../components/Flag';
import { CloseBtn } from '../components/bits';

export function WhySheet({ sh }: { sh: WhySheetT }) {
  const vp = parsePlace(S.ui.check.place);
  const isPlay = sh.itemKind === 'play';
  const def = isPlay ? L.strat(sh.id) : L.el(sh.id);
  if (!def) return null;
  const ev = (isPlay ? L.playEvidence(sh.civ, sh.id, vp) : L.elementEvidence(sh.civ, sh.id, vp, null)).sort((a, b) => a.rank - b.rank);
  const hits = L.whereHits(def, vp);
  const phrase = vp.kind === 'any' ? 'on any map' : L.placePhrase(vp);
  const steps = 'steps' in def ? def.steps : null;
  const rows = ev.map((e, i) => {
    if (e.kind === 'tag' || e.kind === 'viaPlay') {
      const d = L.tagDetail(e.t);
      return (
        <button key={i} type="button" className="card quiet" data-act="why-tag" data-id={e.t.id} onClick={() => openTagSheet({ tagId: e.t.id }, S.sheet)}>
          <span className="t fw5">{L.evText(e, sh.itemKind)}</span>
          {d && <span className="s">{d}</span>}
          <span className="s ulink">Edit this tag</span>
        </button>
      );
    }
    if (e.kind === 'game' || e.kind === 'guide') {
      const route = e.kind === 'game' ? 'ref-game-' + e.gid : 'ref-guide-' + e.lid;
      const mk = e.kind === 'game' ? L.gameMark(e.gid, e.p.pid) : { l: e.l, m: e.m };
      const at = mk ? mk.m.at : null;
      const watch = mk && at != null ? urlAt(mk.l.url, at) : null;
      const note = e.kind === 'game' ? e.p.notes || e.g.notes || '' : e.m.note || '';
      return (
        <div key={i} className="panel">
          <span className="strong">{L.evText(e, sh.itemKind)}</span>
          {note && <span className="hint">{note}</span>}
          <span className="hint">
            <a className="ulink" href={'#' + route}>Open the reference</a>
            {watch && <> · <a className="ulink" href={watch} target="_blank" rel="noopener">Watch from {fmtTime(at)}</a></>}
          </span>
        </div>
      );
    }
    return (
      <div key={i} className="panel">
        <span className="strong">From its parts</span>
        {e.parts.map((x, j) => <span key={j} className="hint">{L.stepLabel(x.st)}: {L.partText(x.ev[0])}</span>)}
        <span className="hint">Nothing says {L.civName(sh.civ)} put these together. Tag the whole play if they do.</span>
      </div>
    );
  });
  const vpPlace: Place = vp.kind === 'any' ? { kind: 'any' } : vp;
  return (
    <>
      <div className="sheet-head">
        <div>
          <h2 id="sheet-title">{def.name}</h2>
          <span className="sublabel"><Flag id={sh.civ} /> {L.civName(sh.civ)}, {phrase}{steps ? '. ' + L.sequence(steps) : ''}</span>
        </div>
        <CloseBtn />
      </div>
      <section className="block"><h3 className="label">Why it's here</h3>{rows}</section>
      {(hits.length > 0 || def.whereNote) && (
        <section className="block">
          <h3 className="label">Comes up on</h3>
          <p className="hint">{hits.length ? cap(hits.map((p) => L.wherePhrase(p)).join(', ')) + '.' : ''} {def.whereNote || ''}</p>
        </section>
      )}
      <div className="btn-row">
        <a className="btn" href={'#civ-' + civSlug(sh.civ)}>{L.civShort(sh.civ)} page</a>
        <button type="button" className="btn btn-primary" data-act="why-new-tag" onClick={whyNewTag}>Tag {L.placePhrase(vpPlace)}</button>
      </div>
    </>
  );
}
