// Versus: your game plan against theirs, side by side. Their spine runs along
// the top with their variants under it; your spine runs along the bottom with
// your branches above it; between them, where the two meet, age by age. Lines
// show where a branch leaves its spine and where it flows back, and a dashed
// line runs from what you scout on their side to the branch it sets off.
import { useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router';
import { AGES, PLAN_STATUS_NAME as STATUS_NAME, STAGE_AGES, STAGE_NAME, byName, isActive, isTested as tested, type Age, type Branch, type GamePlan } from '@matchup-library/core';
import { L, useStore } from '../../store';
import { openDef } from '../../actions';
import { hasLastPairing, lastPairing, openAnswer, openBranch, pairingFrom, rememberPairing, showPairing, swapSides } from '../../versus';
import { paths, type VersusPicks } from '../../app/paths';
import { CivSelect, PageHead } from '../../components/bits';
import { Icon } from '../../components/Icon';
import { StepPills } from '../../components/Pill';
import { PlayCard } from '../../kit/play-card/PlayCard';
import { LineLayer, type Line, type LineLabel } from '../../kit/lines/LineLayer';
import { useMeasured } from '../../kit/lines/useMeasured';
import { boxIn, elbow, type Box } from '../../kit/lines/geometry';

const ANY = { kind: 'any' as const };

// Game plans for one side: documented for that civ first, then the rest.
function PlanSelect({ id, civ, value, onPick, mine }: { id: string; civ: string; value: string; onPick: (v: string) => void; mine: boolean }) {
  const all = L.activePlans().slice().sort(byName);
  const st = civ ? L.civStages(civ, ANY).plans : [];
  const doc = st.filter((x) => x.tier === 'documented').map((x) => x.id);
  const parts = st.filter((x) => x.tier === 'parts').map((x) => x.id);
  const civName = civ ? L.civShort(civ) : '';
  const opt = (g: GamePlan) => <option key={g.id} value={g.id}>{g.name}</option>;
  return (
    <select id={id} className="select" value={value} onChange={(e) => {
      if (e.target.value === '__new') { openDef('gamePlans', null); return; }
      onPick(e.target.value);
    }}>
      <option value="">{mine ? 'Pick your game plan' : 'Pick their game plan'}</option>
      {doc.length > 0 && <optgroup label={'Documented for ' + civName}>{all.filter((g) => doc.includes(g.id)).map(opt)}</optgroup>}
      {parts.length > 0 && <optgroup label={'Possible for ' + civName + ' from its plays'}>{all.filter((g) => parts.includes(g.id)).map(opt)}</optgroup>}
      <optgroup label="Other game plans">{all.filter((g) => !doc.includes(g.id) && !parts.includes(g.id)).map(opt)}</optgroup>
      {mine && <option value="__new">New game plan</option>}
    </select>
  );
}

function Card({ lane, age, play, dashed, trigger }: { lane: string; age: Age; play: string; dashed: boolean; trigger?: boolean }) {
  const p = L.play(play);
  if (!p) return null;
  return (
    <PlayCard name={p.name} steps={<StepPills steps={p.steps} />} outline={dashed ? 'dashed' : 'solid'} fill={dashed ? 'page' : undefined} marked={trigger}
      anchor={lane + ':' + age} data-play={play} data-age={age} data-dashed={dashed ? '1' : '0'} data-act="vs-card" title={'Open ' + p.name}
      onClick={() => openDef('plays', play)} />
  );
}

// One lane: a label, then a cell for each age.
function Lane({ id, cls, label, cells }: { id: string; cls: string; label: React.ReactNode; cells: Partial<Record<Age, React.ReactNode>> }) {
  return (
    <div className={'vs-lane ' + cls} data-lane={id}>
      <div className="vs-label">{label}</div>
      {STAGE_AGES.map((a) => <div key={a} className="vs-cell" data-cell={a}><span className="sublabel phone-only">{STAGE_NAME[a]}</span>{cells[a]}</div>)}
    </div>
  );
}

function branchLabel(b: Branch, planId: string, side: 'mine' | 'theirs') {
  const rejoin = b.rejoins ? 'Rejoins in ' + STAGE_NAME[b.rejoins] : 'Doesn\'t rejoin';
  return (
    <>
      <button type="button" className="vs-bname" data-act="vs-branch" data-id={b.id} onClick={() => openBranch(planId, b.id, side)}>{b.name}</button>
      <span className="s">{b.trigger ? (side === 'mine' ? 'If you scout ' : 'Set off by ') + L.triggerText(b.trigger) : 'Variant'}. {rejoin}{b.status ? '. ' + STATUS_NAME[b.status] : ''}.</span>
    </>
  );
}

// The lines, measured from the page after layout: spines, branches leaving and
// rejoining, and dashed trigger lines with their labels.
interface Drawn { lines: Line[]; labels: LineLabel[] }
const NONE: Drawn = { lines: [], labels: [] };
const R = 10;
function measureBoard(el: HTMLElement, their: GamePlan, mine: GamePlan): Drawn {
  const host = el.getBoundingClientRect();
  const q = (sel: string): Box | null => { const n = el.querySelector<HTMLElement>(sel); return n ? boxIn(n.getBoundingClientRect(), host) : null; };
  const colLeft = (a: Age) => (q('[data-lane="ts"] [data-cell="' + a + '"]') || { l: 0 }).l;
  const lines: Line[] = [], labels: LineLabel[] = [];
  const sides: [string, string, GamePlan, boolean][] = [['ts', 'tb', their, false], ['ms', 'mb', mine, true]];
  sides.forEach(([spineId, prefix, g, isMine]) => {
    const lane = q('[data-lane="' + spineId + '"]');
    const label = q('[data-lane="' + spineId + '"] .vs-label');
    if (!lane || !label) return;
    const tone = isMine ? 'strong' as const : 'soft' as const;
    const y = lane.m;
    lines.push({ d: `M${label.r - 24} ${y} H${host.width - 8}`, tone, weight: 'heavy' });
    L.branchesOf(g.id).forEach((b) => {
      const ages = AGES.filter((a) => b.stages[a] && STAGE_AGES.includes(a));
      const first = ages[0], last = ages[ages.length - 1];
      if (!first || !last) return;
      const c1 = q('[data-card="' + prefix + ':' + b.id + ':' + first + '"]');
      const c2 = q('[data-card="' + prefix + ':' + b.id + ':' + last + '"]');
      if (!c1 || !c2) return;
      const xDep = colLeft(first) - 28;
      lines.push({ d: elbow(xDep - 1, y, xDep, c1.m, c1.l, R), tone, weight: 'bold' });
      if (b.rejoins && STAGE_AGES.includes(b.rejoins)) {
        const xRej = colLeft(b.rejoins) - 28;
        lines.push({ d: elbow(c2.r, c2.m, xRej, y, xRej + 1, R), tone, weight: 'bold' });
      } else {
        lines.push({ d: `M${c2.r} ${c2.m} H${c2.r + 18}`, tone, weight: 'bold' });
      }
      // Your trigger: from the first card on their side that shows it, to where this branch leaves.
      if (isMine && b.trigger) {
        const hit = [...el.querySelectorAll<HTMLElement>('[data-side="theirs"] [data-card]')].find((n) => L.triggerMatches(b.trigger, n.dataset.play || '', (n.dataset.age || 'dark') as Age));
        if (hit) {
          const h = boxIn(hit.getBoundingClientRect(), host);
          const sx = xDep < h.l ? h.l : xDep > h.r ? h.r : h.c;
          const d = (sx === h.c ? `M${xDep} ${h.b}` : `M${sx} ${h.m} H${xDep}`) + ` V${c1.m}`;
          lines.push({ d, tone: 'strong', weight: 'fine', dashed: true });
          labels.push({ x: xDep, y: ((sx === h.c ? h.b : h.m) + c1.m) / 2, text: 'You scout ' + L.triggerText({ ...b.trigger, civ: null }).replace(/ in [A-Z][a-z]+ Age$/, '').toLowerCase() });
        }
      }
    });
  });
  return { lines, labels };
}

function Board({ v, their, mine }: { v: VersusPicks; their: GamePlan; mine: GamePlan }) {
  const host = useRef<HTMLDivElement | null>(null);
  const drawn = useMeasured(host, (el) => measureBoard(el, their, mine), NONE);
  const ans = L.answerFor(their.id, mine.id, v.me || null, v.them || null);
  const a = ans ? ans[1] : null;
  const myBranches = L.branchesOf(mine.id);
  const theirBranches = L.branchesOf(their.id);
  // Their cards that one of your branches is waiting for.
  const watched = (play: string, age: Age) => myBranches.some((b) => L.triggerMatches(b.trigger, play, age));
  const spineCells = (g: GamePlan, lane: string, dashed: boolean, side: 'mine' | 'theirs') => {
    const out: Partial<Record<Age, React.ReactNode>> = {};
    STAGE_AGES.forEach((age) => {
      const st = g.stages[age];
      out[age] = st ? <Card lane={lane} age={age} play={st.play} dashed={dashed} trigger={side === 'theirs' && watched(st.play, age)} /> : <span className="vs-empty">Not set</span>;
    });
    return out;
  };
  const branchCells = (b: Branch, prefix: string, dashed: boolean, side: 'mine' | 'theirs') => {
    const out: Partial<Record<Age, React.ReactNode>> = {};
    STAGE_AGES.forEach((age) => {
      const st = b.stages[age];
      if (st) out[age] = <Card lane={prefix + ':' + b.id} age={age} play={st.play} dashed={dashed} trigger={side === 'theirs' && watched(st.play, age)} />;
    });
    return out;
  };
  const spineLabel = (g: GamePlan, civ: string, mineSide: boolean) => (
    <>
      <span className="t">{mineSide ? 'Your spine' : 'Their spine'}</span>
      <button type="button" className="vs-bname" data-act="vs-plan" data-id={g.id} onClick={() => openDef('gamePlans', g.id)}>{g.name}</button>
      <span className="s">{civ ? L.civShort(civ) : 'Any civ'}{mineSide && g.status ? '. ' + STATUS_NAME[g.status] : ''}</span>
    </>
  );
  const meet: Partial<Record<Age, React.ReactNode>> = {};
  STAGE_AGES.forEach((age) => {
    const n = a && a.ageNotes[age];
    meet[age] = n ? <button type="button" className="vs-note" data-act="vs-note" data-age={age} onClick={() => openAnswer(their.id, mine.id, v.me, v.them)}>{n}</button> : null;
  });
  return (
    <div className="vs-board" ref={host}>
      <LineLayer lines={drawn.lines} labels={drawn.labels} />
      <div className="vs-heads">
        <span />
        {STAGE_AGES.map((age) => <span key={age} className="label" data-cell={age}>{STAGE_NAME[age]}</span>)}
      </div>
      <div className="vs-side theirs" data-side="theirs">
        <Lane id="ts" cls="spine" label={spineLabel(their, v.them, false)} cells={spineCells(their, 'ts', false, 'theirs')} />
        {theirBranches.map((b) => <Lane key={b.id} id={'tb:' + b.id} cls="branch" label={branchLabel(b, their.id, 'theirs')} cells={branchCells(b, 'tb', false, 'theirs')} />)}
        <div className="vs-add"><button type="button" className="textlink" data-act="vs-add-variant" onClick={() => openBranch(their.id, null, 'theirs')}><Icon name="plus" size={14} w={2} /><span>Add a variant of theirs</span></button></div>
      </div>
      <Lane id="meet" cls="meet" label={
        <>
          <span className="t">Where they meet</span>
          <button type="button" className="vs-bname" data-act="vs-answer" onClick={() => openAnswer(their.id, mine.id, v.me, v.them)}>{a ? 'Edit the answer' : 'Write the answer'}</button>
          {a && <span className="s">{STATUS_NAME[a.status]}{a.myCiv || a.oppCiv ? '' : '. For any civs'}</span>}
        </>
      } cells={meet} />
      <div className="vs-side mine" data-side="mine">
        <div className="vs-add"><button type="button" className="textlink" data-act="vs-add-branch" onClick={() => openBranch(mine.id, null, 'mine')}><Icon name="plus" size={14} w={2} /><span>Add a branch: if you scout…</span></button></div>
        {myBranches.map((b) => <Lane key={b.id} id={'mb:' + b.id} cls="branch" label={branchLabel(b, mine.id, 'mine')} cells={branchCells(b, 'mb', !tested(b.status), 'mine')} />)}
        <Lane id="ms" cls="spine" label={spineLabel(mine, v.me, true)} cells={spineCells(mine, 'ms', !tested(mine.status), 'mine')} />
      </div>
    </div>
  );
}

export function VersusPage() {
  useStore();
  const { search } = useLocation();
  const v = pairingFrom(search);
  useEffect(() => { if (search) rememberPairing(v); });
  // /versus on its own reopens the last pairing.
  if (!search && hasLastPairing()) return <Navigate replace to={paths.versus(lastPairing())} />;
  const set = (patch: Partial<VersusPicks>) => showPairing({ ...v, ...patch }, true);
  const their = isActive(L.plan(v.their)) ? L.plan(v.their) : null;
  const mine = isActive(L.plan(v.mine)) ? L.plan(v.mine) : null;
  const ans = their && mine ? L.answerFor(their.id, mine.id, v.me || null, v.them || null) : null;
  return (
    <>
      <PageHead title="Versus" />
      <main className="main vs-main">
        <p className="hint">Pick a game plan for each side. Branches leave a spine when something is scouted, and flow back into it where they rejoin.</p>
        <div className="vs-pick">
          <div className="vs-side-pick">
            <span className="label">Them</span>
            <CivSelect id="vs-them" value={v.them} onChange={(x) => set({ them: x })} />
            <PlanSelect id="vs-their" civ={v.them} value={their ? their.id : ''} mine={false} onPick={(x) => set({ their: x })} />
          </div>
          <button type="button" className="icon-btn vs-swap" data-act="vs-swap" aria-label="Swap sides" title="Swap sides" onClick={() => swapSides(v)}><Icon name="swap" /></button>
          <div className="vs-side-pick">
            <span className="label">You</span>
            <CivSelect id="vs-me" value={v.me} onChange={(x) => set({ me: x })} />
            <PlanSelect id="vs-mine" civ={v.me} value={mine ? mine.id : ''} mine onPick={(x) => set({ mine: x })} />
          </div>
          <div className="vs-key">
            <span><span className="sw spine" />Spine</span>
            <span><span className="sw branch" />Branch</span>
            <span><span className="sw trigger" />What you scout</span>
            <span><span className="sw idea" />Your idea, untested</span>
          </div>
        </div>
        {their && mine
          ? <Board v={v} their={their} mine={mine} />
          : <p className="empty">{!their ? 'Pick their game plan. The list starts with the ones documented for ' + (v.them ? L.civShort(v.them) : 'their civ') + '.' : 'Pick your game plan, or make a new one from the list.'}</p>}
        {their && mine && (
          <section className="vs-answer panel">
            <span className="label">The answer</span>
            {ans
              ? <>
                  <span className="hint">{STATUS_NAME[ans[1].status]}{ans[1].myCiv || ans[1].oppCiv ? ', for ' + [ans[1].myCiv ? L.civShort(ans[1].myCiv) : 'any civ', ans[1].oppCiv ? L.civShort(ans[1].oppCiv) : 'any civ'].join(' against ') : ', for any civs'}.</span>
                  {ans[1].notes ? <p className="vs-notes">{ans[1].notes}</p> : <span className="hint">No notes yet.</span>}
                </>
              : <span className="hint">Nothing written for this pairing yet: the timing to beat, where the two meet, what's still to test.</span>}
            <button type="button" className="btn" data-act="vs-answer-open" onClick={() => openAnswer(their.id, mine.id, v.me, v.them)}>{ans ? 'Edit the answer' : 'Write the answer'}</button>
          </section>
        )}
      </main>
    </>
  );
}
