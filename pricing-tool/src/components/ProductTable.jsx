import React, { useState, useMemo } from 'react';
import { TIER_LABELS, TIER_COLORS, fmt, fmtPct, calcProposedPrice, calcMargin, calcProfit, calcCustomerTotal } from '../lib/pricing';

const PAGE_SIZE = 30;

function ProductCard({ p, proposed, fees, isExpanded, onToggle }) {
  const margin = calcMargin(proposed.proposedPublic, p.dealerCost);
  const profit = calcProfit(proposed.proposedPublic, p.dealerCost);
  const ct = calcCustomerTotal(proposed.proposedPublic, p, fees);

  const marginColor = margin == null ? 'text-gray-600'
    : margin >= 25 ? 'text-emerald-400'
    : margin >= 15 ? 'text-yellow-400'
    : margin >= 8 ? 'text-orange-400'
    : 'text-red-400';

  return (
    <div className="border-b border-gray-800/50" onClick={onToggle}>
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{p.brand} <span className="text-gray-400 font-normal">— {p.name}</span></p>
            <p className="text-[10px] text-gray-500 truncate mt-0.5">
              {p.tireSize || p.description}
            </p>
            <div className="flex gap-1.5 mt-1">
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">{p.supplier}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: (TIER_COLORS[p.tier] || '#6B7280') + '20', color: TIER_COLORS[p.tier] }}>
                {TIER_LABELS[p.tier] || p.tier}
              </span>
              {p.stock && <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">Stock: {p.stock}</span>}
            </div>
          </div>

          <div className="text-right flex-shrink-0 min-w-[80px]">
            <p className="text-sm font-bold text-yellow-400">{fmt(proposed.proposedPublic)}</p>
            {margin != null ? (
              <p className={`text-[10px] font-medium ${marginColor}`}>
                {fmtPct(margin)} margin
              </p>
            ) : (
              <p className="text-[10px] text-gray-600">Cost hidden</p>
            )}
            {profit != null && (
              <p className={`text-[10px] font-bold ${marginColor}`}>
                You earn {fmt(profit)}
              </p>
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 bg-gray-800/20">
          {/* Price breakdown */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm pt-2 mb-3">
            <div className="flex justify-between">
              <span className="text-[10px] text-gray-500">MSRP</span>
              <span className="text-xs">{fmt(p.msrp)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-gray-500">Dealer Cost</span>
              <span className="text-xs text-yellow-400">{p.dealerCost ? fmt(p.dealerCost) : 'Hidden'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-gray-500">Your Price</span>
              <span className="text-xs text-yellow-400">{fmt(proposed.proposedPublic)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-gray-500">Distributor</span>
              <span className="text-xs text-blue-400">{fmt(proposed.proposedDist)}</span>
            </div>
          </div>

          {/* Customer total */}
          <div className="bg-gray-900/60 rounded-lg p-3 mb-2">
            <p className="text-[9px] text-gray-500 uppercase mb-1.5">Customer Pays (with tax & fees)</p>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold text-green-400">{fmt(ct.total)}</span>
              <span className="text-[10px] text-gray-500">
                Set of 4: <span className="text-green-400 font-bold">{fmt(ct.total * 4)}</span>
              </span>
            </div>
            <p className="text-[9px] text-gray-600 mt-1">
              {fmt(ct.base)} + {fmt(ct.ehf)} env fee + {fmt(ct.tax)} HST
            </p>
          </div>

          {profit != null && (
            <div className="bg-emerald-900/20 rounded-lg p-3 text-center">
              <p className="text-[9px] text-gray-500 uppercase">Your Profit</p>
              <p className="text-emerald-400 text-lg font-bold">{fmt(profit)} <span className="text-xs font-normal">per unit</span></p>
              <p className="text-[10px] text-emerald-400/70">Set of 4: {fmt(profit * 4)}</p>
            </div>
          )}

          <p className="text-[8px] text-gray-600 mt-2">
            {p.id} &middot; {p.supplierSku || '--'} &middot; {p.season || p.finish || p.description}
          </p>
        </div>
      )}
    </div>
  );
}

export default function ProductTable({ data, multipliers, fees }) {
  const [search, setSearch] = useState('');
  const [filterBrand, setFilterBrand] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterTier, setFilterTier] = useState('all');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [sortField, setSortField] = useState('brand');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState(null);

  const filtered = useMemo(() => {
    let items = data.products;
    if (filterBrand !== 'all') items = items.filter(p => p.brand === filterBrand);
    if (filterCategory !== 'all') items = items.filter(p => p.category === filterCategory);
    if (filterTier !== 'all') items = items.filter(p => p.tier === filterTier);
    if (filterSupplier !== 'all') items = items.filter(p => p.supplier === filterSupplier);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(p =>
        p.brand.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) ||
        (p.tireSize && p.tireSize.toLowerCase().includes(q))
      );
    }
    items = [...items].sort((a, b) => {
      let va = a[sortField] ?? '', vb = b[sortField] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return items;
  }, [data.products, search, filterBrand, filterCategory, filterTier, filterSupplier, sortField, sortDir]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const brands = useMemo(() => [...new Set(data.products.map(p => p.brand))].sort(), [data.products]);
  const resetPage = () => setPage(0);

  return (
    <div className="space-y-3">
      <input
        type="text" placeholder="Search brand, name, size, SKU..."
        value={search}
        onChange={e => { setSearch(e.target.value); resetPage(); }}
        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm focus:border-yellow-400 focus:outline-none placeholder-gray-600"
      />

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); resetPage(); }} className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs flex-shrink-0">
          <option value="all">All Types</option>
          <option value="tire">Tires</option>
          <option value="wheel">Wheels</option>
        </select>
        <select value={filterTier} onChange={e => { setFilterTier(e.target.value); resetPage(); }} className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs flex-shrink-0">
          <option value="all">All Tiers</option>
          {Object.entries(TIER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterSupplier} onChange={e => { setFilterSupplier(e.target.value); resetPage(); }} className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs flex-shrink-0">
          <option value="all">All Suppliers</option>
          <option value="alltire">Alltire</option>
          <option value="superspeed">Superspeed</option>
          <option value="rwc">RWC</option>
        </select>
        <select value={filterBrand} onChange={e => { setFilterBrand(e.target.value); resetPage(); }} className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs flex-shrink-0">
          <option value="all">All Brands</option>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select
          value={`${sortField}-${sortDir}`}
          onChange={e => { const [f, d] = e.target.value.split('-'); setSortField(f); setSortDir(d); setPage(0); }}
          className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs flex-shrink-0"
        >
          <option value="brand-asc">Brand A-Z</option>
          <option value="msrp-desc">MSRP High-Low</option>
          <option value="msrp-asc">MSRP Low-High</option>
          <option value="currentPublic-desc">Price High-Low</option>
          <option value="currentPublic-asc">Price Low-High</option>
          <option value="publicMargin-desc">Margin High-Low</option>
        </select>
      </div>

      <p className="text-xs text-gray-500">{filtered.length.toLocaleString()} results &middot; Tap a product for details</p>

      {/* Cards */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {paged.map(p => {
          const proposed = calcProposedPrice(p, multipliers);
          return (
            <ProductCard
              key={p.id} p={p} proposed={proposed} fees={fees}
              isExpanded={expandedId === p.id}
              onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
            />
          );
        })}
        {paged.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-500">No products found</div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-gray-500">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()}
          </p>
          <div className="flex gap-1">
            <button onClick={() => setPage(0)} disabled={page === 0} className="px-2.5 py-1.5 text-xs bg-gray-800 rounded-lg disabled:opacity-30">&laquo;</button>
            <button onClick={() => setPage(p => p - 1)} disabled={page === 0} className="px-3 py-1.5 text-xs bg-gray-800 rounded-lg disabled:opacity-30">Prev</button>
            <span className="px-3 py-1.5 text-xs text-gray-500">{page + 1}/{totalPages}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1} className="px-3 py-1.5 text-xs bg-gray-800 rounded-lg disabled:opacity-30">Next</button>
            <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} className="px-2.5 py-1.5 text-xs bg-gray-800 rounded-lg disabled:opacity-30">&raquo;</button>
          </div>
        </div>
      )}
    </div>
  );
}
