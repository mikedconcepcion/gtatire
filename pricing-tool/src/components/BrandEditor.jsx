import React, { useState, useMemo } from 'react';
import {
  TIER_LABELS, TIER_COLORS, TIER_DESCRIPTIONS,
  fmt, fmtPct, calcProposedPrice, calcCustomerTotal, calcMargin, calcProfit, aggregateStats,
} from '../lib/pricing';

// Estimated dealer cost ranges by tier (from pricing strategy doc)
const EST_DC_RANGES = {
  premium: { low: 0.55, high: 0.65, label: '55-65% of MSRP' },
  mid:     { low: 0.45, high: 0.55, label: '45-55% of MSRP' },
  budget:  { low: 0.35, high: 0.50, label: '35-50% of MSRP' },
};

function TierCard({ tier, label, color, products, adjustment, onChange, fees, description }) {
  const stats = useMemo(() => aggregateStats(products), [products]);
  const publicMult = adjustment?.publicMult ?? 0.90;
  const distMult = adjustment?.distMult ?? 0.60;
  const distMarkup = adjustment?.distMarkup ?? 1.20;

  const proposedStats = useMemo(() => {
    const m = { [tier]: { publicMult, distMult, distMarkup } };
    return aggregateStats(products, m);
  }, [products, publicMult, distMult, distMarkup, tier]);

  const isChanged = publicMult !== 0.90 || distMult !== 0.60;

  // Estimate profit for tiers without known DC
  const estDc = EST_DC_RANGES[tier];
  const knownMargin = proposedStats.costCount > 0 ? proposedStats.avgMargin : null;

  // If we have real cost data, use it. Otherwise estimate.
  let profitPerUnit, marginPct, profitLabel;
  if (proposedStats.costCount > 0 && proposedStats.avgCost > 0) {
    profitPerUnit = Math.round((proposedStats.avgPublic - proposedStats.avgCost) * 100) / 100;
    marginPct = proposedStats.avgMargin;
    profitLabel = 'Known Cost';
  } else if (estDc) {
    const estCost = stats.avgMsrp * ((estDc.low + estDc.high) / 2);
    profitPerUnit = Math.round((proposedStats.avgPublic - estCost) * 100) / 100;
    marginPct = Math.round(((proposedStats.avgPublic - estCost) / proposedStats.avgPublic) * 10000) / 100;
    profitLabel = 'Est. Cost ' + estDc.label;
  } else {
    profitPerUnit = null;
    marginPct = null;
    profitLabel = null;
  }

  // Margin health color
  const marginColor = marginPct == null ? 'text-gray-500'
    : marginPct >= 25 ? 'text-emerald-400'
    : marginPct >= 15 ? 'text-yellow-400'
    : marginPct >= 8 ? 'text-orange-400'
    : 'text-red-400';

  const marginEmoji = marginPct == null ? ''
    : marginPct >= 25 ? ' — Great margin'
    : marginPct >= 15 ? ' — Good margin'
    : marginPct >= 8 ? ' — Tight margin'
    : ' — Very thin';

  // Customer total
  const customerTotal = useMemo(() => {
    if (!products[0]) return null;
    return calcCustomerTotal(proposedStats.avgPublic, products[0], fees);
  }, [proposedStats.avgPublic, products, fees]);

  return (
    <div className={`bg-gray-900 rounded-xl border p-4 transition-colors ${
      isChanged ? 'border-yellow-400/30 shadow-lg shadow-yellow-400/5' : 'border-gray-800'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <div>
            <h3 className="font-semibold text-sm">{label}</h3>
            <p className="text-[10px] text-gray-500">{products.length} products</p>
          </div>
        </div>
        {isChanged && (
          <button
            onClick={() => onChange({ publicMult: 0.90, distMult: 0.60, distMarkup: 1.20 })}
            className="text-[10px] text-gray-500 hover:text-red-400 px-2 py-0.5 rounded bg-gray-800"
          >
            Reset
          </button>
        )}
      </div>

      {description && <p className="text-[10px] text-gray-600 mb-3 leading-relaxed">{description}</p>}

      {/* THE KEY NUMBER: profit per unit */}
      <div className="bg-gray-800/50 rounded-lg p-3 mb-4 text-center">
        <p className="text-[9px] text-gray-500 uppercase tracking-wider">You Earn Per Unit</p>
        {profitPerUnit != null ? (
          <>
            <p className={`text-2xl font-bold ${marginColor} mt-1`}>{fmt(profitPerUnit)}</p>
            <p className={`text-xs ${marginColor} mt-0.5`}>
              {fmtPct(marginPct)} margin{marginEmoji}
            </p>
            <p className="text-[9px] text-gray-600 mt-1">Set of 4: <span className="text-white font-medium">{fmt(profitPerUnit * 4)}</span></p>
          </>
        ) : (
          <p className="text-lg text-gray-600 mt-1">Cost data not available</p>
        )}
        {profitLabel && <p className="text-[8px] text-gray-600 mt-1">{profitLabel}</p>}
      </div>

      {/* Price row */}
      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        <div>
          <p className="text-[9px] text-gray-500">MSRP</p>
          <p className="text-xs font-medium text-gray-400">{fmt(stats.avgMsrp)}</p>
        </div>
        <div>
          <p className="text-[9px] text-gray-500">Your Price</p>
          <p className="text-xs font-medium text-yellow-400">{fmt(proposedStats.avgPublic)}</p>
        </div>
        <div>
          <p className="text-[9px] text-gray-500">Customer Pays</p>
          <p className="text-xs font-medium text-green-400">{customerTotal ? fmt(customerTotal.total) : '--'}</p>
          <p className="text-[8px] text-gray-600">w/ tax & fees</p>
        </div>
      </div>

      {/* Sell Price slider */}
      <div className="mb-3">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs text-gray-400">Your Price (% of MSRP)</span>
          <span className="text-sm font-bold text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded">
            {Math.round(publicMult * 100)}%
          </span>
        </div>
        <input
          type="range" min="70" max="100" step="1"
          value={Math.round(publicMult * 100)}
          onChange={e => onChange({ publicMult: parseInt(e.target.value) / 100, distMult, distMarkup })}
          className="w-full"
        />
        <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
          <span>30% off</span>
          <span>Full MSRP</span>
        </div>
      </div>

      {/* Distributor slider */}
      <div className="mb-3">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs text-gray-400">Distributor (% of MSRP)</span>
          <span className="text-sm font-bold text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded">
            {Math.round(distMult * 100)}%
          </span>
        </div>
        <input
          type="range" min="40" max="85" step="1"
          value={Math.round(distMult * 100)}
          onChange={e => onChange({ publicMult, distMult: parseInt(e.target.value) / 100, distMarkup })}
          className="w-full"
        />
      </div>
    </div>
  );
}

function BrandRow({ brand, products, adjustment, tierDefault, onChange, fees }) {
  const publicMult = adjustment?.publicMult ?? tierDefault?.publicMult ?? 0.90;
  const distMult = adjustment?.distMult ?? tierDefault?.distMult ?? 0.60;
  const isCustom = !!adjustment;
  const stats = useMemo(() => aggregateStats(products), [products]);
  const proposed = useMemo(() => {
    const m = { [brand.brand]: { publicMult, distMult, distMarkup: 1.20 } };
    return aggregateStats(products, m);
  }, [products, publicMult, distMult, brand.brand]);

  const delta = proposed.avgPublic - stats.avgPublic;

  // Profit estimate
  const estDc = EST_DC_RANGES[brand.tier];
  let profitPerUnit = null;
  let marginPct = null;
  if (proposed.costCount > 0 && proposed.avgCost > 0) {
    profitPerUnit = Math.round((proposed.avgPublic - proposed.avgCost) * 100) / 100;
    marginPct = proposed.avgMargin;
  } else if (estDc) {
    const estCost = stats.avgMsrp * ((estDc.low + estDc.high) / 2);
    profitPerUnit = Math.round((proposed.avgPublic - estCost) * 100) / 100;
    marginPct = Math.round(((proposed.avgPublic - estCost) / proposed.avgPublic) * 10000) / 100;
  }

  const marginColor = marginPct == null ? 'text-gray-600'
    : marginPct >= 25 ? 'text-emerald-400'
    : marginPct >= 15 ? 'text-yellow-400'
    : marginPct >= 8 ? 'text-orange-400'
    : 'text-red-400';

  return (
    <div className={`px-4 py-3 border-b border-gray-800/50 ${isCustom ? 'bg-yellow-400/[0.03]' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm truncate">{brand.brand}</p>
            {isCustom && <span className="text-[8px] text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded flex-shrink-0">CUSTOM</span>}
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5">
            <span className="inline-block px-1.5 py-0.5 rounded mr-1" style={{ backgroundColor: (TIER_COLORS[brand.tier] || '#6B7280') + '20', color: TIER_COLORS[brand.tier] }}>
              {TIER_LABELS[brand.tier] || brand.tier}
            </span>
            {brand.count} SKUs
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* % input */}
          <div className="text-center">
            <div className="flex items-center gap-0.5">
              <input
                type="number" min="70" max="100" step="1"
                value={Math.round(publicMult * 100)}
                onChange={e => {
                  const val = parseInt(e.target.value);
                  if (val >= 70 && val <= 100) onChange({ publicMult: val / 100, distMult });
                }}
                className="w-12 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-center focus:border-yellow-400 focus:outline-none"
              />
              <span className="text-[10px] text-gray-500">%</span>
            </div>
            <p className="text-[10px] text-yellow-400 mt-0.5">{fmt(proposed.avgPublic)}</p>
          </div>

          {/* Profit per unit */}
          <div className="text-right w-16">
            {profitPerUnit != null ? (
              <>
                <p className={`text-xs font-bold ${marginColor}`}>{fmt(profitPerUnit)}</p>
                <p className={`text-[9px] ${marginColor}`}>{fmtPct(marginPct)}</p>
              </>
            ) : <p className="text-[10px] text-gray-600">--</p>}
          </div>

          {isCustom && (
            <button onClick={() => onChange(null)} className="text-gray-600 hover:text-red-400 p-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BrandEditor({ data, adjustments, onAdjust, multipliers, fees, categoryLabel }) {
  const [mode, setMode] = useState('tier');

  const productsByTier = useMemo(() => {
    const map = {};
    for (const p of data.products) {
      if (!map[p.tier]) map[p.tier] = [];
      map[p.tier].push(p);
    }
    return map;
  }, [data.products]);

  const productsByBrand = useMemo(() => {
    const map = {};
    for (const p of data.products) {
      if (!map[p.brand]) map[p.brand] = [];
      map[p.brand].push(p);
    }
    return map;
  }, [data.products]);

  const relevantTiers = useMemo(() =>
    Object.entries(TIER_LABELS).filter(([key]) => (productsByTier[key]?.length || 0) > 0),
  [productsByTier]);

  const handleTierChange = (tier, vals) => onAdjust(prev => ({ ...prev, [tier]: vals }));
  const handleBrandChange = (brandName, vals) => {
    if (vals === null) {
      onAdjust(prev => { const next = { ...prev }; delete next[brandName]; return next; });
    } else {
      onAdjust(prev => ({ ...prev, [brandName]: vals }));
    }
  };

  const applyPreset = (preset) => {
    if (preset === 'current') onAdjust({});
    else if (preset === 'recommended') {
      onAdjust({
        premium: { publicMult: 0.95, distMult: 0.60, distMarkup: 1.20 },
        mid:     { publicMult: 0.88, distMult: 0.60, distMarkup: 1.20 },
        budget:  { publicMult: 0.85, distMult: 0.60, distMarkup: 1.20 },
        wheel:   { publicMult: 0.90, distMult: 0.60, distMarkup: 1.20 },
      });
    } else if (preset === 'aggressive') {
      onAdjust({
        premium: { publicMult: 0.97, distMult: 0.65, distMarkup: 1.25 },
        mid:     { publicMult: 0.92, distMult: 0.62, distMarkup: 1.22 },
        budget:  { publicMult: 0.90, distMult: 0.58, distMarkup: 1.18 },
        wheel:   { publicMult: 0.92, distMult: 0.62, distMarkup: 1.22 },
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <h2 className="text-lg font-bold">{categoryLabel} Pricing</h2>
        <p className="text-xs text-gray-500">{data.products.length} products &middot; {data.brands.length} brands</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
          <button onClick={() => setMode('tier')} className={`px-3 py-2 text-xs font-medium ${mode === 'tier' ? 'bg-yellow-400/20 text-yellow-400' : 'text-gray-400'}`}>
            By Tier
          </button>
          <button onClick={() => setMode('brand')} className={`px-3 py-2 text-xs font-medium ${mode === 'brand' ? 'bg-yellow-400/20 text-yellow-400' : 'text-gray-400'}`}>
            By Brand
          </button>
        </div>

        <div className="flex gap-1.5 ml-auto flex-wrap">
          <button onClick={() => applyPreset('current')} className="px-2.5 py-1.5 text-[10px] sm:text-xs bg-gray-800 text-gray-300 rounded-lg active:bg-gray-600">
            Current
          </button>
          <button onClick={() => applyPreset('recommended')} className="px-2.5 py-1.5 text-[10px] sm:text-xs bg-emerald-900/50 text-emerald-400 rounded-lg border border-emerald-800 active:bg-emerald-900">
            Recommended
          </button>
          <button onClick={() => applyPreset('aggressive')} className="px-2.5 py-1.5 text-[10px] sm:text-xs bg-purple-900/50 text-purple-400 rounded-lg border border-purple-800 active:bg-purple-900">
            Max Profit
          </button>
        </div>
      </div>

      {mode === 'tier' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {relevantTiers.map(([key, label]) => (
            <TierCard
              key={key} tier={key} label={label} color={TIER_COLORS[key]}
              description={TIER_DESCRIPTIONS[key]}
              products={productsByTier[key] || []}
              adjustment={adjustments[key]}
              onChange={vals => handleTierChange(key, vals)}
              fees={fees}
            />
          ))}
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-800 flex items-center justify-between">
            <p className="text-xs text-gray-500">Adjust % of MSRP per brand</p>
            <p className="text-[10px] text-gray-600">Price &middot; Profit/unit</p>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {data.brands.map(b => (
              <BrandRow
                key={b.brand} brand={b}
                products={productsByBrand[b.brand] || []}
                adjustment={adjustments[b.brand]}
                tierDefault={adjustments[b.tier]}
                onChange={vals => handleBrandChange(b.brand, vals)}
                fees={fees}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
