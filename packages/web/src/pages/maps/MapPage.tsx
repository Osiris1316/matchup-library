// One map, feature or map type, opened beside the list on a wide screen, or on
// its own on a phone. The list shows the same kind as what's open.
import { useParams } from 'react-router';
import { isActive } from '@matchup-library/core';
import { L, S, useStore } from '../../store';
import { openDef } from '../../actions';
import { mapItemFromPath, paths } from '../../app/paths';
import { PageHead } from '../../components/bits';
import { Panes } from '../../kit/layout/Panes';
import { KIND_SEG, MapsList } from './MapsList';
import { DEF_OF, KIND_WORD, MapDetail } from './MapDetail';
import { RetiredToggle } from './MapsPage';
import s from './Maps.module.css';

let synced = '';

export function MapPage() {
  useStore();
  const { kind = '', id = '' } = useParams();
  const cur = mapItemFromPath('/maps/' + kind + '/' + encodeURIComponent(id));
  if (!cur) return <><PageHead title="Maps" back={paths.maps()} /><main className="main"><p className="empty">There's nothing at that address in Maps.</p></main></>;
  const it = cur.kind === 'map' ? L.map(cur.id) : cur.kind === 'feature' ? L.feature(cur.id) : L.mapType(cur.id);
  // Opening one turns the list to its kind (and shows the retired, if it is),
  // once; after that the switch is yours.
  const key = cur.kind + ':' + cur.id;
  if (key !== synced) {
    synced = key;
    const u = S.ui.maps;
    u.seg = KIND_SEG[cur.kind];
    if (it && !isActive(it)) u.showRetired = true;
  }
  return (
    <>
      <PageHead title={it ? it.name : 'Maps'} back={paths.maps()} tools={<RetiredToggle />}
        aside={it && <button type="button" className="head-link" data-act="map-edit" onClick={() => openDef(DEF_OF[cur.kind], cur.id)}>Edit {KIND_WORD[cur.kind].toLowerCase()}</button>} />
      <main className={s.main}>
        <Panes label="Maps" showing="detail" listWidth="minmax(300px, 360px)" list={<MapsList current={cur} />} detail={<MapDetail key={cur.kind + ':' + cur.id} kind={cur.kind} id={cur.id} />} />
      </main>
    </>
  );
}
