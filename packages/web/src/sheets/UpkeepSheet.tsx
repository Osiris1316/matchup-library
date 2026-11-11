// Upkeep: recent changes with undo, duplicate checks, and a download.
import { ago, plural } from '@matchup-library/core';
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
          <span className="strong">{h.dupes.length ? plural(h.dupes.length, 'set of plays has', 'sets of plays have') + ' the same steps' : h.issues.length ? 'Needs a look' : 'All clear'}</span>
          <span className="hint">
            {h.dupes[0] ? h.dupes[0].map((s) => s.name).join(' and ') + '.' : ''} {h.issues.join('. ')}{h.issues.length ? '.' : ''}
            {!h.dupes.length && !h.issues.length ? 'No duplicate plays, no half-finished merges, no ages that clash with an element.' : ''}
          </span>
          {h.dupes.length > 0 && <button type="button" className="btn" data-act="up-merge" onClick={() => openSheet({ kind: 'merge', keep: null, back: S.sheet })}>Merge duplicates</button>}
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
  const group = L.health().dupes[0];
  if (!group || !group[0]) {
    return <><SheetBack /><div className="sheet-head"><h2 id="sheet-title">No duplicates</h2><CloseBtn /></div><p className="hint">Nothing to merge.</p></>;
  }
  const keep = sh.keep && group.some((s) => s.id === sh.keep) ? sh.keep : group[0].id;
  return (
    <>
      <SheetBack />
      <div className="sheet-head"><h2 id="sheet-title">Merge duplicate plays</h2><CloseBtn /></div>
      <p className="hint">These have the same steps: {L.sequence(group[0].steps)}. Keep one, and every game and tag moves to it.</p>
      <div className="block" role="group" aria-label="Which play to keep">
        {group.map((s) => {
          const n = L.civCount('play', s.id);
          return (
            <button key={s.id} type="button" className={'card' + (keep === s.id ? ' picked' : ' quiet')} data-act="mg-keep" data-id={s.id} aria-pressed={keep === s.id} onClick={() => { sh.keep = s.id; emit(); }}>
              <span className="t">{s.name}</span><span className="s">{n ? 'Tagged for ' + plural(n, 'civ') : 'No civs yet'}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="btn btn-primary" data-act="mg-do" data-keep={keep} onClick={() => doMerge(keep)}>Keep {L.playTitle(keep)} and merge</button>
    </>
  );
}
