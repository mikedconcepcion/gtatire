/**
 * Build internal GTA database from raw supplier data.
 *
 * Creates:
 *   data/gta-products.json     — master product DB with GTA IDs (internal, not public)
 *   data/gta-sku-map.json      — supplier SKU ↔ GTA SKU mapping (internal)
 *   webapp/public/data/products.json  — public product data (no supplier info)
 *   webapp/public/data/fitment.json   — GTA ID → vehicle list
 *   webapp/public/data/vehicles.json  — Year/Make/Model tree
 *   webapp/public/data/stats.json     — catalog stats
 */

const fs = require('fs');
const pathMod = require('path');

const DATA_DIR = pathMod.join(__dirname, '..', 'data');
const OUT_DIR = pathMod.join(__dirname, '..', 'webapp', 'public', 'data');
const IMG_SRC_DIR = pathMod.join(__dirname, '..', 'data', 'images');
const IMG_PUB_DIR = pathMod.join(OUT_DIR, 'images', 'wheels');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(IMG_PUB_DIR, { recursive: true });

function loadJSON(filename) {
  const fpath = pathMod.join(DATA_DIR, filename);
  if (!fs.existsSync(fpath)) return null;
  return JSON.parse(fs.readFileSync(fpath, 'utf8'));
}

function saveJSON(filepath, data, pretty = false) {
  const str = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  fs.writeFileSync(filepath, str);
  console.log(`  Saved ${pathMod.basename(filepath)} (${(str.length / 1024).toFixed(0)} KB)`);
}

// Generate GTA SKU: GTA-W-0001 (W=wheel, T=tire later)
let skuCounter = 0;
function nextSku(category = 'W') {
  skuCounter++;
  return `GTA-${category}-${String(skuCounter).padStart(4, '0')}`;
}

// Parse wheel description for specs
function parseWheelDescription(desc) {
  const specs = {};
  const nameMatch = desc.match(/^([A-Z][A-Za-z_]+)\s/);
  if (nameMatch) specs.name = nameMatch[1].replace(/_/g, ' ');
  const dimMatch = desc.match(/(\d{2,3})x(\d+\.?\d*)/);
  if (dimMatch) { specs.rimDiameter = parseInt(dimMatch[1]); specs.rimWidth = parseFloat(dimMatch[2]); }
  const boltMatch = desc.match(/(\d)x(\d{3,4}\.?\d*)/);
  if (boltMatch) { specs.boltPattern = `${boltMatch[1]}x${boltMatch[2]}`; }
  const etMatch = desc.match(/ET(-?\d+)/);
  if (etMatch) specs.offset = parseInt(etMatch[1]);
  const cbMatch = desc.match(/CB(\d+\.?\d*)/);
  if (cbMatch) specs.hubBore = parseFloat(cbMatch[1]);
  const colorMatch = desc.match(/(?:CB[\d.]+\s+)(.+)$/);
  if (colorMatch) specs.finish = colorMatch[1].trim();
  return specs;
}

// Pricing: public = 75% MSRP, wholesale = DC+20% (capped below public)
function calcPricing(msrp, dealerCost) {
  const publicPrice = msrp > 0 ? Math.round(msrp * 0.75 * 100) / 100 : 0;
  const dcBased = dealerCost > 0 ? Math.round(dealerCost * 1.20 * 100) / 100 : 0;
  const msrpBased = msrp > 0 ? Math.round(msrp * 0.60 * 100) / 100 : 0;
  const distPrice = dcBased > 0 && dcBased < publicPrice ? dcBased : msrpBased;
  return { publicPrice, distPrice, msrp };
}

// Copy image to public dir with GTA SKU name, return new filename
function copyImage(srcPath, gtaSku, index = 0) {
  return copyImageTo(srcPath, gtaSku, IMG_PUB_DIR, index);
}

function copyImageTo(srcPath, gtaSku, destDir, index = 0) {
  if (!srcPath || !fs.existsSync(srcPath)) return null;
  const ext = pathMod.extname(srcPath) || '.jpg';
  const newName = index === 0 ? `${gtaSku}${ext}` : `${gtaSku}-${index}${ext}`;
  const destPath = pathMod.join(destDir, newName);
  if (!fs.existsSync(destPath)) {
    fs.copyFileSync(srcPath, destPath);
  }
  return newName;
}

function buildDatabase() {
  console.log('=== Building GTA Internal Database ===\n');

  const products = [];       // final product list
  const skuMap = [];         // supplier ↔ GTA mapping
  const fitmentMap = {};     // gtaId → Set of "year|make|model"

  // ─── ALLTIRE ───
  const rawWheels = loadJSON('alltire-wheels.json');
  if (rawWheels) {
    console.log(`Alltire: ${rawWheels.length} raw entries`);
    const seen = new Map();

    for (const raw of rawWheels) {
      if (!raw.productNo) continue;
      const supplierSku = raw.productNo;
      const vehicleKey = `${raw.vehicleYear}|${raw.vehicleMake}|${raw.vehicleModel}`;

      // Track fitment
      let gtaId;
      if (seen.has(supplierSku)) {
        gtaId = seen.get(supplierSku);
        if (!fitmentMap[gtaId]) fitmentMap[gtaId] = new Set();
        fitmentMap[gtaId].add(vehicleKey);
        continue;
      }

      gtaId = nextSku('W');
      seen.set(supplierSku, gtaId);
      if (!fitmentMap[gtaId]) fitmentMap[gtaId] = new Set();
      fitmentMap[gtaId].add(vehicleKey);

      const specs = parseWheelDescription(raw.description);
      const msrp = parseFloat((raw.msrp || '').replace(/[$,]/g, '')) || 0;
      const dc = parseFloat((raw.dealerPrice || '').replace(/[$,]/g, '')) || 0;
      const pricing = calcPricing(msrp, dc);

      // Copy image
      const origImgName = raw.image ? raw.image.split('/').pop() : '';
      // Try source data folder, then existing wheels folder
      let srcImg = '';
      if (origImgName) {
        const paths = [
          pathMod.join(DATA_DIR, 'images', 'alltire', origImgName),
          pathMod.join(IMG_PUB_DIR, origImgName),
        ];
        srcImg = paths.find(p => fs.existsSync(p)) || '';
      }
      const newImgName = copyImage(srcImg, gtaId);

      skuMap.push({
        gtaId,
        gtaSku: gtaId,
        supplier: 'alltire',
        supplierSku,
        supplierProductNo: supplierSku,
      });

      // Alltire brand: Steel wheels are generic, Alloy wheels are "Macpek"
      const alltireBrand = raw.wheelType === 'Steel Wheel' ? 'Steel' : 'Macpek';

      products.push({
        id: gtaId,
        sku: gtaId,
        category: 'wheel',
        brand: alltireBrand,
        wheelType: raw.wheelType || '',
        name: specs.name || raw.description?.split(' ')[0] || '',
        description: raw.description || '',
        image: newImgName ? `/gtatire/data/images/wheels/${newImgName}` : '',
        price: pricing.publicPrice > 0 ? `$${pricing.publicPrice.toFixed(2)}` : '',
        priceNum: pricing.publicPrice,
        distPrice: pricing.distPrice > 0 ? `$${pricing.distPrice.toFixed(2)}` : '',
        distPriceNum: pricing.distPrice,
        compareAt: pricing.msrp > 0 ? `$${pricing.msrp.toFixed(2)}` : '',
        compareAtNum: pricing.msrp,
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
    console.log(`  → ${seen.size} unique products`);
  }

  // ─── SUPERSPEED ───
  const ssRaw = loadJSON('superspeed-wheels-raw.json');
  if (ssRaw && ssRaw.List) {
    console.log(`Superspeed: ${ssRaw.List.length} raw entries`);
    let count = 0;

    for (const w of ssRaw.List) {
      if (!w.SKU) continue;
      const gtaId = nextSku('W');
      count++;

      const pricing = calcPricing(w.MSRP || 0, w.COST || 0);
      const faceImgs = (w.FACE_IMG || '').split(',').filter(Boolean);

      // Copy first image
      const ssImgName = faceImgs[0]?.replace('.png', '.jpg') || '';
      const srcImg = ssImgName
        ? [pathMod.join(DATA_DIR, 'images', 'superspeed', ssImgName),
           pathMod.join(DATA_DIR, 'images', 'superspeed', faceImgs[0] || '')].find(p => fs.existsSync(p)) || ''
        : '';
      const newImgName = copyImage(srcImg, gtaId);

      // Copy additional images
      const extraImages = [];
      for (let i = 1; i < faceImgs.length; i++) {
        const extraFileName = faceImgs[i].replace('.png', '.jpg');
        const extraSrc = [pathMod.join(DATA_DIR, 'images', 'superspeed', extraFileName),
                          pathMod.join(DATA_DIR, 'images', 'superspeed', faceImgs[i])].find(p => fs.existsSync(p)) || '';
        const extraImgName = copyImage(extraSrc, gtaId, i);
        if (extraImgName) extraImages.push(`/gtatire/data/images/wheels/${extraImgName}`);
      }

      let stockText = '';
      if (w.INVENTORY > 20) stockText = '20+ In Stock';
      else if (w.INVENTORY > 0) stockText = `${w.INVENTORY} In Stock`;
      else if (w.ETA) stockText = w.ETA;
      else stockText = 'Out of Stock';

      skuMap.push({
        gtaId,
        gtaSku: gtaId,
        supplier: 'superspeed',
        supplierSku: w.SKU,
        supplierProductNo: w.SKU,
      });

      products.push({
        id: gtaId,
        sku: gtaId,
        category: 'wheel',
        brand: w.BRAND || 'Superspeed',
        wheelType: 'Alloy',
        name: w.MODEL || '',
        description: `${w.MODEL} ${w.DIAMETER}x${w.WIDTH} ${w.PCD} ET${w.ET} CB${w.CB} ${w.FINISH}`,
        image: newImgName ? `/gtatire/data/images/wheels/${newImgName}` : '',
        images: extraImages.length > 0 ? extraImages : undefined,
        price: pricing.publicPrice > 0 ? `$${pricing.publicPrice.toFixed(2)}` : '',
        priceNum: pricing.publicPrice,
        distPrice: pricing.distPrice > 0 ? `$${pricing.distPrice.toFixed(2)}` : '',
        distPriceNum: pricing.distPrice,
        compareAt: pricing.msrp > 0 ? `$${pricing.msrp.toFixed(2)}` : '',
        compareAtNum: pricing.msrp,
        stock: stockText,
        hubCentric: false,
        rimDiameter: parseInt(w.DIAMETER) || null,
        rimWidth: w.WIDTH || null,
        boltPattern: w.PCD || '',
        offset: w.ET || null,
        hubBore: w.CB || null,
        finish: w.FINISH || '',
        seat: w.SEAT || '',
      });
    }
    console.log(`  → ${count} unique products`);
  }

  // ─── RWC ───
  const rwcRaw = loadJSON('rwc-wheels-raw.json');
  if (rwcRaw && Array.isArray(rwcRaw)) {
    console.log(`RWC: ${rwcRaw.length} raw entries`);
    let count = 0;

    for (const w of rwcRaw) {
      if (!w.sku) continue;
      const gtaId = nextSku('W');
      count++;

      const dc = w.cost || 0;
      const estMsrp = dc > 0 ? Math.round(dc * 1.6 * 100) / 100 : 0;
      const pricing = calcPricing(estMsrp, dc);

      // Copy image
      const imgFile = w.image ? w.image.split('/').pop() : '';
      const srcImg = imgFile
        ? [pathMod.join(DATA_DIR, 'images', 'rwc', imgFile)].find(p => fs.existsSync(p)) || ''
        : '';
      const newImgName = copyImage(srcImg, gtaId);

      const sizeMatch = (w.size || '').match(/(\d+)x([\d.]+)/);

      skuMap.push({
        gtaId,
        gtaSku: gtaId,
        supplier: 'rwc',
        supplierSku: w.sku,
        supplierProductNo: w.sku,
      });

      // Add RWC fitment if available
      if (w.fitment && w.fitment.length > 0) {
        fitmentMap[gtaId] = new Set();
        for (const f of w.fitment) {
          fitmentMap[gtaId].add(`${f.year}|${f.make}|${f.model}`);
        }
      }

      products.push({
        id: gtaId,
        sku: gtaId,
        category: 'wheel',
        brand: 'RWC',
        wheelType: 'Alloy',
        name: w.modelCode1 || w.name || '',
        description: w.name || '',
        image: newImgName ? `/gtatire/data/images/wheels/${newImgName}` : '',
        price: pricing.publicPrice > 0 ? `$${pricing.publicPrice.toFixed(2)}` : '',
        priceNum: pricing.publicPrice,
        distPrice: pricing.distPrice > 0 ? `$${pricing.distPrice.toFixed(2)}` : '',
        distPriceNum: pricing.distPrice,
        compareAt: estMsrp > 0 ? `$${estMsrp.toFixed(2)}` : '',
        compareAtNum: estMsrp,
        stock: w.stock || 'Available',
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
    }
    console.log(`  → ${count} unique products`);
  }

  // ─── ALLTIRE TIRES ───
  const tiresRaw = loadJSON('alltire-tires.json');
  if (tiresRaw && Array.isArray(tiresRaw)) {
    console.log(`Alltire Tires: ${tiresRaw.length} raw entries`);
    const seen = new Map();
    let tireCount = 0;

    for (const t of tiresRaw) {
      if (!t.productNo) continue;
      if (seen.has(t.productNo)) continue;
      seen.set(t.productNo, true);

      const gtaId = nextSku('T');
      tireCount++;

      const msrp = parseFloat((t.msrp || '').replace(/[$,]/g, '')) || 0;
      // Dealer price is hidden ("DC" or "..."), estimate as ~60% of MSRP
      const estDC = msrp > 0 ? Math.round(msrp * 0.60 * 100) / 100 : 0;
      const pricing = calcPricing(msrp, estDC);

      // Parse tire size: P225/45R17 → width=225, aspect=45, rim=17
      const sizeMatch = (t.size || '').match(/[PL]?T?(\d{3})\/?(\d{2,3})R(\d{2})/);
      const tireWidth = sizeMatch ? parseInt(sizeMatch[1]) : null;
      const tireAspect = sizeMatch ? parseInt(sizeMatch[2]) : null;
      const tireRim = sizeMatch ? parseInt(sizeMatch[3]) : null;

      // Copy tire image
      const origImgName = t.image ? t.image.split('/').pop() : '';
      const tireSrcImg = origImgName
        ? [pathMod.join(__dirname, '..', 'webapp', 'public', 'data', 'images', 'tires', origImgName),
           pathMod.join(DATA_DIR, 'images', 'tires', origImgName)].find(p => fs.existsSync(p)) || ''
        : '';
      const TIRE_PUB_DIR = pathMod.join(OUT_DIR, 'images', 'tires');
      if (!fs.existsSync(TIRE_PUB_DIR)) fs.mkdirSync(TIRE_PUB_DIR, { recursive: true });
      const tireImgName = copyImageTo(tireSrcImg, gtaId, TIRE_PUB_DIR);

      skuMap.push({
        gtaId,
        gtaSku: gtaId,
        supplier: 'alltire',
        supplierSku: t.productNo,
        supplierProductNo: t.productNo,
      });

      products.push({
        id: gtaId,
        sku: gtaId,
        category: 'tire',
        brand: t.maker || '',
        wheelType: t.type || 'All Season',
        name: t.model || '',
        description: t.description || '',
        image: tireImgName ? `/gtatire/data/images/tires/${tireImgName}` : '',
        price: pricing.publicPrice > 0 ? `$${pricing.publicPrice.toFixed(2)}` : '',
        priceNum: pricing.publicPrice,
        distPrice: pricing.distPrice > 0 ? `$${pricing.distPrice.toFixed(2)}` : '',
        distPriceNum: pricing.distPrice,
        compareAt: pricing.msrp > 0 ? `$${pricing.msrp.toFixed(2)}` : '',
        compareAtNum: pricing.msrp,
        stock: t.stock || '',
        tireSize: t.size || '',
        tireWidth,
        tireAspect,
        rimDiameter: tireRim,
        rimWidth: null,
        boltPattern: '',
        offset: null,
        hubBore: null,
        finish: '',
      });
    }
    console.log(`  → ${tireCount} unique tires`);
  }

  console.log(`\nTotal products: ${products.length}`);
  console.log(`SKU mappings: ${skuMap.length}`);

  // ─── Build fitment (convert Sets to arrays) ───
  const fitment = {};
  for (const [gtaId, vehicles] of Object.entries(fitmentMap)) {
    fitment[gtaId] = Array.from(vehicles);
  }

  // ─── Build vehicle tree ───
  const vehicleTree = loadJSON('alltire-wheel-tree.json');
  let vehicles = vehicleTree || {};

  // ─── Build stats ───
  const brands = {}, types = {}, finishes = {}, diameters = {};
  products.forEach(p => {
    if (p.wheelType) types[p.wheelType] = (types[p.wheelType] || 0) + 1;
    if (p.finish) finishes[p.finish] = (finishes[p.finish] || 0) + 1;
    if (p.rimDiameter) diameters[p.rimDiameter] = (diameters[p.rimDiameter] || 0) + 1;
    if (p.brand) brands[p.brand] = (brands[p.brand] || 0) + 1;
  });

  const yearCount = Object.keys(vehicles).length;
  let makeCount = 0, modelCount = 0;
  for (const y of Object.keys(vehicles)) {
    makeCount += Object.keys(vehicles[y]).length;
    for (const mk of Object.keys(vehicles[y])) {
      modelCount += Array.isArray(vehicles[y][mk]) ? vehicles[y][mk].length : Object.keys(vehicles[y][mk]).length;
    }
  }

  const stats = {
    totalProducts: products.length,
    totalFitments: Object.values(fitment).reduce((s, v) => s + v.length, 0),
    years: yearCount,
    makes: makeCount,
    models: modelCount,
    byType: types,
    byBrand: brands,
    byDiameter: diameters,
    topFinishes: Object.entries(finishes).sort((a, b) => b[1] - a[1]).slice(0, 20),
    priceRange: {
      min: products.filter(p => p.priceNum > 0).reduce((min, p) => Math.min(min, p.priceNum), Infinity),
      max: products.reduce((max, p) => Math.max(max, p.priceNum), 0),
    },
    lastUpdated: new Date().toISOString(),
  };

  // ─── Save internal DB (not public) ───
  console.log('\nSaving internal database...');
  saveJSON(pathMod.join(DATA_DIR, 'gta-products.json'), products, true);
  saveJSON(pathMod.join(DATA_DIR, 'gta-sku-map.json'), skuMap, true);

  // ─── Save public data (no supplier info) ───
  console.log('\nSaving public data...');
  // Strip any internal fields before saving public version
  const publicProducts = products.map(p => {
    const pub = { ...p };
    // These are clean already — no supplier field in the product
    return pub;
  });

  saveJSON(pathMod.join(OUT_DIR, 'products.json'), publicProducts);
  saveJSON(pathMod.join(OUT_DIR, 'fitment.json'), fitment);
  saveJSON(pathMod.join(OUT_DIR, 'vehicles.json'), vehicles);
  saveJSON(pathMod.join(OUT_DIR, 'stats.json'), stats);

  // ─── Summary ───
  console.log('\n=== Summary ===');
  console.log(`Products: ${products.length} (GTA-W-0001 to GTA-W-${String(products.length).padStart(4, '0')})`);
  console.log(`Brands: ${JSON.stringify(brands)}`);
  console.log(`Images copied to: ${IMG_PUB_DIR}`);
  console.log(`Internal DB: data/gta-products.json, data/gta-sku-map.json`);
  console.log(`Public data: webapp/public/data/`);

  // Verify no supplier leaks
  const pubStr = JSON.stringify(publicProducts);
  const leaks = ['alltire', 'superspeed', 'rwc', 'gpibtob', 'super-speed'].filter(s => pubStr.toLowerCase().includes(s));
  if (leaks.length > 0) {
    console.log(`\n⚠ SUPPLIER LEAKS FOUND: ${leaks.join(', ')}`);
  } else {
    console.log('\n✓ No supplier names in public data');
  }
}

buildDatabase();
