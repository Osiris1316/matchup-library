// Check: what each side is documented doing on a map, and why.
import { STAGE_NAME, isActive, parsePlace, type Evidence, type ItemKind, type Place } from '@matchup-library/core';
import { L, S, civSlug, emit, openSheet, savePrefs } from '../store';
import { openTagSheet } from '../actions';
import { Icon } from '../components/Icon';
import { CivSelect, Lines, MapGroups, PageHead, Seg, UpkeepLink } from '../components/bits';
import { PlanStages, SplitPill, StepPills } from '../components/Pill';

function CheckCard({ itemKind, id, civ, ev, vp }: { itemKind: ItemKind; id: string; civ: string; ev: Evidence[]; vp: Place }) {
  const def = L.itemDef(itemKind, id);
  if (!def) return null;
  const lines = [...new Set(ev.slice().sort((a, b) => a.rank - b.rank).map((e) => L.evText(e, itemKind)))];
  const shown = lines.slice(0, 2);
  const more = lines.length - shown.length;
  const hits = L.whereHits(def, vp);
  const play = itemKind === 'play' ? L.play(id) : null;
  const plan = itemKind === 'plan' ? L.plan(id) : null;
  return (
    <button type="button" className="card" data-act="ck-open" data-kind={itemKind} data-id={id} data-civ={civ} onClick={() => openSheet({ kind: 'why', itemKind, id, civ })}>
      <span className="t">{itemKind === 'el' ? <SplitPill el={id} /> : def.name}{play && <span className="sublabel"> {STAGE_NAME[play.age]}</span>}</span>
      {play && <StepPills steps={play.steps} />}
      {plan && <PlanStages g={plan} />}
      <span className="why"><Lines lines={more > 0 ? [...shown, 'And ' + more + ' more'] : shown} /></span>
      {hits.length > 0 && <span className="why lead">Comes up on {hits.map((p) => L.wherePhrase(p)).join(', ')}</span>}
    </button>
  );
}

function EmptyCheck({ civ, phrase }: { civ: string; phrase: string }) {
  return (
    <div className="panel">
      <span className="strong">Nothing for {L.civName(civ)} applies {phrase} yet.</span>
      <span className="hint">Tag elements, plays or game plans on their civ page, or open one in Library and tick {L.civShort(civ)}.</span>
    </div>
  );
}

export function CheckView() {
  const u = S.ui.check;
  if (!isActive(L.civ(u.me))) u.me = (L.activeCivs()[0] || { id: '' }).id;
  if (!isActive(L.civ(u.opp))) u.opp = (L.activeCivs()[1] || { id: '' }).id;
  let vp = parsePlace(u.place);
  if ((vp.kind === 'type' && !isActive(L.mapType(vp.id))) || (vp.kind === 'map' && !isActive(L.map(vp.id)))) { u.place = 'any:'; vp = { kind: 'any' }; }
  const phrase = vp.kind === 'any' ? 'on any map' : L.placePhrase(vp);
  const tg = L.civPlans(u.opp, vp), tp = L.civPlays(u.opp, vp), te = L.civElements(u.opp, vp);
  const mg = L.civPlans(u.me, vp), mp = L.civPlays(u.me, vp), me = L.civElements(u.me, vp);
  const mineN = mg.length + mp.length + me.length;
  const elsewhere = L.civElsewhere(u.opp, vp);
  let body;
  if (u.seg === 'mine') {
    body = mineN
      ? <>
          <p className="hint">What {L.civName(u.me)} are documented doing {phrase}: your own options.</p>
          {mg.length > 0 && <><h3 className="label">Game plans</h3>{mg.map((x) => <CheckCard key={x.id} itemKind="plan" id={x.id} civ={u.me} ev={x.ev} vp={vp} />)}</>}
          {mp.length > 0 && <><h3 className="label">Plays</h3>{mp.map((x) => <CheckCard key={x.id} itemKind="play" id={x.id} civ={u.me} ev={x.ev} vp={vp} />)}</>}
          {me.length > 0 && <><h3 className="label">Elements</h3>{me.map((x) => <CheckCard key={x.id} itemKind="el" id={x.id} civ={u.me} ev={x.ev} vp={vp} />)}</>}
        </>
      : <EmptyCheck civ={u.me} phrase={phrase} />;
  } else {
    const items = u.seg === 'plans' ? tg : u.seg === 'plays' ? tp : te;
    const k: ItemKind = u.seg === 'plans' ? 'plan' : u.seg === 'plays' ? 'play' : 'el';
    const word = u.seg === 'plans' ? 'game plans' : u.seg === 'plays' ? 'plays' : 'elements';
    body = (
      <>
        {items.length
          ? <>
              <p className="hint">Your opponent's {word}: everything for {L.civName(u.opp)} that applies {phrase}, with the reason it's here. Tap one to see all of it.</p>
              {items.map((x) => <CheckCard key={x.id} itemKind={k} id={x.id} civ={u.opp} ev={x.ev} vp={vp} />)}
            </>
          : <EmptyCheck civ={u.opp} phrase={phrase} />}
        {elsewhere.length > 0 && (
          <button type="button" className="textlink" data-act="ck-elsewhere" aria-expanded={u.showElsewhere} onClick={() => { u.showElsewhere = !u.showElsewhere; emit(); }}>
            <span className="label">Tagged for other maps</span><span>{u.showElsewhere ? 'Hide' : 'Show'} {elsewhere.length}</span>
          </button>
        )}
        {elsewhere.length > 0 && u.showElsewhere && (
          <div className="list">
            {elsewhere.map((t) => (
              <div key={t.id} className="lrow">
                <button type="button" className="main-btn" data-act="ck-tag" data-id={t.id} onClick={() => openTagSheet({ tagId: t.id })}>
                  <span className="t">{t.el && !t.play && !t.plan ? <SplitPill el={t.el} use={t} /> : L.tagTargetName(t)}{L.tagAgeText(t) ? ' · ' + L.tagAgeText(t) : ''}</span>
                  <span className="s">{L.placeLabel(t.place)}, so not {phrase}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }
  const pageCiv = u.seg === 'mine' ? u.me : u.opp;
  const setCheck = () => { savePrefs(); emit(); };
  return (
    <>
      <PageHead title="Check" aside={<UpkeepLink />} />
      <main className="main">
        <section className="block">
          <div className="versus">
            <div className="field"><label className="label" htmlFor="ck-me">You</label><CivSelect id="ck-me" value={u.me} onChange={(v) => { u.me = v; setCheck(); }} /></div>
            <button type="button" className="swap" data-act="ck-swap" aria-label="Swap sides" onClick={() => { [u.me, u.opp] = [u.opp, u.me]; setCheck(); }}><Icon name="swap" size={18} w={2} /></button>
            <div className="field"><label className="label right" htmlFor="ck-opp">Opponent</label><CivSelect id="ck-opp" value={u.opp} onChange={(v) => { u.opp = v; setCheck(); }} /></div>
          </div>
          <div className="field">
            <label className="label" htmlFor="ck-place">Map</label>
            <select id="ck-place" className="select" value={u.place} onChange={(e) => { u.place = e.target.value; setCheck(); }}>
              <option value="any:">Any map</option>
              <optgroup label="Any map of a type">{L.activeTypes().map((t) => <option key={t.id} value={'type:' + t.id}>Any {t.name.toLowerCase()} map</option>)}</optgroup>
              <MapGroups prefix="map:" />
            </select>
          </div>
          <Seg label="Show" act="ck-seg" options={[['plans', 'Game plans (' + tg.length + ')'], ['plays', 'Plays (' + tp.length + ')'], ['elements', 'Elements (' + te.length + ')'], ['mine', 'Your side (' + mineN + ')']]}
            current={u.seg} onPick={(v) => { u.seg = v; setCheck(); }} />
        </section>
        <section className="block">
          {body}
          <a className="btn btn-outline" href={'#civ-' + civSlug(pageCiv)}>{L.civShort(pageCiv)} page</a>
        </section>
      </main>
    </>
  );
}
