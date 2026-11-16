// Civs, and one civ's page with its tags.
import { byName, guideTitle, isActive, lookOf, placeKey, plural, tagField, tagTargetId, type Civ, type ItemKind, type TagWithId, type UseLook } from '@matchup-library/core';
import { L, S, civIdFromView, civSlug, emit, savePrefs } from '../store';
import { copyFromParent, openBulk, openDef, openTagSheet, restoreTag, toggleDefActive } from '../actions';
import { Flag, hasFlag } from '../components/Flag';
import { Icon } from '../components/Icon';
import { NewButton, PageHead, RetiredToggle, UpkeepLink } from '../components/bits';
import { SplitPill, StepPills } from '../components/Pill';

export function CivsView() {
  const u = S.ui.civs;
  const all = S.data.defs.civs.filter((c) => isActive(c) || u.showRetired);
  const bases = all.filter((c) => !c.parent || !L.civ(c.parent)).sort(byName);
  const row = (c: Civ, variant: boolean) => {
    const retired = !isActive(c);
    return (
      <div key={c.id} className={'lrow' + (variant ? ' variant' : '') + (retired ? ' retired' : '')}>
        {retired
          ? <>
              <button type="button" className="main-btn" data-act="df-open" data-type="civs" data-id={c.id} onClick={() => openDef('civs', c.id)}><span className="t">{c.name} (retired)</span></button>
              <button type="button" className="pill-btn" data-act="df-restore" data-type="civs" data-id={c.id} aria-label={'Restore ' + c.name} onClick={() => toggleDefActive('civs', c.id)}><span className="pill">Restore</span></button>
            </>
          : <>
              {hasFlag(c.id) && <span className="lead-flag"><Flag id={c.id} /></span>}
              <a className="main-btn" href={'#civ-' + civSlug(c.id)}><span className="t">{c.name}</span><span className="s">{L.civTagSummary(c.id)}</span></a>
            </>}
      </div>
    );
  };
  return (
    <>
      <PageHead title="Civs" aside={<UpkeepLink />} />
      <main className="main">
        <section className="block">
          <p className="hint">Open a civ to tag what it does, anywhere or only in some places. Variants sit under their base civ.</p>
          <div className="list">
            {bases.map((b) => [row(b, false), ...all.filter((v) => v.parent === b.id).sort(byName).map((v) => row(v, true))])}
          </div>
          <NewButton type="civs" word="civ" />
          <RetiredToggle act="civs-retired" on={u.showRetired} count={S.data.defs.civs.filter((c) => !isActive(c)).length} onToggle={() => { u.showRetired = !u.showRetired; emit(); }} />
        </section>
      </main>
    </>
  );
}

export function CivView() {
  const cid = civIdFromView();
  const c = L.civ(cid);
  if (!c) return <><PageHead title="Civ" back="civs" /><main className="main"><p className="empty">That civ isn't in the library.</p></main></>;
  const mine = L.allTags().filter((t) => t.civ === cid);
  const active = mine.filter((t) => t.active !== false);
  const retired = mine.filter((t) => t.active === false);
  const sortT = (a: TagWithId, b: TagWithId) => L.tagTargetName(a).localeCompare(L.tagTargetName(b)) || placeKey(a.place).localeCompare(placeKey(b.place));
  const elTags = active.filter((t) => t.el).sort(sortT);
  const playTags = active.filter((t) => t.play).sort(sortT);
  const row = (t: TagWithId) => {
    const gone = !L.tagTargetActive(t);
    const age = L.tagAgeText(t);
    const d = L.tagDetail(t);
    return (
      <div key={t.id} className={'lrow' + (gone ? ' retired' : '')}>
        <button type="button" className="main-btn" data-act="cv-tag" data-id={t.id} onClick={() => openTagSheet({ tagId: t.id })}>
          <span className="t">{t.el ? <SplitPill el={t.el} use={t} /> : L.tagTargetName(t)}{age && <span className="muted fw5"> · {age}</span>}{gone && <span className="muted fw5"> ({t.play ? 'play' : 'element'} retired)</span>}</span>
          {t.play && L.strat(t.play) && <StepPills steps={(L.strat(t.play) as NonNullable<ReturnType<typeof L.strat>>).steps} mini />}
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
  L.gamePlays(cid, { kind: 'any' }).forEach((x) => note(x.p.strategyId ? 'play' : 'el', x.p.strategyId || x.p.elementId, L.gameReason(x.g), lookOf(x.p)));
  L.guideMarks(cid, { kind: 'any' }).forEach((x) => note(x.m.strategyId ? 'play' : 'el', x.m.strategyId || x.m.elementId, 'Shown in a guide: ' + guideTitle(x.l), lookOf(x.m)));
  const parent = c.parent ? L.civ(c.parent) : null;
  const parentTags = parent ? L.activeTags().filter((t) => t.civ === parent.id) : [];
  const u = S.ui.civ;
  const mark = c.short && c.short !== c.name ? c.short : '';
  return (
    <>
      <PageHead title={c.name} back="civs" mark={hasFlag(cid) ? '' : mark} flag={<Flag id={cid} lg />}
        aside={<button type="button" className="head-link" data-act="cv-edit" onClick={() => openDef('civs', cid)}>Edit civ</button>} />
      <main className="main">
        {parent && parentTags.length > 0 && !active.length && (
          <div className="panel">
            <span className="hint">{c.name} is a variant of {parent.name}, which has {plural(parentTags.length, 'tag')}. Copy them here, then change what differs.</span>
            <button type="button" className="btn" data-act="cv-copy-parent" onClick={() => copyFromParent(cid)}>Copy from {parent.name}</button>
          </div>
        )}
        <button type="button" className="btn btn-primary" data-act="cv-bulk" onClick={() => openBulk(cid)}><Icon name="plus" size={16} w={2} /> Tag elements or plays</button>
        <section className="block">
          <div className="block-head"><h2 className="label">Elements</h2><span className="sublabel">{elTags.length}</span></div>
          {elTags.length ? <div className="list">{elTags.map(row)}</div> : <p className="hint">No elements tagged yet.</p>}
        </section>
        <section className="block">
          <div className="block-head"><h2 className="label">Plays</h2><span className="sublabel">{playTags.length}</span></div>
          {playTags.length ? <div className="list">{playTags.map(row)}</div> : <p className="hint">No whole plays tagged yet. Tag a play when this civ puts its elements together that way.</p>}
        </section>
        {seen.size > 0 && (
          <section className="block">
            <h2 className="label">Seen in references, not tagged yet</h2>
            <div className="list">
              {[...seen.values()].map((x) => (
                <div key={x.field + ':' + x.id} className="lrow">
                  <button type="button" className="main-btn" data-act="cv-tag-new" data-field={x.field} data-id={x.id} onClick={() => openTagSheet({ civ: cid, field: x.field, id: x.id, place: { kind: 'any' } })}>
                    <span className="t">{x.field === 'play' ? L.playTitle(x.id) : <SplitPill el={x.id} use={x.use} />}</span><span className="s">{x.text}</span>
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
                    <span className="main-btn static"><span className="t">{t.el ? <SplitPill el={t.el} use={t} /> : L.tagTargetName(t)}{L.tagAgeText(t) ? ' · ' + L.tagAgeText(t) : ''}</span><span className="s">{L.placeLabel(t.place)}</span></span>
                    <button type="button" className="pill-btn" data-act="cv-restore" data-id={t.id} aria-label={'Restore the ' + L.tagTargetName(t) + ' tag'} onClick={() => restoreTag(t.id)}><span className="pill">Restore</span></button>
                  </div>
                ))}
              </div>
            : <p className="hint">None. Retired tags wait here with their notes.</p>)}
        </section>
        <a className="btn btn-outline" href="#check" data-act="cv-to-check" onClick={() => { S.ui.check.opp = cid; if (S.ui.check.seg === 'mine') S.ui.check.seg = 'plays'; savePrefs(); }}>
          See {c.short || c.name} in Check
        </a>
      </main>
    </>
  );
}
