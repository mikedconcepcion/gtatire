import React, { useState, useEffect, useMemo } from 'react';
import Dashboard from './components/Dashboard';
import BrandEditor from './components/BrandEditor';
import ProductTable from './components/ProductTable';
import ImpactAnalysis from './components/ImpactAnalysis';
import FeeSettings from './components/FeeSettings';
import AuthGate from './components/AuthGate';
import ApplyChanges from './components/ApplyChanges';
import { DEFAULT_FEES } from './lib/pricing';

const TABS = [
  { id: 'dashboard', label: 'Overview', icon: '📊' },
  { id: 'tires', label: 'Tires', icon: '🛞' },
  { id: 'wheels', label: 'Wheels', icon: '⚙️' },
  { id: 'products', label: 'All Items', icon: '📋' },
  { id: 'impact', label: 'Impact', icon: '💰' },
];

export default function App() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem('gta-pricing-auth') === '1');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('dashboard');
  const [adjustments, setAdjustments] = useState({});
  const [fees, setFees] = useState(DEFAULT_FEES);
  const [showFees, setShowFees] = useState(false);
  const [showApply, setShowApply] = useState(false);

  useEffect(() => {
    if (!authed) return;
    const base = import.meta.env.BASE_URL || '/';
    fetch(`${base}pricing-data.json`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [authed]);

  if (!authed) {
    return <AuthGate onAuth={() => setAuthed(true)} />;
  }

  const multipliers = useMemo(() => {
    const base = {
      premium: { publicMult: 0.90, distMult: 0.60, distMarkup: 1.20 },
      mid:     { publicMult: 0.90, distMult: 0.60, distMarkup: 1.20 },
      budget:  { publicMult: 0.90, distMult: 0.60, distMarkup: 1.20 },
      wheel:   { publicMult: 0.90, distMult: 0.60, distMarkup: 1.20 },
    };
    return { ...base, ...adjustments };
  }, [adjustments]);

  // Split data into tires and wheels
  const tireData = useMemo(() => {
    if (!data) return null;
    return {
      ...data,
      products: data.products.filter(p => p.category === 'tire'),
      brands: data.brands.filter(b => b.category === 'tire'),
    };
  }, [data]);

  const wheelData = useMemo(() => {
    if (!data) return null;
    return {
      ...data,
      products: data.products.filter(p => p.category === 'wheel'),
      brands: data.brands.filter(b => b.category === 'wheel'),
    };
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-center px-6">
          <div className="animate-spin w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Loading pricing data...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 px-6">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-2">Could not load data</p>
          <p className="text-gray-500 text-sm">Run: <code className="bg-gray-800 px-2 py-1 rounded">npm start</code></p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 pb-20 lg:pb-6">
      {/* Top header */}
      <header className="bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-bold">
              <span className="text-yellow-400">GTA</span> Pricing
            </h1>
            <p className="text-[11px] text-gray-500 hidden sm:block">
              {data.summary.total.toLocaleString()} products &middot; {data.summary.tires} tires &middot; {data.summary.wheels} wheels
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFees(!showFees)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                showFees
                  ? 'bg-yellow-400/20 text-yellow-400 border-yellow-400/50'
                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white'
              }`}
            >
              Tax & Fees
            </button>
            <button
              onClick={() => setShowApply(true)}
              className="px-3 py-1.5 text-xs rounded-lg border bg-emerald-900/50 text-emerald-400 border-emerald-800 active:bg-emerald-900 font-medium"
            >
              Apply Changes
            </button>
          </div>
        </div>

        {/* Fee settings panel */}
        {showFees && (
          <FeeSettings fees={fees} onChange={setFees} onClose={() => setShowFees(false)} />
        )}

        {/* Desktop tab nav */}
        <div className="max-w-7xl mx-auto px-4 hidden lg:block">
          <nav className="flex gap-1 -mb-px">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                  tab === t.id
                    ? 'bg-gray-950 text-yellow-400 border-t-2 border-x border-yellow-400 border-x-gray-800'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                }`}
              >
                <span className="mr-1.5">{t.icon}</span>{t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-4 sm:py-6">
        {tab === 'dashboard' && (
          <Dashboard data={data} multipliers={multipliers} fees={fees} />
        )}
        {tab === 'tires' && (
          <BrandEditor
            data={tireData}
            adjustments={adjustments}
            onAdjust={setAdjustments}
            multipliers={multipliers}
            fees={fees}
            categoryLabel="Tires"
          />
        )}
        {tab === 'wheels' && (
          <BrandEditor
            data={wheelData}
            adjustments={adjustments}
            onAdjust={setAdjustments}
            multipliers={multipliers}
            fees={fees}
            categoryLabel="Wheels"
          />
        )}
        {tab === 'products' && (
          <ProductTable data={data} multipliers={multipliers} fees={fees} />
        )}
        {tab === 'impact' && (
          <ImpactAnalysis data={data} multipliers={multipliers} fees={fees} />
        )}
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-sm border-t border-gray-800 z-50 pb-safe">
        <div className="flex justify-around py-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-col items-center py-2 px-3 rounded-lg min-w-[60px] transition-colors ${
                tab === t.id
                  ? 'text-yellow-400'
                  : 'text-gray-500 active:text-gray-300'
              }`}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              <span className="text-[10px] mt-0.5 font-medium">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Apply changes modal */}
      {showApply && (
        <ApplyChanges
          data={data}
          multipliers={multipliers}
          fees={fees}
          onClose={() => setShowApply(false)}
        />
      )}
    </div>
  );
}
