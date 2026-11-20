// The head of a civ's page: pick the civ right there (no trip back to a list),
// switch between Stages and Tags, the page's own tools, and Edit civ.
import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { byName, isActive } from '@matchup-library/core';
import { L, S } from '../../store';
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
// The list is every civ, variants under their parent, then the retired, then
// New civ: there's no separate page of civs to manage.
const NEW = '__new';
const INDENT = '\u00a0\u00a0\u00a0';
function CivPicker({ cid, onPick }: { cid: string; onPick: (id: string) => void }) {
  const all = S.data.defs.civs;
  const active = all.filter(isActive);
  const bases = active.filter((c) => !c.parent || !active.some((p) => p.id === c.parent)).sort(byName);
  const retired = all.filter((c) => !isActive(c)).sort(byName);
  const here = L.civ(cid);
  const flag = hasFlag(cid);
  const mark = here && here.short && here.short !== here.name ? here.short : '';
  return (
    <span className={s.picker}>
      <span className={s.face} aria-hidden="true">
        {flag ? <Flag id={cid} lg /> : mark ? <span className={s.mark}>{mark}</span> : null}
        <span className={s.name}>{here ? here.name : 'Civ'}</span>
        {here && !isActive(here) && <span className={s.retired}>Retired</span>}
        <span className={s.chev}><Icon name="down" size={16} w={2} /></span>
      </span>
      <select id="civ-pick" className={s.select} aria-label="Civ" value={cid}
        onChange={(e) => { if (e.target.value === NEW) openDef('civs', null); else onPick(e.target.value); }}>
        {bases.map((b) => [
          <option key={b.id} value={b.id}>{b.name}</option>,
          ...active.filter((v) => v.parent === b.id).sort(byName).map((v) => <option key={v.id} value={v.id} data-variant={b.id}>{INDENT + v.name}</option>)
        ])}
        {retired.length > 0 && <optgroup label="Retired">{retired.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>}
        <optgroup label="Add"><option value={NEW}>New civ</option></optgroup>
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
