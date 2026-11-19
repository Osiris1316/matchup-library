// All civs: every civ as a card, its variants inside it. Each opens its own
// page. Add, retire and restore civs here; day to day, the menu's Civs and the
// civ picker in a civ page's head get you around faster.
import { Link } from 'react-router';
import { byName, isActive, plural, type Civ } from '@matchup-library/core';
import { L, S, emit, useStore } from '../../store';
import { openDef, toggleDefActive } from '../../actions';
import { paths } from '../../app/paths';
import { Flag, hasFlag } from '../../components/Flag';
import { Icon } from '../../components/Icon';
import { PageHead } from '../../components/bits';
import { AutoGrid } from '../../kit/layout/AutoGrid';
import s from './CivsPage.module.css';

function CivRow({ c, variant }: { c: Civ; variant?: boolean }) {
  const retired = !isActive(c);
  const inner = (
    <>
      <span className={s.flag}>{hasFlag(c.id) && <Flag id={c.id} />}</span>
      <span className={s.text}>
        <span className={s.name}>{c.name}{retired ? ' (retired)' : ''}</span>
        <span className={s.sum}>{L.civTagSummary(c.id)}</span>
      </span>
    </>
  );
  const cls = s.civ + (variant ? ' ' + s.variant : '');
  if (!retired) return <Link className={cls} to={paths.civ(c.id, S.ui.civ.tab)} data-civ={c.id}>{inner}</Link>;
  return (
    <span className={s.row}>
      <button type="button" className={cls} data-act="df-open" data-type="civs" data-id={c.id} onClick={() => openDef('civs', c.id)}>{inner}</button>
      <button type="button" className={'pill-btn ' + s.restore} data-act="df-restore" data-type="civs" data-id={c.id} aria-label={'Restore ' + c.name} onClick={() => toggleDefActive('civs', c.id)}><span className="pill">Restore</span></button>
    </span>
  );
}

export function CivsPage() {
  useStore();
  const u = S.ui.civs;
  const all = S.data.defs.civs.filter((c) => isActive(c) || u.showRetired);
  const bases = all.filter((c) => !c.parent || !L.civ(c.parent)).sort(byName);
  const retiredCount = S.data.defs.civs.filter((c) => !isActive(c)).length;
  return (
    <>
      <PageHead title="All civs"
        tools={<button type="button" className="head-link" data-act="civs-retired" aria-pressed={u.showRetired} onClick={() => { u.showRetired = !u.showRetired; emit(); }}>
          {u.showRetired ? 'Hide retired' : retiredCount ? 'Show ' + plural(retiredCount, 'retired civ') : 'None retired'}
        </button>}
        aside={<button type="button" className="btn btn-sm btn-outline" data-act="df-new" data-type="civs" onClick={() => openDef('civs', null)}><Icon name="plus" size={16} w={2} /> New civ</button>} />
      <main className="main">
        <AutoGrid min={300}>
          {bases.map((b) => {
            const variants = all.filter((v) => v.parent === b.id).sort(byName);
            return (
              <article key={b.id} className={s.card} data-retired={isActive(b) ? undefined : ''}>
                <CivRow c={b} />
                {variants.length > 0 && <div className={s.variants}>{variants.map((v) => <CivRow key={v.id} c={v} variant />)}</div>}
              </article>
            );
          })}
          {!bases.length && <p className={'empty ' + s.empty}>No civs yet. Add one, or load the starting reference data (see the README).</p>}
        </AutoGrid>
      </main>
    </>
  );
}
