// One civ's page: its stages (plays per age and game plans), or its tags.
import { Link, useParams } from 'react-router';
import { AGES, ITEM_WORD, STAGE_NAME, guideTitle, lookOf, placeKey, plural, tagField, tagTargetId, targetField, targetId, type ItemKind, type TagWithId, type UseLook } from '@matchup-library/core';
import { L, S, emit, savePrefs, useStore, type CivTab } from '../../store';
import { copyFromParent, openBulk, openDef, openTagSheet, restoreTag } from '../../actions';
import { civIdFromSlug, paths } from '../../app/paths';
import { go } from '../../app/navigation';
import { Flag, hasFlag } from '../../components/Flag';
import { Icon } from '../../components/Icon';
import { PageHead, Seg } from '../../components/bits';
import { PlanStages, SplitPill, StepPills } from '../../components/Pill';
import { CivStages } from './CivStages';

export function CivPage({ tab }: { tab: CivTab }) {
  useStore();
  const { civ: slug = '' } = useParams();
  const cid = civIdFromSlug(slug);
  const c = L.civ(cid);
  if (!c) return <><PageHead title="Civ" back={paths.civs()} /><main className="main"><p className="empty">That civ isn't in the library.</p></main></>;
  const mine = L.allTags().filter((t) => t.civ === cid);
  const active = mine.filter((t) => t.active !== false);
  const retired = mine.filter((t) => t.active === false);
  const sortT = (a: TagWithId, b: TagWithId) => L.tagTargetName(a).localeCompare(L.tagTargetName(b)) || placeKey(a.place).localeCompare(placeKey(b.place));
  const elTags = active.filter((t) => tagField(t) === 'el').sort(sortT);
  const playTags = active.filter((t) => tagField(t) === 'play').sort((a, b) => {
    const pa = L.play(a.play), pb = L.play(b.play);
    return (pa && pb ? AGES.indexOf(pa.age) - AGES.indexOf(pb.age) : 0) || sortT(a, b);
  });
  const planTags = active.filter((t) => tagField(t) === 'plan').sort(sortT);
  const row = (t: TagWithId) => {
    const gone = !L.tagTargetActive(t);
    const field = tagField(t);
    const play = field === 'play' ? L.play(t.play) : null;
    const plan = field === 'plan' ? L.plan(t.plan) : null;
    const age = play ? STAGE_NAME[play.age] : L.tagAgeText(t);
    const d = L.tagDetail(t);
    return (
      <div key={t.id} className={'lrow' + (gone ? ' retired' : '')}>
        <button type="button" className="main-btn" data-act="cv-tag" data-id={t.id} onClick={() => openTagSheet({ tagId: t.id })}>
          <span className="t">{field === 'el' && t.el ? <SplitPill el={t.el} use={t} /> : L.tagTargetName(t)}{age && <span className="muted fw5"> · {age}</span>}{gone && <span className="muted fw5"> ({ITEM_WORD[field]} retired)</span>}</span>
          {play && <StepPills steps={play.steps} mini />}
          {plan && <PlanStages g={plan} />}
          <span className="s">{L.placeLabel(t.place)}{d ? ' · ' + d : ''}</span>
        </button>
      </div>
    );
  };
  // Seen in a game or guide, but not tagged yet.
  const taggedKeys = new Set(active.map((t) => tagField(t) + ':' + tagTargetId(t)));
  const seen = new Map<string, { field: ItemKind; id: string; text: string; use: UseLook }>();
  const note = (field: ItemKind, id: string | null | undefined, text: string, use: UseLook) => {
    const k = field + ':' + id;
    if (id && !taggedKeys.has(k) && !seen.has(k)) seen.set(k, { field, id, text, use });
  };
  L.gamePlays(cid, { kind: 'any' }).forEach((x) => { const f = targetField(x.p); if (f) note(f, targetId(x.p), L.gameReason(x.g), lookOf(x.p)); });
  L.guideMarks(cid, { kind: 'any' }).forEach((x) => { const f = targetField(x.m); if (f) note(f, targetId(x.m), 'Shown in a guide: ' + guideTitle(x.l), lookOf(x.m)); });
  const parent = c.parent ? L.civ(c.parent) : null;
  const parentTags = parent ? L.activeTags().filter((t) => t.civ === parent.id) : [];
  const u = S.ui.civ;
  const mark = c.short && c.short !== c.name ? c.short : '';
  // The tab is part of the address; the last one used is what links to a civ open on.
  if (u.tab !== tab) { u.tab = tab; savePrefs(); }
  const tabs = (
    <Seg label="Show" act="cv-tab" options={[['stages', 'Stages'], ['tags', 'Tags']] as [CivTab, string][]} current={tab}
      onPick={(v) => go(paths.civ(cid, v), { replace: true, keepScroll: true })} />
  );
  const head = (
    <PageHead title={c.name} back={paths.civs()} mark={hasFlag(cid) ? '' : mark} flag={<Flag id={cid} lg />}
      aside={<button type="button" className="head-link" data-act="cv-edit" onClick={() => openDef('civs', cid)}>Edit civ</button>} />
  );
  if (tab === 'stages') return <>{head}<main className="main stages-main"><CivStages cid={cid} tabs={tabs} /></main></>;
  return (
    <>
      {head}
      <main className="main narrow">
        <div className="cv-tabs">{tabs}</div>
        {parent && parentTags.length > 0 && !active.length && (
          <div className="panel">
            <span className="hint">{c.name} is a variant of {parent.name}, which has {plural(parentTags.length, 'tag')}. Copy them here, then change what differs.</span>
            <button type="button" className="btn" data-act="cv-copy-parent" onClick={() => copyFromParent(cid)}>Copy from {parent.name}</button>
          </div>
        )}
        <button type="button" className="btn btn-primary" data-act="cv-bulk" onClick={() => openBulk(cid)}><Icon name="plus" size={16} w={2} /> Tag elements, plays or game plans</button>
        <section className="block">
          <div className="block-head"><h2 className="label">Game plans</h2><span className="sublabel">{planTags.length}</span></div>
          {planTags.length ? <div className="list">{planTags.map(row)}</div> : <p className="hint">No game plans tagged yet. Tag one when this civ runs a whole game that way.</p>}
        </section>
        <section className="block">
          <div className="block-head"><h2 className="label">Plays</h2><span className="sublabel">{playTags.length}</span></div>
          {playTags.length ? <div className="list">{playTags.map(row)}</div> : <p className="hint">No whole plays tagged yet. Tag a play when this civ puts its elements together that way.</p>}
        </section>
        <section className="block">
          <div className="block-head"><h2 className="label">Elements</h2><span className="sublabel">{elTags.length}</span></div>
          {elTags.length ? <div className="list">{elTags.map(row)}</div> : <p className="hint">No elements tagged yet.</p>}
        </section>
        {seen.size > 0 && (
          <section className="block">
            <h2 className="label">Seen in references, not tagged yet</h2>
            <div className="list">
              {[...seen.values()].map((x) => (
                <div key={x.field + ':' + x.id} className="lrow">
                  <button type="button" className="main-btn" data-act="cv-tag-new" data-field={x.field} data-id={x.id} onClick={() => openTagSheet({ civ: cid, field: x.field, id: x.id, place: { kind: 'any' } })}>
                    <span className="t">{x.field === 'el' ? <SplitPill el={x.id} use={x.use} /> : L.itemName(x.field, x.id)}</span><span className="s">{x.text}</span>
                  </button>
                  <span className="pill plain" aria-hidden="true">Tag</span>
                </div>
              ))}
            </div>
          </section>
        )}
        {parent && parentTags.length > 0 && active.length > 0 && (
          <button type="button" className="textlink" data-act="cv-copy-parent" onClick={() => copyFromParent(cid)}><span>Copy missing tags from {parent.name}</span></button>
        )}
        <section className="block">
          <button type="button" className="textlink" data-act="cv-retired" aria-expanded={u.showRetired} onClick={() => { u.showRetired = !u.showRetired; emit(); }}>
            <span className="label">Retired tags</span><span>{u.showRetired ? 'Hide' : 'Show'} {retired.length}</span>
          </button>
          {u.showRetired && (retired.length
            ? <div className="list">
                {retired.sort(sortT).map((t) => (
                  <div key={t.id} className="lrow retired">
                    <span className="main-btn static"><span className="t">{tagField(t) === 'el' && t.el ? <SplitPill el={t.el} use={t} /> : L.tagTargetName(t)}{L.tagAgeText(t) ? ' · ' + L.tagAgeText(t) : ''}</span><span className="s">{L.placeLabel(t.place)}</span></span>
                    <button type="button" className="pill-btn" data-act="cv-restore" data-id={t.id} aria-label={'Restore the ' + L.tagTargetName(t) + ' tag'} onClick={() => restoreTag(t.id)}><span className="pill">Restore</span></button>
                  </div>
                ))}
              </div>
            : <p className="hint">None. Retired tags wait here with their notes.</p>)}
        </section>
        <Link className="btn btn-outline" to={paths.check()} data-act="cv-to-check" onClick={() => { S.ui.check.opp = cid; if (S.ui.check.seg === 'mine') S.ui.check.seg = 'plans'; savePrefs(); }}>
          See {c.short || c.name} in Check
        </Link>
      </main>
    </>
  );
}
