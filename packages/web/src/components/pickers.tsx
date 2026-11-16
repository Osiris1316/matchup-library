// Pickers used inside sheets: a dropdown checklist, a place picker, and the
// step builder for plays and moments.
import { Fragment, type ReactNode } from 'react';
import { AGES, INTENT_NAME, STAGE_AGES, STAGE_NAME, agesText, builderToSteps, type Age, type BuilderRow } from '@matchup-library/core';
import { L, S, emit, type DefSheet, type MomentSheet, type PlaceDraft } from '../store';
import { addStep, cycleIntent, elementGroups, setPlaceKind } from '../actions';
import { Icon } from './Icon';
import { MapGroups, Seg } from './bits';
import { SplitPill } from './Pill';

// Landmarks you can age up with, grouped by civ. An age-up during an age is
// built in that age: Dark builds the Feudal landmarks (aoe4world age 1).
export function LandmarkOptions({ age }: { age?: Age | null }) {
  const n = age ? AGES.indexOf(age) + 1 : 0;
  const lms = L.subjects().filter((x) => x.kind === 'landmark' && x.active && (!n || x.age === n));
  const civs = [...new Set(lms.map((x) => (x.civs || []).find((c) => L.civ(c)) || ''))].sort((a, b) => L.civName(a, a).localeCompare(L.civName(b, b)));
  return (
    <>
      {civs.map((c) => (
        <optgroup key={c || 'other'} label={c ? L.civName(c, c) : 'Other'}>
          {lms.filter((x) => ((x.civs || []).find((y) => L.civ(y)) || '') === c).sort((a, b) => a.name.localeCompare(b.name)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </optgroup>
      ))}
    </>
  );
}

// An age-up step can name its landmark.
function StepLandmark({ b, i, age }: { b: BuilderRow; i: number; age: Age }) {
  if (L.elType(b.el) !== 'age_tech' || !L.subjects().some((x) => x.kind === 'landmark')) return null;
  return (
    <div className="step-sub">
      <select className="select" data-act="pb-subject" data-i={i} aria-label={'Landmark for ' + L.elName(b.el)} value={b.subject || ''}
        onChange={(e) => { if (e.target.value) b.subject = e.target.value; else delete b.subject; emit(); }}>
        <option value="">{L.el(b.el)?.subject ? 'Its usual icon' : 'No landmark'}</option>
        <LandmarkOptions age={age} />
      </select>
    </div>
  );
}

// The age a play or a moment's steps happen in. Imperial only shows when already chosen.
export function AgeSeg({ value, onPick, act }: { value: Age; onPick: (a: Age) => void; act: string }) {
  const ages: Age[] = STAGE_AGES.includes(value) ? STAGE_AGES : [...STAGE_AGES, value];
  return <Seg label="Age" act={act} options={ages.map((a) => [a, STAGE_NAME[a]] as [Age, string])} current={value} onPick={onPick} />;
}

export interface MsOption { value: string; label: string; short?: string; flag?: ReactNode; sub?: string; group?: string }

// A dropdown checklist: a button that shows what is chosen, opening a list to tick.
export function MultiSelect({ msKey, label, options, selected, onToggle, none = 'None', hint }: {
  msKey: string; label: string; options: MsOption[]; selected: string[]; onToggle: (value: string, on: boolean) => void; none?: string; hint?: string;
}) {
  const host = S.sheet || S.panel;
  const open = host.open === msKey;
  const chosen = options.filter((x) => selected.includes(x.value));
  const toggleOpen = () => { host.open = host.open === msKey ? null : msKey; emit(); };
  let last: string | undefined;
  return (
    <div className="field">
      <span className="label" id={'ms-' + msKey + '-label'}>{label}</span>
      {hint && <span className="hint">{hint}</span>}
      <button type="button" className="ms-btn" data-act="ms-open" data-key={msKey} aria-expanded={open} aria-labelledby={'ms-' + msKey + '-label'} onClick={toggleOpen}>
        <span className="sum">
          {chosen.length
            ? <>
                {chosen.slice(0, 6).map((x, i, a) => (
                  <span key={x.value} className="vs">{x.flag}<span>{x.short || x.label}{i < a.length - 1 || chosen.length > 6 ? ',' : ''}</span></span>
                ))}
                {chosen.length > 6 && <span className="muted">and {chosen.length - 6} more</span>}
              </>
            : <span className="muted">{none}</span>}
        </span>
        <span className="chev">{open ? 'Done' : <Icon name="down" size={16} w={2} />}</span>
      </button>
      {open && (
        <div className="ms-list" role="group" aria-label={label}>
          {options.map((x, i) => {
            const head = x.group && x.group !== last ? <div className="group"><span className="label">{x.group}</span></div> : null;
            last = x.group;
            return (
              <Fragment key={x.value}>
                {head}
                <label className="check">
                  <input type="checkbox" id={'ms-' + msKey + '-' + i} value={x.value} checked={selected.includes(x.value)} onChange={(e) => { onToggle(x.value, e.target.checked); emit(); }} />
                  {x.flag}
                  <span className="txt"><span>{x.label}</span>{x.sub && <span className="sublabel">{x.sub}</span>}</span>
                </label>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Where a tag applies: anywhere, a map type, a feature, or one map.
export function PlacePicker({ owner }: { owner: { place: PlaceDraft } }) {
  const p = owner.place;
  const pick = (v: string) => { owner.place.id = v; emit(); };
  let sel: ReactNode = null;
  if (p.kind === 'type') {
    sel = <select id="pl-id" className="select" aria-label="Map type" value={p.id || ''} onChange={(e) => pick(e.target.value)}>
      {L.activeTypes().map((t) => <option key={t.id} value={t.id}>{t.name} maps</option>)}
    </select>;
  }
  if (p.kind === 'feature') {
    sel = L.activeFeatures().length
      ? <select id="pl-id" className="select" aria-label="Map feature" value={p.id || ''} onChange={(e) => pick(e.target.value)}>
          {L.activeFeatures().map((f) => <option key={f.id} value={f.id}>Maps with {f.name.toLowerCase()}</option>)}
        </select>
      : <p className="hint">No map features yet. Add them in Maps.</p>;
  }
  if (p.kind === 'map') {
    sel = <select id="pl-id" className="select" aria-label="Map" value={p.id || ''} onChange={(e) => pick(e.target.value)}><MapGroups /></select>;
  }
  return (
    <div className="field">
      <span className="label">Where</span>
      <Seg label="Where" act="pl-kind" options={[['any', 'Anywhere'], ['type', 'Map type'], ['feature', 'Feature'], ['map', 'One map']]} current={p.kind} onPick={(v) => setPlaceKind(owner, v)} />
      {sel}
    </div>
  );
}

// Elements in order, all in one age. 'steps' edits a play; 'match' is a
// moment, which is one element or a play, matched to a saved play in that age
// when the steps agree.
export function Builder({ sh, mode }: { sh: DefSheet | MomentSheet; mode: 'steps' | 'match' }) {
  const d = sh.draft;
  const age: Age = d.age;
  const togglePick = () => { sh.picking = !sh.picking; emit(); };
  const rows = d.builder.map((b, i) => {
    const wrongAge = !L.elAges(b.el).includes(age);
    const intentLabel = b.intent ? INTENT_NAME[b.intent] : 'Usual';
    return (
      <Fragment key={i + ':' + b.el}>
      <div className="step">
        {i > 0 && (
          <button type="button" className="join" data-act="pb-join" data-i={i} onClick={() => { b.join = !b.join; emit(); }}
            aria-label={b.join ? 'Happens with the element above. Tap to make it come after' : 'Comes after the element above. Tap to make it happen at the same time'}>
            <span>{b.join ? 'with' : 'then'}</span>
          </button>
        )}
        <span className="name pillname"><SplitPill el={b.el} use={b} /></span>
        <button type="button" className="pill-btn age" data-act="pb-intent" data-i={i} onClick={() => { cycleIntent(b); emit(); }}
          aria-label={'Intent: ' + intentLabel + '. Tap to change'}>
          <span className={'pill' + (b.intent ? '' : ' ghost')}>{intentLabel}</span>
        </button>
        {wrongAge && <span className="pill warn" title={'Can\'t happen in ' + STAGE_NAME[age]}>Not {STAGE_NAME[age]}</span>}
        <button type="button" className="icon-btn" data-act="pb-remove" data-i={i} aria-label={'Remove ' + L.elName(b.el)} onClick={() => { d.builder.splice(i, 1); emit(); }}>
          <Icon name="x" size={16} w={2} />
        </button>
      </div>
      <StepLandmark b={b} i={i} age={age} />
      </Fragment>
    );
  });
  const picker = sh.picking && (
    <div className="picker">
      {elementGroups().map((g) => (
        <div key={g.name} className="picker-group">
          <span className="label">{g.name}</span>
          {g.items.map((e) => (
            <button key={e.id} type="button" className="item" data-act="pb-add" data-id={e.id} onClick={() => {
              // A moment's first element sets its age when the age it had can't happen.
              if (mode === 'match' && !d.builder.length && !L.elAges(e.id).includes(d.age)) d.age = L.elAges(e.id)[0] || d.age;
              addStep(d.builder, e.id); sh.picking = false; emit();
            }}>
              <SplitPill el={e.id} /><span className="sublabel">{agesText(L.elAges(e.id))}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
  const addBtn = (
    <button type="button" className="btn btn-outline" data-act="pb-pick" aria-expanded={!!sh.picking} onClick={togglePick}>
      {sh.picking ? 'Close the list' : <><Icon name="plus" size={16} w={2} /> Add element</>}
    </button>
  );
  const steps = builderToSteps(d.builder, age);
  const first = steps[0];
  if (mode === 'match' && sh.kind === 'moment') {
    let after: ReactNode;
    if (!first) after = <span className="hint">Pick one element, or several in order for a play.</span>;
    else if (steps.length === 1) after = <span className="hint">One element: {L.stepLabel(first)}, in {STAGE_NAME[age]}. Add more for a play.</span>;
    else {
      const hit = L.matchPlay(d.builder, age, sh.draft.origPlay);
      after = hit
        ? <div className="panel"><span className="label">Matches a saved play</span><span className="strong">{hit.name}</span><span className="hint">{L.sequence(steps)}</span></div>
        : <div className="panel">
            <span className="label">New play</span>
            <label className="sublabel" htmlFor="mo-name">Name it</label>
            <input id="mo-name" className="input" type="text" autoComplete="off" placeholder={L.sequence(steps)} value={d.name || ''} onChange={(e) => { d.name = e.target.value; emit(); }} />
            <span className="hint">It goes into Library as a {STAGE_NAME[age]} play when you save.</span>
          </div>;
    }
    return <div className="field"><span className="label">Steps</span><AgeSeg act="mo-age" value={age} onPick={(a) => { d.age = a; emit(); }} />{rows}{addBtn}{picker}{after}</div>;
  }
  const playId = sh.kind === 'def' ? sh.id : null;
  const hit = steps.length ? L.matchPlay(d.builder, age, playId) : null;
  const twin = hit && hit.id !== playId ? hit : null;
  return (
    <div className="field">
      <span className="label">Steps</span>
      {rows}{addBtn}{picker}
      {steps.length
        ? <span className="hint">{L.sequence(steps)}</span>
        : <span className="hint">Add elements in the order they happen. Switch "then" to "with" when two happen together.</span>}
      {twin && <span className="hint warn-text">Same steps as {twin.name} in this age.</span>}
      {playId && (L.allPlays().some(({ p }) => p.playId === playId) || L.activePlans().some((g) => AGES.some((a) => g.stages[a]?.play === playId)))
        && <span className="hint">Game plans and games that use this play keep pointing at it, so changing the steps changes what they mean.</span>}
    </div>
  );
}
