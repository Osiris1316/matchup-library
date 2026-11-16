// Edit or add a definition: play, kind, feature, map, map type or civ.
// Elements are edited beside the list in the Library (views/ElementEditor.tsx),
// which reuses the civ, "comes up on" and references fields from here.
import { byName, guideTitle, isActive, parsePlace, placeKey, type ItemKind } from '@matchup-library/core';
import { L, S, bind, emit, toggleIn, type DefDraft, type DefSheet as DefSheetT } from '../store';
import { DEF_WORD, saveDef, toggleDefActive } from '../actions';
import { Flag } from '../components/Flag';
import { Builder, MultiSelect, type MsOption } from '../components/pickers';
import { CloseBtn, Field } from '../components/bits';
import { GameTitle } from '../views/RefsView';

// Which civs do it: ticking one tags it anywhere.
export function CivChips({ field, id, d }: { field: ItemKind; id: string | null; d: DefDraft }) {
  const states: Record<string, 'on' | 'some'> = {};
  if (id) L.activeTags().filter((t) => t[field] === id).forEach((t) => { states[t.civ] = placeKey(t.place) === 'any:' ? 'on' : states[t.civ] || 'some'; });
  const civs = L.activeCivs();
  const opt = (c: (typeof civs)[number], group: string): MsOption => ({ group, value: c.id, label: c.name, short: c.short || c.name, flag: <Flag id={c.id} />,
    sub: !d.civOn.includes(c.id) && states[c.id] === 'some' ? 'Tagged only for some maps' : '' });
  const options = [...civs.filter((c) => !c.parent).map((c) => opt(c, 'Civs')), ...civs.filter((c) => c.parent).map((c) => opt(c, 'Variants'))];
  const some = civs.filter((c) => !d.civOn.includes(c.id) && states[c.id] === 'some');
  return (
    <>
      <MultiSelect msKey="civOn" label={field === 'play' ? 'Civs that run it' : 'Civs that do it'} options={options} selected={d.civOn} none="No civs yet"
        hint="Ticking a civ tags it anywhere. Add timing, tells or map limits on the civ page." onToggle={(v, on) => { d.civOn = toggleIn(d.civOn, v, on); }} />
      {some.length > 0 && <span className="hint">Also tagged only for some maps: {some.map((c) => c.short || c.name).join(', ')}.</span>}
    </>
  );
}

// "Comes up on": map notes on the element or play itself, true for any civ.
export function WhereField({ d }: { d: DefDraft }) {
  const options: MsOption[] = [
    ...L.activeTypes().map((t) => ({ group: 'Map types', value: 'type:' + t.id, label: t.name + ' maps' })),
    ...L.activeFeatures().map((f) => ({ group: 'Map features', value: 'feature:' + f.id, label: f.name })),
    ...L.activeTypes().flatMap((t) => L.mapsOfType(t.id).map((m) => ({ group: t.name + ' maps', value: 'map:' + m.id, label: m.name })))
  ];
  const toggle = (v: string, on: boolean) => {
    const i = d.where.findIndex((x) => placeKey(x) === v);
    if (on && i < 0) d.where.push(parsePlace(v));
    if (!on && i >= 0) d.where.splice(i, 1);
  };
  return (
    <>
      <MultiSelect msKey="where" label="Comes up on" options={options} selected={d.where.map(placeKey)} none="Not noted" hint="True for any civ. Check shows it when the map matches." onToggle={toggle} />
      {d.where.length > 0 && (
        <textarea id="wh-note" className="textarea" rows={2} aria-label="What about these maps makes it come up" placeholder="What about these maps makes it come up" {...bind(d, 'whereNote')} />
      )}
    </>
  );
}

// Every game or guide moment that shows it.
export function RefsSection({ field, id }: { field: ItemKind; id: string }) {
  const rows = L.refsFor(field, id);
  if (!rows.length) return null;
  return (
    <div className="field">
      <span className="label">In references</span>
      <div className="list">
        {rows.slice(0, 12).map((r, i) => (
          <div key={i} className="lrow">
            <a className="main-btn" href={'#' + r.route}><span className="t fw5">{r.game ? <GameTitle g={r.game} /> : r.guide ? guideTitle(r.guide) : ''}</span><span className="s">{r.sub}</span></a>
          </div>
        ))}
      </div>
      {rows.length > 12 && <span className="hint">And {rows.length - 12} more.</span>}
    </div>
  );
}

export function DefSheet({ sh }: { sh: DefSheetT }) {
  const d = sh.draft, t = sh.type;
  const it = sh.id ? (S.data.defs[t] as { id: string; name: string; active: boolean; mergedInto?: string | null }[]).find((x) => x.id === sh.id) || null : null;
  const desc = (ph?: string) => <Field id="df-desc" label="Description"><textarea id="df-desc" className="textarea" rows={2} placeholder={ph || ''} {...bind(d, 'description')} /></Field>;
  let body;
  if (t === 'strategies') {
    body = <>
      {it ? <><CivChips field="play" id={sh.id} d={d} /><Builder sh={sh} mode="steps" /></> : <><Builder sh={sh} mode="steps" /><CivChips field="play" id={sh.id} d={d} /></>}
      {desc('What the play is going for')}
      <WhereField d={d} />
      {it && <RefsSection field="play" id={it.id} />}
    </>;
  } else if (t === 'features') {
    body = <>
      {desc('What it means on the map')}
      <MultiSelect msKey="mapsOn" label="Maps that usually have it" none="No maps yet" selected={d.mapsOn} onToggle={(v, on) => { d.mapsOn = toggleIn(d.mapsOn, v, on); }}
        options={L.activeTypes().flatMap((ty) => L.mapsOfType(ty.id).map((m) => ({ group: ty.name + ' maps', value: m.id, label: m.name })))} />
    </>;
  } else if (t === 'maps') {
    body = <>
      <Field id="df-type" label="Map type">
        <select id="df-type" className="select" {...bind(d, 'type')}>
          {S.data.defs.mapTypes.filter((m) => isActive(m) || m.id === d.type).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      {L.activeFeatures().length
        ? <MultiSelect msKey="features" label="Usually has" none="No features yet" selected={d.features} onToggle={(v, on) => { d.features = toggleIn(d.features, v, on); }}
            options={L.activeFeatures().map((f) => ({ value: f.id, label: f.name }))} />
        : <div className="field"><span className="label">Usually has</span><span className="hint">No features yet. Add them under Features.</span></div>}
      <label className="check plain"><input type="checkbox" id="df-pool" checked={d.inPool} onChange={(e) => { d.inPool = e.target.checked; emit(); }} /><span className="txt">In the ranked map pool</span></label>
      <Field id="df-notes" label="Notes"><textarea id="df-notes" className="textarea" rows={2} {...bind(d, 'notes')} /></Field>
    </>;
  } else if (t === 'civs') {
    body = <>
      <Field id="df-short" label="Short name"><input id="df-short" className="input" type="text" placeholder="For chips, e.g. OotD" {...bind(d, 'short')} /></Field>
      <Field id="df-parent" label="Variant of">
        <select id="df-parent" className="select" {...bind(d, 'parent')}>
          <option value="">None, a base civ</option>
          {S.data.defs.civs.filter((c) => !c.parent && c.id !== sh.id).sort(byName).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
    </>;
  } else {
    body = desc();
  }
  const status = it && (
    <p className="hint">{isActive(it) ? 'Retiring hides it from lists and pickers. Everything that uses it keeps it, and you can restore it any time.'
      : it.mergedInto ? 'Merged into ' + L.playTitle(it.mergedInto) + '.' : 'Retired. Restoring puts it back in lists and pickers.'}</p>
  );
  const secondary = !it
    ? <button type="button" className="btn" data-act="sheet-close" onClick={() => { S.sheet = null; emit(); }}>Cancel</button>
    : it.mergedInto
      ? <button type="button" className="btn" data-act="sheet-close" onClick={() => { S.sheet = null; emit(); }}>Close</button>
      : <button type="button" className={'btn' + (isActive(it) ? ' btn-danger' : '')} data-act="df-secondary" onClick={() => toggleDefActive(t, it.id)}>{isActive(it) ? 'Retire' : 'Restore'}</button>;
  return (
    <>
      <div className="sheet-head"><h2 id="sheet-title">{it ? it.name : 'New ' + DEF_WORD[t]}</h2><CloseBtn /></div>
      <Field id="df-name" label="Name"><input id="df-name" className="input" type="text" autoComplete="off" {...bind(d, 'name')} /></Field>
      {body}
      {status}
      <div className="btn-row sheet-foot">{secondary}<button type="button" className="btn btn-primary" data-act="df-save" onClick={() => saveDef()}>{it ? 'Save' : 'Add'}</button></div>
    </>
  );
}
