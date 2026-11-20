// Ages across, lanes down: the board a reference is drawn on. Each lane has a
// heading row, then a cell per age. The page works out the lines (see
// kit/lines) from the cards it put in the cells; the board measures after
// layout and draws them under the cards. On a phone each lane stacks its ages,
// each cell with its own age heading, and no lines are drawn.
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { LineLayer, type Line } from '../lines/LineLayer';
import { useMeasured } from '../lines/useMeasured';
import s from './AgeBoard.module.css';

export interface BoardColumn { id: string; name: string }
export interface BoardLaneProps {
  id: string;
  head: ReactNode;
  cells: Partial<Record<string, ReactNode>>;
  // Shown under the cells, across the lane: what the lane can add.
  foot?: ReactNode;
}

const NONE: Line[] = [];

export function AgeBoard({ columns, lanes, measure, label, after }: {
  columns: BoardColumn[];
  lanes: BoardLaneProps[];
  measure?: (host: HTMLElement) => Line[];
  label?: string;
  // Under the last lane, inside the board: such as adding another lane.
  after?: ReactNode;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const lines = useMeasured(host, (el) => (measure ? measure(el) : NONE), NONE);
  return (
    <div className={s.board} ref={host} role="group" aria-label={label} style={{ '--cols': columns.length } as CSSProperties}>
      <LineLayer lines={lines} />
      <div className={s.heads} aria-hidden="true">
        {columns.map((c) => <span key={c.id} className={s.head} data-cell={c.id}>{c.name}</span>)}
      </div>
      {lanes.map((l) => (
        <section key={l.id} className={s.lane} data-lane={l.id}>
          <div className={s.laneHead}>{l.head}</div>
          <div className={s.cells}>
            {columns.map((c) => (
              <div key={c.id} className={s.cell} data-cell={c.id}>
                <span className={s.cellHead}>{c.name}</span>
                {l.cells[c.id]}
              </div>
            ))}
          </div>
          {l.foot != null && <div className={s.laneFoot}>{l.foot}</div>}
        </section>
      ))}
      {after}
    </div>
  );
}
