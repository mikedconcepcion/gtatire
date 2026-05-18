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

export function cdnUrl(path: string): string {
  if (!CDN_BASE) return path;
  return `${CDN_BASE}/${path.replace(/^\//, '')}`;
}

export { CDN_BASE };
