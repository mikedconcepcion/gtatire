// Build the URL to a local vehicle template image. Replaces the previous
// IMAGIN.studio integration for displaying the customer's vehicle.
//
// Files live at webapp/public/images/vehicles/{YEAR}-{UPPER-MAKE}-{UPPER-MODEL}.jpg
// (~1,947 templates). All current templates are JPG. CDN-served via jsDelivr
// in prod, same-origin in dev — see ./cdn.ts.

import { cdnUrl } from './cdn';

function normalize(s: string | undefined): string {
  if (!s) return '';
  return s.trim().toUpperCase().replace(/\s+/g, '-');
}

export function getVehicleImgUrl(
  make: string | undefined,
  model: string | undefined,
  year: string | number | undefined,
): string {
  const mk = normalize(make);
  const md = normalize(model);
  const yr = String(year ?? '').trim();
  if (!mk || !md || !yr) return '';
  return cdnUrl(`/images/vehicles/${yr}-${mk}-${md}.jpg`);
}
