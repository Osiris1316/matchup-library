// The head of a civ's page: pick the civ right there (no trip back to a list),
// switch between Stages and Tags, the page's own tools, and Edit civ.
import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { L } from '../../store';
import { openDef } from '../../actions';
import { paths, readCivView, type CivTab } from '../../app/paths';
import { go } from '../../app/navigation';
import { PageHead } from '../../app/PageHead';
import { Seg } from '../../components/bits';
import { Flag, hasFlag } from '../../components/Flag';
import { Icon } from '../../components/Icon';
import s from './CivHead.module.css';

// The civ's name as the page title, with the real dropdown laid invisibly over
// it: a native dropdown is as wide as its longest option, so drawing the name
// ourselves keeps the arrow beside it. Clicks and keys still reach the dropdown.
function CivPicker({ cid, onPick }: { cid: string; onPick: (id: string) => void }) {
  const civs = L.activeCivs();
  const here = L.civ(cid);
  const list = here && !civs.some((c) => c.id === cid) ? [...civs, here] : civs;
  const flag = hasFlag(cid);
  const mark = here && here.short && here.short !== here.name ? here.short : '';
  return (
    <span className={s.picker}>
      <span className={s.face} aria-hidden="true">
        {flag ? <Flag id={cid} lg /> : mark ? <span className={s.mark}>{mark}</span> : null}
        <span className={s.name}>{here ? here.name : 'Civ'}</span>
        <span className={s.chev}><Icon name="down" size={16} w={2} /></span>
      </span>
      <select id="civ-pick" className={s.select} aria-label="Civ" value={cid} onChange={(e) => onPick(e.target.value)}>
        {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </span>
  );
}

export function CivHead({ cid, tab, tools }: { cid: string; tab: CivTab; tools?: ReactNode }) {
  const { search } = useLocation();
  const map = readCivView(search).map;
  const c = L.civ(cid);
  // Another civ opens on the same tab and map; picks belong to this civ, so they stay behind.
  const pickCiv = (id: string) => go(paths.civ(id, tab, tab === 'stages' ? { map } : {}));
  const tabs = (
    <span className={s.tabs}>
      <Seg label="Show" act="cv-tab" options={[['stages', 'Stages'], ['tags', 'Tags']] as [CivTab, string][]} current={tab}
        onPick={(v) => go(paths.civ(cid, v, v === 'stages' ? { map } : {}), { replace: true, keepScroll: true })} />
    </span>
  );
  return (
    <PageHead title={c ? c.name : 'Civ'} control={<CivPicker cid={cid} onPick={pickCiv} />} tools={<>{tabs}{tools}</>}
      aside={<button type="button" className="head-link" data-act="cv-edit" onClick={() => openDef('civs', cid)}>Edit civ</button>} />
  );
}
