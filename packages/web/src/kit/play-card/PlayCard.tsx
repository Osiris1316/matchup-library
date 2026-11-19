// A play as a card. The page decides what it means (documented, tested, picked,
// scouted) and passes the look; the card only draws it. Extra props (onClick,
// aria-pressed, data-* hooks for tests and for measuring lines) go to the button.
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../cx';
import s from './PlayCard.module.css';

export type CardOutline = 'solid' | 'dashed' | 'faint';

export interface PlayCardProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  name: string;
  badge?: ReactNode;
  // The steps, usually <StepPills>.
  steps: ReactNode;
  // A line under the steps, shown as a warning (why a civ can't play it).
  note?: ReactNode;
  // A plain line under the steps, such as your answer to it. 'gap' greys it out.
  detail?: ReactNode;
  detailTone?: 'normal' | 'gap';
  outline?: CardOutline;
  // 'page' fills a dashed card with the page color, for cards on a tinted lane.
  fill?: 'page';
  picked?: boolean;
  marked?: boolean;
  // Faded back, but still there to click: not on the path being looked at.
  dimmed?: boolean;
  // Where lines attach: the page finds the card by data-card="<anchor>".
  anchor?: string;
}

export function PlayCard({ name, badge, steps, note, detail, detailTone = 'normal', outline = 'solid', fill, picked, marked, dimmed, anchor, className, type = 'button', ...rest }: PlayCardProps) {
  return (
    <button {...rest} type={type} className={cx(s.card, className)} data-card={anchor} data-outline={outline} data-fill={fill}
      data-picked={picked ? '' : undefined} data-marked={marked ? '' : undefined} data-dimmed={dimmed ? '' : undefined}>
      <span className={s.top}><span className={s.name}>{name}</span>{badge != null && <span className={s.badge}>{badge}</span>}</span>
      <span className={s.steps}>{steps}</span>
      {note != null && <span className={s.note}>{note}</span>}
      {detail != null && <span className={s.detail} data-tone={detailTone}>{detail}</span>}
    </button>
  );
}
