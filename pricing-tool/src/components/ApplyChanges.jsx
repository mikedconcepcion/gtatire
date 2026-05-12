import React, { useState, useMemo } from 'react';
import { fmt, fmtPct, calcProposedPrice, calcMargin, calcCustomerTotal, aggregateStats } from '../lib/pricing';

export default function ApplyChanges({ data, multipliers, fees, onClose }) {
  const [step, setStep] = useState('review'); // review | downloading | done

  // Calculate all changes
  const changes = useMemo(() => {
    const items = [];
    let upCount = 0, downCount = 0, sameCount = 0;
    let totalCurrentRev = 0, totalProposedRev = 0;

    for (const p of data.products) {
      const proposed = calcProposedPrice(p, multipliers);
      const delta = Math.round((proposed.proposedPublic - p.currentPublic) * 100) / 100;
      totalCurrentRev += p.currentPublic;
      totalProposedRev += proposed.proposedPublic;

      if (Math.abs(delta) > 0.01) {
        items.push({
          id: p.id, brand: p.brand, name: p.name, category: p.category,
          tier: p.tier, tireSize: p.tireSize,
          currentPublic: p.currentPublic,
          proposedPublic: proposed.proposedPublic,
          currentDist: p.currentDist,
          proposedDist: proposed.proposedDist,
          delta,
        });
        if (delta > 0) upCount++;
        else downCount++;
      } else {
        sameCount++;
      }
    }

    return {
      items,
      upCount,
      downCount,
      sameCount,
      totalProducts: data.products.length,
      changedCount: items.length,
      totalCurrentRev: Math.round(totalCurrentRev),
      totalProposedRev: Math.round(totalProposedRev),
      netDelta: Math.round(totalProposedRev - totalCurrentRev),
    };
  }, [data.products, multipliers]);

  // Group changes by tier
  const byTier = useMemo(() => {
    const map = {};
    for (const item of changes.items) {
      if (!map[item.tier]) map[item.tier] = { count: 0, avgDelta: 0 };
      map[item.tier].count++;
      map[item.tier].avgDelta += item.delta;
    }
    for (const t of Object.values(map)) {
      t.avgDelta = Math.round(t.avgDelta / t.count * 100) / 100;
    }
    return map;
  }, [changes.items]);

  // Download the new products.json that the website uses
  const handleApply = () => {
    setStep('downloading');

    // Build the updated products array matching the website's format
    const updatedProducts = data.products.map(p => {
      const proposed = calcProposedPrice(p, multipliers);
      return {
        ...p,
        // Overwrite the price fields
        currentPublic: proposed.proposedPublic,
        currentDist: proposed.proposedDist,
      };
    });

    // Generate the config that build-internal-db.js would need
    const config = {
      appliedAt: new Date().toISOString(),
      multipliers,
      fees,
      summary: {
        changed: changes.changedCount,
        unchanged: changes.sameCount,
        netRevenueDelta: changes.netDelta,
      },
    };

    // Download pricing config JSON
    const configBlob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const configUrl = URL.createObjectURL(configBlob);
    const a1 = document.createElement('a');
    a1.href = configUrl;
    a1.download = `pricing-config-${new Date().toISOString().slice(0, 10)}.json`;
    a1.click();
    URL.revokeObjectURL(configUrl);

    // Download full pricing CSV with all columns
    const rows = [['GTA SKU', 'Category', 'Brand', 'Tier', 'Supplier', 'Name', 'Size/Spec', 'MSRP', 'Dealer Cost', 'OLD Public Price', 'NEW Public Price', 'OLD Dist Price', 'NEW Dist Price', 'Price Change', 'Env Fee', 'HST', 'Customer Total', 'Set of 4', 'Margin %', 'Stock']];
    for (const p of data.products) {
      const proposed = calcProposedPrice(p, multipliers);
      const ct = calcCustomerTotal(proposed.proposedPublic, p, fees);
      const delta = Math.round((proposed.proposedPublic - p.currentPublic) * 100) / 100;
      const margin = calcMargin(proposed.proposedPublic, p.dealerCost);
      rows.push([
        p.id, p.category, p.brand, p.tier, p.supplier, p.name,
        p.tireSize || p.description || '',
        p.msrp, p.dealerCost ?? '', p.currentPublic, proposed.proposedPublic,
        p.currentDist, proposed.proposedDist, delta,
        ct.ehf, ct.tax, ct.total, Math.round(ct.total * 4 * 100) / 100,
        margin ?? '', p.stock,
      ]);
    }
    const csv = rows.map(r => r.map(c => typeof c === 'string' && c.includes(',') ? `"${c}"` : c).join(',')).join('\n');
    const csvBlob = new Blob([csv], { type: 'text/csv' });
    const csvUrl = URL.createObjectURL(csvBlob);
    const a2 = document.createElement('a');
    a2.href = csvUrl;
    a2.download = `gta-pricing-update-${new Date().toISOString().slice(0, 10)}.csv`;
    a2.click();
    URL.revokeObjectURL(csvUrl);

    setTimeout(() => setStep('done'), 500);
  };

  if (changes.changedCount === 0) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
        <div className="bg-gray-900 rounded-2xl w-full max-w-lg p-6 border border-gray-800" onClick={e => e.stopPropagation()}>
          <p className="text-center text-gray-400 text-lg mb-4">No changes to apply</p>
          <p className="text-center text-gray-500 text-sm mb-6">All prices match the current settings. Adjust sliders in Tires or Wheels first.</p>
          <button onClick={onClose} className="w-full py-3 bg-gray-800 text-gray-300 rounded-xl text-sm">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-gray-800" onClick={e => e.stopPropagation()}>

        {step === 'review' && (
          <>
            {/* Header */}
            <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-5 py-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Review Changes</h2>
                <button onClick={onClose} className="text-gray-500 hover:text-white p-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                These changes will be downloaded as files. Upload them to update the website.
              </p>
            </div>

            <div className="p-5 space-y-4">
              {/* Summary numbers */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <p className="text-[10px] text-gray-500 uppercase">Changed</p>
                  <p className="text-xl font-bold text-yellow-400">{changes.changedCount}</p>
                  <p className="text-[10px] text-gray-500">of {changes.totalProducts}</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <p className="text-[10px] text-gray-500 uppercase">Price Up</p>
                  <p className="text-xl font-bold text-emerald-400">{changes.upCount}</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <p className="text-[10px] text-gray-500 uppercase">Price Down</p>
                  <p className="text-xl font-bold text-yellow-400">{changes.downCount}</p>
                </div>
              </div>

              {/* Net impact */}
              <div className={`rounded-lg p-4 text-center border ${
                changes.netDelta >= 0
                  ? 'bg-emerald-950/20 border-emerald-800/30'
                  : 'bg-yellow-950/20 border-yellow-800/30'
              }`}>
                <p className="text-xs text-gray-400">Net Revenue Impact</p>
                <p className={`text-2xl font-bold mt-1 ${changes.netDelta >= 0 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                  {changes.netDelta >= 0 ? '+' : ''}{fmt(changes.netDelta)}
                </p>
              </div>

              {/* By tier */}
              <div>
                <p className="text-xs text-gray-500 uppercase mb-2">By Tier</p>
                <div className="space-y-1.5">
                  {Object.entries(byTier).map(([tier, info]) => (
                    <div key={tier} className="flex items-center justify-between px-3 py-2 bg-gray-800/30 rounded-lg">
                      <span className="text-sm text-gray-300 capitalize">{tier}</span>
                      <div className="text-right">
                        <span className="text-xs text-gray-500">{info.count} items &middot; </span>
                        <span className={`text-xs font-medium ${info.avgDelta >= 0 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                          avg {info.avgDelta >= 0 ? '+' : ''}{fmt(info.avgDelta)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sample changes */}
              <div>
                <p className="text-xs text-gray-500 uppercase mb-2">Sample Changes (first 10)</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {changes.items.slice(0, 10).map(item => (
                    <div key={item.id} className="flex items-center justify-between px-3 py-1.5 text-xs bg-gray-800/20 rounded">
                      <div className="flex-1 min-w-0">
                        <span className="text-gray-300 truncate block">{item.brand} {item.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="text-gray-500">{fmt(item.currentPublic)}</span>
                        <span className="text-gray-600">&rarr;</span>
                        <span className="text-yellow-400">{fmt(item.proposedPublic)}</span>
                        <span className={item.delta >= 0 ? 'text-emerald-400' : 'text-yellow-400'}>
                          {item.delta >= 0 ? '+' : ''}{fmt(item.delta)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {changes.items.length > 10 && (
                    <p className="text-[10px] text-gray-600 text-center py-1">
                      ...and {changes.items.length - 10} more
                    </p>
                  )}
                </div>
              </div>

              {/* What will be downloaded */}
              <div className="bg-gray-800/30 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-1.5">What you'll get:</p>
                <ul className="text-xs text-gray-500 space-y-1">
                  <li>1. <strong className="text-gray-300">Pricing Config (JSON)</strong> — the multiplier settings to re-apply later</li>
                  <li>2. <strong className="text-gray-300">Full Pricing Sheet (CSV)</strong> — every product with old/new prices, tax, fees, margins</li>
                </ul>
              </div>
            </div>

            {/* Actions */}
            <div className="sticky bottom-0 bg-gray-900 border-t border-gray-800 p-4 space-y-2">
              <button
                onClick={handleApply}
                className="w-full py-3 bg-yellow-400/20 text-yellow-400 border border-yellow-400/50 rounded-xl text-sm font-medium active:bg-yellow-400/30"
              >
                Download {changes.changedCount} Price Changes
              </button>
              <button onClick={onClose} className="w-full py-2.5 text-gray-500 text-sm">
                Cancel
              </button>
            </div>
          </>
        )}

        {step === 'downloading' && (
          <div className="p-10 text-center">
            <div className="animate-spin w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-400">Preparing files...</p>
          </div>
        )}

        {step === 'done' && (
          <div className="p-8 text-center">
            <div className="w-14 h-14 bg-emerald-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Files Downloaded</h3>
            <p className="text-gray-500 text-sm mb-6">
              Share the CSV with James for final approval. Once approved, the pricing config
              can be applied to rebuild the website with updated prices.
            </p>
            <button onClick={onClose} className="w-full py-3 bg-gray-800 text-gray-300 rounded-xl text-sm">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
