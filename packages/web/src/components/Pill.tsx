// Split pills: an element as its icon tile, coloured by type, and its name,
// coloured by intent. Each use can override the intent and the subject; the
// display rule lives in Library.look().
import { Fragment } from 'react';
import { INTENT_NAME, EL_TYPE_NAME, sortedSteps, type ElType, type Intent, type Look, type Step, type UseLook } from '@matchup-library/core';
import { L } from '../store';
import { BUNDLED_ICONS } from '../icons.generated';

const REMOTE = 'https://data.aoe4world.com/images/';
// Bundled icons are served from the page; any other comes from aoe4world
// until `pnpm subjects icons` copies it.
export const iconUrl = (icon: string | null | undefined): string | null => (icon ? (BUNDLED_ICONS.has(icon) ? '/icons/' : REMOTE) + icon : null);

// An age-up with no landmark: two rising chevrons.
function AgeGlyph() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="glyph">
      <path d="M5 11.5 L10 6.5 L15 11.5" /><path d="M5 15.5 L10 10.5 L15 15.5" />
    </svg>
  );
}

export function Tile({ look }: { look: Pick<Look, 'icon' | 'type'> }) {
  const src = iconUrl(look.icon);
  return (
    <span className="tile" data-type={look.type || 'none'}>
      {src
        ? <img src={src} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
        : look.type === 'age_tech' ? <AgeGlyph /> : null}
    </span>
  );
}

const describe = (k: Look): string =>
  [k.title, k.type ? EL_TYPE_NAME[k.type] : 'No type yet', k.intent ? INTENT_NAME[k.intent] : 'No intent'].join(', ');

// The pill itself, from its parts. Used directly for drafts and landmarks.
export function PillFace({ type, intent, icon, name, title, size = 'sm' }: {
  type: ElType | null; intent: Intent | null; icon: string | null; name: string; title?: string; size?: 'sm' | 'lg';
}) {
  return (
    <span className={'spill ' + size} data-type={type || 'none'} data-intent={intent || 'none'} title={title}>
      <Tile look={{ icon, type }} /><span className="nm">{name}</span>
    </span>
  );
}

export function SplitPill({ el, use, size = 'sm' }: { el: string; use?: UseLook | null; size?: 'sm' | 'lg' }) {
  const k = L.look(el, use);
  return <PillFace type={k.type} intent={k.intent} icon={k.icon} name={k.name} title={describe(k)} size={size} />;
}

// The icon tile alone, with a thin intent bar under it, for tight spaces.
export function MiniPill({ el, use }: { el: string; use?: UseLook | null }) {
  const k = L.look(el, use);
  return (
    <span className="mpill" data-type={k.type || 'none'} data-intent={k.intent || 'none'} title={describe(k)} role="img" aria-label={k.name}>
      <Tile look={k} />
    </span>
  );
}

// A play's steps as pills: a chevron before a later step, a plus before one at the same time.
export function StepPills({ steps, mini }: { steps: Step[]; mini?: boolean }) {
  const s = sortedSteps(steps);
  return (
    <span className={'spills' + (mini ? ' mini' : '')}>
      {s.map((st, i) => (
        <Fragment key={i}>
          {i > 0 && (st.step === (s[i - 1] as Step).step
            ? <span className="sep plus" aria-label="with">+</span>
            : <svg className="sep" width="8" height="10" viewBox="0 0 8 10" aria-label="then"><path d="M2 1 L6 5 L2 9" /></svg>)}
          {mini ? <MiniPill el={st.el} use={st} /> : <SplitPill el={st.el} use={st} />}
        </Fragment>
      ))}
    </span>
  );
}
