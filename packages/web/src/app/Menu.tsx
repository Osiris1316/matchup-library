// The menu: one button at the start of every page head opens a drawer with the
// pages. It replaced the tab bars, so the top of the page is free for the page
// itself. The drawer closes on a choice, on Escape, on the scrim, and whenever
// the address changes.
import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router';
import { L, S, emit, openSheet } from '../store';
import { Icon, type IconName } from '../components/Icon';
import { paths } from './paths';
import s from './Menu.module.css';

let opener: HTMLElement | null = null;

export function openMenu(from?: HTMLElement | null): void { opener = from || null; S.menuOpen = true; emit(); }
export function closeMenu(): void {
  if (!S.menuOpen) return;
  S.menuOpen = false; emit();
  if (opener) { const el = opener; opener = null; requestAnimationFrame(() => el.focus()); }
}

export function MenuButton() {
  return (
    <button type="button" className={s.button} data-act="menu" aria-label="Menu" aria-haspopup="dialog" aria-expanded={S.menuOpen} aria-controls="menu"
      onClick={(e) => openMenu(e.currentTarget)}>
      <Icon name="menu" size={20} w={2} />
    </button>
  );
}

// The civ the menu's Civs opens: the last one looked at, else the one Check
// compares against, else the first.
function civTarget(): string {
  const ok = (id: string) => !!id && !!L.civ(id);
  return [S.lastCiv, S.ui.check.opp].find(ok) || (L.activeCivs()[0] ? L.activeCivs()[0]!.id : '');
}

export function MenuDrawer() {
  const { pathname } = useLocation();
  const panel = useRef<HTMLDivElement | null>(null);
  const open = S.menuOpen;
  useEffect(() => {
    if (!open || !panel.current) return;
    const el = panel.current;
    const first = el.querySelector<HTMLElement>('[aria-current="page"]') || el.querySelector<HTMLElement>('a, button');
    if (first) first.focus();
    // Keep Tab inside the drawer while it's open.
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = [...el.querySelectorAll<HTMLElement>('a, button')];
      const a = items[0], z = items[items.length - 1];
      if (!a || !z) return;
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    el.addEventListener('keydown', trap);
    return () => el.removeEventListener('keydown', trap);
  }, [open]);
  if (!open) return null;
  const on = (test: boolean) => (test ? 'page' as const : undefined);
  const civPage = /^\/civs\/[^/]+/.test(pathname);
  const civId = civTarget();
  const pages: [string, IconName, string, string, boolean][] = [
    ['library', 'library', 'Library', paths.library(), pathname.startsWith('/library')],
    ['civs', 'civs', 'Civs', civId ? paths.civ(civId, S.ui.civ.tab) : paths.civs(), civPage],
    ['maps', 'maps', 'Maps', paths.maps(), pathname.startsWith('/maps')],
    ['refs', 'refs', 'References', paths.refs(), pathname.startsWith('/refs')],
    ['versus', 'versus', 'Versus', paths.versus(), pathname.startsWith('/versus')],
    ['check', 'check', 'Check', paths.check(), pathname.startsWith('/check')]
  ];
  const civName = !civPage && civId ? L.civShort(civId) : null;
  return (
    <>
      <button type="button" className={s.scrim} data-act="menu-close" aria-label="Close the menu" tabIndex={-1} onClick={closeMenu} />
      <div id="menu" ref={panel} className={s.drawer} role="dialog" aria-modal="true" aria-label="Menu">
        <div className={s.top}>
          <span className={s.brand}>Matchup Library</span>
          <button type="button" className={s.close} data-act="menu-x" aria-label="Close the menu" onClick={closeMenu}><Icon name="x" size={18} w={2} /></button>
        </div>
        <nav aria-label="Pages">
          {pages.map(([id, icon, name, to, current]) => (
            <Link key={id} className={s.link} to={to} data-page={id} aria-current={on(current)} onClick={() => { S.menuOpen = false; }}>
              <Icon name={icon} />{name}{id === 'civs' && civName && <span className={s.sub}>{civName}</span>}
            </Link>
          ))}
        </nav>
        <div className={s.rule} />
        <Link className={s.link + ' ' + s.minor} to={paths.civs()} data-page="manage-civs" aria-current={on(pathname === '/civs')} onClick={() => { S.menuOpen = false; }}>All civs: add, retire and variants</Link>
        <button type="button" className={s.link + ' ' + s.minor} data-act="menu-upkeep" onClick={() => { S.menuOpen = false; openSheet({ kind: 'upkeep' }); }}>Upkeep</button>
      </div>
    </>
  );
}
