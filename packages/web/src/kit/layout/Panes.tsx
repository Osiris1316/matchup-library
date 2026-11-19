// A list beside the thing it opens (see Panes.module.css). `showing` says which
// one a phone shows; a wide screen shows both.
import type { CSSProperties, ReactNode } from 'react';
import s from './Panes.module.css';

export function Panes({ list, detail, showing, listWidth, label }: { list: ReactNode; detail: ReactNode; showing: 'list' | 'detail'; listWidth?: string; label?: string }) {
  return (
    <div className={s.panes} data-showing={showing} style={listWidth ? ({ '--list': listWidth } as CSSProperties) : undefined}>
      <section className={s.pane + ' ' + s.list} aria-label={label ? label + ' list' : undefined}>{list}</section>
      <section className={s.pane + ' ' + s.detail} aria-label={label ? 'Open ' + label.toLowerCase() : undefined}>{detail}</section>
    </div>
  );
}
