// The open sheet, if any, over a scrim, and the toast. Sheets aren't pages:
// they edit something in place and close back to the page underneath.
import { S, closeSheet, showToast, type Sheet } from '../store';
import { undoLast } from '../api/client';
import { DefSheet } from '../sheets/DefSheet';
import { BulkSheet, TagSheet } from '../sheets/TagSheets';
import { WhySheet } from '../sheets/WhySheet';
import { MergeSheet, UpkeepSheet } from '../sheets/UpkeepSheet';
import { MomentSheet, RefDetailsSheet } from '../sheets/RefSheets';
import { AnswerSheet, BranchSheet } from '../sheets/VersusSheets';

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
export function SheetHost() {
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

export function Toast() {
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
