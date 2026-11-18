// Civs: every civ, with its variants under it. Each opens its own page.
import { Link } from 'react-router';
import { byName, isActive, type Civ } from '@matchup-library/core';
import { L, S, emit, useStore } from '../../store';
import { openDef, toggleDefActive } from '../../actions';
import { paths } from '../../app/paths';
import { Flag, hasFlag } from '../../components/Flag';
import { NewButton, PageHead, RetiredToggle, UpkeepLink } from '../../components/bits';

export function CivsPage() {
  useStore();
  const u = S.ui.civs;
  const all = S.data.defs.civs.filter((c) => isActive(c) || u.showRetired);
  const bases = all.filter((c) => !c.parent || !L.civ(c.parent)).sort(byName);
  const row = (c: Civ, variant: boolean) => {
    const retired = !isActive(c);
    return (
      <div key={c.id} className={'lrow' + (variant ? ' variant' : '') + (retired ? ' retired' : '')}>
        {retired
          ? <>
              <button type="button" className="main-btn" data-act="df-open" data-type="civs" data-id={c.id} onClick={() => openDef('civs', c.id)}><span className="t">{c.name} (retired)</span></button>
              <button type="button" className="pill-btn" data-act="df-restore" data-type="civs" data-id={c.id} aria-label={'Restore ' + c.name} onClick={() => toggleDefActive('civs', c.id)}><span className="pill">Restore</span></button>
            </>
          : <>
              {hasFlag(c.id) && <span className="lead-flag"><Flag id={c.id} /></span>}
              <Link className="main-btn" to={paths.civ(c.id, S.ui.civ.tab)}><span className="t">{c.name}</span><span className="s">{L.civTagSummary(c.id)}</span></Link>
            </>}
      </div>
    );
  };
  return (
    <>
      <PageHead title="Civs" aside={<UpkeepLink />} />
      <main className="main">
        <section className="block">
          <p className="hint">Open a civ to tag what it does, anywhere or only in some places. Variants sit under their base civ.</p>
          <div className="list">
            {bases.map((b) => [row(b, false), ...all.filter((v) => v.parent === b.id).sort(byName).map((v) => row(v, true))])}
          </div>
          <NewButton type="civs" word="civ" />
          <RetiredToggle act="civs-retired" on={u.showRetired} count={S.data.defs.civs.filter((c) => !isActive(c)).length} onToggle={() => { u.showRetired = !u.showRetired; emit(); }} />
        </section>
      </main>
    </>
  );
}
