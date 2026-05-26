// Shared OE hub-bore lookup + strict filter for vehicle-scoped wheel lists.
//
// Authoritative source: webapp/public/data/vehicle-bores.json — a map keyed
// by "Y|MAKE|MODEL" → {bore, source}, populated by build-internal-db.js from
// layered authority (Alltire hubCentric → RWC per-vehicle fitment → AAIA
// mode). When the vehicle is in the map, use that. Inference from the
// matched wheel set is only a fallback for vehicles not yet in the map.
//
// James's rule (2026-05-26): vehicles have specific bore fitment, so we
// only show mm-specific recommendations. A 64.1mm Civic gets 64.1mm wheels
// only, never 73.1.

type WheelLike = {
  category?: string;
  brand?: string;
  hubCentric?: boolean;
  hubBore?: number | null;
};

export type VehicleBoreMap = Record<string, { hubBore?: number; bore?: number; boltPattern?: string; source?: string }>;

const REPLICA_BRANDS = new Set(['RWC', 'OE+', 'OE+ Forged']);

// Look up the vehicle's OE bore from the authoritative map. Returns
// undefined when the vehicle isn't covered — caller should fall back to
// inference (deriveOeHubBore) or skip filtering entirely.
export function lookupOeHubBore(map: VehicleBoreMap | null | undefined, year: string | number, make: string, model: string): number | undefined {
  if (!map) return undefined;
  const k = `${String(year).split('.')[0]}|${String(make).toUpperCase()}|${String(model).toUpperCase()}`;
  const v = map[k];
  if (!v) return undefined;
  // Schema: hubBore is canonical; bore is older shorthand.
  return v.hubBore ?? v.bore;
}

function modeOf(arr: (number | null | undefined)[]): number | undefined {
  const c = new Map<number, number>();
  for (const v of arr) {
    if (v == null || isNaN(v)) continue;
    c.set(v, (c.get(v) || 0) + 1);
  }
  return Array.from(c.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
}

// Derive the OE hub bore for a vehicle from the wheels matched to it.
// Strategy, in order of authority:
//   1) Alltire OE-marked wheels (hubCentric=true) — supplier explicitly
//      flags these as the OE fit. Mode of their bores wins.
//   2) Replica brands (RWC / OE+ / OE+ Forged) — their fits ARE the OE spec.
//   3) Smallest bore in the matched set — OE bore is usually the smallest
//      because aftermarket wheels with larger bores use hub-centric rings
//      to step down. Choosing the smallest excludes those non-OE-fit wheels.
export function deriveOeHubBore(matched: WheelLike[]): number | undefined {
  const wheels = matched.filter(p => p.category === 'wheel' && p.hubBore != null);
  if (wheels.length === 0) return undefined;

  const oeMarked = wheels.filter(p => p.hubCentric === true);
  if (oeMarked.length > 0) {
    const m = modeOf(oeMarked.map(p => p.hubBore as number));
    if (m != null) return m;
  }

  const replicas = wheels.filter(p => REPLICA_BRANDS.has(String(p.brand || '')));
  if (replicas.length > 0) {
    const m = modeOf(replicas.map(p => p.hubBore as number));
    if (m != null) return m;
  }

  // Fallback: smallest bore in the set
  let min = Infinity;
  for (const p of wheels) {
    const b = p.hubBore as number;
    if (b > 0 && b < min) min = b;
  }
  return isFinite(min) ? min : undefined;
}

// Apply the strict hub-bore filter. Returns the input set when oeBore is
// undefined (so we don't accidentally show zero wheels when derivation
// fails). Tires pass through untouched.
export function filterByOeBore<T extends WheelLike>(matched: T[], oeBore: number | undefined, toleranceMm = 0.5): T[] {
  if (oeBore == null) return matched;
  return matched.filter(p =>
    p.category !== 'wheel' || Math.abs((p.hubBore || 0) - oeBore) < toleranceMm
  );
}
