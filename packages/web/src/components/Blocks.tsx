// What a civ can't do, each with its one-tap fix. The rules still hold: the
// fix changes the element's ages for that civ, saved and undoable like any edit.
import { STAGE_NAME, type Age, type Block } from '@matchup-library/core';
import { L, emit } from '../store';
import { openForCiv } from '../actions';

export function BlockList({ civ, blocks }: { civ: string; blocks: Block[] }) {
  if (!blocks.length) return null;
  return (
    <div className="blocks">
      {blocks.map((b) => (
        <div key={b.el + ':' + (b.age || '')} className="block-line">
          <span className="warn-text">{L.blockText(civ, b)}.</span>
          <button type="button" className="btn btn-outline btn-sm" data-act="open-for-civ" data-civ={civ} data-el={b.el} data-age={b.age || ''} onClick={() => openForCiv(civ, b)}>
            Allow for {L.civShort(civ)}
          </button>
        </div>
      ))}
    </div>
  );
}

// A step no civ can do in its age yet: the civs the game data says can, and any other civ.
export function OpenStep({ el, age }: { el: string; age: Age }) {
  const early = L.earlyAges(el).filter((x) => x.ages.includes(age));
  const others = L.activeCivs().filter((c) => !early.some((x) => x.civ === c.id) && !L.civCan(c.id, el, age));
  return (
    <div className="blocks">
      <div className="block-line">
        <span className="warn-text">No civ can do {L.elName(el)} in {STAGE_NAME[age]} yet.</span>
        {early.map((x) => (
          <button key={x.civ} type="button" className="btn btn-outline btn-sm" data-act="open-for-civ" data-civ={x.civ} data-el={el} data-age={age}
            title="The AoE4 World data has it this early for this civ" onClick={() => openForCiv(x.civ, { el, age })}>
            Allow for {L.civShort(x.civ)}
          </button>
        ))}
        <select className="select select-sm" aria-label={'Allow ' + L.elName(el) + ' in ' + STAGE_NAME[age] + ' for a civ'} value=""
          onChange={(e) => { const c = e.target.value; if (c) void openForCiv(c, { el, age }); emit(); }}>
          <option value="">{early.length ? 'Another civ' : 'Allow for a civ'}</option>
          {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {early.length > 0 && <span className="hint">The AoE4 World data has it this early for {early.map((x) => L.civShort(x.civ)).join(', ')}.</span>}
    </div>
  );
}
