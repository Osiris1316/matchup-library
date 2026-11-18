// References: games (yours and others') and guides, newest first.
import { Link } from 'react-router';
import { SOURCE_SHORT, fmtDate, linkHint, plural } from '@matchup-library/core';
import { L, S, emit, useStore } from '../../store';
import { openRefDetails } from '../../actions';
import { refPath } from '../../app/paths';
import { Flag, hasFlag } from '../../components/Flag';
import { PageHead, Seg, UpkeepLink } from '../../components/bits';
import { GameTitle, REF_KIND } from '../../components/refs';

export function RefsPage() {
  useStore();
  const u = S.ui.refs;
  const items = L.refItems().filter((r) => u.seg === 'all' || (u.seg === 'mine' ? r.kind === 'mine' : u.seg === 'games' ? r.kind === 'game' : r.kind === 'guide'));
  return (
    <>
      <PageHead title="References" aside={<UpkeepLink />} />
      <main className="main">
        <section className="panel">
          <label className="label" htmlFor="rf-url">Add a reference</label>
          <input id="rf-url" className="input" type="url" inputMode="url" autoComplete="off" placeholder="Paste a YouTube, Twitch or aoe4world link" value={u.url}
            onChange={(e) => { u.url = e.target.value; emit(); }} />
          <p className="hint" id="rf-hint">{linkHint(u.url)}</p>
          <div className="btn-row three">
            {(['mine', 'game', 'guide'] as const).map((k) => (
              <button key={k} type="button" className="btn" data-act="rf-new" data-kind={k} onClick={() => openRefDetails(k, null)}>{REF_KIND[k]}</button>
            ))}
          </div>
          <p className="hint">A replay or VOD of a real match is a game, yours or someone else's. A video that teaches is a guide.</p>
        </section>
        <Seg label="Show" act="rf-seg" options={[['all', 'All'], ['mine', 'Mine'], ['games', 'Others'], ['guides', 'Guides']]} current={u.seg} onPick={(v) => { u.seg = v; emit(); }} />
        <section className="block">
          {items.length
            ? <div className="list">
                {items.map((r) => {
                  const src = r.source ? SOURCE_SHORT[r.source] : r.kind === 'guide' ? '' : 'No link';
                  const g = r.kind === 'guide' ? null : S.data.games[r.id];
                  return (
                    <div key={r.route} className="lrow">
                      {r.kind === 'guide' && hasFlag(r.civ) && <span className="lead-flag"><Flag id={r.civ} alone /></span>}
                      <Link className="main-btn" to={refPath(r.route)}>
                        <span className="t">{g ? <GameTitle g={g} /> : r.title}</span>
                        <span className="s">{[REF_KIND[r.kind], src, plural(r.count, 'moment'), r.date ? fmtDate(r.date) : ''].filter(Boolean).join(' · ')}</span>
                      </Link>
                    </div>
                  );
                })}
              </div>
            : <p className="empty">No references here yet.</p>}
        </section>
      </main>
    </>
  );
}
