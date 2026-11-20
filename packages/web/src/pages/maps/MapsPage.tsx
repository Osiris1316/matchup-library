// Maps: the list of maps, features or map types, with nothing open yet. Wide,
// the list sits on the left and the open one fills the right; on a phone the
// list shows alone.
import { plural, isActive } from '@matchup-library/core';
import { S, emit, useStore } from '../../store';
import { PageHead } from '../../components/bits';
import { Panes } from '../../kit/layout/Panes';
import { MapsList } from './MapsList';
import { NoMapOpen } from './MapDetail';
import s from './Maps.module.css';

export function RetiredToggle() {
  const u = S.ui.maps;
  const D = S.data.defs;
  const n = [...D.maps, ...D.features, ...D.mapTypes].filter((x) => !isActive(x)).length;
  return (
    <button type="button" className="head-link" data-act="maps-retired" aria-pressed={u.showRetired} onClick={() => { u.showRetired = !u.showRetired; emit(); }}>
      {u.showRetired ? 'Hide retired' : n ? 'Show ' + plural(n, 'retired') : 'None retired'}
    </button>
  );
}

export function MapsPage() {
  useStore();
  return (
    <>
      <PageHead title="Maps" tools={<RetiredToggle />} />
      <main className={s.main}>
        <Panes label="Maps" showing="list" listWidth="minmax(300px, 360px)" list={<MapsList />} detail={<NoMapOpen />} />
      </main>
    </>
  );
}
