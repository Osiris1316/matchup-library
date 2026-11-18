// The breakpoints, for code. CSS uses the same numbers (see styles/tokens.css).
export const WIDE_MIN = 1100;
export const PHONE_MAX = 640;

export const isWide = (): boolean => typeof window !== 'undefined' && window.innerWidth >= WIDE_MIN;
