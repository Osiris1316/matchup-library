// Pickers used inside sheets: a dropdown checklist, a place picker, and the
// step builder for plays and moments.
import { Fragment, type ReactNode } from 'react';
import { AGE_NAME, agesText, builderToSteps, isActive } from '@matchup-library/core';
import { L, S, emit, type DefSheet, type MomentSheet, type PlaceDraft } from '../store';
import { addStep, cycleAge, elementGroups, setPlaceKind } from '../actions';
import { Icon } from './Icon';
import { MapGroups, Seg } from './bits';

export interface MsOption { value: string; label: string; short?: string; flag?: ReactNode; sub?: string; group?: string }

// A dropdown checklist: a button that shows what is chosen, opening a list to tick.
export function MultiSelect({ msKey, label, options, selected, onToggle, none = 'None', hint }: {
  msKey: string; label: string; options: MsOption[]; selected: string[]; onToggle: (value: string, on: boolean) => void; none?: string; hint?: string;
}) {
  const open = !!S.sheet && S.sheet.open === msKey;
  const chosen = options.filter((x) => selected.includes(x.value));
  const toggleOpen = () => { if (!S.sheet) return; S.sheet.open = S.sheet.open === msKey ? null : msKey; emit(); };
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

// Elements in order. 'steps' edits a play; 'match' is a moment, which is one
// element or a whole play, matched to a saved play when the steps agree.
export function Builder({ sh, mode }: { sh: DefSheet | MomentSheet; mode: 'steps' | 'match' }) {
  const d = sh.draft;
  const togglePick = () => { sh.picking = !sh.picking; emit(); };
  const rows = d.builder.map((b, i) => {
    const fixed = L.elAges(b.el).length === 1;
    const ageLabel = b.age ? AGE_NAME[b.age] : 'Any age';
    return (
      <div className="step" key={i + ':' + b.el}>
        {i > 0 && (
          <button type="button" className="join" data-act="pb-join" data-i={i} onClick={() => { b.join = !b.join; emit(); }}
            aria-label={b.join ? 'Happens with the element above. Tap to make it come after' : 'Comes after the element above. Tap to make it happen at the same time'}>
            <span>{b.join ? 'with' : 'then'}</span>
          </button>
        )}
        <span className="name">{L.elName(b.el)}</span>
        <button type="button" className="pill-btn age" data-act="pb-age" data-i={i} disabled={fixed} onClick={() => { cycleAge(b); emit(); }}
          aria-label={fixed ? 'Always ' + ageLabel + ' Age' : 'Age: ' + ageLabel + '. Tap to change'}>
          <span className={'pill' + (fixed ? ' plain' : b.age ? '' : ' ghost')}>{ageLabel}</span>
        </button>
        <button type="button" className="icon-btn" data-act="pb-remove" data-i={i} aria-label={'Remove ' + L.elName(b.el)} onClick={() => { d.builder.splice(i, 1); emit(); }}>
          <Icon name="x" size={16} w={2} />
        </button>
      </div>
    );
  });
  const picker = sh.picking && (
    <div className="picker">
      {elementGroups().map((g) => (
        <div key={g.name} className="picker-group">
          <span className="label">{g.name}</span>
          {g.items.map((e) => (
            <button key={e.id} type="button" className="item" data-act="pb-add" data-id={e.id} onClick={() => { addStep(d.builder, e.id); sh.picking = false; emit(); }}>
              <span className="fw5">{e.name}</span><span className="sublabel">{agesText(L.elAges(e.id))}</span>
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
  const steps = builderToSteps(d.builder);
  const first = steps[0];
  if (mode === 'match' && sh.kind === 'moment') {
    let after: ReactNode;
    if (!first) after = <span className="hint">Pick one element, or several in order for a whole play.</span>;
    else if (steps.length === 1) after = <span className="hint">One element: {L.stepLabel(first)}. Add more for a whole play.</span>;
    else {
      const hit = L.matchPlay(d.builder, sh.draft.origStrategy);
      after = hit
        ? <div className="panel"><span className="label">Matches a saved play</span><span className="strong">{hit.name}</span><span className="hint">{L.sequence(steps)}</span></div>
        : <div className="panel">
            <span className="label">New play</span>
            <label className="sublabel" htmlFor="mo-name">Name it</label>
            <input id="mo-name" className="input" type="text" autoComplete="off" placeholder={L.sequence(steps)} value={d.name || ''} onChange={(e) => { d.name = e.target.value; emit(); }} />
            <span className="hint">It goes into Library when you save.</span>
          </div>;
    }
    return <div className="field"><span className="label">What happened</span>{rows}{addBtn}{picker}{after}</div>;
  }
  const playId = sh.kind === 'def' ? sh.id : null;
  const sig = steps.length ? L.signature(steps) : null;
  const twin = sig ? S.data.defs.strategies.find((s) => s.id !== playId && isActive(s) && L.signature(s.steps) === sig) : null;
  return (
    <div className="field">
      <span className="label">Steps</span>
      {rows}{addBtn}{picker}
      {steps.length
        ? <span className="hint">{L.sequence(steps)}</span>
        : <span className="hint">Add elements in the order they happen. Switch "then" to "with" when two happen together.</span>}
      {twin && <span className="hint warn-text">Same steps as {twin.name}.</span>}
      {playId && L.allPlays().some(({ p }) => p.strategyId === playId) && <span className="hint">Games logged with this play keep pointing at it, so changing the steps changes what they mean.</span>}
    </div>
  );
}
