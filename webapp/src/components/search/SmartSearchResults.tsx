import { useState, useEffect, useMemo } from 'react';
import Fuse from 'fuse.js';

interface Product {
  id: string;
  productNo: string;
  wheelType: string;
  name: string;
  description: string;
  image: string;
  msrp: string;
  priceNum: number;
  stock: string;
  hubCentric: boolean;
  rimDiameter: number | null;
  boltPattern: string;
  finish: string;
}

function StockBadge({ stock }: { stock: string }) {
  const num = parseInt(stock);
  const inStock = stock === '20+' || num >= 10;
  const low = num >= 1 && num < 10;
  const contact = stock === 'Contact us';
  const color = inStock ? 'text-green-400' : low ? 'text-amber-400' : contact ? 'text-dark-400' : 'text-red-400';
  const label = inStock ? 'In Stock' : contact ? 'Contact Us' : low ? `${stock} left` : stock;
  return <span className={`text-xs font-medium ${color}`}>{label}</span>;
}

export default function SmartSearchResults() {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Get query from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(params.get('q') || '');
  }, []);

  // Load products
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}/data/products.json`)
      .then(r => r.json())
      .then(data => { setProducts(data); setLoading(false); })
      .catch(() => { setLoading(false); setError(true); });
  }, []);

  // Fuse search
  const fuse = useMemo(() => new Fuse(products, {
    keys: [
      { name: 'productNo', weight: 5 },
      { name: 'description', weight: 3 },
      { name: 'name', weight: 3 },
      { name: 'boltPattern', weight: 2 },
      { name: 'finish', weight: 2 },
      { name: 'wheelType', weight: 1 },
      { name: 'price', weight: 1 },
    ],
    threshold: 0.5,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
  }), [products]);

  const results = useMemo(() => {
    if (!query.trim() || products.length === 0) return [];

    const q = query.toLowerCase().trim();

    // 1. Exact/partial match on product number, description, name, finish, bolt pattern
    const directMatches = products.filter(p =>
      p.productNo.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.finish.toLowerCase().includes(q) ||
      p.boltPattern.toLowerCase().includes(q)
    );
    if (directMatches.length > 0) {
      return directMatches.sort((a, b) => a.priceNum - b.priceNum);
    }

    // 2. Structured filter: diameter, bolt pattern, type keywords
    const diamMatch = q.match(/(\d{2})\s*(?:inch|"|'')?/);
    const boltMatch = q.match(/(\d)x(\d{3,4}\.?\d*)/);
    const isSteel = q.includes('steel');
    const isAlloy = q.includes('alloy');
    const isBlack = q.includes('black');
    const isSilver = q.includes('silver');

    if (diamMatch || boltMatch || isSteel || isAlloy || isBlack || isSilver) {
      const filtered = products.filter(p => {
        if (diamMatch && p.rimDiameter !== parseInt(diamMatch[1])) return false;
        if (boltMatch && !p.boltPattern.includes(`${boltMatch[1]}x${boltMatch[2]}`)) return false;
        if (isSteel && p.wheelType !== 'Steel Wheel') return false;
        if (isAlloy && p.wheelType !== 'Alloy Wheel') return false;
        if (isBlack && !p.description.toLowerCase().includes('black') && !p.finish.toLowerCase().includes('black')) return false;
        if (isSilver && !p.description.toLowerCase().includes('silver') && !p.finish.toLowerCase().includes('silver')) return false;
        return true;
      });
      if (filtered.length > 0) return filtered.sort((a, b) => a.priceNum - b.priceNum);
    }

    // 3. Multi-word: split query and match products containing ALL words
    const words = q.split(/\s+/).filter(w => w.length >= 2);
    if (words.length > 1) {
      const multiMatch = products.filter(p => {
        const haystack = `${p.productNo} ${p.description} ${p.name} ${p.finish} ${p.wheelType} ${p.boltPattern}`.toLowerCase();
        return words.every(w => haystack.includes(w));
      });
      if (multiMatch.length > 0) return multiMatch.sort((a, b) => a.priceNum - b.priceNum);
    }

    // 4. Fuzzy search as last resort
    return fuse.search(query).map(r => r.item);
  }, [query, products, fuse]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const input = (e.target as HTMLFormElement).querySelector('input') as HTMLInputElement;
    const newQ = input.value.trim();
    if (newQ) {
      window.history.replaceState({}, '', `?q=${encodeURIComponent(newQ)}`);
      setQuery(newQ);
    }
  }

  return (
    <div>
      {/* Search bar */}
      <form onSubmit={handleSearch} className="max-w-2xl mx-auto mb-8">
        <div className="relative">
          <input
            type="text"
            defaultValue={query}
            placeholder='Try "18 inch alloy", "5x114.3", "black wheel"...'
            className="w-full bg-dark-800 border border-dark-600 text-white rounded-lg pl-12 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-dark-500"
          />
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </form>

      {/* Results */}
      {loading ? (
        <div className="text-center py-12 text-dark-500 text-sm">Loading products...</div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-400 text-sm">Failed to load product data. Please try refreshing the page.</p>
        </div>
      ) : query && results.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-dark-400 text-sm">No results for "{query}"</p>
          <p className="text-dark-600 text-xs mt-1">Try different keywords or use the vehicle search</p>
        </div>
      ) : query ? (
        <>
          <p className="text-dark-500 text-sm mb-4">{results.length} result{results.length !== 1 ? 's' : ''} for "{query}"</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {results.slice(0, 50).map(p => (
              <a href={`${import.meta.env.BASE_URL}/wheels/${p.id}`} key={p.id} className="group bg-dark-900 border border-dark-700/50 rounded-xl overflow-hidden hover:border-primary-600/40 transition-all">
                <div className="aspect-square bg-white rounded-t-xl flex items-center justify-center p-4 relative">
                  {p.image ? (
                    <img src={p.image} alt={p.description} className="w-full h-full object-contain mix-blend-multiply" loading="lazy" decoding="async" />
                  ) : (
                    <svg className="w-16 h-16 text-dark-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
                      <circle cx="12" cy="12" r="2" strokeWidth="1.5" />
                    </svg>
                  )}
                  <span className={`absolute top-2 left-2 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                    p.wheelType === 'Alloy Wheel'
                      ? 'bg-primary-500/10 text-primary-400 border-primary-500/20'
                      : 'bg-dark-500/10 text-dark-300 border-dark-500/20'
                  }`}>{p.wheelType}</span>
                </div>
                <div className="p-3">
                  <h3 className="text-white font-semibold text-xs line-clamp-1">{p.name || p.description.split(' ')[0]}</h3>
                  <p className="text-dark-400 text-[11px] line-clamp-1 mb-2">{p.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-white font-bold text-sm">{p.price}</span>
                    <StockBadge stock={p.stock} />
                  </div>
                </div>
              </a>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
