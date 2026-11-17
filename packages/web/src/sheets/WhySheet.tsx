// Check detail: every reason an element, play or game plan is listed for a civ.
import { STAGE_NAME, cap, fmtTime, parsePlace, urlAt, type Place } from '@matchup-library/core';
import { L, S, civSlug, type WhySheet as WhySheetT } from '../store';
import { openTagSheet, whyNewTag } from '../actions';
import { Flag } from '../components/Flag';
import { CloseBtn } from '../components/bits';
import { SplitPill, StepPills } from '../components/Pill';

export function WhySheet({ sh }: { sh: WhySheetT }) {
  const vp = parsePlace(sh.place ?? S.ui.check.place);
  const isEl = sh.itemKind === 'el';
  const def = L.itemDef(sh.itemKind, sh.id);
  if (!def) return null;
  const play = sh.itemKind === 'play' ? L.play(sh.id) : null;
  const plan = sh.itemKind === 'plan' ? L.plan(sh.id) : null;
  const ev = L.evidence(sh.itemKind, sh.civ, sh.id, vp).sort((a, b) => a.rank - b.rank);
  const hits = L.whereHits(def, vp);
  const phrase = vp.kind === 'any' ? 'on any map' : L.placePhrase(vp);
  const steps = play ? play.steps : null;
  const rows = ev.map((e, i) => {
    if (e.kind === 'tag' || e.kind === 'viaPlay' || e.kind === 'viaPlan') {
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
    if (e.kind === 'universal') {
      return (
        <div key={i} className="panel">
          <span className="strong">Every civ can do it</span>
          <span className="hint">It's marked universal in the Library, and {L.civName(sh.civ)} isn't listed as a civ that can't.</span>
        </div>
      );
    }
    if (e.kind === 'stages') {
      return (
        <div key={i} className="panel">
          <span className="strong">From its plays</span>
          {e.stages.map((x, j) => <span key={j} className="hint vs">{STAGE_NAME[x.age]}: {L.playTitle(x.play)}, {L.partText(x.ev[0])}</span>)}
          <span className="hint">Nothing says {L.civName(sh.civ)} put these together. Tag the whole game plan if they do.</span>
        </div>
      );
    }
    return (
      <div key={i} className="panel">
        <span className="strong">From its parts</span>
        {e.parts.map((x, j) => <span key={j} className="hint vs"><SplitPill el={x.st.el} use={x.st} /> {L.partText(x.ev[0])}</span>)}
        <span className="hint">Nothing says {L.civName(sh.civ)} put these together. Tag the whole play if they do.</span>
      </div>
    );
  });
  const vpPlace: Place = vp.kind === 'any' ? { kind: 'any' } : vp;
  return (
    <>
      <div className="sheet-head">
        <div>
          <h2 id="sheet-title">{isEl ? <SplitPill el={sh.id} size="lg" /> : def.name}</h2>
          <span className="sublabel"><Flag id={sh.civ} /> {L.civName(sh.civ)}, {phrase}{play ? '. ' + STAGE_NAME[play.age] + ': ' + L.sequence(play.steps) : plan ? '. ' + L.planSequence(plan) : ''}</span>
          {steps && <StepPills steps={steps} />}
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
