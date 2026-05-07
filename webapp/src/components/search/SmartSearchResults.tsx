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
  category: string;
  tireSize?: string;
  tireWidth?: number | null;
  tireAspect?: number | null;
}

interface FitmentMap {
  [productId: string]: string[]; // "year|make|model"
}

interface VehicleTree {
  [year: string]: {
    [make: string]: any;
  };
}

interface TireFitmentMap {
  [vehicleKey: string]: {
    sizes: string[];
    oeWheel: number | null;
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
  const modelToMakes: Record<string, Set<string>> = {}; // reverse: model → makes
  const years = new Set<string>();

  for (const year of Object.keys(tree)) {
    years.add(year);
    for (const make of Object.keys(tree[year])) {
      makes.add(make.toUpperCase());
      if (!makeModels[make.toUpperCase()]) makeModels[make.toUpperCase()] = new Set();
      const modelObj = tree[year][make];
      const modelList = Array.isArray(modelObj) ? modelObj : Object.keys(modelObj);
      for (const model of modelList) {
        const mUp = model.toUpperCase();
        models.add(mUp);
        makeModels[make.toUpperCase()].add(mUp);
        // Reverse lookup: model → makes
        if (!modelToMakes[mUp]) modelToMakes[mUp] = new Set();
        modelToMakes[mUp].add(make.toUpperCase());
        // Also index first word of model (e.g., "RAV4" from "RAV4 HYBRID")
        const firstWord = mUp.split(/[\s(]/)[0];
        if (firstWord.length >= 2 && firstWord !== mUp) {
          if (!modelToMakes[firstWord]) modelToMakes[firstWord] = new Set();
          modelToMakes[firstWord].add(make.toUpperCase());
        }
      }
    }
  }

  return { makes, models, makeModels, modelToMakes, years };
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

// Find products that fit a specific make+model combo, optionally filtered by year
function getProductsForMakeModel(
  products: Product[],
  fitment: FitmentMap,
  make: string,
  model: string,
  year?: string
): Product[] {
  const matchingIds = new Set<string>();
  const makeUpper = make.toUpperCase();
  const modelUpper = model.toUpperCase();

  for (const [productId, vehicles] of Object.entries(fitment)) {
    for (const vKey of vehicles) {
      const parts = vKey.split('|');
      const yMatch = !year || parts[0] === year;
      const mkMatch = parts[1]?.toUpperCase() === makeUpper;
      const mdMatch = parts[2]?.toUpperCase().includes(modelUpper);
      if (yMatch && mkMatch && mdMatch) {
        matchingIds.add(productId);
        break;
      }
    }
  }

  return products.filter(p => matchingIds.has(p.id));
}

// Find products by model name only (across all makes)
function getProductsForModel(
  products: Product[],
  fitment: FitmentMap,
  model: string,
  year?: string
): { results: Product[]; detectedMake: string } {
  const matchingIds = new Set<string>();
  const modelUpper = model.toUpperCase();
  let foundMake = '';

  for (const [productId, vehicles] of Object.entries(fitment)) {
    for (const vKey of vehicles) {
      const parts = vKey.split('|');
      const yMatch = !year || parts[0] === year;
      if (yMatch && parts[2]?.toUpperCase().includes(modelUpper)) {
        matchingIds.add(productId);
        if (!foundMake) foundMake = parts[1];
        break;
      }
    }
  }

  return { results: products.filter(p => matchingIds.has(p.id)), detectedMake: foundMake };
}

export default function SmartSearchResults() {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [fitment, setFitment] = useState<FitmentMap>({});
  const [tireFitment, setTireFitment] = useState<TireFitmentMap>({});
  const [vehicleTree, setVehicleTree] = useState<VehicleTree>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sortBy, setSortBy] = useState<'relevance' | 'price-asc' | 'price-desc'>('relevance');
  const [showCategory, setShowCategory] = useState<'all' | 'wheel' | 'tire'>('all');

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
      fetch(`${base}/data/tire-fitment.json`).then(r => r.json()).catch(() => ({})),
    ])
      .then(([prods, fit, vehs, tFit]) => {
        setProducts(prods);
        setFitment(fit);
        setVehicleTree(vehs);
        setTireFitment(tFit);
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

    // ── 1. Vehicle search: detect year, make, model from query ──
    let detectedYear = '';
    let detectedMake = '';
    let detectedModel = '';
    const usedWords = new Set<string>();

    // Detect year (4-digit number between 1999-2030)
    for (const w of wordsUpper) {
      const yearNum = parseInt(w);
      if (w.length === 4 && yearNum >= 1999 && yearNum <= 2030 && vehicleNames.years.has(w)) {
        detectedYear = w;
        usedWords.add(w);
        break;
      }
    }

    // Detect make
    const nonYearWords = wordsUpper.filter(w => !usedWords.has(w));
    for (const w of nonYearWords) {
      if (vehicleNames.makes.has(w)) {
        detectedMake = w;
        usedWords.add(w);
        break;
      }
    }

    // Detect model — try remaining words against known models
    const remainingForModel = wordsUpper.filter(w => !usedWords.has(w));
    if (remainingForModel.length > 0) {
      // Try multi-word model first (e.g., "RAV4 HYBRID"), then single words
      const modelCandidate = remainingForModel.join(' ');
      const modelsToSearch = detectedMake
        ? vehicleNames.makeModels[detectedMake]
        : null;

      if (modelsToSearch) {
        // Search within detected make's models
        for (const m of modelsToSearch) {
          if (m === modelCandidate || m.includes(modelCandidate) || modelCandidate.includes(m.split(/[\s(]/)[0])) {
            detectedModel = m;
            remainingForModel.forEach(w => usedWords.add(w));
            break;
          }
        }
        // Try single words
        if (!detectedModel) {
          for (const w of remainingForModel) {
            for (const m of modelsToSearch) {
              if (m === w || m.startsWith(w) || m.includes(w)) {
                detectedModel = m;
                usedWords.add(w);
                break;
              }
            }
            if (detectedModel) break;
          }
        }
      }

      // No make detected yet — try model-only lookup (e.g., "Tucson", "Civic")
      if (!detectedMake && !detectedModel) {
        for (const w of remainingForModel) {
          if (vehicleNames.modelToMakes[w]) {
            detectedModel = w;
            // Pick the first (most common) make for this model
            const possibleMakes = vehicleNames.modelToMakes[w];
            detectedMake = [...possibleMakes][0];
            usedWords.add(w);
            break;
          }
          // Try partial model match
          for (const [modelName, makesSet] of Object.entries(vehicleNames.modelToMakes)) {
            if (modelName.startsWith(w) && w.length >= 3) {
              detectedModel = modelName;
              detectedMake = [...makesSet][0];
              usedWords.add(w);
              break;
            }
          }
          if (detectedModel) break;
        }
      }
    }

    // If we detected any vehicle component, search fitment
    if (detectedMake || detectedModel) {
      let vehicleResults: Product[];
      let label: string;

      if (detectedMake && detectedModel) {
        vehicleResults = getProductsForMakeModel(products, fitment, detectedMake, detectedModel, detectedYear || undefined);
        label = [detectedYear, detectedMake, detectedModel].filter(Boolean).join(' ');
      } else if (detectedMake) {
        // Make only (optionally with year)
        if (detectedYear) {
          // Year + make: filter fitment by both
          const matchingIds = new Set<string>();
          for (const [productId, vehicles] of Object.entries(fitment)) {
            for (const vKey of vehicles) {
              const parts = vKey.split('|');
              if (parts[0] === detectedYear && parts[1]?.toUpperCase() === detectedMake) {
                matchingIds.add(productId);
                break;
              }
            }
          }
          vehicleResults = products.filter(p => matchingIds.has(p.id));
        } else {
          vehicleResults = getProductsForMake(products, fitment, detectedMake);
        }
        label = [detectedYear, detectedMake].filter(Boolean).join(' ');
      } else {
        // Model only
        const { results: modelResults, detectedMake: mk } = getProductsForModel(products, fitment, detectedModel, detectedYear || undefined);
        vehicleResults = modelResults;
        detectedMake = mk;
        label = [detectedYear, detectedMake, detectedModel].filter(Boolean).join(' ');
      }

      // Also find matching tires from tire fitment data
      let matchingTires: Product[] = [];
      if (detectedMake) {
        // Find OE tire sizes for this vehicle
        const oeSizes: string[] = [];
        for (const [key, data] of Object.entries(tireFitment)) {
          const parts = key.split('|');
          const yMatch = !detectedYear || parts[0] === detectedYear;
          const mkMatch = parts[1]?.toUpperCase() === detectedMake;
          const mdMatch = !detectedModel || parts[2]?.toUpperCase().includes(detectedModel);
          if (yMatch && mkMatch && mdMatch && data.sizes) {
            oeSizes.push(...data.sizes);
          }
        }
        const uniqueSizes = [...new Set(oeSizes)];

        if (uniqueSizes.length > 0) {
          // Find tires matching those OE sizes
          matchingTires = products.filter(p => {
            if (p.category !== 'tire' || !p.tireSize) return false;
            // Parse tire size: P225/65R17 → 225/65R17
            const normalized = p.tireSize.replace(/^[PL]T?/, '');
            return uniqueSizes.some(s => normalized === s || p.tireSize.includes(s.replace('R', '/')));
          });
        }
      }

      const combinedResults = [...vehicleResults, ...matchingTires];

      if (combinedResults.length > 0) {
        // Apply additional spec filters from unused words
        let filtered = combinedResults;
        const specWords = wordsUpper.filter(w => !usedWords.has(w));

        for (const w of specWords) {
          const wLower = w.toLowerCase();
          const diamMatch = w.match(/^(\d{2})$/);
          if (diamMatch) {
            const d = parseInt(diamMatch[1]);
            if (d >= 13 && d <= 24) filtered = filtered.filter(p => p.rimDiameter === d);
          } else if (wLower === 'steel') {
            filtered = filtered.filter(p => p.wheelType === 'Steel Wheel');
          } else if (wLower === 'alloy') {
            filtered = filtered.filter(p => p.wheelType !== 'Steel Wheel');
          } else if (wLower === 'winter') {
            filtered = filtered.filter(p => p.wheelType === 'Winter' || p.category === 'wheel');
          } else if (['black','silver','chrome','bronze','gunmetal','anthracite','gold','white','red','satin'].includes(wLower)) {
            filtered = filtered.filter(p => p.finish?.toLowerCase().includes(wLower));
          }
        }

        const wheelCount = (filtered.length > 0 ? filtered : combinedResults).filter(p => p.category === 'wheel').length;
        const tireCount = (filtered.length > 0 ? filtered : combinedResults).filter(p => p.category === 'tire').length;

        return {
          results: filtered.length > 0 ? filtered : combinedResults,
          searchType: 'vehicle',
          searchLabel: `Fits ${label}`,
          wheelCount,
          tireCount,
        };
      }
    }

    // ── 2. Tire size search (225/45R17, 225/45/17, 2254517) ──
    const tireSizeMatch = q.match(/(\d{3})\s*[\/\\]?\s*(\d{2,3})\s*[\/\\]?R?\s*(\d{2})/i);
    if (tireSizeMatch) {
      const [, tw, ta, tr] = tireSizeMatch;
      const tireResults = products.filter(p =>
        p.category === 'tire' &&
        p.tireWidth === parseInt(tw) &&
        p.tireAspect === parseInt(ta) &&
        p.rimDiameter === parseInt(tr)
      );
      if (tireResults.length > 0) {
        // Check for type filter in remaining words
        let filtered = tireResults;
        const isWinter = qLower.includes('winter');
        const isAllSeason = qLower.includes('all season');
        const isAllWeather = qLower.includes('all weather');
        if (isWinter) filtered = filtered.filter(p => p.wheelType === 'Winter');
        if (isAllSeason) filtered = filtered.filter(p => p.wheelType === 'All Season');
        if (isAllWeather) filtered = filtered.filter(p => p.wheelType === 'All Weather');

        return {
          results: filtered.length > 0 ? filtered : tireResults,
          searchType: 'tire-size',
          searchLabel: `${tw}/${ta}R${tr} tires`,
        };
      }
    }

    // ── 2b. Tire type search (winter tires, all season) ──
    const isWinterSearch = qLower.includes('winter');
    const isAllSeasonSearch = qLower.match(/all.?season/);
    const isAllWeatherSearch = qLower.match(/all.?weather/);
    if (isWinterSearch || isAllSeasonSearch || isAllWeatherSearch) {
      const typeFilter = isWinterSearch ? 'Winter' : isAllSeasonSearch ? 'All Season' : 'All Weather';
      let tireTypeResults = products.filter(p => p.category === 'tire' && p.wheelType === typeFilter);

      // Check for brand in remaining words
      const brandWords = words.filter(w => !['winter','all','season','weather','tires','tire'].includes(w.toLowerCase()));
      if (brandWords.length > 0) {
        const brandFiltered = tireTypeResults.filter(p =>
          brandWords.some(bw => p.brand.toLowerCase().includes(bw.toLowerCase()))
        );
        if (brandFiltered.length > 0) tireTypeResults = brandFiltered;
      }

      if (tireTypeResults.length > 0) {
        return { results: tireTypeResults, searchType: 'tire-type', searchLabel: `${typeFilter} tires` };
      }
    }

    // ── 3. Brand search ──
    const brandMatch = products.filter(p =>
      p.brand.toLowerCase() === qLower ||
      (words.length === 1 && p.brand.toLowerCase().includes(qLower))
    );
    if (brandMatch.length > 0) {
      const cat = brandMatch[0].category === 'tire' ? 'tires' : 'wheels';
      return { results: brandMatch, searchType: 'brand', searchLabel: `${brandMatch[0].brand} ${cat}` };
    }

    // ── 4. Direct match on SKU, description, name, finish, bolt pattern, tire size ──
    const directMatches = products.filter(p =>
      p.sku.toLowerCase().includes(qLower) ||
      p.description.toLowerCase().includes(qLower) ||
      p.name.toLowerCase().includes(qLower) ||
      (p.finish && p.finish.toLowerCase().includes(qLower)) ||
      (p.boltPattern && p.boltPattern.toLowerCase().includes(qLower)) ||
      (p.tireSize && p.tireSize.toLowerCase().includes(qLower))
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
  }, [query, products, fitment, tireFitment, vehicleNames, fuse]);

  // Filter and sort results
  const sortedResults = useMemo(() => {
    let r = [...results];
    if (showCategory !== 'all') r = r.filter(p => p.category === showCategory);
    if (sortBy === 'price-asc') r.sort((a, b) => a.priceNum - b.priceNum);
    else if (sortBy === 'price-desc') r.sort((a, b) => b.priceNum - a.priceNum);
    else r.sort((a, b) => a.priceNum - b.priceNum);
    return r;
  }, [results, sortBy, showCategory]);

  const wheelCount = results.filter(p => p.category === 'wheel').length;
  const tireCount = results.filter(p => p.category === 'tire').length;
  const hasBothCategories = wheelCount > 0 && tireCount > 0;

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
    '225/45R17',
    'Michelin',
    'winter tires',
    '2025 Hyundai Tucson',
    'Civic',
    'Toyota RAV4',
    '18 black alloy',
    'Superspeed',
    'RWC',
    '5x114.3',
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              {searchLabel ? (
                <p className="text-dark-300 text-sm font-medium">{searchLabel}</p>
              ) : null}
              <p className="text-dark-500 text-xs">{sortedResults.length} result{sortedResults.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Category tabs when showing both */}
              {hasBothCategories && (
                <div className="flex gap-1 bg-[var(--color-dark-800)]/50 p-0.5 rounded-lg">
                  <button onClick={() => setShowCategory('all')} className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${showCategory === 'all' ? 'bg-primary-600 text-white' : 'text-[var(--color-dark-400)]'}`}>
                    All ({results.length})
                  </button>
                  <button onClick={() => setShowCategory('wheel')} className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${showCategory === 'wheel' ? 'bg-primary-600 text-white' : 'text-[var(--color-dark-400)]'}`}>
                    Wheels ({wheelCount})
                  </button>
                  <button onClick={() => setShowCategory('tire')} className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${showCategory === 'tire' ? 'bg-primary-600 text-white' : 'text-[var(--color-dark-400)]'}`}>
                    Tires ({tireCount})
                  </button>
                </div>
              )}
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="bg-dark-800 border border-dark-600 text-dark-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none"
              >
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
              </select>
            </div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {sortedResults.slice(0, 60).map(p => (
              <a href={`${import.meta.env.BASE_URL}/${p.category === 'tire' ? 'tires' : 'wheels'}/${p.id}`} key={p.id} className="group bg-dark-900 border border-dark-700/50 rounded-xl overflow-hidden hover:border-primary-600/40 transition-all">
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
                    {p.tireSize || (p.rimDiameter && p.rimWidth ? `${p.rimDiameter}x${p.rimWidth} ${p.boltPattern}` : p.boltPattern)} {p.finish}
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
