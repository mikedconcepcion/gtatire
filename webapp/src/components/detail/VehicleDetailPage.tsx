import { useEffect, useState } from 'react';
import VehicleResults from '../VehicleResults';
import VehicleSearch from '../search/VehicleSearch';
import { cdnUrl } from '../../lib/cdn';
import { deriveOeHubBore, filterByOeBore } from '../../lib/oe-bore';

// Hydrator for /vehicle/{year}/{make}/{model}. Replaces the previously
// pre-rendered route so catalogue updates (~7,500 vehicle slugs) ship via
// git push instead of a Cloudflare rebuild. The bare URL stays unchanged
// because Cloudflare _redirects rewrites /vehicle/* to /vehicle/.
function inStock(s: string): boolean {
  const t = String(s || '').trim();
  if (/out of stock/i.test(t)) return false;
  if (/^n\/?a$/i.test(t)) return false;
  if (/discontinu/i.test(t)) return false;
  return true;
}

export default function VehicleDetailPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [vehicleKey, setVehicleKey] = useState<{ year: string; make: string; model: string } | null>(null);
  const [availableDiameters, setAvailableDiameters] = useState<string[]>([]);
  const [vehicleImage, setVehicleImage] = useState<string | null>(null);
  const [oeSpec, setOeSpec] = useState<{ boltPattern?: string; hubBore?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    // URL: /vehicle/{year}/{make}/{model}
    const parts = window.location.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (parts[0] !== 'vehicle' || parts.length < 4) {
      setNotFound(true); setLoading(false); return;
    }
    const [, year, makeRaw, modelRaw] = parts;
    const make = decodeURIComponent(makeRaw);
    const model = decodeURIComponent(modelRaw);
    setVehicleKey({ year, make, model });

    Promise.all([
      fetch(cdnUrl('/data/products.json')).then(r => r.json()),
      fetch(cdnUrl('/data/fitment.json')).then(r => r.json()),
      fetch(cdnUrl('/data/vehicles.json')).then(r => r.json()),
      // Vehicle photo manifest — keyed "YYYY|MAKE|MODEL". Returns null
      // gracefully for vehicles we haven't scraped a photo for yet.
      fetch(cdnUrl('/data/vehicle-images.json')).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]).then(([allProducts, fitment, vehicles, vehicleImages]) => {
      const vkey = `${year}|${make}|${model}`;
      const matchingIds = new Set<string>();
      for (const [sku, vehicleList] of Object.entries(fitment as Record<string, string[]>)) {
        if ((vehicleList || []).includes(vkey)) matchingIds.add(sku);
      }
      const matched = allProducts.filter((p: any) =>
        matchingIds.has(p.id) && !/discontinu/i.test(String(p.stock || ''))
      );

      // Derive OE hub-bore via shared helper (Alltire OE-marked → replica
      // brands → smallest bore fallback). Then apply strict ±0.5mm filter.
      // James's rule: a 66.1mm vehicle gets 66.1mm wheels only, never 73.1.
      const oeHub = deriveOeHubBore(matched);
      const replicas = matched.filter((p: any) =>
        p.category === 'wheel' && ['RWC', 'OE+', 'OE+ Forged'].includes(p.brand)
      );
      const modeOf = <T,>(arr: T[]): T | undefined => {
        const c = new Map<T, number>();
        for (const v of arr) if (v != null) c.set(v, (c.get(v) || 0) + 1);
        return Array.from(c.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
      };
      const oeBolt = modeOf(replicas.map((p: any) => p.boltPattern));

      const sellable = filterByOeBore(matched, oeHub);

      setProducts(sellable);
      setOeSpec({ boltPattern: oeBolt as string | undefined, hubBore: oeHub });
      setAvailableDiameters(vehicles?.[year]?.[make]?.[model] || []);

      // Vehicle JPGs are stripped from dist/ at build time (per strip-cdn-assets)
      // and served from jsDelivr in production. Wrap in cdnUrl() so the path
      // resolves correctly in both dev (same-origin) and prod (CDN).
      const imgPath = (vehicleImages as Record<string, string>)[vkey] || null;
      setVehicleImage(imgPath ? cdnUrl(imgPath) : null);

      const displayMake = make.charAt(0) + make.slice(1).toLowerCase();
      document.title = `${year} ${displayMake} ${model} — Wheels & Tires`;
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 text-center text-dark-500">Loading…</div>;
  }
  if (notFound || !vehicleKey) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">Vehicle Not Found</h1>
        <a href="/" className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors">Search Again</a>
      </div>
    );
  }

  const { year, make, model } = vehicleKey;
  const displayMake = make.charAt(0) + make.slice(1).toLowerCase();
  const inStockProducts = products.filter(p => inStock(String(p.stock || '')));
  const steelCount = inStockProducts.filter(p => p.wheelType === 'Steel Wheel').length;
  const alloyCount = inStockProducts.filter(p => p.wheelType === 'Alloy Wheel').length;

  return (
    <>
      <section className="bg-dark-900 border-b border-dark-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <a href="/" className="text-dark-500 hover:text-dark-300 text-sm transition-colors inline-flex items-center gap-1 mb-3">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Search
          </a>

          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-5 md:gap-8 items-center">
            {/* Vehicle photo — falls back to a generic silhouette if we
                haven't scraped a reference image for this YMM yet. Capped
                size on desktop so it doesn't dominate the fold. */}
            <div className="relative w-full bg-dark-950/40 border border-dark-700/50 rounded-xl overflow-hidden aspect-[16/9] flex items-center justify-center">
              {vehicleImage ? (
                <img
                  src={vehicleImage}
                  alt={`${year} ${make} ${model} reference photo`}
                  className="w-full h-full object-contain p-2"
                  loading="eager"
                  decoding="async"
                />
              ) : (
                <div className="text-center px-6">
                  <svg className="w-12 h-12 mx-auto text-dark-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.4} d="M3 13l2-6h14l2 6M5 13h14M5 13v5a1 1 0 001 1h2a1 1 0 001-1v-1M15 18v1a1 1 0 001 1h2a1 1 0 001-1v-5" />
                    <circle cx="7.5" cy="16.5" r="1.5" strokeWidth={1.4} />
                    <circle cx="16.5" cy="16.5" r="1.5" strokeWidth={1.4} />
                  </svg>
                  <p className="text-dark-500 text-xs">Reference photo coming soon</p>
                </div>
              )}
            </div>

            {/* YMM headline + fit-spec block */}
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white">
                {year} {make} <span className="text-primary-400">{model}</span>
              </h1>
              <p className="text-dark-400 mt-1.5">
                {inStockProducts.length} hub-centric wheel{inStockProducts.length === 1 ? '' : 's'} in stock
                {availableDiameters.length > 0 && (
                  <span> · {availableDiameters.map(d => `${d}"`).join(', ')}</span>
                )}
              </p>
              <p className="text-green-400 text-xs mt-2 inline-flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                All wheels are hub-centric — guaranteed vibration-free fit
              </p>

              {/* OE spec strip — only shown when consensus gave us something */}
              {(oeSpec?.boltPattern || oeSpec?.hubBore) && (
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  {oeSpec.boltPattern && (
                    <span className="inline-flex items-center gap-1.5 bg-dark-800 border border-dark-700/60 rounded-md px-2.5 py-1">
                      <span className="text-dark-500">Bolt</span>
                      <span className="text-white font-mono font-semibold">{oeSpec.boltPattern}</span>
                    </span>
                  )}
                  {oeSpec.hubBore != null && (
                    <span className="inline-flex items-center gap-1.5 bg-dark-800 border border-dark-700/60 rounded-md px-2.5 py-1">
                      <span className="text-dark-500">Hub</span>
                      <span className="text-white font-mono font-semibold">{oeSpec.hubBore}mm</span>
                    </span>
                  )}
                </div>
              )}

              <div className="flex gap-3 text-sm mt-4">
                <div className="bg-dark-800 border border-dark-700/50 rounded-lg px-4 py-2 text-center">
                  <div className="text-white font-bold text-lg">{steelCount}</div>
                  <div className="text-dark-500 text-xs">Steel</div>
                </div>
                <div className="bg-dark-800 border border-dark-700/50 rounded-lg px-4 py-2 text-center">
                  <div className="text-primary-400 font-bold text-lg">{alloyCount}</div>
                  <div className="text-dark-500 text-xs">Alloy</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {products.length > 0 ? (
          <VehicleResults products={products} availableDiameters={availableDiameters} />
        ) : (
          <div className="text-center py-20">
            <h3 className="text-white font-semibold text-lg mb-2">No wheels found for this vehicle</h3>
            <p className="text-dark-500 text-sm max-w-md mx-auto mb-6">
              We don't have wheel data for the {year} {displayMake} {model} yet.
            </p>
            <div className="flex justify-center gap-3">
              <a href="/" className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">Search Again</a>
              <a href="/wheels" className="bg-dark-800 hover:bg-dark-700 text-dark-300 hover:text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors border border-dark-600">Browse All Wheels</a>
            </div>
          </div>
        )}
      </section>

      {products.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 border-t border-dark-700/30">
          <div className="text-center mb-6">
            <h3 className="text-white font-semibold">Search for a different vehicle</h3>
          </div>
          <VehicleSearch />
        </section>
      )}
    </>
  );
}
