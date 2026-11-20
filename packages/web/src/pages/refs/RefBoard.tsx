// A reference on the age board: what each side did in Dark, Feudal and early
// Castle, and nothing else. A game has two lanes, them above and the player
// below, as on Versus; a guide has a lane per civ it shows. Every card opens
// its moment, for the time, how it went and notes.
//
// Picking: each lane also offers what its civ could do in each age, with what
// goes with the lane's path first, as on a civ's page. A pick goes straight in
// as a moment; a game plan fills every age it has a stage in.
import { useState, type ReactNode } from 'react';
import {
  STAGE_AGES, STAGE_NAME, byName, cardState, fmtTime,
  type Age, type CardState, type Moment, type Picks, type Route, type StageTier
} from '@matchup-library/core';
import { L } from '../../store';
import { openMoment, pickMoment, type RefCtx } from '../../actions';
import { CivSelect } from '../../components/bits';
import { FlagOr } from '../../components/Flag';
import { SplitPill, StepPills } from '../../components/Pill';
import { OUTCOME } from '../../components/refs';
import { AgeBoard, type BoardLaneProps } from '../../kit/age-board/AgeBoard';
import { PlayCard } from '../../kit/play-card/PlayCard';
import { boxIn, linkBoxes } from '../../kit/lines/geometry';
import type { Line } from '../../kit/lines/LineLayer';
import { lanePicks, placeMoments, playsIn, type BoardItem, type Placed } from './board';
import s from './Refs.module.css';

const ANY = { kind: 'any' as const };
const COLUMNS = STAGE_AGES.map((a) => ({ id: a, name: STAGE_NAME[a] }));

interface Lane {
  id: string;
  // A game's side, or a guide's civ (null for moments tied to no civ).
  side?: 'player' | 'opponent';
  civ: string | null;
  who: string;
  extra?: string;
  moments: Moment[];
}

export function refLanes(r: RefCtx, extraCivs: string[] = []): Lane[] {
  if (r.kind === 'game') {
    const g = r.g;
    const runBy = new Map((g.plays || []).map((p) => [p.pid, p.runBy]));
    const mos = L.gameMoments(r.id, g);
    const result = g.result ? (g.result === 'win' ? 'Won' : 'Lost') : '';
    return [
      { id: 'opponent', side: 'opponent', civ: g.oppCiv, who: g.oppName || (g.mine ? 'Your opponent' : 'Their opponent'), moments: mos.filter((m) => runBy.get(m.key) === 'opponent') },
      { id: 'player', side: 'player', civ: g.playerCiv, who: g.mine ? 'You' : g.playerName || 'The player', extra: result, moments: mos.filter((m) => runBy.get(m.key) !== 'opponent') }
    ];
  }
  // As on Versus, the civ the guide is about sits at the bottom, as your side,
  // with what it plays against above it.
  const mos = L.guideMoments(r.l);
  const own = r.l.civ || null;
  const civs: (string | null)[] = [];
  const add = (c: string | null) => { if (!civs.includes(c) && !(own && c === own)) civs.push(c); };
  mos.forEach((m) => add(m.civ || null));
  extraCivs.forEach(add);
  if (own) civs.push(own);
  if (!civs.length) civs.push(null);
  return civs.map((c) => ({ id: c || 'any', civ: c, who: c ? '' : 'Not one civ', moments: mos.filter((m) => (m.civ || null) === c) }));
}

const lookup = {
  playAge: (id: string) => L.play(id)?.age || null,
  planStages: (id: string) => {
    const g = L.plan(id);
    const out: Partial<Record<Age, string>> = {};
    if (g) STAGE_AGES.forEach((a) => { const st = g.stages[a]; if (st && st.play) out[a] = st.play; });
    return out;
  },
  elAges: (id: string) => L.elAges(id)
};

export function placeLane(l: Lane): Placed {
  return placeMoments(l.moments.map((m) => ({ key: m.key, i: m.i, at: m.at, planId: m.planId, playId: m.playId, elementId: m.elementId, age: m.age })), lookup);
}

// One card: a play (its own moment, or a stage of a game plan's) or an element.
function ItemCard({ it, mo, anchor }: { it: BoardItem; mo: Moment | undefined; anchor: string }) {
  const time = it.kind === 'el' || !it.via ? (it.at != null ? fmtTime(it.at) : null) : null;
  const said = mo ? [mo.outcome ? OUTCOME[mo.outcome] : '', mo.note].filter(Boolean).join(' · ') : '';
  const common = { anchor, badge: time, 'data-act': 'ref-card', 'data-key': it.key, onClick: () => openMoment(it.key) };
  if (it.kind === 'el') {
    return <PlayCard {...common} name={L.elName(it.el)} steps={<SplitPill el={it.el} use={mo} />} detail={said || undefined} data-el={it.el} title={'Open this moment: ' + L.elName(it.el)} />;
  }
  const p = L.play(it.play);
  if (!p) return null;
  const detail = it.via ? 'In ' + L.planTitle(it.via) : said || undefined;
  return <PlayCard {...common} name={p.name} steps={<StepPills steps={p.steps} />} detail={detail} data-play={it.play} data-via={it.via || undefined} title={'Open this moment: ' + p.name} />;
}

// What a lane could add in one age: its civ's plays, what goes with the path first.
const TIER_RANK: Record<StageTier, number> = { documented: 0, standard: 1, parts: 2, open: 3 };
interface Option { id: string; family: string; tier: StageTier; state: CardState }

function laneOptions(civ: string | null, age: Age, taken: Set<string>, routes: Route[] | null, picks: Picks): Option[] {
  let opts: Omit<Option, 'state'>[];
  if (civ) {
    const col = L.civStages(civ, ANY).columns.find((c) => c.age === age);
    opts = col ? col.families.flatMap((f) => f.cards.map((c) => ({ id: c.id, family: f.name, tier: c.tier }))) : [];
  } else {
    opts = L.activePlays().filter((p) => p.age === age).sort((a, b) => a.family.localeCompare(b.family) || byName(a, b)).map((p) => ({ id: p.id, family: p.family, tier: 'documented' as StageTier }));
  }
  const withState = opts.filter((o) => !taken.has(o.id)).map((o, i) => ({ ...o, i, state: routes ? cardState(routes, picks, age, o.id) : 'free' as CardState }));
  return withState.sort((a, b) => Number(b.state === 'lit') - Number(a.state === 'lit') || TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.i - b.i);
}

function Options({ r, lane, age, placed, routes, picks }: { r: RefCtx; lane: Lane; age: Age; placed: Placed; routes: Route[] | null; picks: Picks }) {
  const [all, setAll] = useState(false);
  const opts = laneOptions(lane.civ, age, playsIn(placed, age), routes, picks);
  const keep = (o: Option) => o.state === 'lit' || o.tier !== 'open';
  const shown = all ? opts : opts.filter(keep);
  const hidden = opts.length - opts.filter(keep).length;
  return (
    <div className={s.options} data-options={lane.id + ':' + age}>
      <span className={s.optionsHead}>{shown.length ? 'Add' : 'Nothing seen for ' + (lane.civ ? L.civShort(lane.civ) : 'this age')}</span>
      {shown.map((o) => {
        const p = L.play(o.id);
        if (!p) return null;
        return (
          <button key={o.id} type="button" className={s.option} data-act="ref-pick" data-play={o.id} data-for={lane.id} data-state={o.state} data-tier={o.tier}
            onClick={() => pickMoment(r, { side: lane.side, civ: lane.civ }, { playId: o.id })}>
            <span className={s.optionName}>{p.name}<span className={s.optionFamily}>{o.family}</span></span>
            <StepPills steps={p.steps} mini />
          </button>
        );
      })}
      {hidden > 0 && (
        <button type="button" className={'textlink ' + s.more} data-act="ref-more" aria-expanded={all} onClick={() => setAll(!all)}>
          <span>{all ? 'Hide plays not seen' : 'Show ' + hidden + ' not seen for ' + (lane.civ ? L.civShort(lane.civ) : 'this civ')}</span>
        </button>
      )}
    </div>
  );
}

// Game plans a lane could add: documented for its civ first.
function PlanPick({ r, lane }: { r: RefCtx; lane: Lane }) {
  const all = L.activePlans().slice().sort(byName);
  const st = lane.civ ? L.civStages(lane.civ, ANY).plans : [];
  const doc = st.filter((x) => x.tier === 'documented').map((x) => x.id);
  const parts = st.filter((x) => x.tier === 'parts').map((x) => x.id);
  const civName = lane.civ ? L.civShort(lane.civ) : '';
  const opt = (id: string) => <option key={id} value={id}>{L.planTitle(id)}</option>;
  return (
    <select className={'select ' + s.planPick} data-act="ref-plan-pick" data-for={lane.id} value="" aria-label={'Add a game plan for ' + (lane.civ ? L.civName(lane.civ) : 'this lane')}
      onChange={(e) => { if (e.target.value) pickMoment(r, { side: lane.side, civ: lane.civ }, { planId: e.target.value }); }}>
      <option value="">Add a whole game plan</option>
      {doc.length > 0 && <optgroup label={'Documented for ' + civName}>{doc.map(opt)}</optgroup>}
      {parts.length > 0 && <optgroup label={'Possible for ' + civName + ' from its plays'}>{parts.map(opt)}</optgroup>}
      <optgroup label={lane.civ ? 'Other game plans' : 'Game plans'}>{all.filter((g) => !doc.includes(g.id) && !parts.includes(g.id)).map((g) => opt(g.id))}</optgroup>
    </select>
  );
}

function LaneHead({ lane, placed, byKey }: { lane: Lane; placed: Placed; byKey: Map<string, Moment> }) {
  return (
    <>
      <span className={s.laneWho}>
        {lane.civ && <FlagOr id={lane.civ} />}
        <span className={s.laneCiv}>{lane.civ ? L.civName(lane.civ) : lane.side ? 'Civ not set' : 'Any civ'}</span>
        {lane.who && <span className={s.laneMeta}>{lane.who}</span>}
        {lane.extra && <span className={s.laneMeta}>{lane.extra}</span>}
      </span>
      {placed.plans.map((m) => {
        const mo = byKey.get(m.key);
        return (
          <span key={m.key} className={s.lanePlan}>
            Game plan{' '}
            <button type="button" className={s.lanePlanBtn} data-act="ref-plan" data-key={m.key} onClick={() => openMoment(m.key)}>{L.planTitle(m.planId)}</button>
            {m.at != null && <span className={s.laneMeta}>{fmtTime(m.at)}</span>}
            {mo && mo.outcome && <span className={s.laneMeta}>{OUTCOME[mo.outcome]}</span>}
          </span>
        );
      })}
    </>
  );
}

export function RefBoard({ r, picking }: { r: RefCtx; picking: boolean }) {
  const [extraCivs, setExtraCivs] = useState<string[]>([]);
  const lanes = refLanes(r, picking ? extraCivs : []);
  const placedBy = new Map(lanes.map((l) => [l.id, placeLane(l)]));
  const byKey = new Map(lanes.flatMap((l) => l.moments.map((m) => [m.key, m] as const)));
  const boardLanes: BoardLaneProps[] = lanes.map((lane) => {
    const placed = placedBy.get(lane.id) as Placed;
    const routes = picking && lane.civ ? L.civRoutes(lane.civ, ANY) : null;
    const picks = lanePicks(placed);
    const empty = STAGE_AGES.every((a) => !(placed.cells[a] || []).length);
    const cells: Partial<Record<string, ReactNode>> = {};
    STAGE_AGES.forEach((age) => {
      const items = placed.cells[age] || [];
      cells[age] = (
        <>
          {items.map((it, n) => <ItemCard key={it.key + ':' + n} it={it} mo={byKey.get(it.key)} anchor={lane.id + ':' + age + ':' + n} />)}
          {picking && <Options r={r} lane={lane} age={age} placed={placed} routes={routes} picks={picks} />}
        </>
      );
    });
    const foot = picking
      ? <>
          <PlanPick r={r} lane={lane} />
          <button type="button" className={'textlink ' + s.footLink} data-act="mo-new" data-for={lane.id} onClick={() => openMoment(null, { side: lane.side, civ: lane.civ || '' })}>
            <span>Something else: an element, or a play that isn't in the library</span>
          </button>
        </>
      : empty ? <span className="hint">Nothing logged for this side yet.</span> : undefined;
    return { id: lane.id, head: <LaneHead lane={lane} placed={placed} byKey={byKey} />, cells, foot };
  });
  // A line through each lane's path: from the first card in one age to the first in the next.
  const measure = (el: HTMLElement): Line[] => {
    const host = el.getBoundingClientRect();
    const out: Line[] = [];
    lanes.forEach((lane) => {
      const firsts = STAGE_AGES.map((a) => el.querySelector<HTMLElement>('[data-card="' + lane.id + ':' + a + ':0"]')).filter((n): n is HTMLElement => !!n);
      for (let i = 1; i < firsts.length; i++) {
        const a = boxIn((firsts[i - 1] as HTMLElement).getBoundingClientRect(), host), b = boxIn((firsts[i] as HTMLElement).getBoundingClientRect(), host);
        out.push({ d: linkBoxes(a, b), tone: lane.side === 'player' ? 'strong' : 'soft', weight: 'regular' });
      }
    });
    return out;
  };
  const guideAdd = picking && r.kind === 'guide'
    ? <div className={s.addCiv}>
        <CivSelect id="ref-add-civ" value="" empty="Add another civ the guide shows" onChange={(c) => { if (c && !extraCivs.includes(c)) setExtraCivs([...extraCivs, c]); }} />
      </div>
    : null;
  return <AgeBoard columns={COLUMNS} lanes={boardLanes} measure={measure} label="What happened, age by age" after={guideAdd} />;
}

// Moments with no place on the board, for the list under it.
export function unplacedOf(r: RefCtx): { lane: Lane; mo: Moment }[] {
  const lanes = refLanes(r);
  const byKey = new Map(lanes.flatMap((l) => l.moments.map((m) => [m.key, { lane: l, mo: m }] as const)));
  return lanes.flatMap((l) => placeLane(l).unplaced).map((m) => byKey.get(m.key)).filter((x): x is { lane: Lane; mo: Moment } => !!x)
    .sort((a, b) => (a.mo.at == null ? 1e9 : a.mo.at) - (b.mo.at == null ? 1e9 : b.mo.at) || a.mo.i - b.mo.i);
}

