import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { TIER_COLORS, TIER_LABELS, fmt, fmtPct, aggregateStats, calcCustomerTotal } from '../lib/pricing';

function Stat({ label, value, sub, color = 'text-white' }) {
  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl sm:text-2xl font-bold ${color} mt-1`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function Dashboard({ data, multipliers, fees }) {
  const { summary, brands, products } = data;
  const tireProducts = useMemo(() => products.filter(p => p.category === 'tire'), [products]);
  const wheelProducts = useMemo(() => products.filter(p => p.category === 'wheel'), [products]);
  const tireStats = useMemo(() => aggregateStats(tireProducts), [tireProducts]);
  const wheelStats = useMemo(() => aggregateStats(wheelProducts), [wheelProducts]);

  // Customer total examples
  const tireCustomer = useMemo(() =>
    calcCustomerTotal(tireStats.avgPublic, { category: 'tire' }, fees),
  [tireStats, fees]);

  // Wheel brands with known margins
  const wheelBrands = useMemo(() =>
    brands.filter(b => b.category === 'wheel' && b.avgCost)
      .sort((a, b) => b.avgMargin - a.avgMargin)
      .map(b => ({
        name: b.brand,
        margin: b.avgMargin,
        profit: Math.round(b.avgPublic - b.avgCost),
        fill: TIER_COLORS.wheel,
      })),
  [brands]);

  // Top tire brands
  const topTireBrands = useMemo(() =>
    brands.filter(b => b.category === 'tire' && b.count >= 10)
      .slice(0, 10)
      .map(b => ({ ...b, fill: TIER_COLORS[b.tier] })),
  [brands]);

  // Tier data for chart (desktop only)
  const tierData = useMemo(() =>
    Object.entries(TIER_LABELS)
      .filter(([key]) => key !== 'wheel')
      .map(([key, label]) => ({
        name: label, value: summary.tiers[key] || 0, color: TIER_COLORS[key],
      })),
  [summary]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Key numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Tires" value={summary.tires.toLocaleString()} sub={`avg ${fmt(tireStats.avgPublic)}/tire`} color="text-blue-400" />
        <Stat label="Wheels" value={summary.wheels.toLocaleString()} sub={`avg ${fmt(wheelStats.avgPublic)}/wheel`} color="text-yellow-400" />
        <Stat label="Customer Pays (avg tire)" value={fmt(tireCustomer.total)} sub={`${fmt(tireCustomer.base)} + ${fmt(tireCustomer.ehf)} EHF + ${fmt(tireCustomer.tax)} HST`} color="text-green-400" />
        <Stat label="Wheel Margin" value={fmtPct(wheelStats.avgMargin)} sub={`${fmt(wheelStats.avgPublic - wheelStats.avgCost)} profit/unit`} color="text-emerald-400" />
      </div>

      {/* Customer breakdown card */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Set of 4 Tires — Customer Receipt</h3>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 sm:gap-2 text-sm">
          <div className="sm:col-span-3 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-gray-400">4 tires</span>
              <span>{fmt(tireStats.avgPublic * 4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Environmental fee (4 &times; {fmt(fees.tireEhf)})</span>
              <span className="text-orange-400">{fmt(fees.tireEhf * 4)}</span>
            </div>
            {fees.installTire > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400">Install</span>
                <span>{fmt(fees.installTire * 4)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-800 pt-1.5">
              <span className="text-gray-400">Subtotal</span>
              <span>{fmt((tireStats.avgPublic + fees.tireEhf + fees.installTire) * 4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">HST ({(fees.hstRate * 100).toFixed(0)}%)</span>
              <span className="text-red-400">{fmt((tireStats.avgPublic + fees.tireEhf + fees.installTire) * fees.hstRate * 4)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-700 pt-1.5 text-base font-bold">
              <span className="text-yellow-400">Customer Total</span>
              <span className="text-yellow-400">{fmt(tireCustomer.total * 4)}</span>
            </div>
          </div>
          <div className="sm:col-span-2 bg-gray-800/50 rounded-lg p-3 text-center flex flex-col justify-center">
            <p className="text-[9px] text-gray-500 uppercase">Per Tire</p>
            <p className="text-2xl font-bold text-yellow-400 mt-1">{fmt(tireCustomer.total)}</p>
            <p className="text-[10px] text-gray-500 mt-1">
              {fmt(tireCustomer.base)} + {fmt(tireCustomer.ehf)} + {fmt(tireCustomer.tax)}
            </p>
          </div>
        </div>
      </div>

      {/* Charts — hidden on mobile, shown on sm+ */}
      <div className="hidden sm:grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <h3 className="text-xs font-semibold text-gray-400 mb-2">Tire Tiers</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={tierData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value"
                label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                {tierData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip formatter={v => v.toLocaleString()} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 lg:col-span-2">
          <h3 className="text-xs font-semibold text-gray-400 mb-2">Wheel Margin by Brand</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={wheelBrands} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis type="number" domain={[0, 80]} tickFormatter={v => v + '%'} tick={{ fill: '#6B7280', fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={85} tick={{ fill: '#9CA3AF', fontSize: 10 }} />
              <Tooltip formatter={v => fmtPct(v)} />
              <Bar dataKey="margin" radius={[0, 4, 4, 0]}>
                {wheelBrands.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top tire brands */}
      <div className="bg-gray-900 rounded-xl border border-gray-800">
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-300">Top Tire Brands</h3>
        </div>
        <div className="divide-y divide-gray-800/50">
          {topTireBrands.map(b => {
            const discount = b.avgMsrp > 0 ? Math.round((1 - b.avgPublic / b.avgMsrp) * 100) : 0;
            return (
              <div key={b.brand} className="px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{b.brand}</p>
                  <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: b.fill + '20', color: b.fill }}>
                    {TIER_LABELS[b.tier]}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <span className="text-[10px] text-gray-500 hidden sm:inline">{b.count} SKUs</span>
                  <span className="text-sm text-green-400">{fmt(b.avgPublic)}</span>
                  <span className="text-[10px] text-yellow-400 w-12 text-right">{discount}% off</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
