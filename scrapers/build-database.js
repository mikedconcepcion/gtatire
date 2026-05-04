/**
 * Build a normalized database from raw scraped data.
 * Deduplicates products, creates fitment index, generates frontend-ready JSON.
 *
 * Output files (in webapp/public/data/):
 *   products.json    — unique products with specs
 *   fitment.json     — productNo → vehicle list mapping
 *   vehicles.json    — Year/Make/Model tree for dropdowns
 *   stats.json       — catalog stats (counts, brands, etc.)
 */

const fs = require('fs');
const pathMod = require('path');

const DATA_DIR = pathMod.join(__dirname, '..', 'data');
const OUT_DIR = pathMod.join(__dirname, '..', 'webapp', 'public', 'data');

// Ensure output dir
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function loadJSON(filename) {
  const fpath = pathMod.join(DATA_DIR, filename);
  if (!fs.existsSync(fpath)) return null;
  return JSON.parse(fs.readFileSync(fpath, 'utf8'));
}

function saveJSON(filename, data) {
  fs.writeFileSync(pathMod.join(OUT_DIR, filename), JSON.stringify(data));
  console.log(`  Saved ${filename} (${(JSON.stringify(data).length / 1024).toFixed(0)} KB)`);
}

// Parse description like "17x7 5x114.3 ET40 CB64.1 Black" or "VERTEX_SatinBlack 18x8 5x120 ET35 CB72.6"
function parseWheelDescription(desc) {
  const specs = {};

  // Extract wheel name (if alloy — has a name before dimensions)
  const nameMatch = desc.match(/^([A-Z][A-Za-z_]+)\s/);
  if (nameMatch) specs.name = nameMatch[1].replace(/_/g, ' ');

  // Dimensions: 17x7, 18x8, etc.
  const dimMatch = desc.match(/(\d{2,3})x(\d+\.?\d*)/);
  if (dimMatch) {
    specs.rimDiameter = parseInt(dimMatch[1]);
    specs.rimWidth = parseFloat(dimMatch[2]);
  }

  // Bolt pattern: 5x114.3, 6x139.7, etc.
  const boltMatch = desc.match(/(\d)x(\d{3,4}\.?\d*)/);
  if (boltMatch) {
    specs.boltPattern = `${boltMatch[1]}x${boltMatch[2]}`;
    specs.bolts = parseInt(boltMatch[1]);
    specs.pcd = parseFloat(boltMatch[2]);
  }

  // Offset: ET40, ET35, etc.
  const etMatch = desc.match(/ET(-?\d+)/);
  if (etMatch) specs.offset = parseInt(etMatch[1]);

  // Hub bore: CB64.1, CB73.1, etc.
  const cbMatch = desc.match(/CB(\d+\.?\d*)/);
  if (cbMatch) specs.hubBore = parseFloat(cbMatch[1]);

  // Color/finish: last word(s) after specs
  const colorMatch = desc.match(/(?:CB[\d.]+\s+)(.+)$/);
  if (colorMatch) specs.finish = colorMatch[1].trim();

  return specs;
}

function buildDatabase() {
  console.log('=== Building Database ===\n');

  // Load raw wheel data
  const rawWheels = loadJSON('alltire-wheels.json');
  if (!rawWheels) {
    console.log('No wheel data found. Run the scraper first.');
    return;
  }
  console.log(`Raw wheel entries: ${rawWheels.length}`);

  // Load vehicle tree
  const vehicleTree = loadJSON('alltire-wheel-tree.json');

  // ─── 1. Deduplicate products ───
  const productMap = new Map(); // productNo → product
  const fitmentMap = new Map(); // productNo → Set of "year|make|model"

  for (const raw of rawWheels) {
    if (!raw.productNo) continue;

    const key = raw.productNo;
    const vehicleKey = `${raw.vehicleYear}|${raw.vehicleMake}|${raw.vehicleModel}`;

    if (!fitmentMap.has(key)) fitmentMap.set(key, new Set());
    fitmentMap.get(key).add(vehicleKey);

    // Only process product once (first occurrence)
    if (productMap.has(key)) continue;

    const specs = parseWheelDescription(raw.description);

    const product = {
      id: `alltire-${key}`,
      productNo: key,
      supplier: 'alltire',
      category: 'wheel',
      wheelType: raw.wheelType || '',
      name: specs.name || raw.wheelType || '',
      description: raw.description || '',
      image: raw.image || '',
      msrp: raw.msrp || '',
      msrpNum: parseFloat((raw.msrp || '').replace(/[$,]/g, '')) || 0,
      dealerPrice: raw.dealerPrice || '',
      stock: raw.stock || '',
      hubCentric: raw.hubCentric || false,
      // Parsed specs
      rimDiameter: specs.rimDiameter || null,
      rimWidth: specs.rimWidth || null,
      boltPattern: specs.boltPattern || '',
      offset: specs.offset || null,
      hubBore: specs.hubBore || null,
      finish: specs.finish || '',
    };

    productMap.set(key, product);
  }

  console.log(`Unique products: ${productMap.size}`);
  console.log(`Fitment entries: ${fitmentMap.size}`);

  // ─── 2. Build products array ───
  const products = Array.from(productMap.values());

  // Sort by MSRP
  products.sort((a, b) => a.msrpNum - b.msrpNum);

  // ─── 3. Build fitment index ───
  const fitment = {};
  for (const [productNo, vehicles] of fitmentMap) {
    fitment[productNo] = Array.from(vehicles);
  }

  // ─── 4. Build vehicle tree (for dropdowns) ───
  // Use the scraped tree if available, otherwise build from fitment data
  let vehicles = vehicleTree;
  if (!vehicles) {
    vehicles = {};
    for (const raw of rawWheels) {
      const { vehicleYear: y, vehicleMake: mk, vehicleModel: md } = raw;
      if (!y || !mk || !md) continue;
      if (!vehicles[y]) vehicles[y] = {};
      if (!vehicles[y][mk]) vehicles[y][mk] = {};
      if (!vehicles[y][mk][md]) vehicles[y][mk][md] = true;
    }
    // Convert to arrays
    for (const y of Object.keys(vehicles)) {
      for (const mk of Object.keys(vehicles[y])) {
        vehicles[y][mk] = Object.keys(vehicles[y][mk]).sort();
      }
    }
  }

  // ─── 5. Build stats ───
  const brands = {};
  const types = {};
  const finishes = {};
  const diameters = {};

  products.forEach(p => {
    types[p.wheelType] = (types[p.wheelType] || 0) + 1;
    if (p.finish) finishes[p.finish] = (finishes[p.finish] || 0) + 1;
    if (p.rimDiameter) diameters[p.rimDiameter] = (diameters[p.rimDiameter] || 0) + 1;
  });

  const yearCount = Object.keys(vehicles).length;
  let makeCount = 0, modelCount = 0;
  for (const y of Object.keys(vehicles)) {
    makeCount += Object.keys(vehicles[y]).length;
    for (const mk of Object.keys(vehicles[y])) {
      if (Array.isArray(vehicles[y][mk])) {
        modelCount += vehicles[y][mk].length;
      } else {
        modelCount += Object.keys(vehicles[y][mk]).length;
      }
    }
  }

  const stats = {
    totalProducts: products.length,
    totalFitments: rawWheels.length,
    years: yearCount,
    makes: makeCount,
    models: modelCount,
    byType: types,
    byDiameter: diameters,
    topFinishes: Object.entries(finishes).sort((a, b) => b[1] - a[1]).slice(0, 20),
    priceRange: {
      min: products.filter(p => p.msrpNum > 0).reduce((min, p) => Math.min(min, p.msrpNum), Infinity),
      max: products.reduce((max, p) => Math.max(max, p.msrpNum), 0),
    },
    lastUpdated: new Date().toISOString(),
  };

  // ─── 6. Save everything ───
  console.log('\nSaving files...');
  saveJSON('products.json', products);
  saveJSON('fitment.json', fitment);
  saveJSON('vehicles.json', vehicles);
  saveJSON('stats.json', stats);

  // ─── 7. Print summary ───
  console.log('\n=== Database Summary ===');
  console.log(`Products: ${products.length} unique wheels`);
  console.log(`Fitments: ${rawWheels.length} vehicle/product combos`);
  console.log(`Vehicles: ${yearCount} years, ${makeCount} makes, ${modelCount} models`);
  console.log(`Types: ${JSON.stringify(types)}`);
  console.log(`Diameters: ${JSON.stringify(diameters)}`);
  console.log(`Price range: $${stats.priceRange.min} - $${stats.priceRange.max}`);
  console.log(`\nFiles saved to: ${OUT_DIR}`);
}

buildDatabase();
