// CDN base for static catalogue assets (images, large JSON).
//
// Catalogue data lives in this GitHub repo and is served via jsDelivr, so
// catalogue updates (re-scrape -> git push) reach the live site without a
// Cloudflare Pages rebuild. Only code/template changes trigger a rebuild.
//
// In dev (when PROD=false) the base is empty, so paths resolve to
// webapp/public/ via the local dev server. In prod it points at jsDelivr
// pinned to a branch. Override either by setting PUBLIC_CDN_BASE.
// Fallback if PUBLIC_CDN_BASE isn't injected at build (e.g. local prod build
// without the env var). Branch-pinned URLs cache for ~12hr at jsDelivr's
// edge; the CI workflow overrides this with @<commit-sha> so every deploy
// gets fresh URLs without needing a manual cache purge.
const DEFAULT_PROD_BASE = 'https://cdn.jsdelivr.net/gh/mikedconcepcion/gtatire@cloudflare-migration/webapp/public';

const envBase = (import.meta as any).env?.PUBLIC_CDN_BASE;
const isProd = !!(import.meta as any).env?.PROD;
const CDN_BASE = (envBase ?? (isProd ? DEFAULT_PROD_BASE : '')).replace(/\/$/, '');

// Files served from the same-origin Cloudflare Pages build instead of the
// jsDelivr CDN. fitment.json is 24MB which is over jsDelivr's 20MB per-file
// limit (returns 403), but well under Cloudflare's 25MB per-file cap.
// Trade-off: a catalogue refresh needs a Cloudflare rebuild for fitment to
// update (every other JSON file ships via `git push` alone).
const LOCAL_ONLY = new Set<string>([
  '/data/fitment.json',
]);

export function cdnUrl(path: string): string {
  if (LOCAL_ONLY.has(path)) return path;
  if (!CDN_BASE) return path;
  return `${CDN_BASE}/${path.replace(/^\//, '')}`;
}

export { CDN_BASE };
