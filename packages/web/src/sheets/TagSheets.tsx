// Tag one element or play for a civ, or tick many at once.
import type { ReactNode } from 'react';
import { AGE_NAME, INTENTS, INTENT_NAME, agesText, byName, isActive, placeKey, plural, tagField, tagTargetId, type Intent } from '@matchup-library/core';
import { L, S, bind, closeSheet, emit, toggleIn, type BulkSheet as BulkSheetT, type TagSheet as TagSheetT } from '../store';
import { elementGroups, retireTagFromSheet, saveBulk, saveTag } from '../actions';
import { LandmarkOptions, PlacePicker } from '../components/pickers';
import { CloseBtn, Seg, SheetBack } from '../components/bits';
import { SplitPill, StepPills } from '../components/Pill';

export function TagSheet({ sh }: { sh: TagSheetT }) {
  const d = sh.draft;
  const isEl = d.field === 'el';
  const def = isEl ? L.el(d.target) : L.strat(d.target);
  const ages = isEl ? L.elAges(d.target) : [];
  const steps = def && 'steps' in def ? def.steps : null;
  return (
    <>
      <SheetBack />
      <div className="sheet-head">
        <div>
          <h2 id="sheet-title">{isEl && def ? <SplitPill el={d.target} use={{ intent: d.intent || null, subject: d.subject || null }} size="lg" /> : def ? def.name : ''}</h2>
          <span className="sublabel">{d.tagId ? 'Tag' : 'New tag'} for {L.civName(d.civ)}{steps ? '. ' + L.sequence(steps) : ''}</span>
          {steps && <StepPills steps={steps} />}
        </div>
        <CloseBtn />
      </div>
      {isEl && def && 'tells' in def && def.tells && <p className="hint"><span className="strong">Tells for anyone doing it:</span> {def.tells}</p>}
      <PlacePicker owner={d} />
      {isEl && ages.length > 1 && (
        <div className="field">
          <span className="label">Age</span>
          <Seg label="Age" act="tg-age" options={[['', 'Any'], ...ages.map((a) => [a, AGE_NAME[a]] as [string, string])]} current={d.age || ''} onPick={(v) => { d.age = (v || null) as typeof d.age; emit(); }} />
        </div>
      )}
      {isEl && (
        <div className="field">
          <span className="label">How {L.civShort(d.civ)} uses it</span>
          <div className="intentseg small" role="group" aria-label="Intent">
            {([null, ...INTENTS] as (Intent | null)[]).map((i) => (
              <button key={i || 'usual'} type="button" data-act="tg-intent" data-v={i || ''} data-intent={i || L.elIntent(d.target) || 'none'} aria-pressed={(d.intent || null) === i}
                onClick={() => { d.intent = i || ''; emit(); }}>{i ? INTENT_NAME[i] : 'Usual'}</button>
            ))}
          </div>
          <span className="hint">Usual means the element's own intent{L.elIntent(d.target) ? ', ' + INTENT_NAME[L.elIntent(d.target) as Intent].toLowerCase() : ''}.</span>
        </div>
      )}
      {isEl && L.elType(d.target) === 'age_tech' && L.subjects().some((x) => x.kind === 'landmark') && (
        <div className="field">
          <label className="label" htmlFor="tg-subject">Landmark</label>
          <select id="tg-subject" className="select" value={d.subject} onChange={(e) => { d.subject = e.target.value; emit(); }}>
            <option value="">{L.el(d.target)?.subject ? 'Its usual icon' : 'No landmark'}</option>
            <LandmarkOptions age={d.age} />
          </select>
        </div>
      )}
      <div className="field"><label className="label" htmlFor="tg-timing">Timing</label><input id="tg-timing" className="input" type="text" placeholder="When it shows up, in words" {...bind(d, 'timing')} /></div>
      <div className="field"><label className="label" htmlFor="tg-tells">{L.civShort(d.civ)} tells</label><textarea id="tg-tells" className="textarea" rows={2} placeholder="What this civ doing it looks like" {...bind(d, 'tells')} /></div>
      <div className="field"><label className="label" htmlFor="tg-notes">Notes</label><textarea id="tg-notes" className="textarea" rows={3} placeholder="What it targets, how strong it is here" {...bind(d, 'notes')} /></div>
      <div className="btn-row sheet-foot">
        <button type="button" className={'btn' + (d.tagId ? ' btn-danger' : '')} data-act="tg-secondary" onClick={() => retireTagFromSheet()}>{d.tagId ? 'Retire tag' : 'Cancel'}</button>
        <button type="button" className="btn btn-primary" data-act="tg-save" onClick={() => saveTag()}>Save tag</button>
      </div>
    </>
  );
}

export function BulkSheet({ sh }: { sh: BulkSheetT }) {
  const d = sh.draft;
  const isEl = d.seg === 'el';
  const pk = placeKey(d.place);
  const here = new Set(L.activeTags().filter((t) => t.civ === d.civ && placeKey(t.place) === pk && !t.age && tagField(t) === d.seg).map(tagTargetId));
  const picked = isEl ? d.pickedEl : d.pickedPlay;
  const box = (id: string, name: ReactNode, sub: string) => {
    const already = here.has(id);
    return (
      <label key={id} className="check">
        <input type="checkbox" id={'bk-' + id} value={id} checked={already || picked.includes(id)} disabled={already} onChange={(e) => {
          if (isEl) d.pickedEl = toggleIn(d.pickedEl, id, e.target.checked); else d.pickedPlay = toggleIn(d.pickedPlay, id, e.target.checked);
          emit();
        }} />
        <span className="txt"><span className="fw5">{name}</span><span className="sublabel">{already ? 'Already tagged here' : sub}</span></span>
      </label>
    );
  };
  const list = isEl
    ? elementGroups().map((g) => (
        <div key={g.name}>
          <div className="group"><h3 className="label">{g.name}</h3></div>
          {g.items.map((e) => box(e.id, <SplitPill el={e.id} />, agesText(L.elAges(e.id))))}
        </div>
      ))
    : S.data.defs.strategies.filter(isActive).sort(byName).map((s) => box(s.id, s.name, L.sequence(s.steps)));
  const n = picked.filter((id) => !here.has(id)).length;
  return (
    <>
      <div className="sheet-head">
        <div><h2 id="sheet-title">Tag {L.civName(d.civ)}</h2><span className="sublabel">Tick everything they do, then add timing and tells to each one later.</span></div>
        <CloseBtn />
      </div>
      <Seg label="What to tag" act="bk-seg" options={[['el', 'Elements'], ['play', 'Plays']]} current={d.seg} onPick={(v) => { d.seg = v; emit(); }} />
      <PlacePicker owner={d} />
      <div>{list.length ? list : <p className="hint">Nothing to tag yet. Add some in Library.</p>}</div>
      <div className="btn-row sheet-foot">
        <button type="button" className="btn" data-act="sheet-close" onClick={closeSheet}>Cancel</button>
        <button type="button" className="btn btn-primary" data-act="bk-save" disabled={!n} onClick={() => saveBulk()}>{n ? 'Tag ' + plural(n, isEl ? 'element' : 'play') : 'Tick some first'}</button>
      </div>
    </>
  );
}
