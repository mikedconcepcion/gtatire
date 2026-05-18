import { useEffect, useMemo, useState } from 'react';
import ProductCard from '../ProductCard';
import { cdnUrl } from '../../lib/cdn';

const PAGE_SIZE = 40;

// Client-rendered /wheels listing. Replaces the previously pre-rendered
// version that embedded all 2,137 ProductCards in dist/wheels/index.html
// (5.7MB). Same filter/sort UX, but the products grid is fetched from the
// CDN on page load so a re-scrape just needs `git push`, no rebuild.
export default function WheelsListingPage() {
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState('');
  const [diameter, setDiameter] = useState('');
  const [bolt, setBolt] = useState('');
  const [sort, setSort] = useState<'price-asc' | 'price-desc'>('price-asc');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    fetch(cdnUrl('/data/products.json'))
      .then(r => r.json())
      .then(prods => {
        setAllProducts(prods.filter((p: any) => p.category === 'wheel'));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const brands = useMemo(() => [...new Set(allProducts.map(p => p.brand))].filter(Boolean).sort(), [allProducts]);
  const diameters = useMemo(() => [...new Set(allProducts.map(p => p.rimDiameter))].filter(Boolean).sort((a: any, b: any) => a - b), [allProducts]);
  const boltPatterns = useMemo(() => [...new Set(allProducts.map(p => p.boltPattern))].filter(Boolean).sort(), [allProducts]);

  const filtered = useMemo(() => {
    const out = allProducts.filter(p => {
      if (brand && p.brand !== brand) return false;
      if (diameter && String(p.rimDiameter) !== diameter) return false;
      if (bolt && p.boltPattern !== bolt) return false;
      return true;
    });
    out.sort((a, b) => sort === 'price-desc' ? b.priceNum - a.priceNum : a.priceNum - b.priceNum);
    return out;
  }, [allProducts, brand, diameter, bolt, sort]);

  // Reset pagination on filter change
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [brand, diameter, bolt, sort]);

  const visible = filtered.slice(0, visibleCount);
  const remaining = Math.max(0, filtered.length - visibleCount);

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Wheels</h1>
          <p className="text-dark-400 text-sm mt-1">
            {loading ? 'Loading…' : `${filtered.length} products`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={brand} onChange={e => setBrand(e.target.value)} className="bg-dark-800 border border-dark-600 text-dark-300 text-xs rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">All Brands</option>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={diameter} onChange={e => setDiameter(e.target.value)} className="bg-dark-800 border border-dark-600 text-dark-300 text-xs rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">All Sizes</option>
            {diameters.map((d: any) => <option key={d} value={d}>{d}"</option>)}
          </select>
          <select value={bolt} onChange={e => setBolt(e.target.value)} className="bg-dark-800 border border-dark-600 text-dark-300 text-xs rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">All Bolts</option>
            {boltPatterns.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value as any)} className="bg-dark-800 border border-dark-600 text-dark-300 text-xs rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="price-asc">Price: Low</option>
            <option value="price-desc">Price: High</option>
          </select>
        </div>
      </div>

      {visible.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {visible.map(p => (
            <ProductCard
              key={p.id}
              id={p.id}
              image={p.image}
              brand={p.brand}
              model={p.name || (p.description || '').split(' ')[0]}
              description={p.description}
              size={p.boltPattern ? `${p.rimDiameter}" · ${p.boltPattern}` : `${p.rimDiameter}"`}
              price={p.price}
              compareAt={p.compareAt}
              stock={p.stock}
              type={p.wheelType}
              category="wheel"
              noImage={p.noImage}
            />
          ))}
        </div>
      ) : !loading && (
        <div className="text-center py-12">
          <p className="text-dark-400 text-sm">No wheels match your filters.</p>
          <button onClick={() => { setBrand(''); setDiameter(''); setBolt(''); }} className="text-primary-400 text-sm mt-2 hover:underline">Clear filters</button>
        </div>
      )}

      {remaining > 0 && (
        <div className="text-center mt-8">
          <button onClick={() => setVisibleCount(c => c + PAGE_SIZE)} className="bg-dark-800 hover:bg-dark-700 text-dark-300 hover:text-white px-6 py-3 rounded-lg text-sm font-medium transition-colors border border-dark-600">
            Show More ({remaining} remaining)
          </button>
        </div>
      )}
    </section>
  );
}
