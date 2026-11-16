// Upkeep: recent changes with undo, duplicate checks, and a download.
import { STAGE_NAME, ago, plural } from '@matchup-library/core';
import { L, S, emit, openSheet, type MergeSheet as MergeSheetT } from '../store';
import { downloadCopy, undoLast } from '../api/client';
import { doMerge } from '../actions';
import { CloseBtn, SheetBack } from '../components/bits';

export function UpkeepSheet() {
  const h = L.health();
  const ids = Object.keys(S.changes).sort().reverse();
  return (
    <>
      <div className="sheet-head"><h2 id="sheet-title">Upkeep</h2><CloseBtn /></div>
      <section className="block">
        <h3 className="label">Recent changes</h3>
        {ids.length
          ? <>
              <div className="list">
                {ids.slice(0, 8).map((id, i) => {
                  const ch = S.changes[id];
                  if (!ch) return null;
                  return (
                    <div key={id} className="lrow">
                      <span className="change-row">{ch.label} <span className="muted">· {ago(ch.at)}</span></span>
                      {i === 0 && <button type="button" className="pill-btn" data-act="up-undo" onClick={() => undoLast()}><span className="pill">Undo</span></button>}
                    </div>
                  );
                })}
              </div>
              <p className="hint">Undo works newest first.</p>
            </>
          : <p className="hint">Changes you make anywhere are listed here.</p>}
      </section>
      <section className="block">
        <h3 className="label">Checks</h3>
        <div className="panel">
          <span className="strong">
            {h.dupes.length ? plural(h.dupes.length, 'set of plays has', 'sets of plays have') + ' the same steps. '
              : h.planDupes.length ? plural(h.planDupes.length, 'set of game plans has', 'sets of game plans have') + ' the same plays. '
              : h.issues.length ? 'Needs a look' : 'All clear'}
          </span>
          <span className="hint">
            {h.dupes[0] ? h.dupes[0].map((s) => s.name).join(' and ') + '. ' : h.planDupes[0] ? h.planDupes[0].map((s) => s.name).join(' and ') + '. ' : ''}
            {h.issues.join('. ')}{h.issues.length ? '.' : ''}
            {!h.dupes.length && !h.planDupes.length && !h.issues.length ? 'No duplicate plays or game plans, no half-finished merges, no ages that clash with an element.' : ''}
          </span>
          {h.dupes.length > 0 && <button type="button" className="btn" data-act="up-merge" onClick={() => openSheet({ kind: 'merge', what: 'play', keep: null, back: S.sheet })}>Merge duplicate plays</button>}
          {!h.dupes.length && h.planDupes.length > 0 && <button type="button" className="btn" data-act="up-merge" onClick={() => openSheet({ kind: 'merge', what: 'plan', keep: null, back: S.sheet })}>Merge duplicate game plans</button>}
        </div>
      </section>
      <section className="block">
        <h3 className="label">Your data</h3>
        <p className="hint">Everything in the library as one file, for safekeeping.</p>
        <button type="button" className="btn" data-act="up-export" onClick={downloadCopy}>Download a copy</button>
      </section>
    </>
  );
}

export function MergeSheet({ sh }: { sh: MergeSheetT }) {
  const h = L.health();
  const isPlay = sh.what === 'play';
  const group: { id: string; name: string }[] | undefined = isPlay ? h.dupes[0] : h.planDupes[0];
  const first = group && group[0];
  if (!group || !first) {
    return <><SheetBack /><div className="sheet-head"><h2 id="sheet-title">No duplicates</h2><CloseBtn /></div><p className="hint">Nothing to merge.</p></>;
  }
  const keep = sh.keep && group.some((s) => s.id === sh.keep) ? sh.keep : first.id;
  const field = isPlay ? 'play' : 'plan';
  const firstPlay = isPlay ? L.play(first.id) : null;
  const same = firstPlay ? 'the same steps in ' + STAGE_NAME[firstPlay.age] + ': ' + L.sequence(firstPlay.steps) : 'the same play in every age: ' + L.planSequence(L.plan(first.id));
  return (
    <>
      <SheetBack />
      <div className="sheet-head"><h2 id="sheet-title">Merge duplicate {isPlay ? 'plays' : 'game plans'}</h2><CloseBtn /></div>
      <p className="hint">These have {same}. Keep one, and every {isPlay ? 'game plan, game' : 'game'} and tag moves to it.</p>
      <div className="block" role="group" aria-label={'Which ' + (isPlay ? 'play' : 'game plan') + ' to keep'}>
        {group.map((s) => {
          const n = L.civCount(field, s.id);
          return (
            <button key={s.id} type="button" className={'card' + (keep === s.id ? ' picked' : ' quiet')} data-act="mg-keep" data-id={s.id} aria-pressed={keep === s.id} onClick={() => { sh.keep = s.id; emit(); }}>
              <span className="t">{s.name}</span><span className="s">{n ? 'Tagged for ' + plural(n, 'civ') : 'No civs yet'}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="btn btn-primary" data-act="mg-do" data-keep={keep} onClick={() => doMerge(sh.what, keep)}>Keep {L.itemName(field, keep)} and merge</button>
    </>
  );
}
