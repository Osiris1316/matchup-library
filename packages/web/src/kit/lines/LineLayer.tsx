// The lines and their labels, as an overlay on a positioned host. The page
// works out the paths (see geometry.ts and useMeasured.ts); this only draws.
import s from './LineLayer.module.css';

export interface Line { d: string; tone?: 'soft' | 'strong'; weight?: 'fine' | 'regular' | 'bold' | 'heavy'; dashed?: boolean }
export interface LineLabel { x: number; y: number; text: string }

export function LineLayer({ lines, labels = [] }: { lines: Line[]; labels?: LineLabel[] }) {
  if (!lines.length && !labels.length) return null;
  return (
    <>
      <svg className={s.layer} aria-hidden="true">
        {lines.map((x, i) => <path key={i} d={x.d} data-tone={x.tone || 'soft'} data-weight={x.weight || 'regular'} data-dashed={x.dashed ? '' : undefined} />)}
      </svg>
      {labels.map((x, i) => <span key={i} className={s.label} style={{ left: x.x, top: x.y }}>{x.text}</span>)}
    </>
  );
}
