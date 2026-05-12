/**
 * Build pricing analysis dataset from raw supplier data.
 * Merges all suppliers with dealer costs, MSRP, and brand tier info.
 * Output: pricing-tool/public/pricing-data.json
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function loadJSON(filename) {
  const fpath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(fpath)) { console.warn(`  Missing: ${filename}`); return null; }
  return JSON.parse(fs.readFileSync(fpath, 'utf8'));
}

// Brand tier classification
const BRAND_TIERS = {
  // Premium (MAP-restricted)
  'MICHELIN': 'premium', 'BRIDGESTONE': 'premium', 'CONTINENTAL': 'premium',
  'PIRELLI': 'premium', 'GOODYEAR': 'premium', 'NOKIAN': 'premium',
  // Mid-tier
  'HANKOOK': 'mid', 'HANKOOk': 'mid', 'KUMHO': 'mid', 'YOKOHAMA': 'mid',
  'NEXEN': 'mid', 'LAUFENN': 'mid', 'BFGOODRICH': 'mid', 'FIRESTONE': 'mid',
  'TOYO': 'mid', 'FALKEN': 'mid', 'UNIROYAL': 'mid', 'GENERAL': 'mid',
  'COOPER': 'mid', 'DUNLOP': 'mid', 'GISLAVED': 'mid', 'HERCULES': 'mid',
  // Budget (no MAP)
  'SAILUN': 'budget', 'ILINK': 'budget', 'MIRAGE': 'budget', 'TRANSMATE': 'budget',
  'TRIANGLE': 'budget', 'OVATION': 'budget', 'IRONMAN': 'budget', 'WESTLAKE': 'budget',
  'SURETRAC': 'budget', 'CARLISLE': 'budget', 'MAXTREK': 'budget', 'MINERVA': 'budget',
  'ANTARES': 'budget',
  // Wheel brands
  'Steel': 'wheel', 'Macpek': 'wheel', 'Superspeed': 'wheel', 'OE+': 'wheel',
  'Blackhorn': 'wheel', 'OE+ Forged': 'wheel', 'Superspeed Forged': 'wheel',
  'Rocktrix': 'wheel', 'RWC': 'wheel',
};

function main() {
  console.log('Building pricing dataset...\n');

  // Load raw data
  const alltireWheels = loadJSON('alltire-wheels.json') || [];
  const alltireTires = loadJSON('alltire-tires.json') || [];
  const superspeedRaw = loadJSON('superspeed-wheels-raw.json');
  const superspeedWheels = superspeedRaw?.List || [];
  const rwcWheels = loadJSON('rwc-wheels-raw.json') || [];
  const gtaProducts = loadJSON('gta-products.json') || [];
  const skuMap = loadJSON('gta-sku-map.json') || {};

  console.log(`  Alltire wheels: ${alltireWheels.length} rows`);
  console.log(`  Alltire tires: ${alltireTires.length}`);
  console.log(`  Superspeed wheels: ${superspeedWheels.length}`);
  console.log(`  RWC wheels: ${rwcWheels.length}`);
  console.log(`  GTA products: ${gtaProducts.length}`);

  // Build supplier cost lookup: supplierSKU -> { cost, msrp, supplier }
  const supplierCosts = {};

  // Alltire wheels — deduplicate by productNo, keep dealer price
  const seenAlltire = new Set();
  for (const w of alltireWheels) {
    if (seenAlltire.has(w.productNo)) continue;
    seenAlltire.add(w.productNo);
    const dc = parseFloat((w.dealerPrice || '').replace('$', '').replace(',', ''));
    const msrp = parseFloat((w.msrp || '').replace('$', '').replace(',', ''));
    supplierCosts[w.productNo] = {
      supplier: 'alltire',
      dealerCost: isNaN(dc) ? null : dc,
      msrp: isNaN(msrp) ? null : msrp,
    };
  }

  // Alltire tires — dealer cost is mostly hidden
  for (const t of alltireTires) {
    const dc = parseFloat((t.dealerPrice || '').replace('$', '').replace(',', ''));
    const msrp = parseFloat((t.msrp || '').replace('$', '').replace(',', ''));
    supplierCosts[t.productNo] = {
      supplier: 'alltire',
      dealerCost: isNaN(dc) ? null : dc,
      msrp: isNaN(msrp) ? null : msrp,
    };
  }

  // Superspeed wheels
  for (const w of superspeedWheels) {
    supplierCosts[`SS-${w.SKU}`] = {
      supplier: 'superspeed',
      dealerCost: w.COST || null,
      msrp: w.MSRP || null,
    };
  }

  // RWC wheels
  for (const w of rwcWheels) {
    supplierCosts[`RWC-${w.sku}`] = {
      supplier: 'rwc',
      dealerCost: w.cost || null,
      msrp: null, // RWC doesn't provide MSRP
    };
  }

  // Build reverse SKU map: GTA-ID -> { supplier, supplierSku }
  const gtaToSupplier = {};
  for (const entry of Object.values(skuMap)) {
    gtaToSupplier[entry.gtaId] = {
      supplier: entry.supplier,
      supplierSku: entry.supplierSku,
    };
  }

  // Build final pricing dataset
  const pricingData = [];

  for (const p of gtaProducts) {
    const mapEntry = gtaToSupplier[p.id];
    const supplierSku = mapEntry?.supplierSku;

    // Look up cost by supplier-specific key format
    let costInfo = null;
    if (supplierSku) {
      if (mapEntry.supplier === 'superspeed') {
        costInfo = supplierCosts[`SS-${supplierSku}`];
      } else if (mapEntry.supplier === 'rwc') {
        costInfo = supplierCosts[`RWC-${supplierSku}`];
      } else {
        costInfo = supplierCosts[supplierSku];
      }
    }

    // Determine supplier
    let supplier = mapEntry?.supplier || 'unknown';
    if (supplier === 'unknown') {
      if (['RWC'].includes(p.brand)) supplier = 'rwc';
      else if (['Superspeed', 'Superspeed Forged'].includes(p.brand)) supplier = 'superspeed';
      else supplier = 'alltire';
    }

    const msrp = p.compareAtNum || costInfo?.msrp || 0;
    const dealerCost = costInfo?.dealerCost || null;
    const currentPublic = p.priceNum || 0;
    const currentDist = p.distPriceNum || 0;

    // Calculate current margins
    const publicMargin = dealerCost && currentPublic
      ? Math.round(((currentPublic - dealerCost) / currentPublic) * 10000) / 100
      : null;
    const distMargin = dealerCost && currentDist
      ? Math.round(((currentDist - dealerCost) / currentDist) * 10000) / 100
      : null;

    const tier = BRAND_TIERS[p.brand] || (p.category === 'wheel' ? 'wheel' : 'unknown');

    const item = {
      id: p.id,
      category: p.category,
      brand: p.brand,
      tier,
      name: p.name,
      description: p.description,
      supplier,
      supplierSku: supplierSku || null,
      msrp,
      dealerCost,
      currentPublic,
      currentDist,
      stock: p.stock,
    };
    // Add type-specific fields
    if (p.category === 'tire') {
      if (p.tireSize) item.tireSize = p.tireSize;
      if (p.wheelType) item.season = p.wheelType;
    } else {
      if (p.finish) item.finish = p.finish;
    }
    pricingData.push(item);
  }

  // Summary stats
  const withCost = pricingData.filter(p => p.dealerCost !== null);
  const tires = pricingData.filter(p => p.category === 'tire');
  const wheels = pricingData.filter(p => p.category === 'wheel');

  console.log(`\n  Total products: ${pricingData.length}`);
  console.log(`  With dealer cost: ${withCost.length} (${Math.round(withCost.length / pricingData.length * 100)}%)`);
  console.log(`  Tires: ${tires.length}, Wheels: ${wheels.length}`);

  // Brand summary for the app
  const brandSummary = {};
  for (const p of pricingData) {
    if (!brandSummary[p.brand]) {
      brandSummary[p.brand] = {
        brand: p.brand,
        tier: p.tier,
        category: p.category === 'wheel' ? 'wheel' : 'tire',
        supplier: p.supplier,
        count: 0,
        avgMsrp: 0,
        avgPublic: 0,
        avgDist: 0,
        avgCost: 0,
        costCount: 0,
        avgMargin: 0,
      };
    }
    const b = brandSummary[p.brand];
    b.count++;
    b.avgMsrp += p.msrp;
    b.avgPublic += p.currentPublic;
    b.avgDist += p.currentDist;
    if (p.dealerCost) {
      b.avgCost += p.dealerCost;
      b.costCount++;
    }
  }

  for (const b of Object.values(brandSummary)) {
    b.avgMsrp = Math.round(b.avgMsrp / b.count * 100) / 100;
    b.avgPublic = Math.round(b.avgPublic / b.count * 100) / 100;
    b.avgDist = Math.round(b.avgDist / b.count * 100) / 100;
    b.avgCost = b.costCount > 0 ? Math.round(b.avgCost / b.costCount * 100) / 100 : null;
    if (b.avgCost) {
      b.avgMargin = Math.round(((b.avgPublic - b.avgCost) / b.avgPublic) * 10000) / 100;
    }
  }

  // Save
  const output = {
    generated: new Date().toISOString(),
    summary: {
      total: pricingData.length,
      tires: tires.length,
      wheels: wheels.length,
      withDealerCost: withCost.length,
      suppliers: { alltire: 0, superspeed: 0, rwc: 0 },
      tiers: { premium: 0, mid: 0, budget: 0, wheel: 0 },
    },
    brands: Object.values(brandSummary).sort((a, b) => b.count - a.count),
    products: pricingData,
  };

  // Count suppliers and tiers
  for (const p of pricingData) {
    if (output.summary.suppliers[p.supplier] !== undefined) output.summary.suppliers[p.supplier]++;
    if (output.summary.tiers[p.tier] !== undefined) output.summary.tiers[p.tier]++;
  }

  const outPath = path.join(__dirname, 'public', 'pricing-data.json');
  if (!fs.existsSync(path.dirname(outPath))) fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output));
  console.log(`\n  Saved: ${outPath} (${(fs.statSync(outPath).size / 1024 / 1024).toFixed(1)} MB)`);
}

main();
