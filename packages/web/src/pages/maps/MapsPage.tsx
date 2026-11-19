// Maps: maps, features and map types. Wide, the three sit side by side; on a
// phone the switcher shows one at a time.
import type { ReactNode } from 'react';
import { byName, isActive, plural, type Feature, type MapDef, type MapType } from '@matchup-library/core';
import { L, S, emit, useStore, type MapsSeg } from '../../store';
import { DEF_WORD } from '../../actions';
import { DefRow, NewButton, PageHead, Seg } from '../../components/bits';
import s from './MapsPage.module.css';

const HINT: Record<MapsSeg, string> = {
  maps: 'Open a map to give it features. Features let one tag cover every map that has them.',
  features: 'Things a map can have that change how plays go. Open one to pick the maps that usually have it.',
  mapTypes: 'The broad buckets maps fall into.'
};

// One column: its heading (wide only), what it's for, the list, and New.
function Column({ seg, title, count, current, children }: { seg: MapsSeg; title: string; count: number; current: boolean; children: ReactNode }) {
  return (
    <section className={s.col} data-seg={seg} data-current={current ? '' : undefined} aria-label={title}>
      <div className={s.colHead}><h2 className={s.colTitle}>{title}</h2><span className="sublabel">{count}</span></div>
      <p className="hint">{HINT[seg]}</p>
      {children}
      <NewButton type={seg} word={DEF_WORD[seg]} />
    </section>
  );
}

export function MapsPage() {
  useStore();
  const u = S.ui.maps;
  const D = S.data.defs;
  const shownOf = <T extends MapDef | Feature | MapType>(xs: T[]) => xs.filter((x) => isActive(x) || u.showRetired);
  const maps = shownOf(D.maps);
  const features = shownOf(D.features);
  const types = shownOf(D.mapTypes);
  const retiredCount = [...D.maps, ...D.features, ...D.mapTypes].filter((x) => !isActive(x)).length;
  const featureNames = (m: MapDef) => ((m.features || []).length ? m.features.map((f) => L.feature(f)?.name || f).join(', ') : 'No features yet');
  const orphans = maps.filter((m) => !L.mapType(m.type));
  const empty = <p className="empty">Nothing here yet.</p>;
  return (
    <>
      <PageHead title="Maps"
        tools={<button type="button" className="head-link" data-act="maps-retired" aria-pressed={u.showRetired} onClick={() => { u.showRetired = !u.showRetired; emit(); }}>
          {u.showRetired ? 'Hide retired' : retiredCount ? 'Show ' + plural(retiredCount, 'retired') : 'None retired'}
        </button>} />
      <main className="main">
        <div className={s.seg}>
          <Seg label="Show" act="maps-seg" options={[['maps', 'Maps'], ['features', 'Features'], ['mapTypes', 'Map types']]} current={u.seg} onPick={(v) => { u.seg = v; emit(); }} />
        </div>
        <div className={s.cols}>
          <Column seg="maps" title="Maps" count={maps.length} current={u.seg === 'maps'}>
            {maps.length
              ? <>
                  {D.mapTypes.filter((t) => isActive(t) || u.showRetired).map((t) => {
                    const ms = maps.filter((m) => m.type === t.id).sort(byName);
                    if (!ms.length) return null;
                    return (
                      <div key={t.id}>
                        <div className={s.group}><h3 className="label">{t.name}{isActive(t) ? '' : ' (retired type)'}</h3></div>
                        <div className="list">{ms.map((m) => <DefRow key={m.id} type="maps" it={m} sub={featureNames(m)} sub2={m.inPool === false ? 'Out of the ranked pool' : ''} />)}</div>
                      </div>
                    );
                  })}
                  {orphans.length > 0 && (
                    <div>
                      <div className={s.group}><h3 className="label">No type</h3></div>
                      <div className="list">{orphans.map((m) => <DefRow key={m.id} type="maps" it={m} sub="Pick a map type" />)}</div>
                    </div>
                  )}
                </>
              : empty}
          </Column>
          <Column seg="features" title="Features" count={features.length} current={u.seg === 'features'}>
            {features.length
              ? <div className="list">
                  {features.map((f) => {
                    const n = D.maps.filter((m) => isActive(m) && (m.features || []).includes(f.id)).length;
                    return <DefRow key={f.id} type="features" it={f} sub={n ? 'On ' + plural(n, 'map') : 'On no maps yet'} sub2={f.description || ''} />;
                  })}
                </div>
              : empty}
          </Column>
          <Column seg="mapTypes" title="Map types" count={types.length} current={u.seg === 'mapTypes'}>
            {types.length ? <div className="list">{types.map((t) => <DefRow key={t.id} type="mapTypes" it={t} sub={plural(L.mapsOfType(t.id).length, 'map')} />)}</div> : empty}
          </Column>
        </div>
      </main>
    </>
  );
}
