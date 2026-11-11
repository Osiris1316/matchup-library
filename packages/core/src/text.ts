// Formatting and link helpers shared by the page and the scripts.
import { AGES, AGE_NAME, type Age, type Source } from './types';

export const plural = (n: number, one: string, many?: string): string => n + ' ' + (n === 1 ? one : many || one + 's');
export const cap = (w: string): string => (w ? w.charAt(0).toUpperCase() + w.slice(1) : '');
export const lowerFirst = (w: string): string => (w ? w.charAt(0).toLowerCase() + w.slice(1) : '');
export const slug = (n: string): string =>
  String(n).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'item';
export const byName = <T extends { name: string }>(a: T, b: T): number => a.name.localeCompare(b.name);
export const newId = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const clone = <T>(o: T): T => (o == null ? o : (JSON.parse(JSON.stringify(o)) as T));

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}
export function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  return fmtDate(iso);
}
export function agesText(ages: Age[]): string {
  const sorted = AGES.filter((a) => ages.includes(a));
  if (sorted.length === 4) return 'Any age';
  if (sorted.length === 1) return AGE_NAME[sorted[0] as Age] + ' only';
  return sorted.map((a) => AGE_NAME[a]).join(', ');
}

// Times in footage, as m:ss or h:mm:ss.
export function parseTime(t: unknown): number | null {
  const v = String(t == null ? '' : t).trim();
  if (!/^\d+(:\d{1,2}){0,2}$/.test(v)) return null;
  return v.split(':').map(Number).reduce((acc, x) => acc * 60 + x, 0);
}
export function fmtTime(sec: number | null | undefined): string {
  if (sec == null) return '';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
}

// Links
export function detectSource(url: string): Source {
  if (/youtu\.?be/i.test(url)) return 'youtube';
  if (/twitch\.tv/i.test(url)) return /clip/i.test(url) ? 'twitch_clip' : 'twitch_vod';
  if (/aoe4world\.com/i.test(url)) return 'aoe4world';
  return 'other';
}
export const SOURCE_NAME: Record<Source, string> = {
  youtube: 'YouTube', twitch_vod: 'Twitch', twitch_highlight: 'Twitch', twitch_clip: 'Twitch', aoe4world: 'aoe4world', own_site: 'your site', other: 'the site'
};
export const SOURCE_SHORT: Record<Source, string> = {
  youtube: 'YouTube', twitch_vod: 'Twitch', twitch_highlight: 'Twitch', twitch_clip: 'Twitch clip', aoe4world: 'aoe4world', own_site: 'Your site', other: 'Link'
};
export function aoe4worldId(url: string): number | null {
  const m = url && url.match(/aoe4world\.com\/.*games\/(\d+)/i);
  return m ? Number(m[1]) : null;
}
export const safeUrl = (u: unknown): string | null => (/^https?:\/\/[^\s]+$/i.test(String(u || '').trim()) ? String(u).trim() : null);
export function hostOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}
export function normalizeUrl(u: unknown): string {
  const v = String(u || '').trim();
  if (v && !/^[a-z]+:\/\//i.test(v) && /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v)) return 'https://' + v;
  return v;
}
// The link, opening at a time where the site supports it.
export function urlAt(url: string, sec: number | null): string | null {
  const base = safeUrl(url);
  if (!base || sec == null) return base;
  try {
    const u = new URL(base);
    if (/youtu\.?be/i.test(u.hostname)) { u.searchParams.set('t', sec + 's'); return u.toString(); }
    if (/twitch\.tv/i.test(u.hostname) && /\/videos\//.test(u.pathname)) {
      u.searchParams.set('t', Math.floor(sec / 3600) + 'h' + Math.floor((sec % 3600) / 60) + 'm' + (sec % 60) + 's');
      return u.toString();
    }
  } catch { /* keep the plain link */ }
  return base;
}
export function openAtFrom(url: string): number | null {
  const m = url.match(/[?&](?:t|start)=(\d+)/);
  return m ? Number(m[1]) : null;
}
export function linkHint(url: string): string {
  const u = normalizeUrl(url);
  if (!u) return 'Optional for your own games logged from memory. Guides need one.';
  if (!safeUrl(u)) return "That doesn't look like a link yet.";
  const src = detectSource(u);
  let text = ({ youtube: 'YouTube video', twitch_vod: 'Twitch video', twitch_clip: 'Twitch clip', aoe4world: 'aoe4world page', other: 'Link' } as Record<string, string>)[src] || 'Link';
  const at = openAtFrom(u);
  if (at != null) text += ', opens at ' + fmtTime(at);
  if (src === 'aoe4world') text += '. It has no video, so moments in it have no times';
  return text + '.';
}
