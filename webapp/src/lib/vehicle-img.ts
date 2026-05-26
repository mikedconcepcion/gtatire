// Vehicle image resolution.
//
// Primary: local template at webapp/public/images/vehicles/{YEAR}-{UPPER-MAKE}-{UPPER-MODEL}.jpg
// (CDN-served via jsDelivr in prod, same-origin in dev — see ./cdn.ts).
//
// Fallback: cdn.imagin.studio on-demand render. Used when:
//   (a) Local file doesn't exist yet (e.g. mid-rescrape from wheel-size.com)
//   (b) Local file 404s for any reason
// Consumers attach `onError={imaginErrorHandler(make,model,year)}` to <img>
// so the browser auto-swaps src to the IMAGIN URL on the first 404.

import { cdnUrl } from './cdn';

function normalize(s: string | undefined): string {
  if (!s) return '';
  return s.trim().toUpperCase().replace(/\s+/g, '-');
}

// Catalogue covers 2010–2027; default to a recent year with broad coverage
// when caller has no year (e.g. "Toyota RAV4" search without a year token).
const DEFAULT_YEAR = '2025';

export function getVehicleImgUrl(
  make: string | undefined,
  model: string | undefined,
  year: string | number | undefined,
): string {
  const mk = normalize(make);
  const md = normalize(model);
  const yr = String(year ?? '').trim() || DEFAULT_YEAR;
  if (!mk || !md) return '';
  return cdnUrl(`/images/vehicles/${yr}-${mk}-${md}.jpg`);
}

// IMAGIN.studio on-demand vehicle render. Free `customer=img` tier is
// usable for personal/dev use; for production we should swap to a paid
// customer code. Returns empty string if make+model unavailable.
//
// API: https://cdn.imagin.studio/getImage
//   ?customer=img        — public/free tier
//   &make=honda          — lowercase slug
//   &modelFamily=civic   — lowercase slug
//   &modelYear=2020      — 4-digit
//   &angle=01            — 01 (3/4 front) is the canonical angle
//   &width=1200          — output width in px
//   &fileType=png        — transparent background
export function getImaginFallbackUrl(
  make: string | undefined,
  model: string | undefined,
  year: string | number | undefined,
): string {
  const mk = String(make ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  const md = String(model ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  const yr = String(year ?? '').trim() || DEFAULT_YEAR;
  if (!mk || !md) return '';
  const params = new URLSearchParams({
    customer: 'img',
    make: mk,
    modelFamily: md,
    modelYear: yr,
    angle: '01',
    width: '1200',
    fileType: 'png',
  });
  return `https://cdn.imagin.studio/getImage?${params.toString()}`;
}

// React onError handler factory — attach to <img onError={...}> elements
// where the primary local image may be missing. Swaps to IMAGIN once,
// then clears itself so a still-broken IMAGIN URL doesn't loop.
export function imaginErrorHandler(
  make: string | undefined,
  model: string | undefined,
  year: string | number | undefined,
) {
  return (e: any) => {
    const img = e.currentTarget as HTMLImageElement;
    const fallback = getImaginFallbackUrl(make, model, year);
    if (!fallback || img.src === fallback) {
      img.onerror = null;
      img.style.display = 'none';
      return;
    }
    img.onerror = null; // prevent loop
    img.src = fallback;
  };
}
