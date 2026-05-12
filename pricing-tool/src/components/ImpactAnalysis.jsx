import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell,
} from 'recharts';
import { TIER_LABELS, TIER_COLORS, fmt, fmtPct, fmtShort, calcProposedPrice, calcMargin, calcCustomerTotal, aggregateStats } from '../lib/pricing';

export default function ImpactAnalysis({ data, multipliers, fees }) {
  const [monthlySales, setMonthlySales] = useState(100);

  const overallCurrent = useMemo(() => aggregateStats(data.products), [data.products]);
  const overallProposed = useMemo(() => aggregateStats(data.products, multipliers), [data.products, multipliers]);

  const tireCurrent = useMemo(() => aggregateStats(data.products.filter(p => p.category === 'tire')), [data.products]);
  const tireProposed = useMemo(() => aggregateStats(data.products.filter(p => p.category === 'tire'), multipliers), [data.products, multipliers]);

  const wheelCurrent = useMemo(() => aggregateStats(data.products.filter(p => p.category === 'wheel')), [data.products]);
  const wheelProposed = useMemo(() => aggregateStats(data.products.filter(p => p.category === 'wheel'), multipliers), [data.products, multipliers]);

  const hasChanges = Math.abs(overallProposed.totalRevenue - overallCurrent.totalRevenue) > 0.01;

  const netDelta = overallProposed.avgPublic - overallCurrent.avgPublic;
  const tireDelta = tireProposed.avgPublic - tireCurrent.avgPublic;
  const wheelDelta = wheelProposed.avgPublic - wheelCurrent.avgPublic;

  // Monthly estimate: avg price change × monthly sales
  const monthlyImpact = netDelta * monthlySales;
  const yearlyImpact = monthlyImpact * 12;

  // Tier breakdown
  const tierComparison = useMemo(() =>
    Object.entries(TIER_LABELS).map(([key, label]) => {
      const products = data.products.filter(p => p.tier === key);
      if (products.length === 0) return null;
      const current = aggregateStats(products);
      const proposed = aggregateStats(products, multipliers);
      const avgDelta = proposed.avgPublic - current.avgPublic;
      return {
        name: label, tier: key, count: products.length,
        currentAvg: current.avgPublic,
        proposedAvg: proposed.avgPublic,
        avgDelta,
        direction: avgDelta > 0.01 ? 'up' : avgDelta < -0.01 ? 'down' : 'same',
        reason: key === 'premium' ? 'Closer to MSRP, MAP-compliant'
          : key === 'mid' ? 'Stay competitive with chains'
          : key === 'budget' ? 'Beat Costco, still 25-35% margin'
          : 'Margin from known dealer cost',
      };
    }).filter(Boolean),
  [data.products, multipliers]);

  // Brand impact — only brands that changed
  const brandImpact = useMemo(() => {
    const brandMap = {};
    for (const p of data.products) {
      if (!brandMap[p.brand]) brandMap[p.brand] = [];
      brandMap[p.brand].push(p);
    }
    return Object.entries(brandMap)
      .filter(([_, prods]) => prods.length >= 5)
      .map(([brand, prods]) => {
        const current = aggregateStats(prods);
        const proposed = aggregateStats(prods, multipliers);
        const delta = Math.round((proposed.avgPublic - current.avgPublic) * 100) / 100;
        return { name: brand, tier: prods[0].tier, count: prods.length, delta };
      })
      .filter(b => Math.abs(b.delta) > 0.01)
      .sort((a, b) => b.delta - a.delta);
  }, [data.products, multipliers]);

  // Export
  const handleExport = () => {
    const rows = [['GTA SKU', 'Category', 'Brand', 'Tier', 'Supplier', 'Name', 'Size/Spec', 'MSRP', 'Dealer Cost', 'Current Price', 'Proposed Price', 'Price Change', 'Env Fee', 'HST', 'Customer Total', 'Set of 4 Total', 'Margin %', 'Profit/Unit', 'Stock']];
    for (const p of data.products) {
      const proposed = calcProposedPrice(p, multipliers);
      const ct = calcCustomerTotal(proposed.proposedPublic, p, fees);
      const delta = Math.round((proposed.proposedPublic - p.currentPublic) * 100) / 100;
      const margin = calcMargin(proposed.proposedPublic, p.dealerCost);
      const profit = p.dealerCost ? Math.round((proposed.proposedPublic - p.dealerCost) * 100) / 100 : '';
      rows.push([
        p.id, p.category, p.brand, p.tier, p.supplier, p.name,
        p.tireSize || p.description || '',
        p.msrp, p.dealerCost ?? '', p.currentPublic, proposed.proposedPublic, delta,
        ct.ehf, ct.tax, ct.total, Math.round(ct.total * 4 * 100) / 100,
        margin ?? '', profit, p.stock,
      ]);
    }
    const csv = rows.map(r => r.map(c => typeof c === 'string' && c.includes(',') ? `"${c}"` : c).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gta-pricing-proposal-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportConfig = () => {
    const config = {
      exported: new Date().toISOString(),
      adjustments: multipliers,
      fees,
      monthlySalesEstimate: monthlySales,
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gta-pricing-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!hasChanges) {
    return (
      <div className="space-y-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 sm:p-10 text-center">
          <p className="text-3xl mb-3">🎯</p>
          <p className="text-gray-300 text-lg font-medium mb-2">Ready to Compare Pricing?</p>
          <p className="text-gray-500 text-sm max-w-md mx-auto">
            Go to <strong className="text-yellow-400">Tires</strong> or <strong className="text-yellow-400">Wheels</strong> and adjust the price sliders.
            Come back here to see the full impact and download.
          </p>
          <p className="text-gray-600 text-xs mt-4">
            Tip: Try the <span className="text-emerald-400">Recommended</span> preset for a quick start.
          </p>
        </div>

        <button
          onClick={handleExport}
          className="w-full sm:w-auto px-5 py-3 text-sm bg-gray-800 text-gray-400 rounded-xl border border-gray-700"
        >
          Export Current Pricing (CSV)
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">

      {/* THE BIG NUMBER: Net Impact */}
      <div className={`rounded-xl p-5 sm:p-6 text-center border ${
        netDelta >= 0
          ? 'bg-emerald-950/30 border-emerald-800/50'
          : 'bg-yellow-950/20 border-yellow-800/30'
      }`}>
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Net Price Change per Product</p>
        <p className={`text-3xl sm:text-4xl font-bold ${netDelta >= 0 ? 'text-emerald-400' : 'text-yellow-400'}`}>
          {netDelta >= 0 ? '+' : ''}{fmt(netDelta)}
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Tires: {tireDelta >= 0 ? '+' : ''}{fmt(tireDelta)} avg &middot;
          Wheels: {wheelDelta >= 0 ? '+' : ''}{fmt(wheelDelta)} avg
        </p>
      </div>

      {/* Monthly Estimate */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <h3 className="text-sm font-semibold text-gray-300">Monthly Profit Impact</h3>
          <div className="flex items-center gap-2 sm:ml-auto">
            <span className="text-xs text-gray-500">Sales/month:</span>
            <input
              type="number" min="10" max="10000" step="10"
              value={monthlySales}
              onChange={e => setMonthlySales(Math.max(1, parseInt(e.target.value) || 100))}
              className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-center text-white focus:border-yellow-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-800/50 rounded-lg p-4 text-center">
            <p className="text-[10px] text-gray-500 uppercase">Per Month</p>
            <p className={`text-xl sm:text-2xl font-bold mt-1 ${monthlyImpact >= 0 ? 'text-emerald-400' : 'text-yellow-400'}`}>
              {monthlyImpact >= 0 ? '+' : ''}{fmt(monthlyImpact)}
            </p>
            <p className="text-[10px] text-gray-500 mt-1">at {monthlySales} sales/mo</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 text-center">
            <p className="text-[10px] text-gray-500 uppercase">Per Year</p>
            <p className={`text-xl sm:text-2xl font-bold mt-1 ${yearlyImpact >= 0 ? 'text-emerald-400' : 'text-yellow-400'}`}>
              {yearlyImpact >= 0 ? '+' : ''}{fmt(yearlyImpact)}
            </p>
            <p className="text-[10px] text-gray-500 mt-1">estimated annual</p>
          </div>
        </div>
      </div>

      {/* What changed and why */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-300">What Changed & Why</h3>
        </div>

        {tierComparison.map(t => (
          <div key={t.tier} className="px-4 py-3 border-b border-gray-800/50">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TIER_COLORS[t.tier] }} />
                <span className="font-medium text-sm">{t.name}</span>
                <span className="text-[10px] text-gray-500">{t.count} items</span>
              </div>
              <div className="text-right">
                {t.direction === 'up' ? (
                  <span className="text-emerald-400 text-sm font-bold">+{fmt(t.avgDelta)}</span>
                ) : t.direction === 'down' ? (
                  <span className="text-yellow-400 text-sm font-bold">{fmt(t.avgDelta)}</span>
                ) : (
                  <span className="text-gray-600 text-sm">No change</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-500">
              <span>{fmt(t.currentAvg)}</span>
              <span>&rarr;</span>
              <span className="text-yellow-400">{fmt(t.proposedAvg)}</span>
            </div>
            {t.direction !== 'same' && (
              <p className="text-[10px] text-gray-600 mt-1 italic">{t.reason}</p>
            )}
          </div>
        ))}
      </div>

      {/* Brand impact chart — only if brands changed */}
      {brandImpact.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <h3 className="text-xs font-semibold text-gray-400 mb-3">Price Change by Brand</h3>
          <ResponsiveContainer width="100%" height={Math.max(180, brandImpact.length * 26)}>
            <BarChart data={brandImpact} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis type="number" tick={{ fill: '#6B7280', fontSize: 10 }} tickFormatter={v => (v >= 0 ? '+' : '') + '$' + v.toFixed(0)} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fill: '#9CA3AF', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 8 }}
                formatter={v => (v >= 0 ? '+' : '') + fmt(v)}
              />
              <Bar dataKey="delta" name="Avg price change" radius={[0, 4, 4, 0]}>
                {brandImpact.map((d, i) => <Cell key={i} fill={d.delta >= 0 ? '#10B981' : '#F59E0B'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[9px] text-gray-600 mt-2 text-center">
            Green = price increase (more revenue) &middot; Yellow = price decrease (more competitive)
          </p>
        </div>
      )}

      {/* Export buttons */}
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={handleExport}
          className="flex-1 sm:flex-none px-5 py-3 text-sm bg-yellow-400/20 text-yellow-400 rounded-xl hover:bg-yellow-400/30 border border-yellow-400/50 font-medium active:bg-yellow-400/40"
        >
          Download Full Pricing (CSV)
        </button>
        <button
          onClick={handleExportConfig}
          className="flex-1 sm:flex-none px-5 py-3 text-sm bg-gray-800 text-gray-400 rounded-xl border border-gray-700 active:bg-gray-700"
        >
          Save Settings (JSON)
        </button>
      </div>

      <p className="text-[10px] text-gray-600 text-center">
        This is a pricing proposal only. Changes are not applied to the website until you approve and upload.
      </p>
    </div>
  );
}
