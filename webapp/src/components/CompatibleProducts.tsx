import { useState, useEffect } from 'react';

interface CrossRefItem {
  id: string;
  name: string;
  brand: string;
  priceNum: number;
  image: string;
  boltPattern?: string;
  tireSize?: string;
  type?: string;
}

interface CrossRefData {
  [rimDiameter: string]: {
    tires: CrossRefItem[];
    wheels: CrossRefItem[];
  };
}

interface Props {
  productCategory: 'wheel' | 'tire';
  rimDiameter: number;
  boltPattern?: string;
  priceNum: number;
}

export default function CompatibleProducts({ productCategory, rimDiameter, boltPattern, priceNum }: Props) {
  const [crossRef, setCrossRef] = useState<CrossRefData>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'tires' | 'wheels'>(productCategory === 'wheel' ? 'tires' : 'wheels');

  useEffect(() => {
    fetch(`/data/cross-ref.json`)
      .then(r => r.json())
      .then(data => { setCrossRef(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading || !rimDiameter) return null;

  const rimData = crossRef[String(rimDiameter)];
  if (!rimData) return null;

  const compatibleTires = rimData.tires || [];
  const compatibleWheels = rimData.wheels || [];

  // Filter wheels by bolt pattern if available
  const matchingWheels = boltPattern
    ? compatibleWheels.filter(w => w.boltPattern === boltPattern)
    : compatibleWheels;

  if (compatibleTires.length === 0 && matchingWheels.length === 0) return null;

  const showItems = activeTab === 'tires' ? compatibleTires : matchingWheels;
  const showCount = 8;

  // Calculate package price (4x)
  const cheapestTire = compatibleTires[0];
  const cheapestWheel = matchingWheels[0];

  return (
    <div className="mt-8 pt-6 border-t border-[var(--color-dark-700)]/30">
      {/* Package pricing hint */}
      {productCategory === 'wheel' && cheapestTire && (
        <div className="bg-primary-600/5 border border-primary-600/20 rounded-xl p-4 mb-5">
          <p className="text-primary-300 text-sm font-semibold mb-1">Complete Your Setup</p>
          <p className="text-dark-300 text-xs">
            Add 4 matching {rimDiameter}" tires from <span className="text-white font-medium">${(cheapestTire.priceNum * 4).toFixed(2)}</span>
            {' '}— total package from <span className="text-white font-medium">${((priceNum + cheapestTire.priceNum) * 4).toFixed(2)}</span> for 4 tires + 4 wheels
          </p>
        </div>
      )}
      {productCategory === 'tire' && cheapestWheel && (
        <div className="bg-primary-600/5 border border-primary-600/20 rounded-xl p-4 mb-5">
          <p className="text-primary-300 text-sm font-semibold mb-1">Complete Your Setup</p>
          <p className="text-dark-300 text-xs">
            Add 4 matching {rimDiameter}" wheels from <span className="text-white font-medium">${(cheapestWheel.priceNum * 4).toFixed(2)}</span>
            {' '}— total package from <span className="text-white font-medium">${((priceNum + cheapestWheel.priceNum) * 4).toFixed(2)}</span> for 4 tires + 4 wheels
          </p>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 mb-4 bg-[var(--color-dark-800)]/50 p-1 rounded-lg inline-flex">
        {compatibleTires.length > 0 && (
          <button
            onClick={() => setActiveTab('tires')}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'tires'
                ? 'bg-primary-600 text-white'
                : 'text-[var(--color-dark-400)] hover:text-white'
            }`}
          >
            Compatible Tires ({compatibleTires.length})
          </button>
        )}
        {matchingWheels.length > 0 && (
          <button
            onClick={() => setActiveTab('wheels')}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'wheels'
                ? 'bg-primary-600 text-white'
                : 'text-[var(--color-dark-400)] hover:text-white'
            }`}
          >
            Compatible Wheels ({matchingWheels.length})
          </button>
        )}
      </div>

      {/* Product grid */}
      <div className="grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {showItems.slice(0, showCount).map(item => (
          <a
            key={item.id}
            href={`/${activeTab === 'tires' ? 'tires' : 'wheels'}/${item.id}`}
            className="group bg-[var(--color-dark-900)] border border-[var(--color-dark-700)]/50 rounded-lg overflow-hidden hover:border-primary-600/40 transition-all"
          >
            <div className="aspect-square bg-white flex items-center justify-center p-2">
              {item.image ? (
                <img src={item.image} alt={item.name} className="w-full h-full object-contain mix-blend-multiply" loading="lazy" />
              ) : (
                <svg className="w-8 h-8 text-[var(--color-dark-600)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
                  <circle cx="12" cy="12" r="2" strokeWidth="1.5" />
                </svg>
              )}
            </div>
            <div className="p-2">
              <p className="text-white text-[10px] font-semibold line-clamp-1">{item.brand} {item.name}</p>
              <p className="text-[var(--color-dark-400)] text-[9px] line-clamp-1">{item.tireSize || item.boltPattern}</p>
              <p className="text-white text-xs font-bold mt-0.5">${item.priceNum.toFixed(2)}</p>
            </div>
          </a>
        ))}
      </div>

      {showItems.length > showCount && (
        <a
          href={`/search/?q=${rimDiameter}+inch+${activeTab === 'tires' ? '' : ''}`}
          className="text-primary-400 text-xs mt-3 inline-block hover:underline"
        >
          View all {showItems.length} compatible {activeTab} →
        </a>
      )}
    </div>
  );
}
