// One map, feature or map type, as the pane beside the list: what it is, then
// what the library knows about it. Tags for civs that apply there, game plans,
// plays and elements that come up there, and the references played there.
// Edit is a button; opening it is just reading.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import {
  guideTitle, isActive, plural, tagField, tagTargetId,
  type DefType, type Game, type Link as RefLink, type MapDef, type Place, type TagWithId
} from '@matchup-library/core';
import { L, S } from '../../store';
import { openDef, openTagSheet } from '../../actions';
import { paths, type MapKind } from '../../app/paths';
import { FlagOr } from '../../components/Flag';
import { PlanStages, SplitPill, StepPills } from '../../components/Pill';
import { GameTitle } from '../../components/refs';
import { AutoGrid } from '../../kit/layout/AutoGrid';
import s from './Maps.module.css';

export const KIND_WORD: Record<MapKind, string> = { map: 'Map', feature: 'Feature', type: 'Map type' };
export const DEF_OF: Record<MapKind, DefType> = { map: 'maps', feature: 'features', type: 'mapTypes' };
const FIELD_NAME = { plan: 'Game plans', play: 'Plays', el: 'Elements' } as const;

// The maps a map, feature or type covers.
function mapsFor(kind: MapKind, id: string): MapDef[] {
  if (kind === 'map') { const m = L.map(id); return m ? [m] : []; }
  if (kind === 'type') return L.mapsOfType(id);
  return S.data.defs.maps.filter((m) => isActive(m) && (m.features || []).includes(id));
}

// Tags for a place, not "anywhere": on this map, or on a type or feature it has.
function tagsFor(kind: MapKind, id: string): { t: TagWithId; own: boolean }[] {
  const out: { t: TagWithId; own: boolean }[] = [];
  L.activeTags().forEach((t) => {
    const p = t.place;
    if (!p || p.kind === 'any') return;
    if (kind === 'feature') { if (p.kind === 'feature' && p.id === id) out.push({ t, own: true }); return; }
    const rel = L.relation(p, { kind, id } as Place);
    if (rel === 'own') out.push({ t, own: true });
    else if (rel === 'inherited' || rel === 'narrower') out.push({ t, own: false });
  });
  return out.sort((a, b) => Number(b.own) - Number(a.own) || L.civName(a.t.civ).localeCompare(L.civName(b.t.civ)) || L.tagTargetName(a.t).localeCompare(L.tagTargetName(b.t)));
}

// Game plans, plays and elements that say they come up here.
function comesUp(kind: MapKind, id: string): { type: DefType; id: string; name: string; where: string }[] {
  const out: { type: DefType; id: string; name: string; where: string }[] = [];
  const hits = (def: { where?: Place[] }) => (kind === 'feature'
    ? (def.where || []).filter((p) => p.kind === 'feature' && p.id === id)
    : L.whereHits(def, { kind, id } as Place));
  const D = S.data.defs;
  ([['gamePlans', D.gamePlans], ['plays', D.plays], ['elements', D.elements]] as const).forEach(([type, xs]) => {
    (xs as { id: string; name: string; where?: Place[]; active: boolean }[]).filter(isActive).forEach((d) => {
      const h = hits(d);
      if (h.length) out.push({ type, id: d.id, name: d.name, where: h.map((p) => L.wherePhrase(p)).join(', ') });
    });
  });
  return out;
}

// Games and guides played on the maps it covers.
function refsFor(kind: MapKind, id: string): { key: string; to: string; title: ReactNode; sub: string }[] {
  const ids = new Set(mapsFor(kind, id).map((m) => m.id));
  const games = Object.entries(S.data.games).filter(([, g]) => g.map && ids.has(g.map)) as [string, Game][];
  const guides = Object.entries(S.data.links).filter(([, l]) => !l.gameId && l.map && ids.has(l.map)) as [string, RefLink][];
  return [
    ...games.sort(([, a], [, b]) => String(b.date || '').localeCompare(String(a.date || ''))).map(([gid, g]) => ({
      key: 'g' + gid, to: paths.ref('game', gid), title: <GameTitle g={g} />,
      sub: [g.mine ? 'My game' : 'Other game', kind !== 'map' && g.map ? L.map(g.map)?.name || '' : '', g.result ? (g.result === 'win' ? 'Won' : 'Lost') : ''].filter(Boolean).join(' · ')
    })),
    ...guides.map(([lid, l]) => ({ key: 'l' + lid, to: paths.ref('guide', lid), title: guideTitle(l), sub: ['Guide', kind !== 'map' && l.map ? L.map(l.map)?.name || '' : ''].filter(Boolean).join(' · ') }))
  ];
}

function Block({ title, count, hint, children, act }: { title: string; count: number; hint: string; children: ReactNode; act: string }) {
  return (
    <section className={'block ' + s.block} data-block={act}>
      <div className="block-head"><h3 className="label">{title}</h3><span className="sublabel">{count || ''}</span></div>
      {count ? children : <p className="hint">{hint}</p>}
    </section>
  );
}

function TagRow({ t, own }: { t: TagWithId; own: boolean }) {
  const field = tagField(t);
  const id = tagTargetId(t);
  const plan = field === 'plan' ? L.plan(id) : null;
  const play = field === 'play' ? L.play(id) : null;
  const d = L.tagDetail(t);
  return (
    <div className="lrow">
      <span className="lead-flag"><FlagOr id={t.civ} /></span>
      <button type="button" className="main-btn" data-act="map-tag" data-id={t.id} onClick={() => openTagSheet({ tagId: t.id })}>
        <span className="t">{field === 'el' && t.el ? <SplitPill el={t.el} use={t} /> : L.tagTargetName(t)}</span>
        {play && <StepPills steps={play.steps} mini />}
        {plan && <PlanStages g={plan} />}
        <span className="s">{[L.civName(t.civ), own ? '' : 'Tagged ' + L.placePhrase(t.place), d].filter(Boolean).join(' · ')}</span>
      </button>
    </div>
  );
}

export function MapDetail({ kind, id }: { kind: MapKind; id: string }) {
  const it = kind === 'map' ? L.map(id) : kind === 'feature' ? L.feature(id) : L.mapType(id);
  if (!it) return <div className={s.nothing}><h2 className={s.nothingTitle}>Not in the library</h2><p className="hint">It may have been merged or removed. Pick another from the list.</p></div>;
  const m = kind === 'map' ? (it as MapDef) : null;
  const desc = m ? m.notes : (it as { description: string }).description;
  const maps = mapsFor(kind, id);
  const tags = tagsFor(kind, id);
  const ups = comesUp(kind, id);
  const refs = refsFor(kind, id);
  const fields = (['plan', 'play', 'el'] as const).map((f) => ({ f, xs: tags.filter((x) => tagField(x.t) === f) })).filter((g) => g.xs.length);
  const here = kind === 'map' ? 'this map' : kind === 'feature' ? 'maps with ' + it.name : it.name + ' maps';
  return (
    <div className={s.detail}>
      <section className={s.head}>
        <span className="label">{KIND_WORD[kind]}{isActive(it) ? '' : ' · retired'}</span>
        {desc ? <p className={s.desc}>{desc}</p> : <p className="hint">No {kind === 'map' ? 'notes' : 'description'} yet. Add {kind === 'map' ? 'them' : 'one'} with Edit.</p>}
      </section>

      <dl className={s.facts}>
        {m && (
          <div className={s.fact}>
            <dt>Type</dt>
            <dd>{L.mapType(m.type) ? <Link className="ulink" to={paths.mapItem('type', m.type)} data-act="map-to-type">{L.mapType(m.type)?.name}</Link> : 'Not set'}</dd>
          </div>
        )}
        {m && (
          <div className={s.fact}>
            <dt>Features</dt>
            <dd className={s.chips}>{(m.features || []).length
              ? m.features.map((f) => <Link key={f} className={s.chip} to={paths.mapItem('feature', f)} data-act="map-to-feature">{L.feature(f)?.name || f}</Link>)
              : 'None yet'}</dd>
          </div>
        )}
        {m && <div className={s.fact}><dt>Ranked pool</dt><dd>{m.inPool === false ? 'Out of the pool' : 'In the pool'}</dd></div>}
        {m && m.aoe4worldName && m.aoe4worldName !== m.name && <div className={s.fact}><dt>On aoe4world</dt><dd>{m.aoe4worldName}</dd></div>}
        {!m && (
          <div className={s.fact}>
            <dt>Maps</dt>
            <dd className={s.chips}>{maps.length ? maps.map((x) => <Link key={x.id} className={s.chip} to={paths.mapItem('map', x.id)} data-act="map-to-map">{x.name}</Link>) : 'None yet'}</dd>
          </div>
        )}
      </dl>

      <AutoGrid min={340}>
        <Block title={'Tagged for ' + here} count={tags.length} act="tags"
          hint={'No civ has something tagged for ' + here + ' yet. Tag a play or game plan on a civ\'s page and choose where it applies.'}>
          {fields.map((g) => (
            <div key={g.f} className={s.sub}>
              <span className="sublabel">{FIELD_NAME[g.f]}</span>
              <div className="list">{g.xs.map((x) => <TagRow key={x.t.id} t={x.t} own={x.own} />)}</div>
            </div>
          ))}
        </Block>
        <Block title={'Comes up on ' + here} count={ups.length} act="comes-up"
          hint="Nothing in the library says it comes up here. Game plans, plays and elements say where they come up in their own sheets.">
          <div className="list">
            {ups.map((x) => (
              <div key={x.type + x.id} className="lrow">
                <button type="button" className="main-btn" data-act="map-def" data-type={x.type} data-id={x.id} onClick={() => openDef(x.type, x.id)}>
                  <span className="t">{x.name}</span>
                  <span className="s">{(x.type === 'gamePlans' ? 'Game plan' : x.type === 'plays' ? 'Play' : 'Element') + ' · comes up on ' + x.where}</span>
                </button>
              </div>
            ))}
          </div>
        </Block>
        <Block title={'Played on ' + here} count={refs.length} act="refs"
          hint={'No game or guide logged on ' + here + ' yet.'}>
          <div className="list">
            {refs.map((x) => (
              <div key={x.key} className="lrow">
                <Link className="main-btn" to={x.to} data-act="map-ref"><span className="t">{x.title}</span><span className="s">{x.sub}</span></Link>
              </div>
            ))}
          </div>
        </Block>
      </AutoGrid>
      {kind !== 'map' && maps.length > 0 && <p className="hint">{plural(maps.length, 'map')} {kind === 'type' ? 'of this type' : 'with this feature'}.</p>}
    </div>
  );
}

export function NoMapOpen() {
  return (
    <div className={s.nothing}>
      <h2 className={s.nothingTitle}>Pick a map</h2>
      <p className="hint">What it is, and what the library knows about it, opens here: tags for civs, what comes up there, and the games played on it.</p>
    </div>
  );
}
