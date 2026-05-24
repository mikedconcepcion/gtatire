import { useState, useEffect, useMemo } from 'react';
import Fuse from 'fuse.js';
import VehiclePackageBuilder from './VehiclePackageBuilder';
import { cdnUrl } from '../../lib/cdn';
import { getVehicleImgUrl } from '../../lib/vehicle-img';

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
  const s = String(stock || '').trim();
  const n = parseInt(s, 10);
  const out = /out of stock/i.test(s) || /^n\/?a$/i.test(s) || /discontinu/i.test(s);
  const low = !out && !isNaN(n) && n >= 1 && n < 10;
  const color = out ? 'text-red-400' : low ? 'text-amber-400' : 'text-green-400';
  const label = out ? 'Out of Stock' : low ? `${n} left` : 'In Stock';
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
  const [seasonFilter, setSeasonFilter] = useState<'' | 'All Season' | 'Winter' | 'All Weather'>('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(params.get('q') || '');
  }, []);

  // Load all data
  useEffect(() => {
    Promise.all([
      fetch(cdnUrl('/data/products.json')).then(r => r.json()),
      fetch(cdnUrl('/data/fitment.json')).then(r => r.json()),
      fetch(cdnUrl('/data/vehicles.json')).then(r => r.json()),
      fetch(cdnUrl('/data/tire-fitment.json')).then(r => r.json()).catch(() => ({})),
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

  const searchResult = useMemo(() => {
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
          if (m === modelCandidate || m.includes(modelCandidate)) {
            detectedModel = m;
            remainingForModel.forEach(w => usedWords.add(w));
            break;
          }
          // Check if first word of model matches — but only mark that word as used, not all
          const mFirstWord = m.split(/[\s(]/)[0];
          if (modelCandidate.includes(mFirstWord) && mFirstWord.length >= 3) {
            detectedModel = m;
            usedWords.add(mFirstWord);
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
      // Detect rim size from remaining words (e.g., "17" from "2025 HONDA CIVIC 17")
      const specWords = wordsUpper.filter(w => !usedWords.has(w));
      let detectedRimSize = 0;
      for (const w of specWords) {
        const d = parseInt(w);
        if (w.match(/^\d{2}$/) && d >= 13 && d <= 24) { detectedRimSize = d; break; }
      }

      if (detectedMake) {
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
        let uniqueSizes = [...new Set(oeSizes)];

        // If rim size specified, only keep OE sizes for that rim
        if (detectedRimSize > 0) {
          uniqueSizes = uniqueSizes.filter(s => s.endsWith(`R${detectedRimSize}`));
        }

        if (uniqueSizes.length > 0) {
          matchingTires = products.filter(p => {
            if (p.category !== 'tire' || !p.tireSize) return false;
            const normalized = p.tireSize.replace(/^[PL]T?/, '');
            return uniqueSizes.some(s => normalized === s || p.tireSize.includes(s.replace('R', '/')));
          });
        } else if (detectedRimSize > 0) {
          // No OE sizes for this rim — show all tires of this rim diameter
          matchingTires = products.filter(p => p.category === 'tire' && p.rimDiameter === detectedRimSize);
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
          vMake: detectedMake,
          vModel: detectedModel,
          vYear: detectedYear,
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

        // Also find wheels that match this rim diameter
        const rimDiam = parseInt(tr);
        const matchingWheels = products.filter(p => p.category === 'wheel' && p.rimDiameter === rimDiam);
        const combined = [...(filtered.length > 0 ? filtered : tireResults), ...matchingWheels];

        return {
          results: combined,
          searchType: 'tire-size',
          searchLabel: `${tw}/${ta}R${tr}`,
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

  const results = searchResult.results || [];
  const searchType = searchResult.searchType || 'none';
  const searchLabel = searchResult.searchLabel || '';

  // Auto-set season filter for tire-type searches
  useEffect(() => {
    if (searchType === 'tire-type') {
      if (searchLabel.includes('Winter')) setSeasonFilter('Winter');
      else if (searchLabel.includes('All Season')) setSeasonFilter('All Season');
      else if (searchLabel.includes('All Weather')) setSeasonFilter('All Weather');
    } else {
      setSeasonFilter('');
    }
    setShowCategory('all');
  }, [searchType, searchLabel]);
  const detectedMake = (searchResult as any).vMake || '';
  const detectedModel = (searchResult as any).vModel || '';
  const detectedYear = (searchResult as any).vYear || '';

  // Filter and sort results
  const sortedResults = useMemo(() => {
    let r = [...results];
    if (showCategory !== 'all') r = r.filter(p => p.category === showCategory);
    // Season filter applies to tires only, wheels always show
    if (seasonFilter) r = r.filter(p => p.category === 'wheel' || p.wheelType === seasonFilter);
    if (sortBy === 'price-asc') r.sort((a, b) => a.priceNum - b.priceNum);
    else if (sortBy === 'price-desc') r.sort((a, b) => b.priceNum - a.priceNum);
    else r.sort((a, b) => a.priceNum - b.priceNum);
    return r;
  }, [results, sortBy, showCategory, seasonFilter]);

  const wheelCount = results.filter(p => p.category === 'wheel').length;
  const tireResults = seasonFilter
    ? results.filter(p => p.category === 'tire' && p.wheelType === seasonFilter)
    : results.filter(p => p.category === 'tire');
  const tireCount = tireResults.length;
  const hasBothCategories = wheelCount > 0 && tireCount > 0;

  // Season counts for the picker
  const seasonCounts = useMemo(() => {
    const tires = results.filter(p => p.category === 'tire');
    return {
      'All Season': tires.filter(t => t.wheelType === 'All Season').length,
      'Winter': tires.filter(t => t.wheelType === 'Winter').length,
      'All Weather': tires.filter(t => t.wheelType === 'All Weather').length,
    };
  }, [results]);

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

      {/* Rich empty state when no query — addresses "feels abandoned" audit gap */}
      {!query && !loading && (
        <div className="max-w-4xl mx-auto">
          {/* Quick-start search examples */}
          <div className="text-center mb-10">
            <p className="text-dark-500 text-xs mb-3">Try one of these searches</p>
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

          {/* Popular vehicles as cards (vehicle search shortcut) */}
          <div className="mb-10">
            <h2 className="text-white font-bold text-base mb-4">Popular vehicles in the GTA</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { name: 'Honda Civic', sub: 'Compact' },
                { name: 'Toyota RAV4', sub: 'SUV' },
                { name: 'Hyundai Tucson', sub: 'SUV' },
                { name: 'Tesla Model 3', sub: 'EV Sedan' },
                { name: 'Ford F-150', sub: 'Truck' },
                { name: 'Hyundai Elantra', sub: 'Sedan' },
                { name: 'BMW 3 Series', sub: 'Sedan' },
                { name: 'Toyota Corolla', sub: 'Sedan' },
              ].map(v => (
                <button
                  key={v.name}
                  onClick={() => { window.history.replaceState({}, '', `?q=${encodeURIComponent(v.name)}`); setQuery(v.name); }}
                  className="text-left bg-dark-900/50 hover:bg-dark-900 border border-dark-700/40 hover:border-primary-600/40 rounded-xl p-4 transition-all group"
                >
                  <p className="text-white font-semibold text-sm group-hover:text-primary-300 transition-colors">{v.name}</p>
                  <p className="text-dark-500 text-[11px] mt-0.5">{v.sub}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Shop by tire size */}
          <div className="mb-10">
            <h2 className="text-white font-bold text-base mb-4">Shop by wheel size</h2>
            <div className="flex flex-wrap gap-2">
              {[15, 16, 17, 18, 19, 20, 21, 22].map(d => (
                <button
                  key={d}
                  onClick={() => { const q = `${d} inch`; window.history.replaceState({}, '', `?q=${encodeURIComponent(q)}`); setQuery(q); }}
                  className="w-14 h-14 bg-dark-800/60 hover:bg-dark-800 border border-dark-700/40 hover:border-primary-600/40 text-white font-bold rounded-xl text-sm transition-all"
                >
                  {d}"
                </button>
              ))}
            </div>
          </div>

          {/* Seasonal + guides band */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <a href="/winter-tires" className="bg-gradient-to-br from-blue-950/40 to-dark-900 border border-blue-500/20 hover:border-blue-500/50 rounded-xl p-5 transition-all group">
              <p className="text-blue-400 text-[10px] uppercase tracking-wider font-semibold mb-2">Seasonal</p>
              <p className="text-white font-semibold text-sm group-hover:text-blue-300 transition-colors">Winter tires →</p>
              <p className="text-dark-500 text-xs mt-1">3PMSF-rated, Ontario insurance discount</p>
            </a>
            <a href="/all-season-tires" className="bg-dark-900/50 border border-dark-700/40 hover:border-primary-600/40 rounded-xl p-5 transition-all group">
              <p className="text-primary-400 text-[10px] uppercase tracking-wider font-semibold mb-2">Year-Round</p>
              <p className="text-white font-semibold text-sm group-hover:text-primary-300 transition-colors">All-season & all-weather →</p>
              <p className="text-dark-500 text-xs mt-1">Compare the two and find your fit</p>
            </a>
            <a href="/guides/hub-centric-wheels" className="bg-dark-900/50 border border-dark-700/40 hover:border-primary-600/40 rounded-xl p-5 transition-all group">
              <p className="text-primary-400 text-[10px] uppercase tracking-wider font-semibold mb-2">Guide</p>
              <p className="text-white font-semibold text-sm group-hover:text-primary-300 transition-colors">Hub-centric explained →</p>
              <p className="text-dark-500 text-xs mt-1">Why centre bore matters for fitment</p>
            </a>
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
          <p className="text-dark-600 text-xs mt-2">Try a vehicle name, brand, size, or bolt pattern</p>
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            {suggestions.map(s => (
              <button
                key={s}
                onClick={() => { window.history.replaceState({}, '', `?q=${encodeURIComponent(s)}`); setQuery(s); }}
                className="text-xs text-dark-400 hover:text-primary-400 bg-dark-800/50 hover:bg-dark-800 px-3 py-1.5 rounded-full transition-all border border-dark-700/50"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : query && searchType === 'vehicle' ? (
        // Vehicle searches always get the rich card with car image + OE
        // fitment + recommendations, even when only wheels OR only tires
        // happen to match (e.g. tire-fitment data hasn't caught up to a
        // recently-added model year). VPB auto-selects its mode internally.
        <VehiclePackageBuilder
          vehicleLabel={searchLabel?.replace('Fits ', '') || ''}
          vehicleMake={detectedMake}
          vehicleModel={detectedModel}
          vehicleYear={detectedYear}
          wheels={results.filter(p => p.category === 'wheel')}
          tires={results.filter(p => p.category === 'tire')}
          seasonCounts={seasonCounts}
        />
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
              {/* Season filter for tire-heavy results */}
              {tireCount > 10 && (
                <select
                  value={seasonFilter}
                  onChange={e => setSeasonFilter(e.target.value as any)}
                  className="bg-dark-800 border border-dark-600 text-dark-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                >
                  <option value="">All Seasons</option>
                  {seasonCounts['All Season'] > 0 && <option value="All Season">All Season ({seasonCounts['All Season']})</option>}
                  {seasonCounts['Winter'] > 0 && <option value="Winter">Winter ({seasonCounts['Winter']})</option>}
                  {seasonCounts['All Weather'] > 0 && <option value="All Weather">All Weather ({seasonCounts['All Weather']})</option>}
                </select>
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

          {/* Package combo banner — only for non-builder vehicle searches */}
          {searchType === 'vehicle' && !hasBothCategories && (() => {
            const wheels = results.filter(p => p.category === 'wheel' && p.priceNum > 0).sort((a, b) => a.priceNum - b.priceNum);
            const filteredTires = (seasonFilter
              ? results.filter(p => p.category === 'tire' && p.priceNum > 0 && p.wheelType === seasonFilter)
              : results.filter(p => p.category === 'tire' && p.priceNum > 0)
            ).sort((a, b) => a.priceNum - b.priceNum);
            const cheapWheel = wheels[0];
            const cheapTire = filteredTires[0];
            if (!cheapWheel || !cheapTire) return null;
            const pkgPrice = (cheapWheel.priceNum + cheapTire.priceNum) * 4;

            // Build vehicle image URL (local template, no IMAGIN). Display labels
            // stay capitalised for the alt text; URL uses UPPER-HYPHEN format.
            const fmtMake = detectedMake ? detectedMake.charAt(0) + detectedMake.slice(1).toLowerCase() : '';
            const fmtModel = detectedModel ? detectedModel.split(' ').map((w: string) =>
              w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
            ).join(' ') : '';
            const vehicleImgUrl = getVehicleImgUrl(detectedMake, detectedModel, detectedYear || '2025');

            return (
              <div className="bg-gradient-to-r from-primary-900/30 via-dark-900 to-primary-900/20 border border-primary-700/30 rounded-xl overflow-hidden mb-6">
                <div className="flex flex-col sm:flex-row">
                  {/* Vehicle image */}
                  {vehicleImgUrl && (
                    <div className="sm:w-80 h-44 sm:h-auto bg-white flex items-center justify-center p-3 shrink-0">
                      <img src={vehicleImgUrl} alt={`${fmtMake} ${fmtModel}`} className="max-w-full max-h-full object-contain" loading="lazy" />
                    </div>
                  )}
                  {/* Package info */}
                  <div className="flex-1 p-4 sm:p-5">
                    <p className="text-primary-300 text-sm font-semibold mb-2">
                      Complete Package for {searchLabel?.replace('Fits ', '') || 'Your Vehicle'}
                    </p>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center p-1">
                        {cheapTire.image && <img src={cheapTire.image} alt="" className="w-full h-full object-contain mix-blend-multiply" />}
                      </div>
                      <span className="text-dark-500">+</span>
                      <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center p-1">
                        {cheapWheel.image && <img src={cheapWheel.image} alt="" className="w-full h-full object-contain mix-blend-multiply" />}
                      </div>
                      <div className="text-dark-500 text-lg">=</div>
                      <div>
                        <p className="text-white font-bold text-xl">${pkgPrice.toFixed(2)}</p>
                        <p className="text-dark-400 text-[10px]">4 tires + 4 wheels</p>
                      </div>
                    </div>
                    <p className="text-dark-500 text-[10px]">
                      Starting from: {cheapTire.brand} {cheapTire.name} × 4 (${(cheapTire.priceNum * 4).toFixed(2)}) + {cheapWheel.brand} {cheapWheel.name} × 4 (${(cheapWheel.priceNum * 4).toFixed(2)})
                    </p>
                    {/* Season picker */}
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-dark-500 text-[10px]">Season:</span>
                      <div className="flex gap-1">
                        {(['', 'All Season', 'Winter', 'All Weather'] as const).map(s => {
                          const label = s || 'All';
                          const count = s ? seasonCounts[s] : Object.values(seasonCounts).reduce((a, b) => a + b, 0);
                          if (s && count === 0) return null;
                          return (
                            <button
                              key={label}
                              onClick={() => setSeasonFilter(s)}
                              className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                                seasonFilter === s
                                  ? s === 'Winter' ? 'bg-blue-600 text-white' : s === 'All Weather' ? 'bg-amber-600 text-white' : 'bg-green-600 text-white'
                                  : 'bg-dark-800/60 text-dark-400 hover:text-white'
                              }`}
                            >
                              {s === 'All Season' ? '☀️ All Season' : s === 'Winter' ? '❄️ Winter' : s === 'All Weather' ? '🌤️ All Weather' : 'All'} ({count})
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {sortedResults.map(p => (
              <a href={`/${p.category === 'tire' ? 'tires' : 'wheels'}/${p.id}`} key={p.id} className="group bg-dark-900 border border-dark-700/50 rounded-xl overflow-hidden hover:border-primary-600/40 transition-all">
                <div className="aspect-square bg-white rounded-t-xl flex items-center justify-center p-4 relative">
                  {p.image && !(p as any).noImage ? (
                    <img src={p.image} alt={p.description} className="w-full h-full object-contain mix-blend-multiply" loading="lazy" decoding="async" />
                  ) : p.category === 'tire' ? (
                    <svg className="w-16 h-16 text-dark-400" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="2">
                      <ellipse cx="50" cy="50" rx="45" ry="48" /><ellipse cx="50" cy="50" rx="30" ry="32" />
                      <line x1="20" y1="15" x2="35" y2="25" /><line x1="80" y1="15" x2="65" y2="25" />
                      <line x1="10" y1="50" x2="22" y2="50" /><line x1="90" y1="50" x2="78" y2="50" />
                      <line x1="20" y1="85" x2="35" y2="75" /><line x1="80" y1="85" x2="65" y2="75" />
                    </svg>
                  ) : (
                    <svg className="w-16 h-16 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" strokeWidth="1.5" /><circle cx="12" cy="12" r="6" strokeWidth="1" /><circle cx="12" cy="12" r="2" strokeWidth="1.5" />
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

          {sortedResults.length > 0 && (
            <p className="text-center text-dark-500 text-xs mt-6">
              {sortedResults.length} results.
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
