import { useState, useEffect, useMemo } from 'react';
import Fuse from 'fuse.js';

interface Product {
  id: string;
  sku: string;
  brand: string;
  wheelType: string;
  name: string;
  description: string;
  image: string;
  price: string;
  priceNum: number;
  compareAt: string;
  stock: string;
  hubCentric: boolean;
  rimDiameter: number | null;
  rimWidth: number | null;
  boltPattern: string;
  offset: number | null;
  finish: string;
  seat?: string;
}

interface FitmentMap {
  [productId: string]: string[]; // "year|make|model"
}

interface VehicleTree {
  [year: string]: {
    [make: string]: any;
  };
}

function StockBadge({ stock }: { stock: string }) {
  const inStock = stock.includes('In Stock') || stock === 'Available' || stock === '20+' || parseInt(stock) >= 10;
  const low = parseInt(stock) >= 1 && parseInt(stock) < 10;
  const out = stock.includes('Out of Stock');
  const color = inStock ? 'text-green-400' : low ? 'text-amber-400' : out ? 'text-red-400' : 'text-dark-400';
  const label = inStock ? 'In Stock' : low ? `${stock} left` : out ? 'Out of Stock' : stock || 'Available';
  return <span className={`text-xs font-medium ${color}`}>{label}</span>;
}

// Extract all unique makes and models from vehicle tree
function extractVehicleNames(tree: VehicleTree) {
  const makes = new Set<string>();
  const models = new Set<string>();
  const makeModels: Record<string, Set<string>> = {};

  for (const year of Object.keys(tree)) {
    for (const make of Object.keys(tree[year])) {
      makes.add(make.toUpperCase());
      if (!makeModels[make.toUpperCase()]) makeModels[make.toUpperCase()] = new Set();
      const modelObj = tree[year][make];
      const modelList = Array.isArray(modelObj) ? modelObj : Object.keys(modelObj);
      for (const model of modelList) {
        models.add(model.toUpperCase());
        makeModels[make.toUpperCase()].add(model.toUpperCase());
      }
    }
  }

  return { makes, models, makeModels };
}

// Find products that fit a specific make (any year, any model)
function getProductsForMake(
  products: Product[],
  fitment: FitmentMap,
  make: string
): Product[] {
  const matchingIds = new Set<string>();
  const makeUpper = make.toUpperCase();

  for (const [productId, vehicles] of Object.entries(fitment)) {
    for (const vKey of vehicles) {
      const parts = vKey.split('|');
      if (parts[1]?.toUpperCase() === makeUpper) {
        matchingIds.add(productId);
        break;
      }
    }
  }

  return products.filter(p => matchingIds.has(p.id));
}

// Find products that fit a specific make+model combo
function getProductsForMakeModel(
  products: Product[],
  fitment: FitmentMap,
  make: string,
  model: string
): Product[] {
  const matchingIds = new Set<string>();
  const makeUpper = make.toUpperCase();
  const modelUpper = model.toUpperCase();

  for (const [productId, vehicles] of Object.entries(fitment)) {
    for (const vKey of vehicles) {
      const parts = vKey.split('|');
      if (parts[1]?.toUpperCase() === makeUpper && parts[2]?.toUpperCase().includes(modelUpper)) {
        matchingIds.add(productId);
        break;
      }
    }
  }

  return products.filter(p => matchingIds.has(p.id));
}

export default function SmartSearchResults() {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [fitment, setFitment] = useState<FitmentMap>({});
  const [vehicleTree, setVehicleTree] = useState<VehicleTree>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sortBy, setSortBy] = useState<'relevance' | 'price-asc' | 'price-desc'>('relevance');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(params.get('q') || '');
  }, []);

  // Load all data
  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    Promise.all([
      fetch(`${base}/data/products.json`).then(r => r.json()),
      fetch(`${base}/data/fitment.json`).then(r => r.json()),
      fetch(`${base}/data/vehicles.json`).then(r => r.json()),
    ])
      .then(([prods, fit, vehs]) => {
        setProducts(prods);
        setFitment(fit);
        setVehicleTree(vehs);
        setLoading(false);
      })
      .catch(() => { setLoading(false); setError(true); });
  }, []);

  const vehicleNames = useMemo(() => extractVehicleNames(vehicleTree), [vehicleTree]);

  // Fuse for product search
  const fuse = useMemo(() => new Fuse(products, {
    keys: [
      { name: 'sku', weight: 5 },
      { name: 'brand', weight: 4 },
      { name: 'description', weight: 3 },
      { name: 'name', weight: 3 },
      { name: 'boltPattern', weight: 2 },
      { name: 'finish', weight: 2 },
    ],
    threshold: 0.4,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
  }), [products]);

  const { results, searchType, searchLabel } = useMemo(() => {
    if (!query.trim() || products.length === 0) return { results: [], searchType: 'none', searchLabel: '' };

    const q = query.trim();
    const qUpper = q.toUpperCase();
    const qLower = q.toLowerCase();
    const words = q.split(/\s+/).filter(w => w.length >= 2);
    const wordsUpper = words.map(w => w.toUpperCase());

    // ── 1. Vehicle search: detect make/model names ──
    // Check if query is or contains a vehicle make
    let detectedMake = '';
    let detectedModel = '';

    // Try full query as make
    if (vehicleNames.makes.has(qUpper)) {
      detectedMake = qUpper;
    }

    // Try words as make + model
    if (!detectedMake && words.length >= 1) {
      for (const w of wordsUpper) {
        if (vehicleNames.makes.has(w)) {
          detectedMake = w;
          // Remaining words might be a model
          const otherWords = wordsUpper.filter(x => x !== w);
          if (otherWords.length > 0) {
            const candidate = otherWords.join(' ');
            // Check if any model for this make contains the candidate
            const makeModels = vehicleNames.makeModels[w];
            if (makeModels) {
              for (const m of makeModels) {
                if (m.includes(candidate) || candidate.includes(m)) {
                  detectedModel = m;
                  break;
                }
              }
            }
            // Also try each word as a model
            if (!detectedModel) {
              for (const ow of otherWords) {
                if (makeModels) {
                  for (const m of makeModels) {
                    if (m.includes(ow) || ow.includes(m.split(' ')[0])) {
                      detectedModel = m;
                      break;
                    }
                  }
                }
                if (detectedModel) break;
              }
            }
          }
          break;
        }
      }
    }

    if (detectedMake) {
      let vehicleResults: Product[];
      let label: string;

      if (detectedModel) {
        vehicleResults = getProductsForMakeModel(products, fitment, detectedMake, detectedModel);
        label = `${detectedMake} ${detectedModel}`;
      } else {
        vehicleResults = getProductsForMake(products, fitment, detectedMake);
        label = detectedMake;
      }

      if (vehicleResults.length > 0) {
        // Apply any additional filters from query (diameter, color, type)
        let filtered = vehicleResults;
        const remainingWords = wordsUpper.filter(w => w !== detectedMake && w !== detectedModel);

        for (const w of remainingWords) {
          const wLower = w.toLowerCase();
          const diamMatch = w.match(/^(\d{2})$/);
          if (diamMatch) {
            filtered = filtered.filter(p => p.rimDiameter === parseInt(diamMatch[1]));
          } else if (wLower === 'steel') {
            filtered = filtered.filter(p => p.wheelType === 'Steel Wheel');
          } else if (wLower === 'alloy') {
            filtered = filtered.filter(p => p.wheelType !== 'Steel Wheel');
          } else if (wLower === 'black') {
            filtered = filtered.filter(p => p.finish?.toLowerCase().includes('black'));
          } else if (wLower === 'silver' || wLower === 'chrome') {
            filtered = filtered.filter(p => p.finish?.toLowerCase().includes(wLower));
          }
        }

        return {
          results: filtered.length > 0 ? filtered : vehicleResults,
          searchType: 'vehicle',
          searchLabel: `Wheels that fit ${label}`,
        };
      }
    }

    // ── 2. Brand search ──
    const brandMatch = products.filter(p =>
      p.brand.toLowerCase() === qLower ||
      (words.length === 1 && p.brand.toLowerCase().includes(qLower))
    );
    if (brandMatch.length > 0) {
      return { results: brandMatch, searchType: 'brand', searchLabel: `${brandMatch[0].brand} wheels` };
    }

    // ── 3. Direct match on SKU, description, name, finish, bolt pattern ──
    const directMatches = products.filter(p =>
      p.sku.toLowerCase().includes(qLower) ||
      p.description.toLowerCase().includes(qLower) ||
      p.name.toLowerCase().includes(qLower) ||
      p.finish.toLowerCase().includes(qLower) ||
      p.boltPattern.toLowerCase().includes(qLower)
    );
    if (directMatches.length > 0) {
      return { results: directMatches, searchType: 'direct', searchLabel: '' };
    }

    // ── 4. Spec filters: diameter, bolt pattern, type, color ──
    const diamMatch = qLower.match(/(\d{2})\s*(?:inch|"|'')?/);
    const boltMatch = qLower.match(/(\d)x(\d{3,4}\.?\d*)/);
    const isSteel = qLower.includes('steel');
    const isAlloy = qLower.includes('alloy');
    const colorWords = ['black', 'silver', 'white', 'bronze', 'gunmetal', 'anthracite', 'gold', 'red', 'chrome'];
    const detectedColor = colorWords.find(c => qLower.includes(c));

    if (diamMatch || boltMatch || isSteel || isAlloy || detectedColor) {
      const filtered = products.filter(p => {
        if (diamMatch && p.rimDiameter !== parseInt(diamMatch[1])) return false;
        if (boltMatch && !p.boltPattern.includes(`${boltMatch[1]}x${boltMatch[2]}`)) return false;
        if (isSteel && p.wheelType !== 'Steel Wheel') return false;
        if (isAlloy && p.wheelType === 'Steel Wheel') return false;
        if (detectedColor && !p.finish?.toLowerCase().includes(detectedColor) && !p.description.toLowerCase().includes(detectedColor)) return false;
        return true;
      });
      if (filtered.length > 0) {
        const parts = [];
        if (diamMatch) parts.push(`${diamMatch[1]}"`);
        if (detectedColor) parts.push(detectedColor);
        if (isSteel) parts.push('steel');
        if (isAlloy) parts.push('alloy');
        if (boltMatch) parts.push(`${boltMatch[1]}x${boltMatch[2]}`);
        return { results: filtered, searchType: 'spec', searchLabel: parts.join(' ') + ' wheels' };
      }
    }

    // ── 5. Multi-word: all words must appear ──
    if (words.length > 1) {
      const multiMatch = products.filter(p => {
        const haystack = `${p.sku} ${p.brand} ${p.description} ${p.name} ${p.finish} ${p.wheelType} ${p.boltPattern}`.toLowerCase();
        return words.every(w => haystack.includes(w.toLowerCase()));
      });
      if (multiMatch.length > 0) {
        return { results: multiMatch, searchType: 'multi', searchLabel: '' };
      }
    }

    // ── 6. Fuzzy fallback ──
    const fuseResults = fuse.search(query).map(r => r.item);
    return { results: fuseResults, searchType: 'fuzzy', searchLabel: '' };
  }, [query, products, fitment, vehicleNames, fuse]);

  // Sort results
  const sortedResults = useMemo(() => {
    const r = [...results];
    if (sortBy === 'price-asc') r.sort((a, b) => a.priceNum - b.priceNum);
    else if (sortBy === 'price-desc') r.sort((a, b) => b.priceNum - a.priceNum);
    else r.sort((a, b) => a.priceNum - b.priceNum); // default: price low
    return r;
  }, [results, sortBy]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const input = (e.target as HTMLFormElement).querySelector('input') as HTMLInputElement;
    const newQ = input.value.trim();
    if (newQ) {
      window.history.replaceState({}, '', `?q=${encodeURIComponent(newQ)}`);
      setQuery(newQ);
    }
  }

  // Search suggestions
  const suggestions = [
    'Hyundai Tucson',
    'Toyota Corolla',
    '18 inch black',
    '5x114.3',
    'Superspeed',
    'RWC',
    'steel 16',
    'bronze alloy',
  ];

  return (
    <div>
      {/* Search bar */}
      <form onSubmit={handleSearch} className="max-w-2xl mx-auto mb-6">
        <div className="relative">
          <input
            type="text"
            defaultValue={query}
            key={query} // reset input when query changes via suggestion
            placeholder='Search by vehicle, brand, size, color...'
            className="w-full bg-dark-800 border border-dark-600 text-white rounded-lg pl-12 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-dark-500"
          />
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </form>

      {/* Suggestions when no query */}
      {!query && !loading && (
        <div className="max-w-2xl mx-auto">
          <p className="text-dark-500 text-xs mb-3 text-center">Try searching for:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {suggestions.map(s => (
              <button
                key={s}
                onClick={() => {
                  window.history.replaceState({}, '', `?q=${encodeURIComponent(s)}`);
                  setQuery(s);
                }}
                className="text-xs text-dark-400 hover:text-primary-400 bg-dark-800/50 hover:bg-dark-800 px-3 py-1.5 rounded-full transition-all border border-dark-700/50"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="text-center py-12 text-dark-500 text-sm">Loading...</div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-400 text-sm">Failed to load data. Try refreshing.</p>
        </div>
      ) : query && results.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-dark-400 text-sm">No results for "{query}"</p>
          <p className="text-dark-600 text-xs mt-1">Try a vehicle name, brand, size, or bolt pattern</p>
        </div>
      ) : query ? (
        <>
          {/* Results header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              {searchLabel ? (
                <p className="text-dark-300 text-sm font-medium">{searchLabel}</p>
              ) : null}
              <p className="text-dark-500 text-xs">{results.length} result{results.length !== 1 ? 's' : ''}</p>
            </div>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="bg-dark-800 border border-dark-600 text-dark-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none"
            >
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
            </select>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {sortedResults.slice(0, 60).map(p => (
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
                  {p.brand && (
                    <span className="absolute top-2 left-2 text-[10px] font-medium px-2 py-0.5 rounded-full border bg-dark-900/80 text-dark-300 border-dark-600/50">
                      {p.brand}
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="text-white font-semibold text-xs line-clamp-1">{p.name || p.description.split(' ')[0]}</h3>
                  <p className="text-dark-400 text-[11px] line-clamp-1 mb-1">
                    {p.rimDiameter && p.rimWidth ? `${p.rimDiameter}x${p.rimWidth}` : ''} {p.boltPattern} {p.finish}
                  </p>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-white font-bold text-sm">{p.price}</span>
                      {p.compareAt && p.compareAt !== p.price && (
                        <span className="text-dark-500 text-[10px] line-through ml-1">{p.compareAt}</span>
                      )}
                    </div>
                    <StockBadge stock={p.stock} />
                  </div>
                </div>
              </a>
            ))}
          </div>

          {sortedResults.length > 60 && (
            <p className="text-center text-dark-500 text-xs mt-6">
              Showing 60 of {sortedResults.length} results. Try a more specific search.
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
