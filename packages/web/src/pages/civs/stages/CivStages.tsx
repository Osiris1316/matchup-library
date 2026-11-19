// One civ's stages: its plays per age, grouped by family, with the outline
// showing the evidence. Picking narrows the page: the rest of that age fades,
// and the other ages keep what a game plan, branch or logged game has with the
// picks. The rail beside it holds the game plans, your path and your answers.
// The picks and the map live in the address. Built for a wide screen; on a
// phone the rail and the ages stack and no lines are drawn.
import { useRef } from 'react';
import { useLocation } from 'react-router';
import {
  PLAN_STATUS_NAME, STAGE_AGES, STAGE_NAME, cardState, plural, togglePick,
  type Age, type CardState, type Picks, type Place, type StageCard, type StageColumn
} from '@matchup-library/core';
import { L, S, emit, savePrefs } from '../../../store';
import { paths, readCivView } from '../../../app/paths';
import { go } from '../../../app/navigation';
import { MapGroups } from '../../../components/bits';
import { StepPills } from '../../../components/Pill';
import { PlayCard, type CardOutline } from '../../../kit/play-card/PlayCard';
import { LineLayer, type Line } from '../../../kit/lines/LineLayer';
import { useMeasured } from '../../../kit/lines/useMeasured';
import { boxIn, linkBoxes } from '../../../kit/lines/geometry';
import { StagesRail } from './StagesRail';
import { StagesKey } from './StagesKey';
import { myCivFor, pickedAges, picksFrom, placeOk, planRows } from './view';
import s from './CivStages.module.css';

const OUTLINE: Record<StageCard['tier'], CardOutline> = { documented: 'solid', standard: 'solid', parts: 'dashed', open: 'faint' };

// Your answer to one of their plays, as the line under its card.
function answerLine(cid: string, me: string, age: Age, c: StageCard, vp: Place): { text: string; gap: boolean } | null {
  if (!me) return null;
  const hits = L.answersToPlay(me, cid, c.id, age, vp);
  if (hits.length) return { text: 'Your answer: ' + hits.map((x) => x.branch.name + (x.branch.status ? ' (' + PLAN_STATUS_NAME[x.branch.status] + ')' : '')).join(', '), gap: false };
  return c.tier === 'documented' || c.tier === 'standard' ? { text: 'No answer yet', gap: true } : null;
}

function Card({ cid, age, c, state, me, vp, onPick }: { cid: string; age: Age; c: StageCard; state: CardState; me: string; vp: Place; onPick: (age: Age, id: string) => void }) {
  const p = L.play(c.id);
  if (!p) return null;
  const ans = answerLine(cid, me, age, c, vp);
  return (
    <PlayCard name={p.name} badge={L.stageBadge(c)} steps={<StepPills steps={p.steps} />} note={c.blocked.length > 0 ? L.blockText(cid, c.blocked[0]!) : undefined}
      detail={ans ? ans.text : undefined} detailTone={ans && ans.gap ? 'gap' : 'normal'}
      outline={OUTLINE[c.tier]} picked={state === 'picked'} dimmed={state === 'dim'} anchor={age + ':' + c.id}
      data-tier={c.tier} data-state={state} data-act="stg-card" data-id={c.id} aria-pressed={state === 'picked'}
      onClick={() => onPick(age, c.id)} />
  );
}

function Column({ cid, col, stateOf, me, vp, onPick }: { cid: string; col: StageColumn; stateOf: (age: Age, id: string) => CardState; me: string; vp: Place; onPick: (age: Age, id: string) => void }) {
  const showOpen = S.ui.civ.showOpen;
  // Plays not seen stay hidden unless asked for, or picked, or on the picked path.
  const families = col.families
    .map((f) => ({ ...f, cards: f.cards.filter((c) => { const st = stateOf(col.age, c.id); return showOpen || c.tier !== 'open' || st === 'picked' || st === 'lit'; }) }))
    .filter((f) => f.cards.length);
  return (
    <div className={s.col} data-age={col.age}>
      {families.map((f) => (
        <div key={f.name} className={s.family}>
          <span className={'label ' + s.familyLabel}>{f.name}</span>
          {f.cards.map((c) => <Card key={c.id} cid={cid} age={col.age} c={c} state={stateOf(col.age, c.id)} me={me} vp={vp} onPick={onPick} />)}
        </div>
      ))}
      {!families.length && <p className="hint">{col.count ? 'Only plays not seen. Show them from the bar above.' : 'No ' + STAGE_NAME[col.age] + ' plays for ' + L.civShort(cid) + ' yet.'}</p>}
      {col.closed.length > 0 && <p className="hint">Not open to {L.civShort(cid)} in {STAGE_NAME[col.age]}: {col.closed.join(', ')}.</p>}
      {col.age === 'castle' && <p className="hint">Past early Castle the game comes down to fights and macro, so the library stops here for now.</p>}
    </div>
  );
}

// The path through the picks: from each picked card to the next age's, along
// the gutter between them. Measured from the page, so it follows cards of any height.
function measurePath(el: HTMLElement, picks: Picks): Line[] {
  const host = el.getBoundingClientRect();
  const at = (age: Age) => el.querySelector<HTMLElement>('[data-card="' + age + ':' + picks[age] + '"]');
  const out: Line[] = [];
  for (let i = 0; i + 1 < STAGE_AGES.length; i++) {
    const a = STAGE_AGES[i] as Age, b = STAGE_AGES[i + 1] as Age;
    if (!picks[a] || !picks[b]) continue;
    const ea = at(a), eb = at(b);
    if (!ea || !eb) continue;
    out.push({ d: linkBoxes(boxIn(ea.getBoundingClientRect(), host), boxIn(eb.getBoundingClientRect(), host)), tone: 'strong', weight: 'regular' });
  }
  return out;
}

export function CivStages({ cid, tabs }: { cid: string; tabs: React.ReactNode }) {
  const { search } = useLocation();
  const host = useRef<HTMLDivElement | null>(null);
  const view = readCivView(search);
  const placeKey = view.map || 'any:';
  const vp = placeOk(placeKey);
  const picks = picksFrom(view);
  const lines = useMeasured(host, (el) => measurePath(el, picks), [] as Line[]);
  const u = S.ui.civ;
  const me = myCivFor(cid);
  const { columns, plans } = L.civStages(cid, vp);
  const routes = L.civRoutes(cid, vp);
  const rows = planRows(plans, picks);
  const show = (next: { picks?: Picks; map?: string }) =>
    go(paths.civ(cid, 'stages', { ...(next.picks || picks), map: next.map ?? view.map }), { replace: true, keepScroll: true });
  const setPicks = (p: Picks) => show({ picks: p });
  const onPick = (age: Age, id: string) => setPicks(togglePick(picks, age, id));
  const stateOf = (age: Age, id: string) => cardState(routes, picks, age, id);
  const [dark, feudal, castle] = columns;
  const ways = (n: number, word: string) => (n === 1 ? '1 way ' : n + ' ways ') + word;
  const documented = plans.filter((x) => x.tier === 'documented').length;
  const summary = [ways(dark ? dark.count : 0, 'through Dark'), (feudal ? feudal.count : 0) + ' through Feudal', (castle ? castle.count : 0) + ' into early Castle'].join(', ')
    + '. ' + plural(documented, 'documented game plan') + '.';
  const narrowing = pickedAges(picks).length > 0;
  return (
    <div className={s.stages}>
      <div className={s.bar}>
        <div className="cv-tabs">{tabs}</div>
        <span className={s.summary}>{summary}</span>
        <button type="button" className={s.toggle} data-act="stg-open" aria-pressed={u.showOpen} onClick={() => { u.showOpen = !u.showOpen; savePrefs(); emit(); }}>
          {u.showOpen ? 'Hide plays not seen' : 'Show plays not seen'}
        </button>
        <label className="label" htmlFor="stg-place">Map</label>
        <select id="stg-place" className={'select ' + s.mapSelect} value={placeKey} onChange={(e) => show({ map: e.target.value })}>
          <option value="any:">Any map</option>
          <optgroup label="Any map of a type">{L.activeTypes().map((t) => <option key={t.id} value={'type:' + t.id}>Any {t.name.toLowerCase()} map</option>)}</optgroup>
          <MapGroups prefix="map:" />
        </select>
        <button type="button" className="btn btn-sm btn-outline" data-act="stg-key" aria-expanded={u.showKey} onClick={() => { u.showKey = !u.showKey; emit(); }}>How to read</button>
      </div>
      {u.showKey && <StagesKey />}
      <div className={s.board} ref={host} data-narrowing={narrowing ? '' : undefined}>
        <StagesRail cid={cid} vp={vp} placeKey={placeKey} picks={picks} rows={rows} routes={routes} me={me} setPicks={setPicks} />
        {columns.map((c) => (
          <span key={c.age} className={s.head} data-age={c.age}><span className={s.headName}>{STAGE_NAME[c.age]}</span><span className="sublabel">{c.count === 1 ? '1 way' : c.count + ' ways'}</span></span>
        ))}
        <span className={s.gutHead} data-gut="1">Age up</span>
        <span className={s.gutHead} data-gut="2">Age up</span>
        <span className={s.rule} data-gut="1" aria-hidden="true" />
        <span className={s.rule} data-gut="2" aria-hidden="true" />
        {columns.map((c) => <Column key={c.age} cid={cid} col={c} stateOf={stateOf} me={me} vp={vp} onPick={onPick} />)}
        <LineLayer lines={lines} />
      </div>
    </div>
  );
}
