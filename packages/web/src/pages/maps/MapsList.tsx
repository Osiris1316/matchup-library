// The list beside an open map, feature or map type: a switch for which kind,
// then the list, with New at the end. Maps are grouped by type.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { byName, isActive, plural, type Feature, type MapDef, type MapType } from '@matchup-library/core';
import { L, S, emit, type MapsSeg } from '../../store';
import { DEF_WORD } from '../../actions';
import { NewButton, Seg } from '../../components/bits';
import { paths, type MapKind } from '../../app/paths';
import s from './Maps.module.css';

export const SEG_KIND: Record<MapsSeg, MapKind> = { maps: 'map', features: 'feature', mapTypes: 'type' };
export const KIND_SEG: Record<MapKind, MapsSeg> = { map: 'maps', feature: 'features', type: 'mapTypes' };

function Row({ kind, it, sub, current }: { kind: MapKind; it: MapDef | Feature | MapType; sub: string; current: boolean }) {
  const retired = !isActive(it);
  return (
    <div className={'lrow ' + s.item + (retired ? ' retired' : '')} aria-current={current ? 'page' : undefined}>
      <Link className="main-btn" to={paths.mapItem(kind, it.id)} data-map-item={kind + ':' + it.id}>
        <span className="t">{it.name}{retired ? ' (retired)' : ''}</span>
        {sub && <span className="s">{sub}</span>}
      </Link>
    </div>
  );
}

export function MapsList({ current }: { current?: { kind: MapKind; id: string } }) {
  const u = S.ui.maps;
  const D = S.data.defs;
  const shownOf = <T extends MapDef | Feature | MapType>(xs: T[]) => xs.filter((x) => isActive(x) || u.showRetired);
  const on = (kind: MapKind, id: string) => !!current && current.kind === kind && current.id === id;
  const featureNames = (m: MapDef) => ((m.features || []).length ? m.features.map((f) => L.feature(f)?.name || f).join(', ') : 'No features yet');
  let list: ReactNode;
  if (u.seg === 'maps') {
    const maps = shownOf(D.maps);
    const groups = [...D.mapTypes.filter((t) => isActive(t) || u.showRetired).map((t) => ({ key: t.id, name: t.name + (isActive(t) ? '' : ' (retired type)'), ms: maps.filter((m) => m.type === t.id) })),
      { key: '', name: 'No type', ms: maps.filter((m) => !L.mapType(m.type)) }].filter((g) => g.ms.length);
    list = groups.length
      ? groups.map((g) => (
          <div key={g.key} className={s.group}>
            <h3 className="label">{g.name}</h3>
            <div className="list">{g.ms.sort(byName).map((m) => <Row key={m.id} kind="map" it={m} current={on('map', m.id)} sub={[featureNames(m), m.inPool === false ? 'Out of the ranked pool' : ''].filter(Boolean).join(' · ')} />)}</div>
          </div>
        ))
      : <p className="empty">No maps yet.</p>;
  } else if (u.seg === 'features') {
    const fs = shownOf(D.features);
    list = fs.length
      ? <div className="list">{fs.map((f) => {
          const n = D.maps.filter((m) => isActive(m) && (m.features || []).includes(f.id)).length;
          return <Row key={f.id} kind="feature" it={f} current={on('feature', f.id)} sub={n ? 'On ' + plural(n, 'map') : 'On no maps yet'} />;
        })}</div>
      : <p className="empty">No features yet.</p>;
  } else {
    const ts = shownOf(D.mapTypes);
    list = ts.length
      ? <div className="list">{ts.map((t) => <Row key={t.id} kind="type" it={t} current={on('type', t.id)} sub={plural(L.mapsOfType(t.id).length, 'map')} />)}</div>
      : <p className="empty">No map types yet.</p>;
  }
  return (
    <>
      <Seg label="Show" act="maps-seg" options={[['maps', 'Maps'], ['features', 'Features'], ['mapTypes', 'Map types']]} current={u.seg} onPick={(v) => { u.seg = v; emit(); }} />
      {list}
      <div className={s.newRow}><NewButton type={u.seg} word={DEF_WORD[u.seg]} /></div>
    </>
  );
}
