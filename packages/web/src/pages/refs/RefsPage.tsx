// References: games (yours and others') and guides, newest first. On a wide
// screen the list sits beside the reference you open.
import { L, useStore } from '../../store';
import { PageHead } from '../../components/bits';
import { Panes } from '../../kit/layout/Panes';
import { RefsList } from './RefsList';
import { NoRefOpen } from './RefDetail';
import s from './Refs.module.css';

export function RefsPage() {
  useStore();
  return (
    <>
      <PageHead title="References" />
      <main className={s.main}>
        <Panes label="References" showing="list" listWidth="minmax(300px, 360px)" list={<RefsList />} detail={<NoRefOpen count={L.refItems().length} />} />
      </main>
    </>
  );
}
