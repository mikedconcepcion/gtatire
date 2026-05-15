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
      className={`w-full cursor-pointer rounded-xl border-2 transition-all overflow-hidden ${
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

type BuilderMode = 'package' | 'tires-only' | 'wheels-only';

export default function VehiclePackageBuilder({ vehicleLabel, vehicleMake, vehicleModel, vehicleYear, wheels, tires, seasonCounts }: Props) {
  const [season, setSeason] = useState<'' | 'All Season' | 'Winter' | 'All Weather'>('');
  const [wheelType, setWheelType] = useState<'' | 'alloy' | 'steel'>('');
  const [tier, setTier] = useState<TierFilter>('all');
  const [selectedTireId, setSelectedTireId] = useState<string>('');
  const [selectedWheelId, setSelectedWheelId] = useState<string>('');
  const [vehicleColor, setVehicleColor] = useState('default');
  const [vehicleAngle, setVehicleAngle] = useState('01');
  const [mode, setMode] = useState<BuilderMode>('package');
  const includeTires = mode !== 'wheels-only';
  const includeWheels = mode !== 'tires-only';

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

  // Price reflects the active mode: package (4+4), tires only (4), wheels only (4).
  const pkgPrice = (() => {
    const tirePart = includeTires && selectedTire ? selectedTire.priceNum * 4 : 0;
    const wheelPart = includeWheels && selectedWheel ? selectedWheel.priceNum * 4 : 0;
    return tirePart + wheelPart;
  })();
  const ctaReady = (includeTires ? !!selectedTire : true) && (includeWheels ? !!selectedWheel : true) && pkgPrice > 0;
  const ctaLabel = mode === 'tires-only' ? 'Inquire — Tires Only →'
    : mode === 'wheels-only' ? 'Inquire — Wheels Only →'
    : 'Get This Package →';
  const pkgLineLabel = mode === 'tires-only' ? '4 tires'
    : mode === 'wheels-only' ? '4 wheels'
    : '4 tires + 4 wheels';

  // Build /contact URL pre-filled with the selected items. Adapts to mode:
  // package (both), tires only, or wheels only.
  const packageContactUrl = (() => {
    if (!ctaReady) return '/contact';
    const tireLabel = selectedTire ? `${selectedTire.brand || ''} ${selectedTire.name || ''} ${selectedTire.tireSize || ''}`.trim() : '';
    const wheelLabel = selectedWheel ? `${selectedWheel.brand || ''} ${selectedWheel.name || ''} ${selectedWheel.rimDiameter || ''}x${selectedWheel.rimWidth || ''}`.trim() : '';
    const skus: string[] = [];
    if (includeTires && selectedTire) skus.push(selectedTire.id);
    if (includeWheels && selectedWheel) skus.push(selectedWheel.id);
    const heading = mode === 'tires-only' ? `Tires inquiry: ${vehicleLabel}`
      : mode === 'wheels-only' ? `Wheels inquiry: ${vehicleLabel}`
      : `Package: ${vehicleLabel}`;
    const subject = `${heading} — ${skus.join(' + ')}`;
    const lines: string[] = [];
    if (includeTires && selectedTire) {
      lines.push(`• Tires (×4): ${tireLabel} — SKU ${selectedTire.id} — $${(selectedTire.priceNum * 4).toFixed(2)}`);
    }
    if (includeWheels && selectedWheel) {
      lines.push(`• Wheels (×4): ${wheelLabel} — SKU ${selectedWheel.id} — $${(selectedWheel.priceNum * 4).toFixed(2)}`);
    }
    const totalLabel = mode === 'package' ? 'Estimated total (4+4)' : 'Estimated total';
    const intro = mode === 'tires-only' ? `Hi, I'd like to order these tires for my ${vehicleLabel}:`
      : mode === 'wheels-only' ? `Hi, I'd like to order these wheels for my ${vehicleLabel}:`
      : `Hi, I'd like to order this package for my ${vehicleLabel}:`;
    const note =
      `${intro}\n\n` +
      lines.join('\n') +
      `\n• ${totalLabel}: $${pkgPrice.toFixed(2)}\n\n` +
      `Please confirm availability, total with taxes/fees, and GTA delivery timing.`;
    const label = `${heading}: ${skus.join(' + ')}`;
    return `/contact?subject=${encodeURIComponent(subject)}&note=${encodeURIComponent(note)}&label=${encodeURIComponent(label)}`;
  })();

  return (
    <div className="space-y-0">
      {/* ── Vehicle header + Package summary (sticky under the site header) ── */}
      <div className="bg-dark-950 border border-primary-700/30 rounded-xl overflow-hidden mb-5 sticky top-16 z-30 shadow-2xl shadow-black/60 backdrop-blur-md">
        <div className="flex flex-col">
          {/* Vehicle image with controls — full width */}
          {vehicleImgUrl && (
            <div className="bg-gradient-to-br from-dark-800/50 to-dark-900 relative">
              <div className="flex items-center justify-center p-3 h-32 sm:h-40 lg:h-48">
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
          <div className="flex-1 p-3 sm:p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-primary-300 text-sm font-semibold">{vehicleLabel}</p>
              <span className="inline-flex items-center gap-1 text-green-400 text-[10px] font-medium bg-green-500/10 border border-green-500/20 rounded-full px-2 py-0.5">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Hub centric fit
              </span>
            </div>

            {/* Mode toggle — package / tires only / wheels only */}
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              <span className="text-dark-500 text-[10px] font-medium mr-1 uppercase tracking-wide">Build</span>
              {([
                { id: 'package', label: 'Tires + Wheels', icon: 'pkg' },
                { id: 'tires-only', label: 'Tires Only', icon: 'tire' },
                { id: 'wheels-only', label: 'Wheels Only', icon: 'wheel' },
              ] as const).map(m => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
                    mode === m.id ? 'bg-primary-600 text-white' : 'bg-dark-800/60 text-dark-400 hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
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

            {/* Selected items + price (sections adapt to mode) */}
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              {includeTires && selectedTire && (
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
              {includeTires && includeWheels && <span className="text-dark-500 text-lg">+</span>}
              {includeWheels && selectedWheel && (
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
                <p className="text-primary-300 text-[9px]">{pkgLineLabel}</p>
              </div>
              {ctaReady && (
                <a
                  href={packageContactUrl}
                  className="hidden sm:inline-block bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors shadow-lg shadow-primary-900/30"
                >
                  {ctaLabel}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tire selection (hidden in wheels-only mode) ── */}
      {includeTires && (
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filteredTires.map(t => (
            <ProductCard
              key={t.id}
              product={t}
              isSelected={t.id === (selectedTire?.id || '')}
              onSelect={() => setSelectedTireId(t.id)}
              detailUrl={`/tires/${t.id}`}
            />
          ))}
        </div>
        {filteredTires.length === 0 && (
          <p className="text-dark-500 text-sm py-8 text-center">No tires found for this season. Try another.</p>
        )}
        {filteredTires.length > 0 && (
          <p className="text-dark-500 text-[10px] mt-2">{filteredTires.length} tires in stock for this vehicle.</p>
        )}
      </div>
      )}

      {/* ── Wheel selection (hidden in tires-only mode) ── */}
      {includeWheels && (
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-white text-sm font-semibold">Choose Your Wheels</h3>
          <div className="inline-flex bg-dark-800/60 rounded-lg p-0.5 border border-dark-700/40">
            <button
              onClick={() => { setWheelType(''); setSelectedWheelId(''); }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${wheelType === '' ? 'bg-primary-600 text-white' : 'text-dark-400 hover:text-white'}`}
              aria-label="Show all wheels"
              title="All wheels"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              All ({inStockWheelsAll.length})
            </button>
            <button
              onClick={() => { setWheelType('alloy'); setSelectedWheelId(''); }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${wheelType === 'alloy' ? 'bg-primary-600 text-white' : 'text-dark-400 hover:text-white'}`}
              aria-label="Show alloy wheels"
              title="Alloy wheels"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2} /><path strokeLinecap="round" strokeWidth={1.5} d="M12 2v8m0 4v8M2 12h8m4 0h8M5 5l5 5m4 4l5 5M5 19l5-5m4-4l5-5" /></svg>
              Alloy ({inStockWheelsAll.filter(w => w.wheelType !== 'Steel Wheel').length})
            </button>
            <button
              onClick={() => { setWheelType('steel'); setSelectedWheelId(''); }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${wheelType === 'steel' ? 'bg-primary-600 text-white' : 'text-dark-400 hover:text-white'}`}
              aria-label="Show steel wheels"
              title="Steel wheels"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2} /><circle cx="6" cy="12" r="1" strokeWidth={2} /><circle cx="12" cy="6" r="1" strokeWidth={2} /><circle cx="18" cy="12" r="1" strokeWidth={2} /><circle cx="12" cy="18" r="1" strokeWidth={2} /></svg>
              Steel ({inStockWheelsAll.filter(w => w.wheelType === 'Steel Wheel').length})
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
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
          <p className="text-dark-500 text-[10px] mt-2">{primaryWheels.length} wheels in stock for this vehicle.</p>
        )}
        {/* Subtle alternative type — show as collapsed link to switch view */}
        {altWheels.length > 0 && (
          <div className="mt-3 pt-3 border-t border-dark-700/20">
            <p className="text-dark-500 text-[10px] mb-2">{altLabel} ({altWheels.length})</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
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
      )}

      {/* ── Sticky bottom CTA (mobile) — adapts to mode ── */}
      {ctaReady && (
        <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-dark-900/95 backdrop-blur border-t border-dark-700 px-4 py-3 z-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-bold text-lg">${pkgPrice.toFixed(2)}</p>
              <p className="text-dark-400 text-[10px]">{pkgLineLabel}</p>
            </div>
            <a href={packageContactUrl} className="bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors">
              {ctaLabel}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
