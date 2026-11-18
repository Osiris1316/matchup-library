// Small shared pieces: page head, segmented control, list rows, selects.
import { Link } from 'react-router';
import type { ReactNode } from 'react';
import { isActive, plural, type DefType } from '@matchup-library/core';
import { L, S, backSheet, closeSheet, openSheet, emit } from '../store';
import { openDef, toggleDefActive } from '../actions';
import { Icon } from './Icon';
import { Flag, hasFlag } from './Flag';

// back: the path the back arrow goes to.
export function PageHead({ title, aside, back, mark, flag }: { title: ReactNode; aside?: ReactNode; back?: string; mark?: string; flag?: ReactNode }) {
  return (
    <header className="head">
      <div className="head-row">
        {back && <Link className="back" to={back} aria-label="Back"><Icon name="back" size={18} w={2} /></Link>}
        {mark && <span className="mark" aria-hidden="true">{mark}</span>}
        {flag}
        <h1>{title}</h1>
        {aside && <span className="aside">{aside}</span>}
      </div>
    </header>
  );
}

export const UpkeepLink = () => (
  <button type="button" className="head-link" data-act="upkeep" onClick={() => openSheet({ kind: 'upkeep' })}>Upkeep</button>
);

export function Seg<V extends string>({ label, act, options, current, onPick }: { label?: string; act: string; options: [V, string][]; current: string; onPick: (v: V) => void }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, t]) => (
        <button key={v} type="button" data-act={act} data-v={v} aria-pressed={String(current) === String(v)} onClick={() => onPick(v)}>{t}</button>
      ))}
    </div>
  );
}

export const CloseBtn = () => (
  <button type="button" className="close" data-act="sheet-close" aria-label="Close" onClick={closeSheet}><Icon name="x" size={18} w={2} /></button>
);
export const SheetBack = () => (S.sheet && S.sheet.back
  ? <button type="button" className="sheet-back" data-act="sheet-back" onClick={backSheet}><Icon name="back" size={14} w={2} /> Back</button>
  : null);

export function Field({ id, label, children }: { id: string; label: ReactNode; children: ReactNode }) {
  return <div className="field"><label className="label" htmlFor={id}>{label}</label>{children}</div>;
}

type DefItem = { id: string; name: string; active: boolean; mergedInto?: string | null };
export function DefRow({ type, it, sub, sub2, extra }: { type: DefType; it: DefItem; sub?: string; sub2?: string; extra?: ReactNode }) {
  const retired = !isActive(it);
  return (
    <div className={'lrow' + (retired ? ' retired' : '')}>
      <button type="button" className="main-btn" data-act="df-open" data-type={type} data-id={it.id} onClick={() => openDef(type, it.id)}>
        <span className="t">{it.name}{retired ? (it.mergedInto ? ' (merged)' : ' (retired)') : ''}</span>
        {sub && <span className="s">{sub}</span>}
        {sub2 && <span className="s">{sub2}</span>}
        {extra}
      </button>
      {retired && !it.mergedInto && (
        <button type="button" className="pill-btn" data-act="df-restore" data-type={type} data-id={it.id} aria-label={'Restore ' + it.name} onClick={() => toggleDefActive(type, it.id)}>
          <span className="pill">Restore</span>
        </button>
      )}
    </div>
  );
}

export function RetiredToggle({ act, on, count, onToggle }: { act: string; on: boolean; count: number; onToggle: () => void }) {
  return (
    <button type="button" className="textlink" data-act={act} aria-pressed={on} onClick={onToggle}>
      <span>{on ? 'Hide retired' : 'Show retired'}</span><span>{count ? plural(count, 'retired') : 'None retired'}</span>
    </button>
  );
}

export function NewButton({ type, word }: { type: DefType; word: string }) {
  return <button type="button" className="btn btn-outline" data-act="df-new" data-type={type} onClick={() => openDef(type, null)}><Icon name="plus" size={16} w={2} /> New {word}</button>;
}

// A native civ picker with the chosen civ's flag inside it.
export function CivSelect({ id, value, empty, onChange }: { id: string; value: string; empty?: string; onChange: (v: string) => void }) {
  const f = hasFlag(value);
  return (
    <div className="civsel">
      {f && <Flag id={value} />}
      <select id={id} className={'select' + (f ? '' : ' noflag')} value={value || ''} onChange={(e) => { onChange(e.target.value); emit(); }}>
        {empty != null && <option value="">{empty}</option>}
        {L.activeCivs().map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
}

// Maps grouped by type, as <optgroup>s.
export function MapGroups({ prefix = '' }: { prefix?: string }) {
  return (
    <>
      {L.activeTypes().map((t) => {
        const maps = L.mapsOfType(t.id);
        if (!maps.length) return null;
        return <optgroup key={t.id} label={t.name}>{maps.map((m) => <option key={m.id} value={prefix + m.id}>{m.name}</option>)}</optgroup>;
      })}
    </>
  );
}

export function Lines({ lines }: { lines: string[] }) {
  return <>{lines.map((x, i) => <span key={i}>{i > 0 && <br />}{x}</span>)}</>;
}
