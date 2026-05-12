// === Ontario Fees & Tax ===
export const DEFAULT_FEES = {
  hstRate: 0.13,           // Ontario HST 13%
  tireEhf: 4.50,           // Environmental Handling Fee per tire
  wheelLevy: 0,            // No standard wheel levy (configurable)
  installTire: 0,          // Optional install fee per tire
  installWheel: 0,         // Optional install fee per wheel
};

export const TIER_LABELS = {
  premium: 'Premium',
  mid: 'Mid-Tier',
  budget: 'Budget',
  wheel: 'Wheels',
};

export const TIER_COLORS = {
  premium: '#8B5CF6',
  mid: '#3B82F6',
  budget: '#10B981',
  wheel: '#F59E0B',
};

export const TIER_DESCRIPTIONS = {
  premium: 'MAP-restricted. Michelin, Bridgestone, Continental, Pirelli, Goodyear, Nokian.',
  mid: 'Moderate MAP. Hankook, Kumho, Yokohama, Nexen, Laufenn, etc.',
  budget: 'No MAP. Sailun, ILINK, Mirage — highest margins.',
  wheel: 'All wheel brands across suppliers.',
};

export const SUPPLIER_COLORS = {
  alltire: '#3B82F6',
  superspeed: '#F59E0B',
  rwc: '#EF4444',
};

// Calculate proposed pricing for a product
export function calcProposedPrice(product, multipliers) {
  const m = multipliers[product.brand] || multipliers[product.tier] || { publicMult: 0.90, distMult: 0.60, distMarkup: 1.20 };

  const proposedPublic = round2(product.msrp * m.publicMult);

  let proposedDist;
  if (product.dealerCost) {
    proposedDist = round2(product.dealerCost * (m.distMarkup || 1.20));
    if (proposedDist >= proposedPublic) {
      proposedDist = round2(proposedPublic * 0.80);
    }
  } else {
    proposedDist = round2(product.msrp * m.distMult);
  }

  return { proposedPublic, proposedDist };
}

// Calculate full customer price with fees & tax
export function calcCustomerTotal(basePrice, product, fees) {
  const ehf = product.category === 'tire' ? fees.tireEhf : fees.wheelLevy;
  const install = product.category === 'tire' ? fees.installTire : fees.installWheel;
  const subtotal = basePrice + ehf + install;
  const tax = round2(subtotal * fees.hstRate);
  return {
    base: basePrice,
    ehf,
    install,
    subtotal,
    tax,
    total: round2(subtotal + tax),
  };
}

// For a set of 4
export function calcSetTotal(basePrice, product, fees) {
  const single = calcCustomerTotal(basePrice, product, fees);
  return {
    base: round2(single.base * 4),
    ehf: round2(single.ehf * 4),
    install: round2(single.install * 4),
    subtotal: round2(single.subtotal * 4),
    tax: round2(single.tax * 4),
    total: round2(single.total * 4),
  };
}

export function calcMargin(sellPrice, cost) {
  if (!cost || !sellPrice || sellPrice === 0) return null;
  return round2(((sellPrice - cost) / sellPrice) * 100);
}

export function calcProfit(sellPrice, cost) {
  if (!cost || !sellPrice) return null;
  return round2(sellPrice - cost);
}

export function fmt(val) {
  if (val == null) return '--';
  return '$' + val.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtPct(val) {
  if (val == null) return '--';
  return val.toFixed(1) + '%';
}

export function fmtShort(val) {
  if (val == null) return '--';
  if (Math.abs(val) >= 1000) return '$' + (val / 1000).toFixed(1) + 'k';
  return fmt(val);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Aggregate stats for a group of products
export function aggregateStats(products, multipliers = null) {
  const stats = {
    count: products.length,
    avgMsrp: 0, avgPublic: 0, avgDist: 0, avgCost: 0,
    costCount: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0, avgMargin: 0,
  };

  for (const p of products) {
    let pub = p.currentPublic;
    let dist = p.currentDist;
    if (multipliers) {
      const proposed = calcProposedPrice(p, multipliers);
      pub = proposed.proposedPublic;
      dist = proposed.proposedDist;
    }
    stats.avgMsrp += p.msrp;
    stats.avgPublic += pub;
    stats.avgDist += dist;
    stats.totalRevenue += pub;
    if (p.dealerCost) {
      stats.avgCost += p.dealerCost;
      stats.costCount++;
      stats.totalCost += p.dealerCost;
      stats.totalProfit += (pub - p.dealerCost);
    }
  }

  if (stats.count > 0) {
    stats.avgMsrp = round2(stats.avgMsrp / stats.count);
    stats.avgPublic = round2(stats.avgPublic / stats.count);
    stats.avgDist = round2(stats.avgDist / stats.count);
  }
  if (stats.costCount > 0) {
    stats.avgCost = round2(stats.avgCost / stats.costCount);
    stats.avgMargin = round2(((stats.avgPublic - stats.avgCost) / stats.avgPublic) * 100);
  }

  return stats;
}
