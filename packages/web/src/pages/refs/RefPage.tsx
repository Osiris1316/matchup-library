// One reference, opened beside the references list on a wide screen, or on its
// own on a phone.
import { guideTitle } from '@matchup-library/core';
import { useStore } from '../../store';
import { openRefDetails, refFromView } from '../../actions';
import { paths } from '../../app/paths';
import { PageHead } from '../../components/bits';
import { GameTitle } from '../../components/refs';
import { Panes } from '../../kit/layout/Panes';
import { RefsList } from './RefsList';
import { RefDetail } from './RefDetail';
import s from './Refs.module.css';

export function RefPage() {
  useStore();
  const r = refFromView();
  if (!r) return <><PageHead title="Reference" back={paths.refs()} /><main className="main"><p className="empty">That reference isn't in the library. It may have been deleted.</p></main></>;
  const g = r.kind === 'game' ? r.g : null;
  const title = g ? <GameTitle g={g} lg /> : guideTitle(r.kind === 'guide' ? r.l : null);
  const route = 'ref-' + r.kind + '-' + r.id;
  return (
    <>
      <PageHead title={title} back={paths.refs()} aside={<button type="button" className="head-link" data-act="rf-edit" onClick={() => openRefDetails(null, r)}>Edit details</button>} />
      <main className={s.main}>
        <Panes label="References" showing="detail" list={<RefsList current={route} />} detail={<RefDetail r={r} />} />
      </main>
    </>
  );
}
