// One civ's page: its stages (plays per age, the rail, your path), or its tags.
import { Link, useParams } from 'react-router';
import { L, S, savePrefs, useStore, type CivTab } from '../../store';
import { civIdFromSlug, paths } from '../../app/paths';
import { PageHead } from '../../components/bits';
import { CivStages } from './stages/CivStages';
import { CivTags } from './CivTags';

export function CivPage({ tab }: { tab: CivTab }) {
  useStore();
  const { civ: slug = '' } = useParams();
  const cid = civIdFromSlug(slug);
  const c = L.civ(cid);
  if (!c) return <><PageHead title="Civ" back={paths.library()} /><main className="main"><p className="empty">That civ isn't in the library. <Link className="ulink" to={paths.civs()}>Open another civ</Link>.</p></main></>;
  // The tab is part of the address; the last one used is what links to a civ open on.
  const u = S.ui.civ;
  if (u.tab !== tab) { u.tab = tab; savePrefs(); }
  return tab === 'stages' ? <CivStages cid={cid} /> : <CivTags cid={cid} c={c} />;
}
