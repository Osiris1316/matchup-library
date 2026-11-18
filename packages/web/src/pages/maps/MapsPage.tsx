// Maps: maps, features and map types.
import { byName, isActive, plural, type Feature, type MapDef, type MapType } from '@matchup-library/core';
import { L, S, emit, useStore, type MapsSeg } from '../../store';
import { DEF_WORD } from '../../actions';
import { DefRow, NewButton, PageHead, RetiredToggle, Seg, UpkeepLink } from '../../components/bits';

const HINT: Record<MapsSeg, string> = {
  maps: 'Open a map to give it features. Features let one tag cover every map that has them.',
  features: 'Things a map can have that change how plays go. Open one to pick the maps that usually have it.',
  mapTypes: 'The broad buckets maps fall into.'
};

export function MapsPage() {
  useStore();
  const u = S.ui.maps;
  const D = S.data.defs;
  const all: (MapDef | Feature | MapType)[] = D[u.seg];
  const shown = all.filter((x) => isActive(x) || u.showRetired);
  const retiredCount = all.filter((x) => !isActive(x)).length;
  let list;
  if (u.seg === 'maps') {
    const maps = shown as MapDef[];
    const featureNames = (m: MapDef) => ((m.features || []).length ? m.features.map((f) => L.feature(f)?.name || f).join(', ') : 'No features yet');
    const orphans = maps.filter((m) => !L.mapType(m.type));
    list = (
      <>
        {D.mapTypes.filter((t) => isActive(t) || u.showRetired).map((t) => {
          const ms = maps.filter((m) => m.type === t.id).sort(byName);
          if (!ms.length) return null;
          return (
            <div key={t.id}>
              <div className="group"><h3 className="label">{t.name}{isActive(t) ? '' : ' (retired type)'}</h3></div>
              <div className="list">{ms.map((m) => <DefRow key={m.id} type="maps" it={m} sub={featureNames(m)} sub2={m.inPool === false ? 'Out of the ranked pool' : ''} />)}</div>
            </div>
          );
        })}
        {orphans.length > 0 && (
          <div>
            <div className="group"><h3 className="label">No type</h3></div>
            <div className="list">{orphans.map((m) => <DefRow key={m.id} type="maps" it={m} sub="Pick a map type" />)}</div>
          </div>
        )}
      </>
    );
  } else if (u.seg === 'features') {
    list = (
      <div className="list">
        {(shown as Feature[]).map((f) => {
          const n = D.maps.filter((m) => isActive(m) && (m.features || []).includes(f.id)).length;
          return <DefRow key={f.id} type="features" it={f} sub={n ? 'On ' + plural(n, 'map') : 'On no maps yet'} sub2={f.description || ''} />;
        })}
      </div>
    );
  } else {
    list = <div className="list">{shown.map((t) => <DefRow key={t.id} type="mapTypes" it={t} sub={plural(L.mapsOfType(t.id).length, 'map')} />)}</div>;
  }
  return (
    <>
      <PageHead title="Maps" aside={<UpkeepLink />} />
      <main className="main">
        <Seg label="Show" act="maps-seg" options={[['maps', 'Maps'], ['features', 'Features'], ['mapTypes', 'Map types']]} current={u.seg} onPick={(v) => { u.seg = v; emit(); }} />
        <section className="block">
          <p className="hint">{HINT[u.seg]}</p>
          {shown.length ? list : <p className="empty">Nothing here yet.</p>}
          <NewButton type={u.seg} word={DEF_WORD[u.seg]} />
          <RetiredToggle act="maps-retired" on={u.showRetired} count={retiredCount} onToggle={() => { u.showRetired = !u.showRetired; emit(); }} />
        </section>
      </main>
    </>
  );
}
