// The rail beside a civ's stages: the path you've picked and what it matches,
// the map, and the game plans, shrinking to the ones that go your way.
// On a phone it sits above the columns and the game plans become a dropdown.
import {
  STAGE_NAME, plural, routeMatches, type Age, type Picks, type Place, type Route
} from '@matchup-library/core';
import { L, S, emit, openSheet } from '../../../store';
import { openDef, openNewPlan, openTagSheet } from '../../../actions';
import { openVersus } from '../../../versus';
import { MapGroups } from '../../../components/bits';
import { cx } from '../../../kit/cx';
import { gamesThrough, pickedAges, type PlanRow } from './view';
import s from './CivStages.module.css';


interface Props { cid: string; vp: Place; placeKey: string; picks: Picks; rows: PlanRow[]; routes: Route[]; setPicks: (p: Picks) => void; onMap: (key: string) => void }

// Why, Tag and Edit for a play or a game plan, with what documents it here.
function ItemActions({ cid, field, id, vp, placeKey }: { cid: string; field: 'play' | 'plan'; id: string; vp: Place; placeKey: string }) {
  const lines = [...new Set(L.evidence(field, cid, id, vp).sort((a, b) => a.rank - b.rank).map((e) => L.evText(e, field)))];
  return (
    <>
      <span className={s.pathText}>{lines.length ? lines.slice(0, 2).join('. ') + '.' : 'Nothing documented for ' + L.civShort(cid) + ' yet.'}</span>
      <span className={s.acts}>
        <button type="button" className="btn btn-sm" data-act="stg-why" onClick={() => openSheet({ kind: 'why', itemKind: field, id, civ: cid, place: placeKey })}>Why</button>
        <button type="button" className="btn btn-sm" data-act="stg-tag" onClick={() => openTagSheet({ civ: cid, field, id, place: vp })}>Tag {L.civShort(cid)}</button>
        <button type="button" className="btn btn-sm" data-act="stg-edit" onClick={() => openDef(field === 'plan' ? 'gamePlans' : 'plays', id)}>Edit</button>
      </span>
    </>
  );
}

function YourPath({ cid, vp, placeKey, picks, rows, routes, setPicks }: Props) {
  const ages = pickedAges(picks);
  if (!ages.length) return null;
  const exact = rows.find((r) => r.exact);
  const matching = rows.filter((r) => r.matches);
  const games = gamesThrough(routes, picks);
  const one = ages.length === 1 ? ages[0] as Age : null;
  const onePlay = one ? (picks[one] as string) : null;
  const exactBranch = exact && exact.exact && exact.exact.kind === 'branch' ? exact.branches.find((b) => b.branch.id === exact.exact?.branch) : null;
  return (
    <div className={s.path} aria-live="polite">
      <div className={s.sectionHead}>
        <span className="label">Your path</span>
        <button type="button" className={s.textBtn} data-act="stg-clear" onClick={() => setPicks({})}>Clear</button>
      </div>
      {ages.map((a) => (
        <span key={a} className={s.pathAge}><span className="sublabel">{STAGE_NAME[a]}</span><span className={s.pathPlay}>{L.playTitle(picks[a] as string)}</span></span>
      ))}
      {exact
        ? <>
            <span className={s.pathMatch}>This is <strong>{L.planTitle(exact.plan.id)}</strong>{exactBranch ? ', ' + exactBranch.branch.name : ''}.</span>
            <ItemActions cid={cid} field="plan" id={exact.plan.id} vp={vp} placeKey={placeKey} />
            <span className={s.acts}>
              <button type="button" className="btn btn-sm" data-act="stg-versus" onClick={() => openVersus({ me: cid, mine: exact.plan.id })}>Open in Versus</button>
            </span>
          </>
        : one && onePlay
          ? <>
              <ItemActions cid={cid} field="play" id={onePlay} vp={vp} placeKey={placeKey} />
            </>
          : <span className={s.pathText}>
              {matching.length ? plural(matching.length, 'game plan') + ' go this way.' : 'No game plan goes this way yet.'}
              {games ? ' Seen together in ' + plural(games, 'game') + '.' : ''}
            </span>}
      {ages.length > 1 && !rows.some((r) => routeMatches(r.spine, picks) || r.branches.some((b) => routeMatches(b.route, picks))) && (
        <span className={s.acts}>
          <button type="button" className="btn btn-sm btn-primary" data-act="stg-save-path" onClick={() => openNewPlan(picks, cid)}>Save this path as a game plan</button>
        </span>
      )}
    </div>
  );
}

function PlanButton({ row, picks, setPicks }: { row: PlanRow; picks: Picks; setPicks: (p: Picks) => void }) {
  const best = row.plan.ev[0];
  const on = !!row.exact;
  const viaBranch = row.route.kind === 'branch' ? row.branches.find((b) => b.branch.id === row.route.branch) : null;
  return (
    <>
      <button type="button" className={s.plan} data-act="stg-plan" data-id={row.plan.id} aria-pressed={on} onClick={() => setPicks(on ? {} : row.route.stages)}>
        <span className={s.planName}>{L.planTitle(row.plan.id)}</span>
        <span className={s.planSub}>{viaBranch ? 'Through ' + viaBranch.branch.name + '. ' : ''}{best ? L.evText(best, 'plan') : ''}</span>
      </button>
      {on && row.branches.map((b) => {
        const here = routeMatches(b.route, picks) && pickedAges(picks).length === Object.keys(b.route.stages).length;
        return (
          <button key={b.branch.id} type="button" className={cx(s.plan, s.branchRow)} data-act="stg-plan-branch" data-id={b.branch.id} aria-pressed={here}
            onClick={() => setPicks(here ? row.spine.stages : b.route.stages)}>
            <span className={s.planName}>{b.branch.trigger ? 'If they scout ' + L.triggerText({ ...b.branch.trigger, civ: null }).toLowerCase() : 'Variant'}: {b.branch.name}</span>
            <span className={s.planSub}>{b.branch.rejoins ? 'Rejoins in ' + STAGE_NAME[b.branch.rejoins] : 'Doesn\'t rejoin'}</span>
          </button>
        );
      })}
    </>
  );
}

const PlanOption = ({ row }: { row: PlanRow }) => (
  <option value={row.plan.id}>{L.planTitle(row.plan.id)}{row.plan.tier === 'parts' ? ' (possible)' : ''}</option>
);

// The map being viewed: it narrows the evidence, so it sits with the game plans it changes.
function MapPick({ placeKey, onMap }: { placeKey: string; onMap: (key: string) => void }) {
  return (
    <div className={s.section}>
      <label className="label" htmlFor="stg-place">Map</label>
      <select id="stg-place" className="select" value={placeKey} onChange={(e) => onMap(e.target.value)}>
        <option value="any:">Any map</option>
        <optgroup label="Any map of a type">{L.activeTypes().map((t) => <option key={t.id} value={'type:' + t.id}>Any {t.name.toLowerCase()} map</option>)}</optgroup>
        <MapGroups prefix="map:" />
      </select>
    </div>
  );
}

export function StagesRail(props: Props) {
  const { cid, vp, placeKey, picks, rows, setPicks, onMap } = props;
  const u = S.ui.civ;
  const filtering = pickedAges(picks).length > 0;
  const shown = rows.filter((r) => !filtering || r.matches);
  const documented = shown.filter((r) => r.plan.tier === 'documented');
  const parts = shown.filter((r) => r.plan.tier === 'parts');
  const partsShown = u.showParts || filtering ? parts : parts.filter((r) => r.exact);
  const allDoc = rows.filter((r) => r.plan.tier === 'documented').length;
  const exact = rows.find((r) => r.exact);
  return (
    <aside className={s.rail} aria-label="Game plans and your path">
      <YourPath {...props} />
      <MapPick placeKey={placeKey} onMap={onMap} />
      <div className={s.section}>
        <div className={s.sectionHead}>
          <h2 className="label">Game plans</h2>
          <span className="sublabel">{filtering ? shown.length + ' of ' + rows.length + (shown.length === 1 ? ' goes' : ' go') + ' this way' : plural(allDoc, 'documented')}</span>
        </div>
        <select id="stg-plan-pick" className={cx('select', s.planSelect)} aria-label="Pick a game plan" value={exact ? exact.plan.id : ''}
          onChange={(e) => { const r = rows.find((x) => x.plan.id === e.target.value); setPicks(r ? r.spine.stages : {}); }}>
          <option value="">{rows.length ? 'Pick a game plan' : 'No game plans yet'}</option>
          {filtering
            ? <>
                {shown.length > 0 && <optgroup label="Go this way">{shown.map((r) => <PlanOption key={r.plan.id} row={r} />)}</optgroup>}
                <optgroup label="Others">{rows.filter((r) => !r.matches).map((r) => <PlanOption key={r.plan.id} row={r} />)}</optgroup>
              </>
            : rows.map((r) => <PlanOption key={r.plan.id} row={r} />)}
        </select>
        <div className={s.planList}>
          {documented.map((r) => <PlanButton key={r.plan.id} row={r} picks={picks} setPicks={setPicks} />)}
          {!documented.length && (
            <p className="hint">{filtering ? 'No documented game plan goes this way.' : 'No game plans documented for ' + L.civShort(cid) + (vp.kind === 'any' ? ' yet' : ' ' + L.placePhrase(vp)) + '. Tag one, or log a game where they ran it.'}</p>
          )}
          {parts.length > 0 && !filtering && (
            <button type="button" className={s.more} data-act="stg-parts" aria-expanded={u.showParts} onClick={() => { u.showParts = !u.showParts; emit(); }}>
              {u.showParts ? 'Hide the ones possible from their plays' : 'Show ' + parts.length + ' possible from their plays'}
            </button>
          )}
          {parts.length > 0 && filtering && <span className={cx('label', s.partsHead)}>Possible from their plays</span>}
          {partsShown.map((r) => <PlanButton key={r.plan.id} row={r} picks={picks} setPicks={setPicks} />)}
        </div>
      </div>
    </aside>
  );
}
