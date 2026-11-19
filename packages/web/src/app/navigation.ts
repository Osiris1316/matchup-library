// Moving between pages from code that isn't a component (actions after a save,
// for instance). The router registers itself here on start, which keeps the
// actions free of an import cycle through the router and every page.
// animate: slide what moved into place (see kit/motion.ts).
export interface GoOptions { replace?: boolean; keepScroll?: boolean; animate?: boolean }
type Navigator = (to: string, opts: GoOptions) => void;

let navigator: Navigator | null = null;
let readPath: () => { pathname: string; search: string } = () => ({ pathname: location.pathname, search: location.search });

export function registerNavigator(nav: Navigator, current: () => { pathname: string; search: string }): void {
  navigator = nav;
  readPath = current;
}

export function go(to: string, opts: GoOptions = {}): void {
  if (navigator) navigator(to, opts);
  else location.assign(to);
}

// Where the page is now.
export const currentPath = (): string => readPath().pathname;
export const currentSearch = (): string => readPath().search;
