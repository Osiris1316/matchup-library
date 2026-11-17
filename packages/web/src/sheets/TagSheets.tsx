// Tag one element, play or game plan for a civ, or tick many at once.
import type { ReactNode } from 'react';
import { AGES, AGE_NAME, INTENTS, INTENT_NAME, ITEM_WORD, STAGE_NAME, agesText, byName, isActive, placeKey, plural, stagesOf, tagField, tagTargetId, type Intent, type ItemKind } from '@matchup-library/core';
import { L, S, bind, closeSheet, emit, toggleIn, type BulkSheet as BulkSheetT, type TagSheet as TagSheetT } from '../store';
import { elementGroups, retireTagFromSheet, saveBulk, saveTag } from '../actions';
import { LandmarkOptions, PlacePicker } from '../components/pickers';
import { CloseBtn, Seg, SheetBack } from '../components/bits';
import { SplitPill, StepPills } from '../components/Pill';
import { BlockList } from '../components/Blocks';
import { openForCiv } from '../actions';

export function TagSheet({ sh }: { sh: TagSheetT }) {
  const d = sh.draft;
  const isEl = d.field === 'el';
  const def = L.itemDef(d.field, d.target);
  // An element tag offers only the ages this civ can do it in.
  const ages = isEl ? L.civAges(d.civ, d.target) : [];
  const blocks = L.blockers(d.civ, d.field, d.target, isEl ? d.age : null);
  const play = d.field === 'play' ? L.play(d.target) : null;
  const plan = d.field === 'plan' ? L.plan(d.target) : null;
  const steps = play ? play.steps : null;
  return (
    <>
      <SheetBack />
      <div className="sheet-head">
        <div>
          <h2 id="sheet-title">{isEl && def ? <SplitPill el={d.target} use={{ intent: d.intent || null, subject: d.subject || null }} size="lg" /> : def ? def.name : ''}</h2>
          <span className="sublabel">{d.tagId ? 'Tag' : 'New tag'} for {L.civName(d.civ)}{play ? '. ' + STAGE_NAME[play.age] + ': ' + L.sequence(play.steps) : plan ? '. ' + L.planSequence(plan) : ''}</span>
          {steps && <StepPills steps={steps} />}
        </div>
        <CloseBtn />
      </div>
      <BlockList civ={d.civ} blocks={blocks} />
      {isEl && def && 'tells' in def && def.tells && <p className="hint"><span className="strong">Tells for anyone doing it:</span> {def.tells}</p>}
      <PlacePicker owner={d} />
      {isEl && ages.length > 1 && (
        <div className="field">
          <span className="label">Age</span>
          <Seg label="Age" act="tg-age" options={[['', 'Any'], ...ages.map((a) => [a, AGE_NAME[a]] as [string, string])]} current={d.age || ''} onPick={(v) => { d.age = (v || null) as typeof d.age; emit(); }} />
          {L.hasOwnAges(d.civ, d.target) && <span className="hint">{L.civShort(d.civ)}'s own ages for it. Change them in Library, on the element.</span>}
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
  const seg = d.seg;
  const pk = placeKey(d.place);
  const here = new Set(L.activeTags().filter((t) => t.civ === d.civ && placeKey(t.place) === pk && !t.age && tagField(t) === seg).map(tagTargetId));
  const picked = d.picked[seg];
  // Something this civ can't do in its age can't be ticked; its fix sits beside it.
  const box = (id: string, name: ReactNode, sub: string) => {
    const already = here.has(id);
    const block = already ? undefined : L.blockers(d.civ, seg, id)[0];
    const label = (
      <label key={id} className="check">
        <input type="checkbox" id={'bk-' + id} value={id} checked={!block && (already || picked.includes(id))} disabled={already || !!block} onChange={(e) => {
          d.picked[seg] = toggleIn(d.picked[seg], id, e.target.checked);
          emit();
        }} />
        <span className="txt"><span className="fw5">{name}</span><span className={'sublabel' + (block ? ' warn-text' : '')}>{already ? 'Already tagged here' : block ? L.blockText(d.civ, block) : sub}</span></span>
      </label>
    );
    if (!block) return label;
    return (
      <div key={id} className="check-fix">
        {label}
        <button type="button" className="btn btn-outline btn-sm" data-act="open-for-civ" data-civ={d.civ} data-el={block.el} onClick={() => openForCiv(d.civ, block)}>Allow for {L.civShort(d.civ)}</button>
      </div>
    );
  };
  const list = seg === 'el'
    ? elementGroups().map((g) => (
        <div key={g.name}>
          <div className="group"><h3 className="label">{g.name}</h3></div>
          {g.items.map((e) => box(e.id, <SplitPill el={e.id} />, agesText(L.elAges(e.id))))}
        </div>
      ))
    : seg === 'play'
      ? AGES.filter((a) => L.activePlays(a).length).map((a) => (
          <div key={a}>
            <div className="group"><h3 className="label">{STAGE_NAME[a]}</h3></div>
            {L.activePlays(a).sort(byName).map((p) => box(p.id, p.name, (p.family ? p.family + '. ' : '') + L.sequence(p.steps)))}
          </div>
        ))
      : S.data.defs.gamePlans.filter(isActive).sort(byName).map((g) => box(g.id, g.name, stagesOf(g).length ? L.planSequence(g) : 'No plays yet'));
  const n = picked.filter((id) => !here.has(id) && !L.blockers(d.civ, seg, id).length).length;
  return (
    <>
      <div className="sheet-head">
        <div><h2 id="sheet-title">Tag {L.civName(d.civ)}</h2><span className="sublabel">Tick everything they do, then add timing and tells to each one later.</span></div>
        <CloseBtn />
      </div>
      <Seg label="What to tag" act="bk-seg" options={[['el', 'Elements'], ['play', 'Plays'], ['plan', 'Game plans']] as [ItemKind, string][]} current={d.seg} onPick={(v) => { d.seg = v; emit(); }} />
      <PlacePicker owner={d} />
      <div>{list.length ? list : <p className="hint">Nothing to tag yet. Add some in Library.</p>}</div>
      <div className="btn-row sheet-foot">
        <button type="button" className="btn" data-act="sheet-close" onClick={closeSheet}>Cancel</button>
        <button type="button" className="btn btn-primary" data-act="bk-save" disabled={!n} onClick={() => saveBulk()}>{n ? 'Tag ' + plural(n, ITEM_WORD[seg]) : 'Tick some first'}</button>
      </div>
    </>
  );
}
