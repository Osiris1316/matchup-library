import type { ReactElement } from 'react';

const PATHS = {
  library: <><rect x="4" y="4" width="6" height="16" rx="1" /><rect x="14" y="4" width="6" height="16" rx="1" /></>,
  civs: <><line x1="5" y1="21" x2="5" y2="4" /><path d="M5 4h12l-2.5 4 2.5 4H5" /></>,
  maps: <><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" /><line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" /></>,
  check: <><line x1="4" y1="6" x2="14" y2="6" /><line x1="4" y1="12" x2="14" y2="12" /><line x1="4" y1="18" x2="10" y2="18" /><polyline points="14 17 16.5 19.5 21 15" /></>,
  swap: <><polyline points="17 3 21 7 17 11" /><line x1="21" y1="7" x2="9" y2="7" /><polyline points="7 13 3 17 7 21" /><line x1="3" y1="17" x2="15" y2="17" /></>,
  x: <><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></>,
  plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  back: <polyline points="15 18 9 12 15 6" />,
  refs: <><rect x="3" y="5" width="18" height="14" rx="2" /><polygon points="10 9 15 12 10 15 10 9" /></>,
  down: <polyline points="6 9 12 15 18 9" />
} satisfies Record<string, ReactElement>;
export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, w = 1.8 }: { name: IconName; size?: number; w?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
