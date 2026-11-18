// The Library's element editor and the "where it is used" pane. On a wide
// screen they sit beside the element list; on a phone they replace it.
import { Link } from 'react-router';
import {
  AGES, AGE_NAME, EL_TYPES, EL_TYPE_NAME, INTENTS, INTENT_NAME, STAGE_NAME, byName, isActive, plural, type Age, type DefType, type ElType, type Intent,
  type Place, type SubjectKind
} from '@matchup-library/core';
import { L, S, bind, emit, showToast, toggleIn, type DefDraft } from '../../store';
import { closeElement, draftAgesWith, openDef, revertElement, saveElement, toggleDefActive, elementDirty } from '../../actions';
import { Flag } from '../../components/Flag';
import { MultiSelect, type MsOption } from '../../components/pickers';
import { Field } from '../../components/bits';
import { paths } from '../../app/paths';
import { Icon } from '../../components/Icon';
import { PillFace, StepPills, Tile } from '../../components/Pill';
import { CivChips, RefsSection, WhereField } from '../../sheets/DefSheet';

// Which subjects suit each type. Anything goes for an element with no type yet.
const SUBJECT_KINDS: Record<ElType, SubjectKind[]> = {
  unit: ['unit'],
  structure: ['building', 'landmark'],
  economy: ['unit', 'building', 'technology'],
  age_tech: ['technology', 'landmark']
};
const isType = (k: string): k is ElType => (EL_TYPES as string[]).includes(k);
const ANY: Place = { kind: 'any' };

function SubjectField({ d }: { d: DefDraft }) {
  const u = S.ui.library;
  const sj = L.subject(d.subject);
  const all = L.subjects();
  if (!all.length) {
    return (
      <div className="field">
        <span className="label">Subject, the icon</span>
        <span className="hint">No subjects loaded yet. Run <code>pnpm subjects sql</code> and load the file it writes (see the README).</span>
      </div>
    );
  }
  const kinds: SubjectKind[] = isType(d.kind) ? SUBJECT_KINDS[d.kind] : ['unit', 'building', 'landmark', 'technology'];
  const q = u.subjectQ.trim().toLowerCase();
  const matches = all.filter((x) => (x.active || x.id === d.subject) && kinds.includes(x.kind) && (!q || x.name.toLowerCase().includes(q))).sort(byName);
  const shown = matches.slice(0, 60);
  const pick = (id: string) => { d.subject = id; u.subjectPick = false; u.subjectQ = ''; emit(); };
  return (
    <div className="field">
      <span className="label">Subject, the icon</span>
      <div className="subj-now">
        {sj
          ? <><Tile look={{ icon: sj.icon, type: isType(d.kind) ? d.kind : null }} size="xl" /><span className="fw5">{sj.name}</span></>
          : <span className="muted">No subject</span>}
        <button type="button" className="btn btn-outline" data-act="df-subject-pick" aria-expanded={u.subjectPick} onClick={() => { u.subjectPick = !u.subjectPick; emit(); }}>
          {u.subjectPick ? 'Close' : sj ? 'Change' : 'Pick one'}
        </button>
        {sj && <button type="button" className="btn btn-outline" data-act="df-subject-clear" onClick={() => pick('')}>Clear</button>}
      </div>
      {u.subjectPick && (
        <>
          <input id="df-subject-q" className="input" type="search" autoComplete="off" placeholder={'Search ' + kinds.map((k) => (k === 'technology' ? 'technologies' : k + 's')).join(', ')}
            aria-label="Search subjects" value={u.subjectQ} onChange={(e) => { u.subjectQ = e.target.value; emit(); }} />
          <div className="subj-grid" role="group" aria-label="Subjects">
            {shown.map((x) => (
              <button key={x.id} type="button" data-act="df-subject" data-id={x.id} aria-pressed={x.id === d.subject} onClick={() => pick(x.id)}>
                <Tile look={{ icon: x.icon, type: isType(d.kind) ? d.kind : null }} size="xl" />
                <span>{x.name}</span>
              </button>
            ))}
          </div>
          <span className="hint">
            {matches.length > shown.length ? 'Showing ' + shown.length + ' of ' + matches.length + '. Search to narrow. ' : matches.length ? '' : 'Nothing matches. '}
            Icons from the AoE4 World data repo, filtered to the type. Optional for broad elements.
          </span>
        </>
      )}
    </div>
  );
}

function IntentField({ d }: { d: DefDraft }) {
  const opts: (Intent | null)[] = [...INTENTS, null];
  const sj = L.subject(d.subject);
  return (
    <div className="field">
      <span className="label">Intent, the name colour</span>
      <div className="intentseg" role="group" aria-label="Intent">
        {opts.map((i) => (
          <button key={i || 'none'} type="button" data-act="df-intent" data-v={i || 'none'} data-intent={i || 'none'} aria-pressed={(d.intent || null) === i}
            onClick={() => { d.intent = i || ''; emit(); }}>{i ? INTENT_NAME[i] : 'None'}</button>
        ))}
      </div>
      <span className="hint">
        {d.kind === 'age_tech'
          ? "Leave it on None so each landmark's own intent shows. A play step or a tag can still set one."
          : 'The usual intent. A play step or a tag can use it differently, such as towers used to attack.'}
        {!d.intent && sj && sj.defaultIntent ? ' ' + sj.name + ' brings ' + INTENT_NAME[sj.defaultIntent].toLowerCase() + '.' : ''}
      </span>
    </div>
  );
}

function UniversalField({ id, d }: { id: string | null; d: DefDraft }) {
  const civs = L.activeCivs();
  const options: MsOption[] = civs.map((c) => ({ group: c.parent ? 'Variants' : 'Civs', value: c.id, label: c.name, short: c.short || c.name, flag: <Flag id={c.id} /> }))
    .sort((a, b) => (a.group === b.group ? 0 : a.group === 'Civs' ? -1 : 1));
  return (
    <>
      <label className="check plain">
        <input type="checkbox" id="df-universal" checked={d.universal} onChange={(e) => { d.universal = e.target.checked; emit(); }} />
        <span className="txt"><span>Every civ can do it</span><span className="sublabel">It counts for every civ without tags. List only the civs that can't.</span></span>
      </label>
      {d.universal
        ? <>
            <MultiSelect msKey="cannot" label="Civs that can't" options={options} selected={d.cannot} none="None, every civ can"
              onToggle={(v, on) => { d.cannot = toggleIn(d.cannot, v, on); }} />
            {id && L.civCount('el', id) > 0 && <span className="hint">{plural(L.civCount('el', id), 'civ')} still {L.civCount('el', id) === 1 ? 'has a tag' : 'have tags'} for it. Tags with timings or notes stay useful; plain ones can be retired on the civ page.</span>}
          </>
        : <CivChips field="el" id={id} d={d} />}
    </>
  );
}

// Civs whose ages differ from the usual ones. A civ listed here can do it in
// exactly the ages ticked; every other civ uses the usual ages.
function CivAgesField({ d }: { d: DefDraft }) {
  const listed = Object.keys(d.civAges).sort((a, b) => L.civName(a, a).localeCompare(L.civName(b, b)));
  const free = L.activeCivs().filter((c) => !(c.id in d.civAges) && !(d.universal && d.cannot.includes(c.id)));
  const sj = L.subject(d.subject);
  // The game data's earlier starts, against the ages in the editor rather than the saved ones.
  const firstUsual = AGES.findIndex((a) => d.ages.includes(a));
  const early = Object.entries((sj && sj.early) || {})
    .map(([c, n]) => ({ civ: c, age: AGES[Number(n) - 1] as Age }))
    .filter((x) => x.age && L.civ(x.civ) && isActive(L.civ(x.civ)) && AGES.indexOf(x.age) < firstUsual && !(d.civAges[x.civ] || []).includes(x.age) && !(d.universal && d.cannot.includes(x.civ)));
  const toggle = (c: string, a: Age) => {
    const now = d.civAges[c] || [];
    const next = AGES.filter((x) => (x === a ? !now.includes(x) : now.includes(x)));
    if (!next.length) { showToast('Keep at least one age on, or take ' + L.civShort(c) + ' off the list.', true); return; }
    d.civAges[c] = next; emit();
  };
  return (
    <div className="field">
      <span className="label">Ages by civ</span>
      {listed.map((c) => (
        <div key={c} className="civage">
          <span className="ca-who"><Flag id={c} /><span className="fw5">{L.civName(c, c)}</span></span>
          <div className="tiles small" role="group" aria-label={'Ages for ' + L.civName(c, c)}>
            {AGES.map((a) => <button key={a} type="button" data-act="df-civage" data-civ={c} data-v={a} aria-pressed={(d.civAges[c] || []).includes(a)} onClick={() => toggle(c, a)}>{AGE_NAME[a]}</button>)}
          </div>
          <button type="button" className="icon-btn" data-act="df-civage-remove" data-civ={c} aria-label={'Take ' + L.civName(c, c) + ' off, back to the usual ages'} onClick={() => { delete d.civAges[c]; emit(); }}>
            <Icon name="x" size={16} w={2} />
          </button>
        </div>
      ))}
      {early.length > 0 && (
        <div className="panel">
          <span className="hint">The AoE4 World data has {early.map((x) => L.civShort(x.civ) + ' from ' + AGE_NAME[x.age]).join(', ')}.</span>
          <div className="chiprow">
            {early.map((x) => (
              <button key={x.civ} type="button" className="btn btn-outline btn-sm" data-act="df-civage-early" data-civ={x.civ}
                onClick={() => { d.civAges[x.civ] = draftAgesWith(d, x.civ, x.age); emit(); }}>Add {L.civShort(x.civ)} from {AGE_NAME[x.age]}</button>
            ))}
          </div>
        </div>
      )}
      <select id="df-civage-add" className="select" aria-label="Add a civ whose ages differ" value=""
        onChange={(e) => { const c = e.target.value; if (c) { d.civAges[c] = d.ages.slice(); emit(); } }}>
        <option value="">{listed.length ? 'Add another civ' : 'Add a civ whose ages differ'}</option>
        {free.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <span className="hint">{listed.length
        ? 'Each civ listed does it in exactly the ages ticked. Every other civ uses the ages above.'
        : 'For a civ that does it in other ages, such as English men-at-arms in the Dark Age. Every other civ keeps the ages above.'}</span>
    </div>
  );
}

export function ElementPane() {
  const u = S.ui.library;
  const d = u.draft;
  if (!d) {
    return <p className="empty">Pick an element to edit it, or add a new one.</p>;
  }
  const id = u.sel === 'new' ? null : u.sel;
  const it = id ? L.el(id) : null;
  const sj = L.subject(d.subject);
  const type = isType(d.kind) ? d.kind : null;
  const oldKind = !type && d.kind ? (L.kind(d.kind) || { name: d.kind }).name : '';
  const dirty = elementDirty();
  const status = it ? (it.mergedInto ? 'Merged into ' + L.elName(it.mergedInto) + '.' : !isActive(it) ? 'Retired.' : dirty ? 'Unsaved changes.' : '') : 'New element. Name it, pick its type, and save.';
  const toggleAge = (a: (typeof AGES)[number]) => {
    const next = AGES.filter((x) => (x === a ? !d.ages.includes(x) : d.ages.includes(x)));
    if (!next.length) { showToast('Keep at least one age on.', true); return; }
    d.ages = next; emit();
  };
  return (
    <>
      <button type="button" className="textlink lib-back" data-act="lib-back" onClick={closeElement}><span className="vs"><Icon name="back" size={14} w={2} /> All elements</span></button>
      <div className="edhead">
        <PillFace type={type} intent={(d.intent || null) || (sj && sj.defaultIntent) || null} icon={sj ? sj.icon : null} name={d.name.trim() || 'New element'} size="lg" />
        <div><h2 id="ed-title">{it ? it.name : 'New element'}</h2>{status && <span className="sub">{status}</span>}</div>
      </div>
      <Field id="df-name" label="Name"><input id="df-name" className="input" type="text" autoComplete="off" {...bind(d, 'name')} /></Field>
      <div className="field">
        <span className="label">Type, the tile colour</span>
        <div className="typeseg" role="group" aria-label="Type">
          {EL_TYPES.map((ty) => (
            <button key={ty} type="button" data-act="df-type" data-v={ty} aria-pressed={d.kind === ty} onClick={() => { d.kind = ty; emit(); }}>
              <span className="swatch" data-type={ty} />{EL_TYPE_NAME[ty]}
            </button>
          ))}
        </div>
        {oldKind && <span className="hint warn-text">Its old kind was {oldKind}. Pick one of the four types.</span>}
      </div>
      <SubjectField d={d} />
      <IntentField d={d} />
      <UniversalField id={id} d={d} />
      <div className="field">
        <span className="label">Can happen in</span>
        <div className="tiles" role="group" aria-label="Ages it can happen in">
          {AGES.map((a) => <button key={a} type="button" data-act="df-age" data-v={a} aria-pressed={d.ages.includes(a)} onClick={() => toggleAge(a)}>{AGE_NAME[a]}</button>)}
        </div>
        <span className="hint">Its usual ages. Leave every age on unless you're sure it can't happen then.</span>
      </div>
      <CivAgesField d={d} />
      <Field id="df-desc" label="Description"><textarea id="df-desc" className="textarea" rows={2} placeholder="What it is" {...bind(d, 'description')} /></Field>
      <Field id="df-tells" label="Tells, for anyone doing it"><textarea id="df-tells" className="textarea" rows={2} placeholder="What you'd scout that gives it away" {...bind(d, 'tells')} /></Field>
      <WhereField d={d} />
      <div className="ed-foot">
        <button type="button" className="btn btn-primary" data-act="df-save" onClick={() => saveElement()}>{it ? 'Save' : 'Add'}</button>
        <button type="button" className="btn" data-act="df-revert" disabled={!dirty && !!it} onClick={revertElement}>{it ? 'Revert' : 'Cancel'}</button>
        {it && !it.mergedInto && (
          <button type="button" className={'btn' + (isActive(it) ? ' btn-danger' : '')} data-act="df-secondary" onClick={() => toggleDefActive('elements' as DefType, it.id)}>
            {isActive(it) ? 'Retire' : 'Restore'}
          </button>
        )}
      </div>
    </>
  );
}

export function UsesPane() {
  const u = S.ui.library;
  const id = u.sel && u.sel !== 'new' ? u.sel : null;
  const e = id ? L.el(id) : null;
  if (!id || !e) return <p className="hint">Where an element is used shows here once it's saved.</p>;
  const plays = S.data.defs.plays.filter((s) => isActive(s) && s.steps.some((st) => st.el === id)).sort((a, b) => AGES.indexOf(a.age) - AGES.indexOf(b.age) || byName(a, b));
  const civs = L.activeCivs().filter((c) => L.elementEvidence(c.id, id, ANY, null).some((x) => x.kind !== 'universal'));
  const cannot = (e.cannot || []).map((c) => L.civShort(c) || c);
  return (
    <>
      <section className="block">
        <h3 className="label">Plays with {e.name}</h3>
        {plays.length
          ? <div className="list">
              {plays.map((s) => (
                <button key={s.id} type="button" className="item" data-act="df-open" data-type="plays" data-id={s.id} onClick={() => openDef('plays', s.id)}>
                  <span className="t">{s.name} <span className="sublabel">{STAGE_NAME[s.age]}</span></span>
                  <StepPills steps={s.steps} mini />
                  <span className="s">{L.civCount('play', s.id) ? plural(L.civCount('play', s.id), 'civ') + ' tagged' : 'No civs yet'}</span>
                </button>
              ))}
            </div>
          : <p className="hint">No plays use it yet.</p>}
      </section>
      <section className="block">
        <h3 className="label">Civs documented doing it</h3>
        {e.universal && <p className="hint">Every civ can{cannot.length ? ', except ' + cannot.join(', ') : ''}. These are the civs with tags, games or guides as well.</p>}
        {civs.length
          ? <div className="chiprow">{civs.map((c) => <Link key={c.id} className="chip" to={paths.civ(c.id, S.ui.civ.tab)}><Flag id={c.id} />{c.short || c.name}</Link>)}</div>
          : <p className="hint">{e.universal ? 'None beyond that.' : 'No civs yet. Tick them in the editor, or tag them on a civ page.'}</p>}
      </section>
      <RefsSection field="el" id={id} />
    </>
  );
}
