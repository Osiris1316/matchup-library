// The whole page: the current view, the tab bar, an open sheet and a toast.
import { S, closeSheet, showToast, useStore, type Sheet } from './store';
import { undoLast } from './api/client';
import { Icon, type IconName } from './components/Icon';
import { PageHead } from './components/bits';
import { LibraryView } from './views/LibraryView';
import { CivView, CivsView } from './views/CivsView';
import { MapsView } from './views/MapsView';
import { CheckView } from './views/CheckView';
import { RefView, RefsView } from './views/RefsView';
import { DefSheet } from './sheets/DefSheet';
import { BulkSheet, TagSheet } from './sheets/TagSheets';
import { WhySheet } from './sheets/WhySheet';
import { MergeSheet, UpkeepSheet } from './sheets/UpkeepSheet';
import { MomentSheet, RefDetailsSheet } from './sheets/RefSheets';
import { AnswerSheet, BranchSheet } from './sheets/VersusSheets';
import { VersusView } from './views/VersusView';

function Message({ text }: { text: string }) {
  return <><PageHead title="Matchup Library" /><main className="main"><p className="empty">{text}</p></main></>;
}

function View() {
  if (S.dbState === 'connecting') return <p className="loading">Opening your library…</p>;
  if (S.dbState === 'unavailable') return <Message text="Couldn't reach the library. Reload the page. If your sign-in has expired, you'll be asked to sign in again." />;
  if (S.dbState === 'unauthorized') return <Message text={S.authError || 'Not signed in.'} />;
  if (!S.data.defs.civs.length) return <Message text={S.loaded ? 'The library has no civs, maps or elements yet. Load the starting reference data (see the README).' : 'Loading civs, maps and elements…'} />;
  const v = S.view;
  if (v === 'civs') return <CivsView />;
  if (v.startsWith('civ-')) return <CivView />;
  if (v === 'maps') return <MapsView />;
  if (v === 'check') return <CheckView />;
  if (v === 'versus') return <VersusView />;
  if (v === 'refs') return <RefsView />;
  if (v.startsWith('ref-')) return <RefView />;
  return <LibraryView />;
}

const TABS: [IconName, string][] = [['library', 'Library'], ['civs', 'Civs'], ['maps', 'Maps'], ['refs', 'References'], ['versus', 'Versus'], ['check', 'Check']];
function Tabs() {
  const active = S.view.startsWith('civ') ? 'civs' : S.view.startsWith('ref') ? 'refs' : S.view;
  return <>{TABS.map(([id, name]) => <a key={id} className="tab" href={'#' + id} aria-current={active === id ? 'page' : undefined}><Icon name={id} />{name}</a>)}</>;
}

function SheetInner({ sh }: { sh: Sheet }) {
  switch (sh.kind) {
    case 'def': return <DefSheet sh={sh} />;
    case 'tag': return <TagSheet sh={sh} />;
    case 'bulk': return <BulkSheet sh={sh} />;
    case 'why': return <WhySheet sh={sh} />;
    case 'upkeep': return <UpkeepSheet />;
    case 'merge': return <MergeSheet sh={sh} />;
    case 'refdet': return <RefDetailsSheet sh={sh} />;
    case 'moment': return <MomentSheet sh={sh} />;
    case 'branch': return <BranchSheet sh={sh} />;
    case 'answer': return <AnswerSheet sh={sh} />;
  }
}

// A new sheet gets a new key, so it opens scrolled to the top.
function SheetHost() {
  const sh = S.sheet;
  if (!sh) return null;
  return (
    <>
      <button type="button" className="scrim" data-act="sheet-close" aria-label="Close" onClick={closeSheet} />
      <div key={sh.sid} className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <span className="grab" aria-hidden="true" />
        <SheetInner sh={sh} />
      </div>
    </>
  );
}

function ToastView() {
  const t = S.toast;
  if (!t) return null;
  const undo = () => {
    const ids = Object.keys(S.changes).sort();
    if (ids[ids.length - 1] === t.undoId) { void undoLast(); return; }
    showToast('Other changes came after that one. Undo them from Upkeep, newest first.', true);
  };
  return (
    <div className={'toast-wrap' + (S.sheet ? ' top' : '')}>
      <div className={'toast' + (t.warn ? ' warn' : '')} role="status">
        <span className="msg">{t.text}</span>
        {t.undoId && <button type="button" className="btn" data-act="toast-undo" onClick={undo}>Undo</button>}
      </div>
    </div>
  );
}

export function App() {
  useStore();
  return (
    <>
      <div className={'shell' + (S.view === 'library' || S.view === 'versus' || S.view.startsWith('civ-') ? ' wide' : '')}><div id="view"><View /></div></div>
      <nav className="tabs" aria-label="Main"><div className="tabs-inner" id="tabs"><Tabs /></div></nav>
      <div id="sheet"><SheetHost /></div>
      <div id="toast"><ToastView /></div>
    </>
  );
}
