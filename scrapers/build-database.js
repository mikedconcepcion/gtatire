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

  const productMap = new Map(); // id → product
  const fitmentMap = new Map(); // id → Set of "year|make|model"

  // ─── 1a. Load Alltire wheels ───
  const rawWheels = loadJSON('alltire-wheels.json');
  if (rawWheels) {
    console.log(`Alltire raw entries: ${rawWheels.length}`);
    for (const raw of rawWheels) {
      if (!raw.productNo) continue;
      const key = raw.productNo;
      const vehicleKey = `${raw.vehicleYear}|${raw.vehicleMake}|${raw.vehicleModel}`;
      if (!fitmentMap.has(key)) fitmentMap.set(key, new Set());
      fitmentMap.get(key).add(vehicleKey);
      if (productMap.has(key)) continue;

      const specs = parseWheelDescription(raw.description);
      const alltireMsrp = parseFloat((raw.msrp || '').replace(/[$,]/g, '')) || 0;
      const alltireDC = parseFloat((raw.dealerPrice || '').replace(/[$,]/g, '')) || 0;
      const ourPrice = alltireMsrp > 0 ? Math.round(alltireMsrp * 0.75 * 100) / 100 : 0;
      const dcBased = alltireDC > 0 ? Math.round(alltireDC * 1.20 * 100) / 100 : 0;
      const msrpBased = alltireMsrp > 0 ? Math.round(alltireMsrp * 0.60 * 100) / 100 : 0;
      const distPrice = dcBased > 0 && dcBased < ourPrice ? dcBased : msrpBased;

      productMap.set(key, {
        id: `alltire-${key}`,
        productNo: key,
        supplier: 'alltire',
        category: 'wheel',
        brand: 'Alltire',
        wheelType: raw.wheelType || '',
        name: specs.name || raw.wheelType || '',
        description: raw.description || '',
        image: raw.image ? `/gtatire/data/images/alltire/${raw.image.split('/').pop()}` : '',
        price: ourPrice > 0 ? `$${ourPrice.toFixed(2)}` : '',
        priceNum: ourPrice,
        distPrice: distPrice > 0 ? `$${distPrice.toFixed(2)}` : '',
        distPriceNum: distPrice,
        compareAt: alltireMsrp > 0 ? `$${alltireMsrp.toFixed(2)}` : '',
        compareAtNum: alltireMsrp,
        stock: raw.stock || '',
        hubCentric: raw.hubCentric || false,
        rimDiameter: specs.rimDiameter || null,
        rimWidth: specs.rimWidth || null,
        boltPattern: specs.boltPattern || '',
        offset: specs.offset || null,
        hubBore: specs.hubBore || null,
        finish: specs.finish || '',
      });
    }
    console.log(`  Alltire unique products: ${productMap.size}`);
  }

  // ─── 1b. Load Superspeed wheels ───
  const ssRaw = loadJSON('superspeed-wheels-raw.json');
  if (ssRaw && ssRaw.List) {
    console.log(`Superspeed raw entries: ${ssRaw.List.length}`);
    let ssCount = 0;
    for (const w of ssRaw.List) {
      if (!w.SKU) continue;
      const key = w.SKU;
      if (productMap.has(key)) continue;

      const msrp = w.MSRP || 0;
      const dc = w.COST || 0;
      const ourPrice = msrp > 0 ? Math.round(msrp * 0.75 * 100) / 100 : 0;
      const dcBased = dc > 0 ? Math.round(dc * 1.20 * 100) / 100 : 0;
      const msrpBased = msrp > 0 ? Math.round(msrp * 0.60 * 100) / 100 : 0;
      const distPrice = dcBased > 0 && dcBased < ourPrice ? dcBased : msrpBased;

      // Image: use first face image (compressed to .jpg)
      const faceImgs = (w.FACE_IMG || '').split(',').filter(Boolean);
      const imageUrl = faceImgs.length > 0
        ? `/gtatire/data/images/superspeed/${faceImgs[0].replace('.png', '.jpg')}`
        : '';

      // Build description string
      const desc = `${w.MODEL} ${w.DIAMETER}x${w.WIDTH} ${w.PCD} ET${w.ET} CB${w.CB} ${w.FINISH}`;

      // Parse diameter as number
      const diameter = parseInt(w.DIAMETER) || null;

      // Stock text
      let stockText = '';
      if (w.INVENTORY > 20) stockText = '20+ In Stock';
      else if (w.INVENTORY > 0) stockText = `${w.INVENTORY} In Stock`;
      else if (w.ETA) stockText = w.ETA;
      else stockText = 'Out of Stock';

      productMap.set(key, {
        id: `ss-${key}`,
        productNo: key,
        supplier: 'superspeed',
        category: 'wheel',
        brand: w.BRAND || 'Superspeed',
        wheelType: 'Alloy',
        name: w.MODEL || '',
        description: desc,
        image: imageUrl,
        images: faceImgs.map(f => `/gtatire/data/images/superspeed/${f.replace('.png', '.jpg')}`),
        price: ourPrice > 0 ? `$${ourPrice.toFixed(2)}` : '',
        priceNum: ourPrice,
        distPrice: distPrice > 0 ? `$${distPrice.toFixed(2)}` : '',
        distPriceNum: distPrice,
        compareAt: msrp > 0 ? `$${msrp.toFixed(2)}` : '',
        compareAtNum: msrp,
        stock: stockText,
        hubCentric: false,
        rimDiameter: diameter,
        rimWidth: w.WIDTH || null,
        boltPattern: w.PCD || '',
        offset: w.ET || null,
        hubBore: w.CB || null,
        finish: w.FINISH || '',
        seat: w.SEAT || '',
      });
      ssCount++;
    }
    console.log(`  Superspeed unique products: ${ssCount}`);
  }

  // ─── 1c. Load RWC wheels (if available) ───
  const rwcRaw = loadJSON('rwc-wheels-raw.json');
  if (rwcRaw && Array.isArray(rwcRaw)) {
    console.log(`RWC raw entries: ${rwcRaw.length}`);
    let rwcCount = 0;
    for (const w of rwcRaw) {
      if (!w.sku) continue;
      const key = w.sku;
      if (productMap.has(key)) continue;

      const dc = w.cost || 0;
      // RWC: cost is dealer cost, estimate MSRP as DC * 1.6
      const estMsrp = dc > 0 ? Math.round(dc * 1.6 * 100) / 100 : 0;
      const ourPrice = estMsrp > 0 ? Math.round(estMsrp * 0.75 * 100) / 100 : 0;
      const dcBased = dc > 0 ? Math.round(dc * 1.20 * 100) / 100 : 0;
      const distPrice = dcBased > 0 && dcBased < ourPrice ? dcBased : 0;

      // Parse size from name or specs
      const sizeMatch = (w.size || '').match(/(\d+)x([\d.]+)/);
      const bpMatch = (w.boltPattern || '').match(/(\d)x([\d.]+)/);

      const imageFile = w.image ? w.image.split('/').pop() : '';
      const imageUrl = imageFile ? `/gtatire/data/images/rwc/${imageFile}` : '';

      productMap.set(key, {
        id: `rwc-${key}`,
        productNo: key,
        supplier: 'rwc',
        category: 'wheel',
        brand: 'RWC',
        wheelType: 'Alloy',
        name: w.modelCode1 || w.name || '',
        description: w.name || '',
        image: imageUrl,
        price: ourPrice > 0 ? `$${ourPrice.toFixed(2)}` : '',
        priceNum: ourPrice,
        distPrice: distPrice > 0 ? `$${distPrice.toFixed(2)}` : '',
        distPriceNum: distPrice,
        compareAt: estMsrp > 0 ? `$${estMsrp.toFixed(2)}` : '',
        compareAtNum: estMsrp,
        stock: w.stock || '',
        hubCentric: (w.customFit || '').includes('HUB CENTRIC'),
        rimDiameter: sizeMatch ? parseInt(sizeMatch[1]) : null,
        rimWidth: sizeMatch ? parseFloat(sizeMatch[2]) : null,
        boltPattern: w.boltPattern || '',
        offset: w.offset ? parseInt((w.offset || '').replace(/\D/g, '')) : null,
        hubBore: w.centerBore ? parseFloat((w.centerBore || '').replace(/[^0-9.]/g, '')) : null,
        finish: w.finish || '',
        tpmsCompatible: w.tpmsCompatible || '',
        runflatCertified: w.runflatCertified || '',
        loadRating: w.loadRating || '',
      });
      rwcCount++;

      // Add RWC fitment if available
      if (w.fitment && w.fitment.length > 0) {
        if (!fitmentMap.has(key)) fitmentMap.set(key, new Set());
        for (const f of w.fitment) {
          fitmentMap.get(key).add(`${f.year}|${f.make}|${f.model}`);
        }
      }
    }
    console.log(`  RWC unique products: ${rwcCount}`);
  }

  const totalProducts = productMap.size;
  console.log(`\nTotal unique products: ${totalProducts}`);
  console.log(`Fitment entries: ${fitmentMap.size}`);

  // ─── 2. Build products array ───
  const products = Array.from(productMap.values());

  // Sort by MSRP
  products.sort((a, b) => a.priceNum - b.priceNum);

  // ─── 3. Build fitment index ───
  const fitment = {};
  for (const [productNo, vehicles] of fitmentMap) {
    fitment[productNo] = Array.from(vehicles);
  }

  // ─── 4. Build vehicle tree (for dropdowns) ───
  const vehicleTree = loadJSON('alltire-wheel-tree.json');
  let vehicles = vehicleTree;
  if (!vehicles) {
    vehicles = {};
    for (const raw of (rawWheels || [])) {
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
  const suppliers = {};
  const types = {};
  const finishes = {};
  const diameters = {};

  products.forEach(p => {
    types[p.wheelType] = (types[p.wheelType] || 0) + 1;
    if (p.finish) finishes[p.finish] = (finishes[p.finish] || 0) + 1;
    if (p.rimDiameter) diameters[p.rimDiameter] = (diameters[p.rimDiameter] || 0) + 1;
    if (p.brand) brands[p.brand] = (brands[p.brand] || 0) + 1;
    suppliers[p.supplier] = (suppliers[p.supplier] || 0) + 1;
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

  const totalFitments = rawWheels ? rawWheels.length : 0;
  const stats = {
    totalProducts: products.length,
    totalFitments,
    years: yearCount,
    makes: makeCount,
    models: modelCount,
    byType: types,
    byDiameter: diameters,
    byBrand: brands,
    bySupplier: suppliers,
    topFinishes: Object.entries(finishes).sort((a, b) => b[1] - a[1]).slice(0, 20),
    priceRange: {
      min: products.filter(p => p.priceNum > 0).reduce((min, p) => Math.min(min, p.priceNum), Infinity),
      max: products.reduce((max, p) => Math.max(max, p.priceNum), 0),
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
  console.log(`Fitments: ${totalFitments} vehicle/product combos`);
  console.log(`Vehicles: ${yearCount} years, ${makeCount} makes, ${modelCount} models`);
  console.log(`Types: ${JSON.stringify(types)}`);
  console.log(`Diameters: ${JSON.stringify(diameters)}`);
  console.log(`Price range: $${stats.priceRange.min} - $${stats.priceRange.max}`);
  console.log(`\nFiles saved to: ${OUT_DIR}`);
}

buildDatabase();
