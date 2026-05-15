import { useState, useMemo } from 'react';

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
  rimWidth: number | null;
  boltPattern: string;
  offset: number | null;
  hubBore: number | null;
  finish: string;
}

interface Props {
  products: Product[];
  availableDiameters: string[];
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

function TypeBadge({ type }: { type: string }) {
  const cls = type === 'Steel Wheel'
    ? 'bg-dark-500/10 text-dark-300 border-dark-500/20'
    : 'bg-primary-500/10 text-primary-400 border-primary-500/20';
  return <span className={`absolute top-3 left-3 text-xs font-medium px-2.5 py-1 rounded-full border ${cls}`}>{type}</span>;
}

export default function VehicleResults({ products, availableDiameters }: Props) {
  const [activeType, setActiveType] = useState<'all' | 'steel' | 'alloy'>('all');
  const [activeDiameter, setActiveDiameter] = useState<string>('all');
  const [sort, setSort] = useState<'price-asc' | 'price-desc' | 'stock'>('price-asc');

  const steelCount = products.filter(p => p.wheelType === 'Steel Wheel').length;
  const alloyCount = products.filter(p => p.wheelType === 'Alloy Wheel').length;

  // Get unique diameters from products
  const diameters = useMemo(() => {
    const d = [...new Set(products.map(p => p.rimDiameter).filter(Boolean))].sort((a, b) => (a || 0) - (b || 0));
    return d.map(v => ({ value: String(v), label: `${v}"`, count: products.filter(p => p.rimDiameter === v).length }));
  }, [products]);

  // Filter
  const filtered = useMemo(() => {
    let result = [...products];
    if (activeType === 'steel') result = result.filter(p => p.wheelType === 'Steel Wheel');
    if (activeType === 'alloy') result = result.filter(p => p.wheelType === 'Alloy Wheel');
    if (activeDiameter !== 'all') result = result.filter(p => String(p.rimDiameter) === activeDiameter);

    if (sort === 'price-asc') result.sort((a, b) => a.priceNum - b.priceNum);
    if (sort === 'price-desc') result.sort((a, b) => b.priceNum - a.priceNum);
    if (sort === 'stock') result.sort((a, b) => {
      const sa = a.stock === '20+' ? 99 : parseInt(a.stock) || 0;
      const sb = b.stock === '20+' ? 99 : parseInt(b.stock) || 0;
      return sb - sa;
    });

    return result;
  }, [products, activeType, activeDiameter, sort]);

  const pillBase = "text-xs px-3 py-1.5 rounded-full font-medium transition-all cursor-pointer border";
  const pillActive = "bg-primary-600 text-white border-primary-600";
  const pillInactive = "bg-dark-800 text-dark-300 hover:text-white hover:bg-dark-700 border-dark-700/50";

  return (
    <div>
      {/* Filter bar */}
      <div className="bg-dark-950 border-b border-dark-700/30 sticky top-16 z-40 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-dark-500 text-xs sm:text-sm font-medium shrink-0">Filter:</span>

          {/* Diameter pills — scroll on mobile */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveDiameter('all')}
              className={`${pillBase} ${activeDiameter === 'all' ? pillActive : pillInactive}`}
            >
              All ({products.length})
            </button>
            {diameters.map(d => (
              <button
                key={d.value}
                onClick={() => setActiveDiameter(d.value)}
                className={`${pillBase} ${activeDiameter === d.value ? pillActive : pillInactive}`}
              >
                {d.label} ({d.count})
              </button>
            ))}
          </div>

          {/* Type pills */}
          <div className="ml-auto flex gap-1.5 shrink-0">
            <button
              onClick={() => setActiveType(activeType === 'steel' ? 'all' : 'steel')}
              className={`${pillBase} ${activeType === 'steel' ? pillActive : pillInactive}`}
            >
              Steel ({steelCount})
            </button>
            <button
              onClick={() => setActiveType(activeType === 'alloy' ? 'all' : 'alloy')}
              className={`${pillBase} ${activeType === 'alloy' ? 'bg-primary-600 text-white border-primary-600' : 'bg-dark-800 text-primary-400 hover:text-white border-primary-700/30'}`}
            >
              Alloy ({alloyCount})
            </button>
          </div>
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-dark-500 text-xs">Sort:</span>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as any)}
            className="bg-dark-800 border border-dark-700/50 text-dark-300 text-xs rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="stock">In Stock First</option>
          </select>
          <span className="text-dark-600 text-xs ml-2">{filtered.length} results</span>
        </div>
      </div>

      {/* Product grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mt-6">
          {filtered.map(p => (
            <a href={`/wheels/${p.id}`} key={p.id} className="group bg-dark-900 border border-dark-700/50 rounded-xl overflow-hidden hover:border-primary-600/40 transition-all hover:shadow-lg hover:shadow-primary-900/10">
              {/* Image */}
              <div className="aspect-square bg-white rounded-t-xl flex items-center justify-center p-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-t from-dark-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                {p.image ? (
                  <img src={p.image} alt={p.description} className="w-full h-full object-contain mix-blend-multiply" loading="lazy" decoding="async" />
                ) : (
                  <svg className="w-24 h-24 text-dark-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
                    <circle cx="12" cy="12" r="6" strokeWidth="1" />
                    <circle cx="12" cy="12" r="2" strokeWidth="1.5" />
                  </svg>
                )}
                <TypeBadge type={p.wheelType} />
                {p.hubCentric && (
                  <span className="absolute top-3 right-3 text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                    Hub Centric
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="p-3 sm:p-4">
                <h3 className="text-white font-semibold text-xs sm:text-sm mb-0.5 line-clamp-1 group-hover:text-primary-300 transition-colors">
                  {p.name || p.description.split(' ')[0]}
                </h3>
                <p className="text-dark-400 text-[11px] line-clamp-1 mb-2">
                  {p.rimDiameter}" · {p.boltPattern}
                </p>
                <div className="flex items-end justify-between">
                  <div className="text-white font-bold text-sm sm:text-lg">{p.price}</div>
                  <StockBadge stock={p.stock} />
                </div>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 mt-6">
          <p className="text-dark-500 text-sm">No wheels match the current filters.</p>
          <button
            onClick={() => { setActiveType('all'); setActiveDiameter('all'); }}
            className="text-primary-400 text-sm mt-2 hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
