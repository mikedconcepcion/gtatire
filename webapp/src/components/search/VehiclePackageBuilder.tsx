import { useState, useMemo } from 'react';

interface Product {
  id: string;
  sku: string;
  brand: string;
  category: string;
  wheelType: string;
  name: string;
  description: string;
  image: string;
  price: string;
  priceNum: number;
  compareAt: string;
  stock: string;
  rimDiameter: number | null;
  rimWidth: number | null;
  boltPattern: string;
  finish: string;
  tireSize?: string;
  hubCentric?: boolean;
}

interface Props {
  vehicleLabel: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  wheels: Product[];
  tires: Product[];
  seasonCounts: Record<string, number>;
}

const MAKE_MAP: Record<string, string> = {
  'MERCEDES': 'Mercedes-Benz', 'LAND ROVER': 'Land Rover', 'ALFA ROMEO': 'Alfa Romeo',
};

const VEHICLE_COLORS = [
  { id: 'default', label: 'Silver', swatch: '#C0C0C0' },
  { id: 'pspc0014', label: 'Black', swatch: '#1a1a1a' },
  { id: 'pspc0087', label: 'Red', swatch: '#cc2a36' },
  { id: 'pspc0071', label: 'Blue', swatch: '#2a5cc7' },
  { id: 'pspc0066', label: 'White', swatch: '#f0f0f0' },
  { id: 'pspc0074', label: 'Grey', swatch: '#6b6b6b' },
];

function fmtMake(make: string) {
  return MAKE_MAP[make] || (make ? make.charAt(0) + make.slice(1).toLowerCase() : '');
}

type TierFilter = 'all' | 'budget' | 'performance' | 'premium';

// Narrow a product list to one price tercile. Used when the user clicks a tier pill.
function filterTier<T extends { priceNum: number }>(items: T[], tier: TierFilter): T[] {
  if (tier === 'all' || items.length < 3) return items;
  const sorted = [...items].sort((a, b) => a.priceNum - b.priceNum);
  const tierSize = Math.ceil(sorted.length / 3);
  if (tier === 'budget') return sorted.slice(0, tierSize);
  if (tier === 'performance') return sorted.slice(tierSize, tierSize * 2);
  return sorted.slice(tierSize * 2);
}

// Pick a tier + brand diverse subset so recommendations span budget/mid/premium
// and multiple brands, instead of stacking the cheapest brand at the top.
function diversifyMix<T extends { priceNum: number; brand: string }>(items: T[], maxCount = 500): T[] {
  if (items.length <= maxCount) return [...items].sort((a, b) => a.priceNum - b.priceNum);

  const sorted = [...items].sort((a, b) => a.priceNum - b.priceNum);
  const tierSize = Math.ceil(sorted.length / 3);

  const buildTierQueue = (tier: T[]): T[][] => {
    const byBrand = new Map<string, T[]>();
    for (const item of tier) {
      const key = item.brand || 'Unknown';
      if (!byBrand.has(key)) byBrand.set(key, []);
      byBrand.get(key)!.push(item);
    }
    return [...byBrand.values()];
  };

  const tierQueues = [
    buildTierQueue(sorted.slice(0, tierSize)),
    buildTierQueue(sorted.slice(tierSize, tierSize * 2)),
    buildTierQueue(sorted.slice(tierSize * 2)),
  ];

  const picked: T[] = [];
  const brandCursors = [0, 0, 0];
  let tierIdx = 0;
  let safety = maxCount * 6;
  while (picked.length < maxCount && safety-- > 0) {
    const totalLeft = tierQueues.reduce((s, t) => s + t.reduce((ss, q) => ss + q.length, 0), 0);
    if (totalLeft === 0) break;

    const tier = tierQueues[tierIdx];
    if (tier.some(q => q.length > 0)) {
      const start = brandCursors[tierIdx];
      for (let attempts = 0; attempts < tier.length; attempts++) {
        const idx = (start + attempts) % tier.length;
        if (tier[idx].length > 0) {
          picked.push(tier[idx].shift()!);
          brandCursors[tierIdx] = (idx + 1) % tier.length;
          break;
        }
      }
    }
    tierIdx = (tierIdx + 1) % 3;
  }

  return picked.sort((a, b) => a.priceNum - b.priceNum);
}

function fmtModel(model: string) {
  return model ? model.split(' ').map(w =>
    w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  ).join(' ') : '';
}

function getVehicleImgUrl(make: string, model: string, year: string, angle = '01', paintId = 'default') {
  const mk = fmtMake(make);
  const md = fmtModel(model);
  if (!mk || !md) return '';
  const params = new URLSearchParams({
    customer: 'img', make: mk, modelFamily: md,
    modelYear: year || '2025', angle, width: '1200', fileType: 'png',
  });
  if (paintId && paintId !== 'default') params.set('paintId', paintId);
  return `https://cdn.imagin.studio/getImage?${params.toString()}`;
}

// Strict "in stock" — physical inventory only. "Available" and "Contact us"
// are order-on-demand statuses and are excluded from recommendations.
function isInStock(stock: string | undefined): boolean {
  const s = (stock || '').trim();
  if (!s) return false;
  if (s === '20+') return true;
  if (s.includes('In Stock')) {
    const n = parseInt(s);
    return !isNaN(n) && n >= 1;  // "N In Stock" qualifies; bare "In Stock" with no number does too via parseInt fallback below
  }
  // Bare numeric stock value (Alltire format like "5")
  const n = parseInt(s);
  if (!isNaN(n) && n >= 1 && /^\d+$/.test(s)) return true;
  return false;
}

function StockBadge({ stock }: { stock: string }) {
  const inStock = stock.includes('In Stock') || stock === 'Available' || stock === '20+' || parseInt(stock) >= 10;
  const low = parseInt(stock) >= 1 && parseInt(stock) < 10;
  const color = inStock ? 'text-green-400' : low ? 'text-amber-400' : 'text-dark-500';
  const label = inStock ? 'In Stock' : low ? `${parseInt(stock)} left` : stock === 'Contact us' ? 'Available' : stock || 'Available';
  return <span className={`text-[9px] font-medium ${color}`}>{label}</span>;
}

function ProductCard({ product, isSelected, onSelect, detailUrl }: {
  product: Product;
  isSelected: boolean;
  onSelect: () => void;
  detailUrl: string;
}) {
  return (
    <div
      onClick={onSelect}
      className={`shrink-0 w-36 sm:w-40 cursor-pointer rounded-xl border-2 transition-all overflow-hidden ${
        isSelected
          ? 'border-primary-500 shadow-lg shadow-primary-900/30 bg-dark-800'
          : 'border-dark-700/30 bg-dark-900 hover:border-dark-600'
      }`}
    >
      <div className="aspect-square bg-white flex items-center justify-center p-3 relative">
        {product.image ? (
          <img src={product.image} alt={product.name} className="w-full h-full object-contain mix-blend-multiply" loading="lazy" />
        ) : (
          <svg className="w-12 h-12 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" strokeWidth="1.5" /><circle cx="12" cy="12" r="2" strokeWidth="1.5" />
          </svg>
        )}
        {isSelected && (
          <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
      </div>
      <div className="p-2">
        <p className="text-white text-[11px] font-semibold line-clamp-1">{product.brand} {product.name}</p>
        <p className="text-dark-400 text-[9px] line-clamp-1">
          {product.tireSize || `${product.rimDiameter}x${product.rimWidth} ${product.boltPattern}`} {product.finish}
        </p>
        <div className="flex items-center justify-between mt-1">
          <span className="text-white font-bold text-sm">{product.price}</span>
          <StockBadge stock={product.stock} />
        </div>
      </div>
      <a
        href={detailUrl}
        onClick={e => e.stopPropagation()}
        className="block text-center text-primary-400 text-[9px] py-1 border-t border-dark-700/30 hover:bg-dark-800/50"
      >
        View Details →
      </a>
    </div>
  );
}

export default function VehiclePackageBuilder({ vehicleLabel, vehicleMake, vehicleModel, vehicleYear, wheels, tires, seasonCounts }: Props) {
  const [season, setSeason] = useState<'' | 'All Season' | 'Winter' | 'All Weather'>('');
  const [wheelType, setWheelType] = useState<'' | 'alloy' | 'steel'>('');
  const [tier, setTier] = useState<TierFilter>('all');
  const [selectedTireId, setSelectedTireId] = useState<string>('');
  const [selectedWheelId, setSelectedWheelId] = useState<string>('');
  const [vehicleColor, setVehicleColor] = useState('default');
  const [vehicleAngle, setVehicleAngle] = useState('01');

  const vehicleImgUrl = getVehicleImgUrl(vehicleMake, vehicleModel, vehicleYear, vehicleAngle, vehicleColor);
  const base = typeof import.meta !== 'undefined' ? (import.meta as any).env?.BASE_URL || '' : '';

  // In-stock universe for counts + filters
  const inStockTires = useMemo(() => tires.filter(p => p.priceNum > 0 && isInStock(p.stock)), [tires]);
  const inStockWheelsAll = useMemo(() => wheels.filter(w => w.priceNum > 0 && isInStock(w.stock)), [wheels]);

  // Recompute season counts from in-stock tires only
  const liveSeasonCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of inStockTires) {
      counts[t.wheelType] = (counts[t.wheelType] || 0) + 1;
    }
    return counts;
  }, [inStockTires]);

  // Filter tires by stock + season, then narrow to tier, then mix brands within
  const filteredTires = useMemo(() => {
    let t = inStockTires;
    if (season) t = t.filter(p => p.wheelType === season);
    return diversifyMix(filterTier(t, tier));
  }, [inStockTires, season, tier]);

  // Filter wheels — show selected type first, others as "also available"
  const { primaryWheels, altWheels, altLabel } = useMemo(() => {
    const alloyAll = filterTier(inStockWheelsAll.filter(w => w.wheelType !== 'Steel Wheel'), tier);
    const steelAll = filterTier(inStockWheelsAll.filter(w => w.wheelType === 'Steel Wheel'), tier);
    const alloy = diversifyMix(alloyAll);
    const steel = diversifyMix(steelAll);

    if (wheelType === 'steel') {
      return { primaryWheels: steel, altWheels: alloy, altLabel: 'Also available in Alloy' };
    }
    // Default: alloy first (or all if no preference)
    if (wheelType === 'alloy' || alloy.length > 0) {
      const fallback = diversifyMix(filterTier(inStockWheelsAll, tier));
      return { primaryWheels: alloy.length > 0 ? alloy : fallback, altWheels: steel, altLabel: 'Also available in Steel' };
    }
    return { primaryWheels: diversifyMix(filterTier(inStockWheelsAll, tier)), altWheels: [], altLabel: '' };
  }, [inStockWheelsAll, wheelType, tier]);

  // Auto-select cheapest if nothing selected
  const selectedTire = filteredTires.find(t => t.id === selectedTireId) || filteredTires[0];
  const selectedWheel = primaryWheels.find(w => w.id === selectedWheelId) || altWheels.find(w => w.id === selectedWheelId) || primaryWheels[0];

  const pkgPrice = selectedTire && selectedWheel ? (selectedTire.priceNum + selectedWheel.priceNum) * 4 : 0;

  return (
    <div className="space-y-0">
      {/* ── Vehicle header + Package summary ── */}
      <div className="bg-gradient-to-r from-primary-900/20 via-dark-900 to-primary-900/10 border border-primary-700/20 rounded-xl overflow-hidden mb-5">
        <div className="flex flex-col">
          {/* Vehicle image with controls — full width */}
          {vehicleImgUrl && (
            <div className="bg-gradient-to-br from-dark-800/50 to-dark-900 relative">
              <div className="aspect-[21/9] flex items-center justify-center p-4 max-h-[350px]">
                <img src={vehicleImgUrl} alt={vehicleLabel} className="max-w-full max-h-full object-contain" loading="lazy" />
              </div>
              {/* Color swatches */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 bg-dark-900/80 backdrop-blur rounded-full px-2.5 py-1.5">
                {VEHICLE_COLORS.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setVehicleColor(c.id)}
                    title={c.label}
                    className={`w-5 h-5 rounded-full border-2 transition-all ${
                      vehicleColor === c.id ? 'border-primary-400 scale-110' : 'border-dark-600 hover:border-dark-400'
                    }`}
                    style={{ backgroundColor: c.swatch }}
                  />
                ))}
              </div>
              {/* Angle toggle */}
              <div className="absolute top-2 right-2 flex gap-1 bg-dark-900/80 backdrop-blur rounded-lg p-0.5">
                {[
                  { id: '01', label: '3/4' },
                  { id: '05', label: 'Side' },
                  { id: '09', label: 'Rear' },
                ].map(a => (
                  <button
                    key={a.id}
                    onClick={() => setVehicleAngle(a.id)}
                    className={`px-2 py-0.5 rounded text-[9px] font-medium transition-all ${
                      vehicleAngle === a.id ? 'bg-primary-600 text-white' : 'text-dark-400 hover:text-white'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Package summary */}
          <div className="flex-1 p-4 md:p-5">
            <p className="text-primary-300 text-sm font-semibold">{vehicleLabel}</p>
            <div className="flex items-center gap-2 mt-1 mb-3">
              <svg className="w-3.5 h-3.5 text-green-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-green-400 text-xs font-medium">All wheels are hub centric fit</span>
            </div>

            {/* Tier filter — affects both tires and wheels */}
            <div className="flex items-center gap-1.5 mb-3 flex-wrap">
              <span className="text-dark-500 text-[10px] font-medium mr-1 uppercase tracking-wide">Style</span>
              {([
                { id: 'all', label: 'All', title: 'Recommended mix across all tiers' },
                { id: 'budget', label: '$ Budget', title: 'Lower-cost value picks' },
                { id: 'performance', label: '$$ Performance', title: 'Mid-range options' },
                { id: 'premium', label: '$$$ Premium', title: 'Top-shelf brands' },
              ] as const).map(t => (
                <button
                  key={t.id}
                  onClick={() => { setTier(t.id); setSelectedTireId(''); setSelectedWheelId(''); }}
                  title={t.title}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                    tier === t.id ? 'bg-primary-600 text-white' : 'bg-dark-800/60 text-dark-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Selected items + price */}
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              {selectedTire && (
                <div className="flex items-center gap-2 bg-dark-800/60 rounded-lg px-2.5 py-1.5">
                  <div className="w-9 h-9 bg-white rounded flex items-center justify-center p-0.5 shrink-0">
                    {selectedTire.image && <img src={selectedTire.image} alt="" className="w-full h-full object-contain mix-blend-multiply" />}
                  </div>
                  <div>
                    <p className="text-white text-[10px] font-medium line-clamp-1">{selectedTire.brand} {selectedTire.name}</p>
                    <p className="text-dark-400 text-[9px]">{selectedTire.tireSize} × 4 = ${(selectedTire.priceNum * 4).toFixed(2)}</p>
                  </div>
                </div>
              )}
              <span className="text-dark-500 text-lg">+</span>
              {selectedWheel && (
                <div className="flex items-center gap-2 bg-dark-800/60 rounded-lg px-2.5 py-1.5">
                  <div className="w-9 h-9 bg-white rounded flex items-center justify-center p-0.5 shrink-0">
                    {selectedWheel.image && <img src={selectedWheel.image} alt="" className="w-full h-full object-contain mix-blend-multiply" />}
                  </div>
                  <div>
                    <p className="text-white text-[10px] font-medium line-clamp-1">{selectedWheel.brand} {selectedWheel.name}</p>
                    <p className="text-dark-400 text-[9px]">{selectedWheel.rimDiameter}x{selectedWheel.rimWidth} × 4 = ${(selectedWheel.priceNum * 4).toFixed(2)}</p>
                  </div>
                </div>
              )}
              <span className="text-dark-500 text-lg">=</span>
              <div className="bg-primary-600/20 border border-primary-500/30 rounded-lg px-4 py-2">
                <p className="text-white font-bold text-xl">${pkgPrice.toFixed(2)}</p>
                <p className="text-primary-300 text-[9px]">4 tires + 4 wheels</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tire selection ── */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white text-sm font-semibold">Choose Your Tires</h3>
          <div className="flex gap-1">
            {(['', 'All Season', 'Winter', 'All Weather'] as const).map(s => {
              const label = s || 'All';
              const count = s ? (liveSeasonCounts[s] || 0) : Object.values(liveSeasonCounts).reduce((a, b) => a + b, 0);
              if (s && count === 0) return null;
              return (
                <button
                  key={label}
                  onClick={() => { setSeason(s); setSelectedTireId(''); }}
                  className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                    season === s
                      ? s === 'Winter' ? 'bg-blue-600 text-white' : s === 'All Weather' ? 'bg-amber-600 text-white' : s === 'All Season' ? 'bg-green-600 text-white' : 'bg-primary-600 text-white'
                      : 'bg-dark-800/60 text-dark-400 hover:text-white'
                  }`}
                >
                  {s === 'Winter' ? '❄️' : s === 'All Season' ? '☀️' : s === 'All Weather' ? '🌤️' : ''} {label} ({count})
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin">
          {filteredTires.map(t => (
            <ProductCard
              key={t.id}
              product={t}
              isSelected={t.id === (selectedTire?.id || '')}
              onSelect={() => setSelectedTireId(t.id)}
              detailUrl={`/tires/${t.id}`}
            />
          ))}
          {filteredTires.length === 0 && (
            <p className="text-dark-500 text-sm py-8">No tires found for this season. Try another.</p>
          )}
        </div>
        {filteredTires.length > 0 && (
          <p className="text-dark-500 text-[10px] mt-1">{filteredTires.length} in stock — scroll to see all.</p>
        )}
      </div>

      {/* ── Wheel selection ── */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white text-sm font-semibold">Choose Your Wheels</h3>
          <div className="flex gap-1">
            <button
              onClick={() => { setWheelType(''); setSelectedWheelId(''); }}
              className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${wheelType === '' ? 'bg-primary-600 text-white' : 'bg-dark-800/60 text-dark-400 hover:text-white'}`}
            >
              All ({inStockWheelsAll.length})
            </button>
            <button
              onClick={() => { setWheelType('alloy'); setSelectedWheelId(''); }}
              className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${wheelType === 'alloy' ? 'bg-primary-600 text-white' : 'bg-dark-800/60 text-dark-400 hover:text-white'}`}
            >
              Alloy ({inStockWheelsAll.filter(w => w.wheelType !== 'Steel Wheel').length})
            </button>
            <button
              onClick={() => { setWheelType('steel'); setSelectedWheelId(''); }}
              className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${wheelType === 'steel' ? 'bg-primary-600 text-white' : 'bg-dark-800/60 text-dark-400 hover:text-white'}`}
            >
              Steel ({inStockWheelsAll.filter(w => w.wheelType === 'Steel Wheel').length})
            </button>
          </div>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin">
          {primaryWheels.map(w => (
            <ProductCard
              key={w.id}
              product={w}
              isSelected={w.id === (selectedWheel?.id || '')}
              onSelect={() => setSelectedWheelId(w.id)}
              detailUrl={`/wheels/${w.id}`}
            />
          ))}
        </div>
        {primaryWheels.length > 0 && (
          <p className="text-dark-500 text-[10px] mt-1">{primaryWheels.length} in stock — scroll to see all.</p>
        )}
        {/* Subtle alternative type */}
        {altWheels.length > 0 && (
          <div className="mt-3 pt-3 border-t border-dark-700/20">
            <p className="text-dark-500 text-[10px] mb-2">{altLabel} ({altWheels.length})</p>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
              {altWheels.slice(0, 10).map(w => (
                <ProductCard
                  key={w.id}
                  product={w}
                  isSelected={w.id === (selectedWheel?.id || '')}
                  onSelect={() => setSelectedWheelId(w.id)}
                  detailUrl={`/wheels/${w.id}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Sticky bottom CTA (mobile) ── */}
      {selectedTire && selectedWheel && (
        <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-dark-900/95 backdrop-blur border-t border-dark-700 px-4 py-3 z-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-bold text-lg">${pkgPrice.toFixed(2)}</p>
              <p className="text-dark-400 text-[10px]">4 tires + 4 wheels</p>
            </div>
            <a href={`/contact`} className="bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors">
              Get This Package
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
