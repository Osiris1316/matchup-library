// Library: elements, plays and kinds.
import { agesText, byName, isActive, plural, type Element, type Kind, type Strategy } from '@matchup-library/core';
import { L, S, emit, type LibrarySeg } from '../store';
import { DEF_WORD } from '../actions';
import { CivFlags } from '../components/Flag';
import { DefRow, NewButton, PageHead, RetiredToggle, Seg, UpkeepLink } from '../components/bits';

const HINT: Record<LibrarySeg, string> = {
  elements: 'The building blocks of a game, for any civ. Open one to say which civs do it.',
  strategies: 'Elements put together in order. Open one to edit its steps or say which civs run it.',
  kinds: 'Groups for elements, used to sort lists and pickers.'
};

export function LibraryView() {
  const u = S.ui.library;
  const D = S.data.defs;
  const all: (Element | Strategy | Kind)[] = D[u.seg];
  const shown = all.filter((x) => isActive(x) || u.showRetired);
  const retiredCount = all.filter((x) => !isActive(x)).length;
  let list;
  if (u.seg === 'elements') {
    const els = shown as Element[];
    const groups = D.kinds.map((k) => ({ key: k.id, name: k.name + (isActive(k) ? '' : ' (retired kind)'), items: els.filter((e) => e.kind === k.id) }));
    groups.push({ key: '', name: 'No kind', items: els.filter((e) => !L.kind(e.kind)) });
    list = groups.filter((g) => g.items.length).map((g) => (
      <div key={g.key}>
        <div className="group"><h3 className="label">{g.name}</h3></div>
        <div className="list">
          {g.items.slice().sort(byName).map((e) => (
            <DefRow key={e.id} type="elements" it={e} sub={agesText(L.elAges(e.id)) + (L.civCount('el', e.id) ? '' : ' · No civs yet')} extra={<CivFlags field="el" id={e.id} />} />
          ))}
        </div>
      </div>
    ));
  } else if (u.seg === 'strategies') {
    list = (
      <div className="list">
        {(shown as Strategy[]).slice().sort(byName).map((s) => {
          const refs = L.refsFor('play', s.id).length;
          return <DefRow key={s.id} type="strategies" it={s} sub={L.sequence(s.steps)} sub2={[L.civCount('play', s.id) ? '' : 'No civs yet', refs ? 'In ' + plural(refs, 'reference') : ''].filter(Boolean).join(' · ')} extra={<CivFlags field="play" id={s.id} />} />;
        })}
      </div>
    );
  } else {
    list = <div className="list">{shown.map((k) => <DefRow key={k.id} type="kinds" it={k} sub={plural(D.elements.filter((e) => isActive(e) && e.kind === k.id).length, 'element')} />)}</div>;
  }
  return (
    <>
      <PageHead title="Library" aside={<UpkeepLink />} />
      <main className="main">
        <Seg label="Show" act="lib-seg" options={[['elements', 'Elements'], ['strategies', 'Plays'], ['kinds', 'Kinds']]} current={u.seg} onPick={(v) => { u.seg = v; emit(); }} />
        <section className="block">
          <p className="hint">{HINT[u.seg]}</p>
          {shown.length ? list : <p className="empty">Nothing here yet.</p>}
          <NewButton type={u.seg} word={DEF_WORD[u.seg]} />
          <RetiredToggle act="lib-retired" on={u.showRetired} count={retiredCount} onToggle={() => { u.showRetired = !u.showRetired; emit(); }} />
        </section>
      </main>
    </>
  );
}
