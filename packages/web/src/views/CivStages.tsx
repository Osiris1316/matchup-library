// One civ's stages: its plays per age, grouped by family, with the outline
// showing the evidence, and its game plans underneath. Picking a game plan
// lights up its plays and draws the path between them. Built for a wide
// screen; on a phone the ages stack and the path isn't drawn.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  STAGE_AGES, STAGE_NAME, isActive, parsePlace, plural, stagesOf, type Age, type ElType, type Intent, type Place, type StageCard, type StageColumn, type StagePlan
} from '@matchup-library/core';
import { L, S, emit, openSheet, type CivSel } from '../store';
import { openDef, openTagSheet } from '../actions';
import { openVersus } from '../versus';
import { MapGroups } from '../components/bits';
import { MiniPill, PillFace, StepPills } from '../components/Pill';

const TIER_WORD: Record<StageCard['tier'], string> = { documented: 'Standard or tagged', standard: 'Standard or tagged', parts: 'From parts, never seen together', open: 'Not seen: possible, nothing documented' };
const LEGEND_PILLS: { type: ElType; intent: Intent | null; name: string; text: string }[] = [
  { type: 'unit', intent: 'offensive', name: 'Unit', text: 'Red name: offensive' },
  { type: 'structure', intent: 'defensive', name: 'Structure', text: 'Blue name: defensive' },
  { type: 'economy', intent: 'economic', name: 'Economy', text: 'Green name: economic' },
  { type: 'age_tech', intent: null, name: 'Age-up', text: 'Grey name: no intent' }
];

function placeOk(key: string): Place {
  const vp = parsePlace(key);
  if ((vp.kind === 'type' && !isActive(L.mapType(vp.id))) || (vp.kind === 'map' && !isActive(L.map(vp.id)))) return { kind: 'any' };
  return vp;
}
const pick = (sel: CivSel | null) => { S.ui.civ.sel = sel; emit(); };
const same = (a: CivSel | null, b: CivSel) => !!a && a.kind === b.kind && a.id === b.id;

function Legend() {
  const u = S.ui.civ;
  return (
    <div className="stg-legend">
      <p className="hint">Each card is one way to play an age. Elements read left to right in the order they happen.</p>
      <span className="label">Tile is type, name is intent</span>
      <p className="hint">Tiles: yellow unit, grey structure, green economy, purple age-up, tech or landmark.</p>
      {LEGEND_PILLS.map((x) => (
        <span key={x.type} className="stg-key"><PillFace type={x.type} intent={x.intent} icon={null} name={x.name} /><span className="hint">{x.text}</span></span>
      ))}
      <p className="hint">The icon names the exact unit, building or landmark. The column gives the age, so names leave it out.</p>
      <span className="label">Card outline is evidence</span>
      {(['documented', 'parts', 'open'] as const).map((t) => (
        <span key={t} className="stg-key"><span className="stg-swatch" data-tier={t} /><span className="hint">{TIER_WORD[t]}</span></span>
      ))}
      <span className="stg-key"><span className="stg-swatch sel" /><span className="hint">Picked, with the plays of a picked game plan</span></span>
      <button type="button" className="textlink" data-act="stg-open" aria-pressed={u.showOpen} onClick={() => { u.showOpen = !u.showOpen; emit(); }}>
        <span>{u.showOpen ? 'Hide plays not seen' : 'Show plays not seen'}</span>
      </button>
    </div>
  );
}

function Card({ cid, age, c, lit }: { cid: string; age: Age; c: StageCard; lit: boolean }) {
  const p = L.play(c.id);
  if (!p) return null;
  const me: CivSel = { kind: 'play', id: c.id };
  return (
    <button type="button" className="stg-card" data-tier={c.tier} data-stg-card={age + ':' + c.id} data-act="stg-card" data-id={c.id} aria-pressed={lit}
      onClick={() => pick(same(S.ui.civ.sel, me) ? null : me)}>
      <span className="top"><span className="nm">{p.name}</span><span className="badge">{L.stageBadge(c)}</span></span>
      <StepPills steps={p.steps} />
      {c.blocked.length > 0 && <span className="warn-text small">{L.blockText(cid, c.blocked[0]!)}</span>}
    </button>
  );
}

function Column({ cid, col, lit }: { cid: string; col: StageColumn; lit: Set<string> }) {
  const showOpen = S.ui.civ.showOpen;
  const families = col.families.map((f) => ({ ...f, cards: f.cards.filter((c) => showOpen || c.tier !== 'open' || lit.has(c.id)) })).filter((f) => f.cards.length);
  return (
    <div className="stg-col" data-age={col.age}>
      {families.map((f) => (
        <div key={f.name} className="stg-fam">
          <span className="label">{f.name}</span>
          {f.cards.map((c) => <Card key={c.id} cid={cid} age={col.age} c={c} lit={lit.has(c.id)} />)}
        </div>
      ))}
      {!families.length && <p className="hint">{col.count ? 'Only plays not seen. Show them from the key.' : 'No ' + STAGE_NAME[col.age] + ' plays for ' + L.civShort(cid) + ' yet.'}</p>}
      {col.closed.length > 0 && <p className="hint">Not open to {L.civShort(cid)} in {STAGE_NAME[col.age]}: {col.closed.join(', ')}.</p>}
      {col.age === 'castle' && <p className="hint">Past early Castle the game comes down to fights and macro, so the library stops here for now.</p>}
    </div>
  );
}

// The path through a picked game plan's plays: right edge of one card, along the
// gutter, into the left edge of the next. Measured from the page, so it follows
// cards of any height.
function usePaths(host: React.RefObject<HTMLDivElement | null>, stages: { age: Age; play: string }[]): string[] {
  const [paths, setPaths] = useState<string[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  useLayoutEffect(() => {
    const el = host.current;
    const next: string[] = [];
    if (el && window.innerWidth >= 1100) {
      const box = el.getBoundingClientRect();
      const at = (s: { age: Age; play: string }) => el.querySelector<HTMLElement>('[data-stg-card="' + s.age + ':' + s.play + '"]');
      for (let i = 0; i + 1 < stages.length; i++) {
        const a = stages[i]!, b = stages[i + 1]!;
        if (STAGE_AGES.indexOf(b.age) !== STAGE_AGES.indexOf(a.age) + 1) continue;
        const ea = at(a), eb = at(b);
        if (!ea || !eb) continue;
        const ra = ea.getBoundingClientRect(), rb = eb.getBoundingClientRect();
        const x1 = ra.right - box.left, y1 = ra.top + ra.height / 2 - box.top;
        const x2 = rb.left - box.left, y2 = rb.top + rb.height / 2 - box.top;
        const xm = Math.round((x1 + x2) / 2);
        const dy = y2 - y1, r = Math.min(8, Math.abs(dy) / 2), s = dy > 0 ? 1 : -1;
        next.push(Math.abs(dy) < 1
          ? `M${x1} ${y1} H${x2}`
          : `M${x1} ${y1} H${xm - r} Q${xm} ${y1} ${xm} ${y1 + s * r} V${y2 - s * r} Q${xm} ${y2} ${xm + r} ${y2} H${x2}`);
      }
    }
    if (next.join('|') !== paths.join('|')) setPaths(next);
  });
  void tick;
  return paths;
}

function PlanRow({ cid, x, picked, hasPlay }: { cid: string; x: StagePlan; picked: boolean; hasPlay: boolean }) {
  const g = L.plan(x.id);
  if (!g) return null;
  const me: CivSel = { kind: 'plan', id: x.id };
  const best = x.ev[0];
  return (
    <button type="button" className={'stg-plan' + (hasPlay ? ' has-play' : '')} data-act="stg-plan" data-id={x.id} aria-pressed={picked} onClick={() => pick(picked ? null : me)}>
      <span className="pwho"><span className="nm">{g.name}</span><span className="s">{best ? L.evText(best, 'plan') : ''}</span></span>
      <span className="gutchev" data-gut="1" aria-hidden="true">›</span>
      <span className="gutchev" data-gut="2" aria-hidden="true">›</span>
      {STAGE_AGES.map((a) => {
        const st = g.stages[a];
        const p = st ? L.play(st.play) : null;
        const blocked = p ? L.cantDo(cid, p.steps, p.age) : [];
        return (
          <span key={a} className="cell" data-age={a}>
            <span className="sublabel phone-only">{STAGE_NAME[a]}</span>
            {p
              ? <>
                  <span className="spills mini">{p.steps.slice().sort((m, n) => m.step - n.step).map((s, i) => <MiniPill key={i} el={s.el} use={s} />)}</span>
                  <span className={blocked.length ? 'warn-text' : 'pn'}>{blocked.length ? 'Not open to ' + L.civShort(cid) + ': ' + p.name : p.name}</span>
                </>
              : <span className="muted">Not set</span>}
          </span>
        );
      })}
    </button>
  );
}

function Picked({ cid, sel, vp }: { cid: string; sel: CivSel; vp: Place }) {
  const isPlan = sel.kind === 'plan';
  const def = isPlan ? L.plan(sel.id) : L.play(sel.id);
  if (!def) return null;
  const field = isPlan ? 'plan' : 'play';
  const ev = L.evidence(field, cid, sel.id, vp).sort((a, b) => a.rank - b.rank);
  const lines = [...new Set(ev.map((e) => L.evText(e, field)))];
  const play = isPlan ? null : L.play(sel.id);
  const inPlans = play ? L.activePlans().filter((g) => stagesOf(g).some(({ stage }) => stage.play === play.id)) : [];
  const g = isPlan ? L.plan(sel.id) : null;
  return (
    <div className="stg-picked" aria-live="polite">
      <span className="label">{isPlan ? 'Game plan' : STAGE_NAME[(play as NonNullable<typeof play>).age] + ' play'}</span>
      <span className="nm">{def.name}</span>
      <span className="s">
        {lines.length ? lines.slice(0, 2).join('. ') + '.' : 'Nothing documented for ' + L.civShort(cid) + ' yet.'}
        {g && g.status ? ' Your status: ' + g.status + '.' : ''}
        {inPlans.length ? ' In ' + inPlans.map((x) => x.name).join(', ') + '.' : ''}
      </span>
      <span className="acts">
        <button type="button" className="btn btn-sm" data-act="stg-why" onClick={() => openSheet({ kind: 'why', itemKind: field, id: sel.id, civ: cid, place: S.ui.civ.place })}>Why</button>
        <button type="button" className="btn btn-sm" data-act="stg-tag" onClick={() => openTagSheet({ civ: cid, field, id: sel.id, place: vp })}>Tag {L.civShort(cid)}</button>
        <button type="button" className="btn btn-sm" data-act="stg-edit" onClick={() => openDef(isPlan ? 'gamePlans' : 'plays', sel.id)}>Edit</button>
        {isPlan && <button type="button" className="btn btn-sm" data-act="stg-versus" onClick={() => openVersus({ them: cid, their: sel.id })}>Answer it in Versus</button>}
        <button type="button" className="btn btn-sm btn-outline" data-act="stg-clear" onClick={() => pick(null)}>Clear</button>
      </span>
    </div>
  );
}

export function CivStages({ cid, tabs }: { cid: string; tabs: React.ReactNode }) {
  const u = S.ui.civ;
  if (u.selFor !== cid) { u.sel = null; u.selFor = cid; u.showParts = false; }
  const vp = placeOk(u.place);
  const { columns, plans } = L.civStages(cid, vp);
  // A picked item that's gone (retired, or no longer listed) drops out.
  if (u.sel && !(u.sel.kind === 'plan' ? isActive(L.plan(u.sel.id)) : isActive(L.play(u.sel.id)))) u.sel = null;
  const sel = u.sel;
  const selPlan = sel && sel.kind === 'plan' ? L.plan(sel.id) : null;
  const stages = selPlan ? stagesOf(selPlan).filter(({ age }) => STAGE_AGES.includes(age)).map(({ age, stage }) => ({ age, play: stage.play })) : [];
  const lit = new Set<string>(selPlan ? stages.map((s) => s.play) : sel ? [sel.id] : []);
  const host = useRef<HTMLDivElement | null>(null);
  const paths = usePaths(host, stages);
  const documented = plans.filter((x) => x.tier === 'documented');
  const parts = plans.filter((x) => x.tier === 'parts');
  // A picked game plan that isn't documented here still shows, at the top of its list.
  const shownParts = u.showParts ? parts : parts.filter((x) => selPlan && x.id === selPlan.id);
  const [dark, feudal, castle] = columns;
  const ways = (n: number, word: string) => (n === 1 ? '1 way ' : n + ' ways ') + word;
  const summary = [ways(dark ? dark.count : 0, 'through Dark'), (feudal ? feudal.count : 0) + ' through Feudal', (castle ? castle.count : 0) + ' into early Castle'].join(', ')
    + '. ' + plural(documented.length, 'documented game plan') + '.';
  const hasPlay = (gid: string) => !!sel && sel.kind === 'play' && stagesOf(L.plan(gid)).some(({ stage }) => stage.play === sel.id);
  return (
    <>
      <div className="stg-bar">
        <div className="cv-tabs">{tabs}</div>
        <span className="stg-summary">{summary}</span>
        <label className="label" htmlFor="stg-place">Map</label>
        <select id="stg-place" className="select stg-select" value={u.place} onChange={(e) => { u.place = e.target.value; emit(); }}>
          <option value="any:">Any map</option>
          <optgroup label="Any map of a type">{L.activeTypes().map((t) => <option key={t.id} value={'type:' + t.id}>Any {t.name.toLowerCase()} map</option>)}</optgroup>
          <MapGroups prefix="map:" />
        </select>
      </div>
      {sel && <Picked cid={cid} sel={sel} vp={vp} />}
      <div className="stg" ref={host}>
        <span className="stg-h legend-h label">How to read</span>
        {columns.map((c) => (
          <span key={c.age} className="stg-h" data-age={c.age}><span className="t">{STAGE_NAME[c.age]}</span><span className="sublabel">{c.count === 1 ? '1 way' : c.count + ' ways'}</span></span>
        ))}
        <span className="stg-h gut" data-gut="1">Age up</span>
        <span className="stg-h gut" data-gut="2">Age up</span>
        <Legend />
        <span className="stg-rule" data-gut="1" aria-hidden="true" />
        <span className="stg-rule" data-gut="2" aria-hidden="true" />
        {columns.map((c) => <Column key={c.age} cid={cid} col={c} lit={lit} />)}
        {paths.length > 0 && (
          <svg className="stg-lines" aria-hidden="true">{paths.map((d, i) => <path key={i} d={d} />)}</svg>
        )}
      </div>
      <section className="stg-plans" aria-label="Game plans">
        <div className="stg-plans-h">
          <h2 className="label">Game plans</h2>
          {STAGE_AGES.map((a) => <span key={a} className="label" data-age={a}>{STAGE_NAME[a]}</span>)}
        </div>
        {documented.map((x) => <PlanRow key={x.id} cid={cid} x={x} picked={!!selPlan && selPlan.id === x.id} hasPlay={hasPlay(x.id)} />)}
        {!documented.length && <p className="hint stg-none">No game plans documented for {L.civShort(cid)} {vp.kind === 'any' ? 'yet' : L.placePhrase(vp)}. Tag one, or log a game where they ran it.</p>}
        {shownParts.map((x) => <PlanRow key={x.id} cid={cid} x={x} picked={!!selPlan && selPlan.id === x.id} hasPlay={hasPlay(x.id)} />)}
        {parts.length > 0 && (
          <button type="button" className="textlink stg-more" data-act="stg-parts" aria-expanded={u.showParts} onClick={() => { u.showParts = !u.showParts; emit(); }}>
            <span className="label">Possible from their plays</span><span>{u.showParts ? 'Hide' : 'Show ' + parts.length + ' more'}</span>
          </button>
        )}
      </section>
    </>
  );
}
