// The head of every page. title names the page; control, when given, stands
// in for it on screen (the civ picker), with the title kept for screen readers.
// tools are the page's own controls; aside sits at the end; back is the path
// the back arrow goes to.
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon } from '../components/Icon';
import { MenuButton } from './Menu';
import s from './PageHead.module.css';

export interface PageHeadProps { title: ReactNode; control?: ReactNode; tools?: ReactNode; aside?: ReactNode; back?: string; mark?: string; flag?: ReactNode }

export function PageHead({ title, control, tools, aside, back, mark, flag }: PageHeadProps) {
  const ref = useRef<HTMLElement | null>(null);
  // Whatever sticks under the head (age headings, the civ page's rail) needs its height.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty('--page-head-height', Math.round(el.getBoundingClientRect().height) + 'px');
    set();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null;
    if (ro) ro.observe(el);
    return () => { if (ro) ro.disconnect(); };
  }, []);
  return (
    <header className={s.head} ref={ref} data-head="">
      <div className={s.row}>
        <span className={s.lead}>
          <MenuButton />
          {back && <Link className={s.back} to={back} data-act="back" aria-label="Back"><Icon name="back" size={18} w={2} /></Link>}
          {mark && <span className={s.mark} aria-hidden="true">{mark}</span>}
          {flag}
          {control ? <><h1 className={s.hidden}>{title}</h1>{control}</> : <h1 className={s.title}>{title}</h1>}
        </span>
        {tools && <div className={s.tools}>{tools}</div>}
        {aside && <span className={s.aside}>{aside}</span>}
      </div>
    </header>
  );
}
