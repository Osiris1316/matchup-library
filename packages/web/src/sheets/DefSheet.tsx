// Edit or add a definition: play, game plan, kind, feature, map, map type or civ.
// Elements are edited beside the list in the Library (views/ElementEditor.tsx),
// which reuses the civ, "comes up on" and references fields from here.
import { Link } from 'react-router';
import { AGE_NAME, STAGE_AGES, STAGE_NAME, byName, guideTitle, isActive, parsePlace, placeKey, tagField, tagTargetId, type Age, type Block, type ItemKind, type PlanStatus } from '@matchup-library/core';
import { L, S, bind, emit, toggleIn, type DefDraft, type DefSheet as DefSheetT } from '../store';
import { DEF_WORD, draftBlockers, openDef, saveDef, toggleDefActive } from '../actions';
import { BlockList } from '../components/Blocks';
import { Flag } from '../components/Flag';
import { AgeSeg, Builder, MultiSelect, type MsOption } from '../components/pickers';
import { CloseBtn, Field, Seg } from '../components/bits';
import { StepPills } from '../components/Pill';
import { GameTitle } from '../components/refs';
import { refPath } from '../app/paths';
import { openBranch, openVersus } from '../versus';

// Which civs do it: ticking one tags it anywhere. blocksFor says what a civ
// can't do in it (a play's or game plan's steps), as the sheet stands.
export function CivChips({ field, id, d, blocksFor }: { field: ItemKind; id: string | null; d: DefDraft; blocksFor?: (civ: string) => Block[] }) {
  const states: Record<string, 'on' | 'some'> = {};
  if (id) L.activeTags().filter((t) => tagField(t) === field && tagTargetId(t) === id).forEach((t) => { states[t.civ] = placeKey(t.place) === 'any:' ? 'on' : states[t.civ] || 'some'; });
  const civs = L.activeCivs();
  const blocks = new Map(civs.map((c) => [c.id, blocksFor ? blocksFor(c.id) : []] as const));
  const cant = (c: string) => { const b = blocks.get(c)?.[0]; return b ? (b.age ? "Can't: " + L.elName(b.el) + ' in ' + AGE_NAME[b.age] : "Can't: " + L.elName(b.el)) : ''; };
  const opt = (c: (typeof civs)[number], group: string): MsOption => ({ group, value: c.id, label: c.name, short: c.short || c.name, flag: <Flag id={c.id} />,
    sub: cant(c.id) || (!d.civOn.includes(c.id) && states[c.id] === 'some' ? 'Tagged only for some maps' : '') });
  const options = [...civs.filter((c) => !c.parent).map((c) => opt(c, 'Civs')), ...civs.filter((c) => c.parent).map((c) => opt(c, 'Variants'))];
  const some = civs.filter((c) => !d.civOn.includes(c.id) && states[c.id] === 'some');
  return (
    <>
      <MultiSelect msKey="civOn" label={field === 'el' ? 'Civs that do it' : 'Civs that run it'} options={options} selected={d.civOn} none="No civs yet"
        hint="Ticking a civ tags it anywhere. Add timing, tells or map limits on the civ page." onToggle={(v, on) => { d.civOn = toggleIn(d.civOn, v, on); }} />
      {some.length > 0 && <span className="hint">Also tagged only for some maps: {some.map((c) => c.short || c.name).join(', ')}.</span>}
      {d.civOn.filter((c) => (blocks.get(c) || []).length).map((c) => <BlockList key={c} civ={c} blocks={blocks.get(c) || []} />)}
    </>
  );
}

// "Comes up on": map notes on the element, play or game plan itself, true for any civ.
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
            <Link className="main-btn" to={refPath(r.route)}><span className="t fw5">{r.game ? <GameTitle g={r.game} /> : r.guide ? guideTitle(r.guide) : ''}</span><span className="s">{r.sub}</span></Link>
          </div>
        ))}
      </div>
      {rows.length > 12 && <span className="hint">And {rows.length - 12} more.</span>}
    </div>
  );
}

const STATUS: [PlanStatus | '', string][] = [['', 'Not set'], ['idea', 'Idea'], ['studying', 'Studying'], ['practiced', 'Practiced'], ['proven', 'Proven']];

// One age of a game plan: which play, and notes on how it's run here.
function StageField({ sh, age }: { sh: DefSheetT; age: Age }) {
  const d = sh.draft;
  const st = d.stages[age] || null;
  const plays = L.activePlays(age);
  const cur = st && st.play ? L.play(st.play) : null;
  const fams = [...new Set(plays.map((p) => p.family || 'Other'))];
  const id = 'st-' + age;
  const setPlay = (v: string) => {
    if (v === '__new') { openDef('plays', null, { age, back: sh, stageFor: age }); return; }
    if (v) d.stages[age] = { play: v, notes: st ? st.notes : '' }; else delete d.stages[age];
    emit();
  };
  return (
    <div className="field stage">
      <label className="label" htmlFor={id}>{STAGE_NAME[age]}</label>
      <select id={id} className="select" value={st ? st.play : ''} onChange={(e) => setPlay(e.target.value)}>
        <option value="">{age === 'castle' ? 'Not planned yet' : 'No play'}</option>
        {cur && !isActive(cur) && <option value={cur.id}>{cur.name} (retired)</option>}
        {cur && cur.age !== age && <option value={cur.id}>{cur.name} ({STAGE_NAME[cur.age]}, wrong age)</option>}
        {fams.map((f) => (
          <optgroup key={f} label={f}>
            {plays.filter((p) => (p.family || 'Other') === f).sort(byName).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </optgroup>
        ))}
        <option value="__new">New {STAGE_NAME[age]} play</option>
      </select>
      {cur && <span className="stage-steps"><StepPills steps={cur.steps} /></span>}
      {st && <textarea id={id + '-notes'} className="textarea" rows={2} aria-label={'How it is run in ' + STAGE_NAME[age]} placeholder="How it is run here: timings, what to watch for"
        value={st.notes} onChange={(e) => { st.notes = e.target.value; emit(); }} />}
    </div>
  );
}

// A game plan's branches: detours set off by something scouted, or variants.
function BranchesField({ planId, sh }: { planId: string; sh: DefSheetT }) {
  const list = L.branchesOf(planId);
  return (
    <div className="field">
      <span className="label">Branches</span>
      {list.map((b) => (
        <button key={b.id} type="button" className="item" data-act="df-branch" data-id={b.id} onClick={() => openBranch(planId, b.id, b.trigger ? 'mine' : 'theirs', sh)}>
          <span className="t">{b.name}</span>
          <span className="s">{b.trigger ? 'If you scout ' + L.triggerText(b.trigger) : 'Variant'}. {b.rejoins ? 'Rejoins in ' + STAGE_NAME[b.rejoins] : 'Doesn\'t rejoin'}.</span>
        </button>
      ))}
      {!list.length && <span className="hint">None yet. A branch leaves this game plan when you scout something; a variant is another way it goes.</span>}
      <div className="chiprow">
        <button type="button" className="btn btn-outline btn-sm" data-act="df-branch-new" onClick={() => openBranch(planId, null, 'mine', sh)}>Add a branch</button>
        <button type="button" className="btn btn-outline btn-sm" data-act="df-variant-new" onClick={() => openBranch(planId, null, 'theirs', sh)}>Add a variant</button>
        <button type="button" className="btn btn-outline btn-sm" data-act="df-versus" onClick={() => { S.sheet = null; openVersus({ mine: planId }); }}>Open in Versus</button>
      </div>
    </div>
  );
}

export function DefSheet({ sh }: { sh: DefSheetT }) {
  const d = sh.draft, t = sh.type;
  const it = sh.id ? (S.data.defs[t] as { id: string; name: string; active: boolean; mergedInto?: string | null }[]).find((x) => x.id === sh.id) || null : null;
  const desc = (ph?: string) => <Field id="df-desc" label="Description"><textarea id="df-desc" className="textarea" rows={2} placeholder={ph || ''} {...bind(d, 'description')} /></Field>;
  let body;
  if (t === 'plays') {
    const fams = L.families(d.age);
    const steps = <><div className="field"><span className="label">Age</span><AgeSeg act="df-age" value={d.age} onPick={(a) => { d.age = a; emit(); }} /></div><Builder sh={sh} mode="steps" /></>;
    const usedBy = it ? L.activePlans().filter((g) => STAGE_AGES.some((a) => g.stages[a]?.play === it.id)) : [];
    body = <>
      {it ? <><CivChips field="play" id={sh.id} d={d} blocksFor={(c) => draftBlockers('plays', d, c)} />{steps}</> : <>{steps}<CivChips field="play" id={sh.id} d={d} blocksFor={(c) => draftBlockers('plays', d, c)} /></>}
      <Field id="df-family" label="Family">
        <input id="df-family" className="input" type="text" list="df-families" autoComplete="off" placeholder="Picked from the steps when left empty" {...bind(d, 'family')} />
        <datalist id="df-families">{fams.map((f) => <option key={f} value={f} />)}</datalist>
      </Field>
      {desc('What the play is going for')}
      <Field id="df-tells" label="Tells"><textarea id="df-tells" className="textarea" rows={2} placeholder="What you see when it's coming" {...bind(d, 'tells')} /></Field>
      <WhereField d={d} />
      {usedBy.length > 0 && <div className="field"><span className="label">In game plans</span><span className="hint">{usedBy.map((g) => g.name).join(', ')}</span></div>}
      {it && <RefsSection field="play" id={it.id} />}
    </>;
  } else if (t === 'gamePlans') {
    body = <>
      {STAGE_AGES.map((a) => <StageField key={a} sh={sh} age={a} />)}
      {it ? <BranchesField planId={it.id} sh={sh} /> : <div className="field"><span className="label">Branches</span><span className="hint">Add the game plan first, then its branches.</span></div>}
      <CivChips field="plan" id={sh.id} d={d} blocksFor={(c) => draftBlockers('gamePlans', d, c)} />
      <div className="field"><span className="label">Status</span><Seg label="Status" act="df-status" options={STATUS} current={d.status} onPick={(v) => { d.status = v; emit(); }} /></div>
      {desc('What the game plan is going for')}
      <Field id="df-notes" label="Notes"><textarea id="df-notes" className="textarea" rows={2} {...bind(d, 'notes')} /></Field>
      <WhereField d={d} />
      {it && <RefsSection field="plan" id={it.id} />}
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
      : it.mergedInto ? 'Merged into ' + (t === 'gamePlans' ? L.planTitle(it.mergedInto) : t === 'elements' ? L.elName(it.mergedInto) : L.playTitle(it.mergedInto)) + '.' : 'Retired. Restoring puts it back in lists and pickers.'}</p>
  );
  const secondary = !it
    ? <button type="button" className="btn" data-act="sheet-close" onClick={() => { S.sheet = sh.back || null; emit(); }}>{sh.back ? 'Back' : 'Cancel'}</button>
    : it.mergedInto
      ? <button type="button" className="btn" data-act="sheet-close" onClick={() => { S.sheet = null; emit(); }}>Close</button>
      : <button type="button" className={'btn' + (isActive(it) ? ' btn-danger' : '')} data-act="df-secondary" onClick={() => toggleDefActive(t, it.id)}>{isActive(it) ? 'Retire' : 'Restore'}</button>;
  return (
    <>
      <div className="sheet-head"><h2 id="sheet-title">{it ? it.name : 'New ' + (t === 'plays' && sh.stageFor ? STAGE_NAME[d.age] + ' ' : '') + DEF_WORD[t]}</h2><CloseBtn /></div>
      <Field id="df-name" label="Name"><input id="df-name" className="input" type="text" autoComplete="off" {...bind(d, 'name')} /></Field>
      {body}
      {status}
      <div className="btn-row sheet-foot">{secondary}<button type="button" className="btn btn-primary" data-act="df-save" onClick={() => saveDef()}>{it ? 'Save' : 'Add'}</button></div>
    </>
  );
}
