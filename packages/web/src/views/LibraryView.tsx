// Library: elements (list, editor, where used), plays, game plans and landmarks.
import {
  AGES, EL_TYPES, EL_TYPE_GROUP, INTENTS, INTENT_NAME, STAGE_AGES, STAGE_NAME, byName, isActive, plural,
  type ElType, type Element, type GamePlan, type Intent, type Play, type PlanStatus, type Subject
} from '@matchup-library/core';
import { L, S, emit, type LibrarySeg } from '../store';
import { DEF_WORD, openDef, openElement, setSubjectIntent } from '../actions';
import { CivFlags, Flag } from '../components/Flag';
import { DefRow, NewButton, PageHead, RetiredToggle, Seg, UpkeepLink } from '../components/bits';
import { Icon } from '../components/Icon';
import { PillFace, PlanStages, SplitPill, StepPills } from '../components/Pill';
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

// Plays, by age and then family.
function PlayList() {
  const u = S.ui.library;
  const all = S.data.defs.plays;
  const shown = all.filter((x) => isActive(x) || u.showRetired);
  const ages = AGES.filter((a) => STAGE_AGES.includes(a) || shown.some((p) => p.age === a));
  const row = (p: Play) => {
    const refs = L.refsFor('play', p.id).length;
    const inPlans = L.activePlans().filter((g) => g.stages[p.age]?.play === p.id);
    // Civs that run a game plan with this play run the play too.
    const viaPlans = new Set(L.activeTags().filter((t) => t.plan && inPlans.some((g) => g.id === t.plan)).map((t) => t.civ)).size;
    const civs = L.civCount('play', p.id) ? '' : viaPlans ? plural(viaPlans, 'civ') + ' through game plans' : 'No civs yet';
    return <DefRow key={p.id} type="plays" it={p}
      sub2={[civs, inPlans.length ? 'In ' + plural(inPlans.length, 'game plan') : '', refs ? 'In ' + plural(refs, 'reference') : ''].filter(Boolean).join(' · ')}
      extra={<><StepPills steps={p.steps} /><CivFlags field="play" id={p.id} /></>} />;
  };
  return (
    <section className="block">
      <p className="hint">A play is one age's steps in order. Game plans put one play from each age together. Open one to edit its steps or say which civs run it.</p>
      {ages.map((a) => {
        const inAge = shown.filter((p) => p.age === a);
        const fams = [...new Set(inAge.map((p) => p.family || 'Other'))].sort((x, y) => (x === 'Other' ? 1 : y === 'Other' ? -1 : x.localeCompare(y)));
        return (
          <div key={a} className="agegroup">
            <div className="block-head">
              <h2 className="label">{STAGE_NAME[a]} <span className="sublabel">{inAge.filter(isActive).length}</span></h2>
              <button type="button" className="btn btn-outline btn-sm" data-act="play-new" data-age={a} onClick={() => openDef('plays', null, { age: a })}>New {STAGE_NAME[a]} play</button>
            </div>
            {fams.map((f) => (
              <div key={f} className="elgroup">
                <h3 className="label">{f}</h3>
                <div className="list">{inAge.filter((p) => (p.family || 'Other') === f).sort(byName).map(row)}</div>
              </div>
            ))}
            {!inAge.length && <p className="empty">No {STAGE_NAME[a]} plays yet.</p>}
          </div>
        );
      })}
      <RetiredToggle act="lib-retired" on={u.showRetired} count={all.filter((x) => !isActive(x)).length} onToggle={() => { u.showRetired = !u.showRetired; emit(); }} />
    </section>
  );
}

const STATUS_NAME: Record<PlanStatus, string> = { idea: 'Idea', studying: 'Studying', practiced: 'Practiced', proven: 'Proven' };

function GamePlanList() {
  const u = S.ui.library;
  const all = S.data.defs.gamePlans;
  const shown = all.filter((x) => isActive(x) || u.showRetired);
  return (
    <section className="block">
      <p className="hint">A game plan is one play for each age: how a game goes from the start into Castle. Open one to change a stage or say which civs run it.</p>
      {shown.length
        ? <div className="list">
            {shown.slice().sort(byName).map((g) => {
              const refs = L.refsFor('plan', g.id).length;
              return <DefRow key={g.id} type="gamePlans" it={g}
                sub2={[g.status ? STATUS_NAME[g.status] : '', L.civCount('plan', g.id) ? '' : 'No civs yet', refs ? 'In ' + plural(refs, 'reference') : ''].filter(Boolean).join(' · ')}
                extra={<><PlanStages g={g} /><CivFlags field="plan" id={g.id} /></>} />;
            })}
          </div>
        : <p className="empty">Nothing here yet.</p>}
      <NewButton type="gamePlans" word={DEF_WORD.gamePlans} />
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
          <Seg label="Show" act="lib-seg" options={[['elements', 'Elements'], ['plays', 'Plays'], ['gamePlans', 'Game plans'], ['landmarks', 'Landmarks']] as [LibrarySeg, string][]} current={u.seg}
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
        {u.seg === 'plays' && <PlayList />}
        {u.seg === 'gamePlans' && <GamePlanList />}
        <p className="notice">
          Icons from the <a href="https://github.com/aoe4world/data" target="_blank" rel="noopener">AoE4 World data repo</a>.
          Age of Empires IV © Microsoft Corporation. Matchup Library was created under Microsoft's "<a href="https://www.xbox.com/en-US/developers/rules" target="_blank" rel="noopener">Game Content Usage Rules</a>" using assets
          from Age of Empires IV, and it is not endorsed by or affiliated with Microsoft.
        </p>
      </main>
    </>
  );
}
