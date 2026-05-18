import { useEffect, useState } from 'react';
import VehicleResults from '../VehicleResults';
import VehicleSearch from '../search/VehicleSearch';
import { cdnUrl } from '../../lib/cdn';

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
    ]).then(([allProducts, fitment, vehicles]) => {
      const vkey = `${year}|${make}|${model}`;
      const matchingIds = new Set<string>();
      for (const [sku, vehicleList] of Object.entries(fitment as Record<string, string[]>)) {
        if ((vehicleList || []).includes(vkey)) matchingIds.add(sku);
      }
      const sellable = allProducts.filter((p: any) =>
        matchingIds.has(p.id) && !/discontinu/i.test(String(p.stock || ''))
      );
      setProducts(sellable);
      setAvailableDiameters(vehicles?.[year]?.[make]?.[model] || []);

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
          <a href="/" className="text-dark-500 hover:text-dark-300 text-sm transition-colors inline-flex items-center gap-1 mb-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Search
          </a>
          <h1 className="text-3xl sm:text-4xl font-bold text-white">
            {year} {make} <span className="text-primary-400">{model}</span>
          </h1>
          <p className="text-dark-400 mt-1">
            {inStockProducts.length} in stock
            {availableDiameters.length > 0 && (
              <span> · Fits {availableDiameters.map(d => `${d}"`).join(', ')} rims</span>
            )}
          </p>
          <p className="text-green-400 text-xs mt-2 inline-flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            All wheels are hub-centric — guaranteed vibration-free fit
          </p>
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
