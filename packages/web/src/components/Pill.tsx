// Element pills for the app: works out what an element looks like (Library.look()
// applies each use's own intent and subject) and draws it with the kit's pills.
import { Fragment } from 'react';
import { INTENT_NAME, EL_TYPE_NAME, STAGE_NAME, sortedSteps, stagesOf, type ElType, type GamePlan, type Intent, type Look, type Step, type UseLook } from '@matchup-library/core';
import { L } from '../store';
import { BUNDLED_ICONS } from '../icons.generated';
import { Pill, PillMini, PillRow, PillSep, PillTile, type TileSize } from '../kit/pills/Pill';

const REMOTE = 'https://data.aoe4world.com/images/';
// Bundled icons are served from the page; any other comes from aoe4world
// until `pnpm subjects icons` copies it.
export const iconUrl = (icon: string | null | undefined): string | null => (icon ? (BUNDLED_ICONS.has(icon) ? '/icons/' : REMOTE) + icon : null);

export function Tile({ look, size }: { look: Pick<Look, 'icon' | 'type'>; size?: TileSize }) {
  return <PillTile src={iconUrl(look.icon)} type={look.type} size={size} />;
}

const describe = (k: Look): string =>
  [k.title, k.type ? EL_TYPE_NAME[k.type] : 'No type yet', k.intent ? INTENT_NAME[k.intent] : 'No intent'].join(', ');

// The pill from its parts. Used directly for drafts and landmarks.
export function PillFace({ type, intent, icon, name, title, size = 'sm' }: {
  type: ElType | null; intent: Intent | null; icon: string | null; name: string; title?: string; size?: 'sm' | 'lg';
}) {
  return <Pill type={type} intent={intent} src={iconUrl(icon)} name={name} title={title} size={size} />;
}

export function SplitPill({ el, use, size = 'sm' }: { el: string; use?: UseLook | null; size?: 'sm' | 'lg' }) {
  const k = L.look(el, use);
  return <Pill type={k.type} intent={k.intent} src={iconUrl(k.icon)} name={k.name} title={describe(k)} size={size} />;
}

// The icon tile alone, with a thin intent bar under it, for tight spaces.
export function MiniPill({ el, use }: { el: string; use?: UseLook | null }) {
  const k = L.look(el, use);
  return <PillMini type={k.type} intent={k.intent} src={iconUrl(k.icon)} label={k.name} title={describe(k)} />;
}

// A play's steps as pills: a chevron before a later step, a plus before one at
// the same time. bare leaves the separators out (minis in a game plan row).
export function StepPills({ steps, mini, bare, wrap }: { steps: Step[]; mini?: boolean; bare?: boolean; wrap?: boolean }) {
  const s = sortedSteps(steps);
  return (
    <PillRow mini={mini} wrap={wrap}>
      {s.map((st, i) => (
        <Fragment key={i}>
          {i > 0 && !bare && <PillSep kind={st.step === (s[i - 1] as Step).step ? 'with' : 'then'} />}
          {mini ? <MiniPill el={st.el} use={st} /> : <SplitPill el={st.el} use={st} />}
        </Fragment>
      ))}
    </PillRow>
  );
}

// One line per stage, in order.
export function PlanStages({ g }: { g: GamePlan }) {
  const stages = stagesOf(g);
  if (!stages.length) return <span className="s">No plays yet</span>;
  return (
    <span className="stages">
      {stages.map(({ age, stage }) => {
        const p = L.play(stage.play);
        return <span key={age} className="stage-line"><span className="sublabel">{STAGE_NAME[age]}</span>{p ? <StepPills steps={p.steps} /> : <span className="s">Unknown play</span>}</span>;
      })}
    </span>
  );
}
