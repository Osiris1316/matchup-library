// The tab bar. NavLink marks the current page (aria-current), including the
// pages under a tab: a civ's page lights Civs, a reference lights References.
import { NavLink } from 'react-router';
import { Icon, type IconName } from '../components/Icon';
import { paths, type TopPage } from './paths';
import s from './Nav.module.css';

const TABS: [TopPage, IconName, string, string][] = [
  ['library', 'library', 'Library', paths.library()],
  ['civs', 'civs', 'Civs', paths.civs()],
  ['maps', 'maps', 'Maps', paths.maps()],
  ['refs', 'refs', 'References', paths.refs()],
  ['versus', 'versus', 'Versus', paths.versus()],
  ['check', 'check', 'Check', paths.check()]
];

export function Nav() {
  return (
    <nav className={s.nav} aria-label="Main">
      <div className={s.inner} id="tabs">
        <span className={s.brand} aria-hidden="true">Matchup Library</span>
        {TABS.map(([id, icon, name, to]) => (
          <NavLink key={id} className={s.tab} to={to} data-tab={id}><Icon name={icon} />{name}</NavLink>
        ))}
      </div>
    </nav>
  );
}
