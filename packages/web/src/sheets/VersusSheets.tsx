// The branch sheet (a detour off a game plan) and the answer sheet (your
// game plan against theirs).
import { AGES, STAGE_AGES, STAGE_NAME, byName, isActive, type Age, type PlanStatus } from '@matchup-library/core';
import { L, S, bind, emit, type AnswerSheet as AnswerSheetT, type BranchDraft, type BranchSheet as BranchSheetT } from '../store';
import { elementGroups, openDef } from '../actions';
import { branchFromDraft, deleteAnswer, deleteBranch, saveAnswer, saveBranch } from '../versus';
import { AgeSeg } from '../components/pickers';
import { CloseBtn, Field, Seg, SheetBack } from '../components/bits';
import { StepPills } from '../components/Pill';
import { Flag } from '../components/Flag';

const STATUS: [PlanStatus | '', string][] = [['', 'Not set'], ['idea', 'Idea'], ['studying', 'Studying'], ['practiced', 'Practiced'], ['proven', 'Proven']];

// A play for one age of the branch, with notes on how it's run there.
function BranchStage({ sh, age }: { sh: BranchSheetT; age: Age }) {
  const d = sh.draft;
  const st = d.stages[age] || null;
  const plays = L.activePlays(age);
  const cur = st && st.play ? L.play(st.play) : null;
  const fams = [...new Set(plays.map((p) => p.family || 'Other'))];
  const id = 'br-st-' + age;
  const setPlay = (v: string) => {
    if (v === '__new') { openDef('plays', null, { age, back: sh, stageFor: age }); return; }
    if (v) d.stages[age] = { play: v, notes: st ? st.notes : '' }; else delete d.stages[age];
    emit();
  };
  const spine = L.plan(d.planId)?.stages[age];
  return (
    <div className="field stage">
      <label className="label" htmlFor={id}>{STAGE_NAME[age]}</label>
      <select id={id} className="select" value={st ? st.play : ''} onChange={(e) => setPlay(e.target.value)}>
        <option value="">{spine ? 'The spine\'s play: ' + L.playTitle(spine.play) : 'Nothing here'}</option>
        {cur && !isActive(cur) && <option value={cur.id}>{cur.name} (retired)</option>}
        {fams.map((f) => (
          <optgroup key={f} label={f}>
            {plays.filter((p) => (p.family || 'Other') === f).sort(byName).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </optgroup>
        ))}
        <option value="__new">New {STAGE_NAME[age]} play</option>
      </select>
      {cur && <span className="stage-steps"><StepPills steps={cur.steps} /></span>}
      {st && <textarea id={id + '-notes'} className="textarea" rows={2} aria-label={'How the branch is run in ' + STAGE_NAME[age]} placeholder="How it's run here: timings, what to watch for"
        value={st.notes} onChange={(e) => { st.notes = e.target.value; emit(); }} />}
    </div>
  );
}

function TriggerField({ d }: { d: BranchDraft }) {
  const opts: ['none' | 'el' | 'play', string][] = [['el', 'An element'], ['play', 'A play'], ['none', 'Nothing: a variant']];
  return (
    <div className="field">
      <span className="label">{d.side === 'mine' ? 'When you scout' : 'Set off by'}</span>
      <Seg label="Trigger" act="br-trigger" options={opts} current={d.trigger} onPick={(v) => { d.trigger = v; emit(); }} />
      {d.trigger === 'el' && <>
        <select id="br-el" className="select" aria-label="Element you scout" {...bind(d, 'el')}>
          <option value="">Pick an element</option>
          {elementGroups().map((g) => <optgroup key={g.name} label={g.name}>{g.items.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</optgroup>)}
        </select>
        <AgeSeg act="br-el-age" value={d.elAge} onPick={(a) => { d.elAge = a; emit(); }} />
      </>}
      {d.trigger === 'play' && (
        <select id="br-play" className="select" aria-label="Play you scout" {...bind(d, 'play')}>
          <option value="">Pick a play</option>
          {STAGE_AGES.map((a) => <optgroup key={a} label={STAGE_NAME[a]}>{L.activePlays(a).sort(byName).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>)}
        </select>
      )}
      {d.trigger !== 'none' && (
        <select id="br-civ" className="select" aria-label="Only against this civ" {...bind(d, 'civ')}>
          <option value="">Against any civ</option>
          {L.activeCivs().map((c) => <option key={c.id} value={c.id}>Only against {c.name}</option>)}
        </select>
      )}
      <span className="hint">{d.trigger === 'none'
        ? 'A variant: another way the same game plan goes, with nothing scouted to set it off. Usually for an opponent\'s game plan.'
        : 'Keyed on what you see, not on the whole game plan, so the branch works against every game plan that shows it.'}</span>
    </div>
  );
}

export function BranchSheet({ sh }: { sh: BranchSheetT }) {
  const d = sh.draft;
  const g = L.plan(d.planId);
  if (!g) return <><div className="sheet-head"><h2 id="sheet-title">Branch</h2><CloseBtn /></div><p className="hint">That game plan is gone.</p></>;
  const b = branchFromDraft(d);
  const problems = L.branchProblems(b);
  const covered = AGES.filter((a) => b.stages[a]);
  const last = covered[covered.length - 1];
  const rejoinOpts: [Age | '', string][] = [['', 'Doesn\'t rejoin'], ...STAGE_AGES.filter((a) => !last || AGES.indexOf(a) > AGES.indexOf(last)).map((a) => [a, STAGE_NAME[a]] as [Age, string])];
  if (d.rejoins && !rejoinOpts.some(([v]) => v === d.rejoins)) d.rejoins = '';
  return (
    <>
      <div className="sheet-head"><SheetBack /><h2 id="sheet-title">{d.id ? 'Branch' : 'New ' + (d.side === 'mine' ? 'branch' : 'variant')}</h2><CloseBtn /></div>
      <p className="hint">Off <span className="strong">{g.name}</span>.</p>
      <Field id="br-name" label="Name"><input id="br-name" className="input" type="text" autoComplete="off" placeholder={d.side === 'mine' ? 'e.g. Push the spears away' : 'e.g. Spears first'} {...bind(d, 'name')} /></Field>
      <TriggerField d={d} />
      <div className="field"><span className="label">The branch, age by age</span><span className="hint">Pick a play for each age the branch changes. Ages left as the spine's play stay on the spine.</span></div>
      {STAGE_AGES.map((a) => <BranchStage key={a} sh={sh} age={a} />)}
      <div className="field"><span className="label">Rejoins the spine in</span>
        <Seg label="Rejoins" act="br-rejoin" options={rejoinOpts} current={d.rejoins} onPick={(v) => { d.rejoins = v; emit(); }} />
        <span className="hint">{d.rejoins ? 'From ' + STAGE_NAME[d.rejoins] + ' on, back to ' + (g.stages[d.rejoins] ? L.playTitle(g.stages[d.rejoins]?.play) : 'the spine') + '.' : 'It takes over the rest of the game. If that\'s always so, it may be a game plan of its own.'}</span>
      </div>
      <Field id="br-tells" label="Tells"><textarea id="br-tells" className="textarea" rows={2} placeholder="What you see that confirms it" {...bind(d, 'tells')} /></Field>
      <Field id="br-notes" label="Notes"><textarea id="br-notes" className="textarea" rows={2} {...bind(d, 'notes')} /></Field>
      <div className="field"><span className="label">Status</span><Seg label="Status" act="br-status" options={STATUS} current={d.status} onPick={(v) => { d.status = v; emit(); }} /></div>
      {problems.length > 0 && <div className="blocks">{problems.map((p) => <span key={p} className="warn-text block-line">{p}</span>)}</div>}
      <div className="btn-row sheet-foot">
        {d.id
          ? <button type="button" className="btn btn-danger" data-act="br-delete" onClick={() => deleteBranch()}>Delete</button>
          : <button type="button" className="btn" data-act="sheet-close" onClick={() => { S.sheet = sh.back || null; emit(); }}>{sh.back ? 'Back' : 'Cancel'}</button>}
        <button type="button" className="btn btn-primary" data-act="br-save" onClick={() => saveBranch()}>{d.id ? 'Save' : 'Add'}</button>
      </div>
    </>
  );
}

export function AnswerSheet({ sh }: { sh: AnswerSheetT }) {
  const d = sh.draft;
  return (
    <>
      <div className="sheet-head"><SheetBack /><h2 id="sheet-title">{d.id ? 'Answer' : 'New answer'}</h2><CloseBtn /></div>
      <p className="hint">
        <span className="strong">{L.planTitle(d.myPlan)}</span> against <span className="strong">{L.planTitle(d.theirPlan)}</span>.
      </p>
      <div className="field"><span className="label">Status</span><Seg label="Status" act="an-status" options={STATUS.slice(1) as [PlanStatus, string][]} current={d.status} onPick={(v) => { d.status = v; emit(); }} /></div>
      <div className="field"><span className="label">Where they meet</span><span className="hint">What happens between the two, age by age. Shown between the lanes.</span></div>
      {STAGE_AGES.map((a) => (
        <Field key={a} id={'an-' + a} label={STAGE_NAME[a]}>
          <textarea id={'an-' + a} className="textarea" rows={2} placeholder={a === 'castle' ? 'e.g. Their flood meets your crossbows. Be ready by about 9:00.' : ''}
            value={d.ageNotes[a] || ''} onChange={(e) => { d.ageNotes[a] = e.target.value; emit(); }} />
        </Field>
      ))}
      <Field id="an-notes" label="Notes"><textarea id="an-notes" className="textarea" rows={3} placeholder="The timing to beat, what to test, what's still open" {...bind(d, 'notes')} /></Field>
      <div className="field">
        <span className="label">Applies to</span>
        {d.myCiv && <label className="check plain"><input type="checkbox" id="an-only-mine" checked={d.onlyMine} onChange={(e) => { d.onlyMine = e.target.checked; emit(); }} />
          <span className="txt"><Flag id={d.myCiv} /> Only when you're {L.civName(d.myCiv, d.myCiv)}</span></label>}
        {d.oppCiv && <label className="check plain"><input type="checkbox" id="an-only-theirs" checked={d.onlyTheirs} onChange={(e) => { d.onlyTheirs = e.target.checked; emit(); }} />
          <span className="txt"><Flag id={d.oppCiv} /> Only when they're {L.civName(d.oppCiv, d.oppCiv)}</span></label>}
        <span className="hint">Untick to use the same answer whichever civ runs the game plan.</span>
      </div>
      <div className="btn-row sheet-foot">
        {d.id
          ? <button type="button" className="btn btn-danger" data-act="an-delete" onClick={() => deleteAnswer()}>Delete</button>
          : <button type="button" className="btn" data-act="sheet-close" onClick={() => { S.sheet = sh.back || null; emit(); }}>Cancel</button>}
        <button type="button" className="btn btn-primary" data-act="an-save" onClick={() => saveAnswer()}>{d.id ? 'Save' : 'Add'}</button>
      </div>
    </>
  );
}
