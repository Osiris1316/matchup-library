// A reference's details, and one moment in it.
import { byName, guideTitle, isActive, linkHint, timed, type Outcome, type Prep, type Shows } from '@matchup-library/core';
import { L, S, bind, closeSheet, emit, type MomentSheet as MomentSheetT, type RefKind, type RefSheet as RefSheetT, type Side } from '../store';
import { deleteMoment, deleteRef, saveMoment, saveRefDetails } from '../actions';
import { Flag } from '../components/Flag';
import { Builder } from '../components/pickers';
import { PlanStages } from '../components/Pill';
import { CivSelect, CloseBtn, Field, MapGroups, Seg } from '../components/bits';
import { GameTitle, OUTCOME } from '../views/RefsView';

const REF_TITLE: Record<RefKind, string> = { mine: 'Your game', game: "Someone else's game", guide: 'Guide' };
const SHOWS: [Shows, string][] = [['threat', 'Doing it'], ['response', 'Answering it'], ['both', 'Both']];
const PREP: Record<Prep, string> = { did_not_see: "Didn't see it", saw_no_plan: 'Saw it, no plan', plan_misexecuted: 'Had a plan, misplayed', handled: 'Handled it' };

export function RefDetailsSheet({ sh }: { sh: RefSheetT }) {
  const d = sh.draft;
  const isGuide = d.kind === 'guide';
  const mine = d.kind === 'mine';
  const mapSel = (
    <select id="rd-map" className="select" {...bind(d, 'map')}>
      <option value="">{isGuide ? 'Any map' : 'Not set'}</option>
      <MapGroups />
    </select>
  );
  return (
    <>
      <div className="sheet-head">
        <div><h2 id="sheet-title">{REF_TITLE[d.kind]}</h2>{!d.id && <span className="sublabel">Set it up, then add moments as you watch.</span>}</div>
        <CloseBtn />
      </div>
      <Field id="rd-url" label="Link">
        <input id="rd-url" className="input" type="url" inputMode="url" autoComplete="off" placeholder="YouTube, Twitch or aoe4world" {...bind(d, 'url')} />
        <p className="hint" id="rd-hint">{linkHint(d.url)}</p>
      </Field>
      {isGuide
        ? <>
            <Field id="rd-title" label="Title"><input id="rd-title" className="input" type="text" autoComplete="off" placeholder="e.g. Chinese professional scouts" {...bind(d, 'title')} /></Field>
            <Field id="rd-civ" label="About which civ"><CivSelect id="rd-civ" value={d.civ} empty="Not one civ" onChange={(v) => { d.civ = v; }} /></Field>
            <Field id="rd-map" label="Map">{mapSel}</Field>
          </>
        : <>
            <Field id="rd-pciv" label={mine ? 'You played' : 'Player'}><CivSelect id="rd-pciv" value={d.playerCiv} empty="Not set" onChange={(v) => { d.playerCiv = v; }} /></Field>
            {!mine && <Field id="rd-pname" label="Player's name"><input id="rd-pname" className="input" type="text" autoComplete="off" placeholder="Optional" {...bind(d, 'playerName')} /></Field>}
            <Field id="rd-ociv" label="Opponent"><CivSelect id="rd-ociv" value={d.oppCiv} empty="Not set" onChange={(v) => { d.oppCiv = v; }} /></Field>
            <Field id="rd-oname" label="Opponent's name"><input id="rd-oname" className="input" type="text" autoComplete="off" placeholder="Optional" {...bind(d, 'oppName')} /></Field>
            <Field id="rd-map" label="Map">{mapSel}</Field>
            <div className="field">
              <span className="label">{mine ? 'Result for you' : 'Result for the player'}</span>
              <Seg label="Result" act="rd-result" options={[['win', 'Win'], ['loss', 'Loss']]} current={d.result || ''} onPick={(v) => { d.result = d.result === v ? '' : v; emit(); }} />
            </div>
            <Field id="rd-date" label="Played on"><input id="rd-date" className="input" type="date" {...bind(d, 'date')} /></Field>
            <Field id="rd-title" label="Title, optional"><input id="rd-title" className="input" type="text" autoComplete="off" placeholder="Shown instead of the civs and map" {...bind(d, 'title')} /></Field>
          </>}
      <Field id="rd-notes" label="Notes"><textarea id="rd-notes" className="textarea" rows={2} {...bind(d, 'notes')} /></Field>
      {d.id && <p className="hint">Deleting removes the reference and its moments. Undo brings them back.</p>}
      <div className="btn-row sheet-foot">
        <button type="button" className={'btn' + (d.id ? ' btn-danger' : '')} data-act="rd-secondary" onClick={() => (d.id ? deleteRef() : closeSheet())}>{d.id ? 'Delete' : 'Cancel'}</button>
        <button type="button" className="btn btn-primary" data-act="rd-save" onClick={() => saveRefDetails()}>{d.id ? 'Save' : 'Add'}</button>
      </div>
    </>
  );
}

export function MomentSheet({ sh }: { sh: MomentSheetT }) {
  const d = sh.draft;
  const isGame = d.refKind === 'game';
  const g = isGame && d.gameId ? S.data.games[d.gameId] : null;
  const l = isGame ? (d.gameId ? L.mainLink(d.gameId) : null) : d.linkId ? S.data.links[d.linkId] : null;
  if (isGame ? !g : !l) return null;
  const sideBtn = (v: Side, civId: string | null, fallback: string, suffix: string) => (
    <button type="button" data-act="mo-side" data-v={v} aria-pressed={d.side === v} onClick={() => { d.side = v; emit(); }}>
      <Flag id={civId} /><span>{L.civShort(civId) || fallback}{suffix}</span>
    </button>
  );
  const who = g
    ? <div className="field">
        <span className="label">Who did it</span>
        <div className="who" role="group" aria-label="Who did it">
          {sideBtn('opponent', g.oppCiv, 'Opponent', g.mine ? ' (them)' : '')}
          {sideBtn('player', g.playerCiv, g.mine ? 'You' : 'Player', g.mine && L.civ(g.playerCiv) ? ' (you)' : '')}
        </div>
      </div>
    : <div className="field">
        <label className="label" htmlFor="mo-civ">Which civ</label>
        <CivSelect id="mo-civ" value={d.civ} empty="Not one civ" onChange={(v) => { d.civ = v; }} />
        {!d.civ && <span className="hint">Without a civ it shows on the element or play, but not in Check.</span>}
      </div>;
  const forWho = d.side === 'player' ? (g && g.mine ? 'you' : 'the player') : (g && g.mine ? 'them' : 'the opponent');
  const how = !g ? null : d.showHow
    ? <>
        <div className="field">
          <span className="label">Did it work for {forWho}?</span>
          <Seg label="Outcome" act="mo-outcome" options={Object.entries(OUTCOME) as [Outcome, string][]} current={d.outcome || ''} onPick={(v) => { d.outcome = d.outcome === v ? null : v; emit(); }} />
        </div>
        {g.mine && d.side === 'opponent' && (
          <div className="field">
            <span className="label">How ready were you?</span>
            <div className="tiles two" role="group" aria-label="How ready were you">
              {(Object.entries(PREP) as [Prep, string][]).map(([v, t]) => (
                <button key={v} type="button" data-act="mo-prep" data-v={v} aria-pressed={d.prep === v} onClick={() => { d.prep = d.prep === v ? null : v; emit(); }}>{t}</button>
              ))}
            </div>
          </div>
        )}
        <div className="field">
          <label className="label" htmlFor="mo-did">{d.side === 'opponent' ? (g.mine ? 'What you did about it' : 'What the player did about it') : (g.mine ? 'What they did about it' : 'What the opponent did about it')}</label>
          <textarea id="mo-did" className="textarea" rows={2} {...bind(d, 'did')} />
        </div>
      </>
    : <button type="button" className="btn btn-outline" data-act="mo-how" onClick={() => { d.showHow = true; emit(); }}>Add how it went</button>;
  const editing = !!(d.pid || d.mid);
  return (
    <>
      <div className="sheet-head">
        <div><h2 id="sheet-title">{editing ? 'Moment' : 'New moment'}</h2><span className="sublabel">{g ? <GameTitle g={g} /> : guideTitle(l)}</span></div>
        <CloseBtn />
      </div>
      {who}
      <div className="field">
        <span className="label">What happened</span>
        <Seg label="What happened" act="mo-mode" options={[['steps', 'Elements or a play'], ['plan', 'A whole game plan']] as ['steps' | 'plan', string][]} current={d.mode}
          onPick={(v) => { d.mode = v; emit(); }} />
      </div>
      {d.mode === 'plan'
        ? <div className="field">
            <label className="label" htmlFor="mo-plan">Game plan</label>
            <select id="mo-plan" className="select" value={d.plan} onChange={(e) => { d.plan = e.target.value; emit(); }}>
              <option value="">Pick one</option>
              {d.plan && !isActive(L.plan(d.plan)) && <option value={d.plan}>{L.planTitle(d.plan)} (retired)</option>}
              {L.activePlans().slice().sort(byName).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {L.plan(d.plan) && <PlanStages g={L.plan(d.plan) as NonNullable<ReturnType<typeof L.plan>>} />}
            <span className="hint">For a game that went the whole way to plan. If only one age went that way, log that age's play instead.</span>
          </div>
        : <Builder sh={sh} mode="match" />}
      {timed(l) && (
        <div className="field"><label className="label" htmlFor="mo-at">Starts at</label><input id="mo-at" className="input" type="text" inputMode="numeric" autoComplete="off" placeholder="e.g. 2:30" {...bind(d, 'at')} /></div>
      )}
      <div className="field"><label className="label" htmlFor="mo-note">Note</label><textarea id="mo-note" className="textarea" rows={2} placeholder="What it looked like, the tells, what to copy" {...bind(d, 'note')} /></div>
      {!isGame && (
        <div className="field"><span className="label">This part shows</span><Seg label="This part shows" act="mo-shows" options={SHOWS} current={d.shows} onPick={(v) => { d.shows = v; emit(); }} /></div>
      )}
      {how}
      {editing && <button type="button" className="textlink" data-act="mo-delete" onClick={() => deleteMoment()}><span className="danger-text">Delete this moment</span></button>}
      <div className="btn-row sheet-foot">
        <button type="button" className="btn" data-act="mo-save" data-again="1" onClick={() => saveMoment(true)}>Save, add next</button>
        <button type="button" className="btn btn-primary" data-act="mo-save" onClick={() => saveMoment(false)}>Save</button>
      </div>
    </>
  );
}
