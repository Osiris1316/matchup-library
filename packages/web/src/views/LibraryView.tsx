// Library: elements (list, editor, where used), landmarks, and plays.
import { AGES, EL_TYPES, EL_TYPE_GROUP, INTENTS, INTENT_NAME, byName, isActive, plural, type ElType, type Element, type Intent, type Strategy, type Subject } from '@matchup-library/core';
import { L, S, emit, type LibrarySeg } from '../store';
import { DEF_WORD, openElement, setSubjectIntent } from '../actions';
import { CivFlags, Flag } from '../components/Flag';
import { DefRow, NewButton, PageHead, RetiredToggle, Seg, UpkeepLink } from '../components/bits';
import { Icon } from '../components/Icon';
import { PillFace, SplitPill, StepPills } from '../components/Pill';
import { ElementPane, UsesPane } from './ElementEditor';

const AGE_LETTER = ['D', 'F', 'C', 'I'];

function ElementRow({ e }: { e: Element }) {
  const u = S.ui.library;
  const ages = L.elAges(e.id);
  const note = e.mergedInto ? 'merged into ' + L.elName(e.mergedInto) : !isActive(e) ? 'retired' : e.universal ? 'every civ' : '';
  const civs = e.universal ? 'All' : String(L.civCount('el', e.id) || '');
  return (
    <button type="button" className={'elrow' + (isActive(e) ? '' : ' retired')} data-act="df-open" data-type="elements" data-id={e.id} aria-current={u.sel === e.id}
      onClick={() => openElement(e.id)}>
      <span className="who-el"><SplitPill el={e.id} /><span className="note">{note}</span></span>
      <span className="agebox" aria-label={'Ages: ' + ages.join(', ')}>{AGES.map((a, i) => <span key={a} className={ages.includes(a) ? '' : 'off'}>{AGE_LETTER[i]}</span>)}</span>
      <span className="num">{civs}</span>
    </button>
  );
}

function ElementList() {
  const u = S.ui.library;
  const all = S.data.defs.elements;
  const q = u.q.trim().toLowerCase();
  const shown = all.filter((e) => (isActive(e) || u.showRetired) && (!q || e.name.toLowerCase().includes(q)));
  const groups: { key: string; type: ElType | null; name: string; items: Element[] }[] = EL_TYPES.map((ty) => ({ key: ty, type: ty, name: EL_TYPE_GROUP[ty], items: shown.filter((e) => e.kind === ty) }));
  groups.push({ key: 'none', type: null, name: 'No type yet', items: shown.filter((e) => !L.elType(e.id)) });
  return (
    <>
      <div className="block-head">
        <h2 className="label">Elements <span className="sublabel">{all.filter(isActive).length}</span></h2>
      </div>
      <input id="lib-q" className="input lib-search" type="search" autoComplete="off" placeholder="Search elements" aria-label="Search elements" value={u.q}
        onChange={(ev) => { u.q = ev.target.value; emit(); }} />
      <div className="elhead label"><span>Element</span><span className="label center">Ages</span><span className="label right">Civs</span></div>
      {groups.filter((g) => g.items.length).map((g) => (
        <div key={g.key} className="elgroup">
          <h3 className="label"><span className="swatch" data-type={g.type || 'none'} />{g.name}</h3>
          {g.items.slice().sort(byName).map((e) => <ElementRow key={e.id} e={e} />)}
        </div>
      ))}
      {!shown.length && <p className="empty">{q ? 'No elements match.' : 'Nothing here yet.'}</p>}
      <button type="button" className="btn btn-outline" data-act="df-new" data-type="elements" onClick={() => openElement(null)}><Icon name="plus" size={16} w={2} /> New element</button>
      <RetiredToggle act="lib-retired" on={u.showRetired} count={all.filter((x) => !isActive(x)).length} onToggle={() => { u.showRetired = !u.showRetired; emit(); }} />
    </>
  );
}

const AGE_UP: Record<number, string> = { 1: 'Age up to Feudal', 2: 'Age up to Castle', 3: 'Age up to Imperial' };

function LandmarkRow({ x, primary }: { x: Subject; primary: string }) {
  const others = (x.civs || []).filter((c) => c !== primary && L.civ(c)).map((c) => L.civShort(c));
  const opts: (Intent | null)[] = [...INTENTS, null];
  return (
    <div className="lmrow">
      <span className="who-el">
        <PillFace type="age_tech" intent={x.defaultIntent} icon={x.icon} name={x.name} />
        <span className="s">{[AGE_UP[x.age || 0] || '', others.length ? 'also ' + others.join(', ') : ''].filter(Boolean).join(', ')}</span>
      </span>
      <div className="intentseg small" role="group" aria-label={'Default intent for ' + x.name}>
        {opts.map((i) => (
          <button key={i || 'none'} type="button" data-act="lm-intent" data-id={x.id} data-v={i || 'none'} data-intent={i || 'none'} aria-pressed={(x.defaultIntent || null) === i}
            onClick={() => setSubjectIntent(x.id, i)}>{i ? INTENT_NAME[i] : 'None'}</button>
        ))}
      </div>
    </div>
  );
}

function LandmarkList() {
  const u = S.ui.library;
  const all = L.subjects().filter((x) => x.kind === 'landmark' && x.active);
  if (!all.length) return <p className="empty">No landmarks loaded yet. Run <code>pnpm subjects sql</code> and load the file it writes (see the README).</p>;
  const civ = u.lmCiv;
  const primaryOf = (x: Subject): string => (x.civs || []).find((c) => L.civ(c)) || '';
  const shown = all.filter((x) => !civ || (x.civs || []).includes(civ));
  const groupIds = [...new Set(shown.map((x) => (civ ? civ : primaryOf(x))))].sort((a, b) => L.civName(a, a).localeCompare(L.civName(b, b)));
  const set = all.filter((x) => x.defaultIntent).length;
  return (
    <section className="block">
      <p className="hint">Each landmark's default intent. An age-up with a landmark shows the landmark's icon, with its name in this colour. A play step or a tag can still set its own. {set} of {all.length} set.</p>
      <div className="field">
        <label className="label" htmlFor="lm-civ">Civ</label>
        <select id="lm-civ" className="select" value={civ} onChange={(e) => { u.lmCiv = e.target.value; emit(); }}>
          <option value="">All civs</option>
          {L.activeCivs().map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {groupIds.map((g) => (
        <div key={g || 'none'} className="elgroup">
          <h3 className="label">{g && <Flag id={g} />}{g ? L.civName(g, g) : 'Other'}</h3>
          {shown.filter((x) => (civ ? true : primaryOf(x) === g)).sort((a, b) => (a.age || 0) - (b.age || 0) || a.name.localeCompare(b.name))
            .map((x) => <LandmarkRow key={x.id} x={x} primary={g} />)}
        </div>
      ))}
    </section>
  );
}

function PlayList() {
  const u = S.ui.library;
  const all = S.data.defs.strategies;
  const shown = all.filter((x) => isActive(x) || u.showRetired);
  return (
    <section className="block">
      <p className="hint">Elements put together in order. Open one to edit its steps or say which civs run it.</p>
      {shown.length
        ? <div className="list">
            {shown.slice().sort(byName).map((s: Strategy) => {
              const refs = L.refsFor('play', s.id).length;
              return <DefRow key={s.id} type="strategies" it={s} sub2={[L.civCount('play', s.id) ? '' : 'No civs yet', refs ? 'In ' + plural(refs, 'reference') : ''].filter(Boolean).join(' · ')}
                extra={<><StepPills steps={s.steps} /><CivFlags field="play" id={s.id} /></>} />;
            })}
          </div>
        : <p className="empty">Nothing here yet.</p>}
      <NewButton type="strategies" word={DEF_WORD.strategies} />
      <RetiredToggle act="lib-retired" on={u.showRetired} count={all.filter((x) => !isActive(x)).length} onToggle={() => { u.showRetired = !u.showRetired; emit(); }} />
    </section>
  );
}

export function LibraryView() {
  const u = S.ui.library;
  return (
    <>
      <PageHead title="Library" aside={<UpkeepLink />} />
      <main className="main">
        <div className="lib-top">
          <Seg label="Show" act="lib-seg" options={[['elements', 'Elements'], ['landmarks', 'Landmarks'], ['strategies', 'Plays']] as [LibrarySeg, string][]} current={u.seg}
            onPick={(v) => { u.seg = v; S.panel.open = null; emit(); }} />
        </div>
        {u.seg === 'elements' && (
          <div className={'lib' + (u.sel ? ' has-sel' : '')}>
            <section className="pane list" aria-label="Elements"><ElementList /></section>
            <section className="pane edit" aria-label="Edit element"><ElementPane /></section>
            <aside className="pane uses" aria-label="Where it is used"><UsesPane /></aside>
          </div>
        )}
        {u.seg === 'landmarks' && <LandmarkList />}
        {u.seg === 'strategies' && <PlayList />}
        <p className="notice">
          Icons from the <a href="https://github.com/aoe4world/data" target="_blank" rel="noopener">AoE4 World data repo</a>.
          Age of Empires IV © Microsoft Corporation. Matchup Library was created under Microsoft's "<a href="https://www.xbox.com/en-US/developers/rules" target="_blank" rel="noopener">Game Content Usage Rules</a>" using assets
          from Age of Empires IV, and it is not endorsed by or affiliated with Microsoft.
        </p>
      </main>
    </>
  );
}
