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
const sqliteDb = require('./lib/db');

const DATA_DIR = pathMod.join(__dirname, '..', 'data');
const OUT_DIR = pathMod.join(__dirname, '..', 'webapp', 'public', 'data');
const IMG_SRC_DIR = pathMod.join(__dirname, '..', 'data', 'images');
const IMG_PUB_DIR = pathMod.join(OUT_DIR, 'images', 'wheels');

// Image URLs in products.json are absolute jsDelivr CDN URLs so they load
// from GitHub directly — no Cloudflare bandwidth, and a catalogue update
// (re-scrape + git push) propagates without a Cloudflare rebuild.
const CDN_BASE = process.env.CDN_BASE
  || 'https://cdn.jsdelivr.net/gh/mikedconcepcion/gtatire@cloudflare-migration/webapp/public';
const cdn = (p) => p ? `${CDN_BASE}${p.startsWith('/') ? p : '/' + p}` : '';

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

// Build a deterministic, URL-safe product ID from the supplier name + the
// supplier's own SKU. Each supplier has a distinct SKU format so the prefix
// (a-/s-/r-) prevents collisions and signals provenance:
//   alltire    -> a-{sku}           e.g. a-x47564
//   superspeed -> s-{sku}           e.g. s-76rr18085355100mb
//   rwc        -> r-{sku}           e.g. r-rw70170a5144564-1
// Re-running the build produces the same IDs for the same supplier SKUs, so
// /wheels/{id} URLs stay stable across rebuilds (unlike the old GTA-W-XXXX
// counter which reshuffled on every run).
const SUPPLIER_PREFIX = { alltire: 'a', superspeed: 's', rwc: 'r' };
function productIdFor(supplier, supplierSku) {
  const prefix = SUPPLIER_PREFIX[supplier];
  if (!prefix) throw new Error(`Unknown supplier: ${supplier}`);
  // Lowercase, replace anything that isn't url-safe (. / etc.) with a dash,
  // collapse repeated dashes. Keep alphanumerics and dashes only.
  const safe = String(supplierSku)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${prefix}-${safe}`;
}

// Brand-name normalization. Alltire's tire feed sometimes ships UPPER and
// sometimes "Hankook" / "HANKOOk" / "Hankook " — fold to a single canonical
// Title Case form so filters don't show duplicates.
function normalizeBrand(b) {
  if (!b) return '';
  const trimmed = String(b).trim();
  if (!trimmed) return '';
  // Preserve known stylized names; otherwise Title Case
  const PRESERVE = {
    'OE+': 'OE+', 'OE+ FORGED': 'OE+ Forged',
    'BFGOODRICH': 'BFGoodrich',
    'RWC': 'RWC',
    'SUPERSPEED FORGED': 'Superspeed Forged',
  };
  const up = trimmed.toUpperCase();
  if (PRESERVE[up]) return PRESERVE[up];
  // Title Case: first letter upper, rest lower, per whitespace-separated word
  return up.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
}

// Map gpibtob.com's RWC stock signal to a normalized customer-facing label
// that ProductCard understands without further interpretation:
//   "In Stock"        -> "In Stock"  (green badge)
//   "No Stock"        -> "Out of Stock"  (red badge — ProductCard regex hit)
//   "Call For Stock"  -> "Contact for stock"  (neutral — ambiguous state)
//   anything else     -> "Contact for stock"
function rwcStockLabel(raw) {
  const s = (raw || '').trim().toLowerCase();
  if (s === 'in stock') return 'In Stock';
  if (s === 'no stock' || s.includes('out of stock')) return 'Out of Stock';
  if (s === 'call for stock' || s.includes('contact')) return 'Contact for stock';
  return raw || 'Contact for stock';
}

// Map Superspeed's raw INVENTORY+ETA pair to a customer-friendly stock label.
// Source data variants we collapse:
//   - "Discontinue" / "Discontinued"       -> Discontinued
//   - "Phase-Out" / "Phase Out"            -> Discontinued
//   - "In Production" / "NEW - In Prod..." -> Available on Backorder
//   - "N/A" / "" (empty) with INV=0        -> Special Order
//   - "84 | 05-15 ON" (qty | restock-date) -> Available on Backorder (mm-dd)
// In-stock counts pass through as before so customer cards show specific
// numbers when inventory is low.
function superspeedStockLabel(inventory, eta) {
  if (inventory > 20) return '20+ In Stock';
  if (inventory > 0) return `${inventory} In Stock`;

  const raw = (eta || '').trim();
  if (!raw) return 'Special Order';

  const lower = raw.toLowerCase();
  if (lower.startsWith('discontinu') || lower.startsWith('phase')) return 'Discontinued';
  if (lower.includes('in production')) return 'Available on Backorder';
  if (lower === 'n/a') return 'Special Order';

  // Batch-restock pattern: "QTY | MM-DD ON" — surface the restock date only.
  const batchMatch = raw.match(/\|\s*(\d{2}-\d{2})/);
  if (batchMatch) return `Available on Backorder (${batchMatch[1]})`;

  return 'Special Order';
}

// Parse wheel description for specs
function parseWheelDescription(desc) {
  const specs = {};
  // Alltire alloy descriptions follow "MODEL[_FINISH] dim x dim ...".
  // The model token can span multiple words ("BLACK WIDOW") or include digits
  // ("SW05", "V20"). It always terminates at the underscore that introduces
  // the finish. So we match from start up to (but not including) the first
  // underscore, allowing letters, digits, and inner spaces.
  const nameMatch = desc.match(/^([A-Z][A-Za-z0-9\s]*?)_/);
  if (nameMatch) specs.name = nameMatch[1].trim();
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

// Pricing: public price = MSRP (no auto-discount). The 10% discount is
// granted manually via referral code at the inquiry stage, so the storefront
// shows the honest "list" price without a fake strikethrough. Distributors
// still see their wholesale price via PriceDisplay (auth-gated).
function calcPricing(msrp, dealerCost) {
  const publicPrice = msrp > 0 ? Math.round(msrp * 100) / 100 : 0;
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

// Normalize vehicle keys so AAIA's naming (e.g. "TESLA|Y", "MERCEDES-BENZ",
// "DURANGO (AWD / FWD)") matches Alltire's (e.g. "TESLA|MODEL Y", "MERCEDES",
// "DURANGO"). Three jobs:
//   1) Tesla 1-2 char models get the "MODEL " prefix.
//   2) "Mercedes-Benz" -> "Mercedes" (Alltire's convention).
//   3) Strip parenthetical suffixes from models. AAIA returns sub-trim
//      variants like "(AWD / FWD)" and "(EXCL. SPORT BREMBO)" — the slashes
//      and periods break Astro's [year]/[make]/[model] dynamic route and
//      the trim distinction isn't useful for our fitment-by-spec model.
function normalizeVehicleKey(key) {
  const parts = key.split('|');
  if (parts.length !== 3) return key;
  let [year, make, model] = parts;
  // RWC's portal exposes mid-cycle refresh years like "2017.5" (Jeep Compass
  // redesign). One vehicle isn't worth its own dropdown bucket, so fold it
  // into the integer year.
  if (/\.\d+$/.test(year)) year = year.split('.')[0];
  if (make === 'MERCEDES-BENZ') make = 'MERCEDES';
  if (make === 'TESLA' && /^[A-Z0-9]{1,2}$/.test(model)) model = `MODEL ${model}`;
  // Strip parenthetical suffixes, replace any remaining route-breaking chars
  // (slash, backslash, hash, question mark), collapse whitespace.
  model = model
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/[/\\#?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${year}|${make}|${model}`;
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
      // Alltire's catalog has inconsistent casing — same SKU appears as both
      // "X46205" and "x46205" with identical specs and image. Dedup by the
      // case-folded ID so the two collapse into one product (the URL is
      // lowercase anyway, so this is the canonical form).
      const supplierSku = raw.productNo;
      const dedupKey = String(supplierSku).toLowerCase();
      const vehicleKey = normalizeVehicleKey(`${raw.vehicleYear}|${raw.vehicleMake}|${raw.vehicleModel}`);

      // Track fitment
      let gtaId;
      if (seen.has(dedupKey)) {
        gtaId = seen.get(dedupKey);
        if (!fitmentMap[gtaId]) fitmentMap[gtaId] = new Set();
        fitmentMap[gtaId].add(vehicleKey);
        continue;
      }

      gtaId = productIdFor('alltire', supplierSku);
      seen.set(dedupKey, gtaId);
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

      // Alltire brand: Steel wheels are generic. For alloys, the supplier
      // doesn't expose a brand field anywhere (no Maker column on wheel
      // search, no detail page — confirmed via probe-alltire-detail.js).
      // The model name (CONTOUR, BLACK WIDOW, SW05, etc., all distributed
      // through Macpek) is the best brand-like label available. Falls back
      // to "Macpek" only when description doesn't fit the MODEL_FINISH
      // pattern. Compare to the descriptions: groups like "BLACK WIDOW",
      // "MINI BAJA", "SW05" should land in their own buckets, not be
      // truncated to just the first word.
      const alltireBrand = raw.wheelType === 'Steel Wheel'
        ? normalizeBrand('Steel')
        : (specs.name ? normalizeBrand(specs.name) : normalizeBrand('Macpek'));

      products.push({
        id: gtaId,
        sku: gtaId,
        productNo: supplierSku,
        category: 'wheel',
        brand: alltireBrand,
        wheelType: raw.wheelType || '',
        name: specs.name || raw.description?.split(' ')[0] || '',
        description: raw.description || '',
        image: newImgName ? cdn(`/data/images/wheels/${newImgName}`) : '',
        price: pricing.publicPrice > 0 ? `$${pricing.publicPrice.toFixed(2)}` : '',
        priceNum: pricing.publicPrice,
        distPrice: pricing.distPrice > 0 ? `$${pricing.distPrice.toFixed(2)}` : '',
        distPriceNum: pricing.distPrice,
        compareAt: '',
        compareAtNum: 0,
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
  // AAIA-derived fitment: { Superspeed SKU -> ["YEAR|MAKE|MODEL", ...] }
  const ssFitment = loadJSON('superspeed-fitment-map.json') || {};
  if (ssRaw && ssRaw.List) {
    console.log(`Superspeed: ${ssRaw.List.length} raw entries (fitment map has ${Object.keys(ssFitment).length} SKUs)`);
    let count = 0;

    for (const w of ssRaw.List) {
      if (!w.SKU) continue;
      const gtaId = productIdFor('superspeed', w.SKU);
      count++;

      // Attach AAIA fitment if available for this SKU (normalize Tesla / Mercedes naming)
      const fits = ssFitment[w.SKU];
      if (fits && fits.length > 0) {
        fitmentMap[gtaId] = new Set(fits.map(normalizeVehicleKey));
      }

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
        if (extraImgName) extraImages.push(cdn(`/data/images/wheels/${extraImgName}`));
      }

      const stockText = superspeedStockLabel(w.INVENTORY, w.ETA);

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
        productNo: w.SKU,
        category: 'wheel',
        brand: normalizeBrand(w.BRAND || 'Superspeed'),
        wheelType: 'Alloy Wheel',
        name: w.MODEL || '',
        description: `${w.MODEL} ${w.DIAMETER}x${w.WIDTH} ${w.PCD} ET${w.ET} CB${w.CB} ${w.FINISH}`,
        image: newImgName ? cdn(`/data/images/wheels/${newImgName}`) : '',
        images: extraImages.length > 0 ? extraImages : undefined,
        price: pricing.publicPrice > 0 ? `$${pricing.publicPrice.toFixed(2)}` : '',
        priceNum: pricing.publicPrice,
        distPrice: pricing.distPrice > 0 ? `$${pricing.distPrice.toFixed(2)}` : '',
        distPriceNum: pricing.distPrice,
        compareAt: '',
        compareAtNum: 0,
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
  // Real MSRPs from detail-page scrape (scrape-rwc-msrp.js). Keyed by sku.
  // When present, drives both the public price calc AND the compareAt
  // strikethrough. Without it we fall back to a cost*1.6 estimate for the
  // pricing math but leave compareAt empty (no fake strikethrough).
  const rwcMsrp = loadJSON('rwc-msrp.json') || {};
  if (rwcRaw && Array.isArray(rwcRaw)) {
    console.log(`RWC: ${rwcRaw.length} raw entries (real MSRP: ${Object.keys(rwcMsrp).length})`);
    let count = 0;

    for (const w of rwcRaw) {
      if (!w.sku) continue;
      const gtaId = productIdFor('rwc', w.sku);
      count++;

      const dc = w.cost || 0;
      const realMsrp = rwcMsrp[w.sku] || 0;
      const estMsrp = dc > 0 ? Math.round(dc * 1.6 * 100) / 100 : 0;
      const msrpForCalc = realMsrp > 0 ? realMsrp : estMsrp;
      const pricing = calcPricing(msrpForCalc, dc);

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

      // Add RWC fitment if available — normalize to uppercase MAKE|MODEL
      // to match Alltire's convention so vehicle search merges them.
      if (w.fitment && w.fitment.length > 0) {
        fitmentMap[gtaId] = new Set();
        for (const f of w.fitment) {
          const make = (f.make || '').toUpperCase();
          const model = (f.model || '').toUpperCase();
          fitmentMap[gtaId].add(normalizeVehicleKey(`${f.year}|${make}|${model}`));
        }
      }

      // Strip the leading "RWC " supplier-prefix from the public-facing name
      // and description. 703 of 964 products didn't match the structured name
      // regex, so they were carrying the prefix into the listing card title.
      const cleanName = (w.modelCode1 || (w.name || '').replace(/^RWC\s+/i, '')) || '';
      const cleanDescription = (w.name || '').replace(/^RWC\s+/i, '');

      products.push({
        id: gtaId,
        sku: gtaId,
        productNo: w.sku,
        category: 'wheel',
        brand: normalizeBrand('RWC'),
        wheelType: 'Alloy Wheel',
        name: cleanName,
        description: cleanDescription,
        image: newImgName ? cdn(`/data/images/wheels/${newImgName}`) : '',
        price: pricing.publicPrice > 0 ? `$${pricing.publicPrice.toFixed(2)}` : '',
        priceNum: pricing.publicPrice,
        distPrice: pricing.distPrice > 0 ? `$${pricing.distPrice.toFixed(2)}` : '',
        distPriceNum: pricing.distPrice,
        // compareAt shows ONLY when we have a real scraped MSRP for this
        // product. No fake strikethroughs (cost*1.6 estimate is for pricing
        // math only, never displayed).
        compareAt: '',
        compareAtNum: 0,
        // Stock comes from the listing page (`.rating span`) — normalized
        // to In Stock / Out of Stock / Contact for stock. Captured by
        // update-rwc-stock.js.
        stock: rwcStockLabel(w.stock),
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
      const dedupKey = String(t.productNo).toLowerCase();
      if (seen.has(dedupKey)) continue;
      seen.set(dedupKey, true);

      const gtaId = productIdFor('alltire', t.productNo);
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
        productNo: t.productNo,
        category: 'tire',
        brand: normalizeBrand(t.maker || ''),
        wheelType: t.type || 'All Season',
        name: t.model || '',
        description: t.description || '',
        image: tireImgName ? cdn(`/data/images/tires/${tireImgName}`) : '',
        price: pricing.publicPrice > 0 ? `$${pricing.publicPrice.toFixed(2)}` : '',
        priceNum: pricing.publicPrice,
        distPrice: pricing.distPrice > 0 ? `$${pricing.distPrice.toFixed(2)}` : '',
        distPriceNum: pricing.distPrice,
        compareAt: '',
        compareAtNum: 0,
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

  // ─── Spec-based fitment augmentation ───
  // Instead of relying solely on each supplier's year/make/model index, derive
  // each vehicle's OE wheel specs (PCD, CB, diameter) and match every catalog
  // wheel that physically fits. Sources for vehicle→specs:
  //   1. AAIA chassis cache (authoritative aftermarket fitment data)
  //   2. Existing Alltire OE fitment (each Alltire wheel's specs imply vehicle specs)
  // Then every wheel in the catalog (any supplier) that matches a vehicle's
  // (PCD|CB|diameter) tuple gets added to that vehicle's fitment.
  console.log('\n=== Spec-based fitment augmentation ===');
  const productsById = new Map(products.map(p => [p.id, p]));

  // vehicleKey -> Set of "PCD|CB|diameter"
  const vehicleSpecs = new Map();
  function addSpec(vehicleKey, pcd, cb, dia) {
    if (!pcd || !cb || !dia) return;
    const spec = `${pcd}|${cb}|${dia}`;
    if (!vehicleSpecs.has(vehicleKey)) vehicleSpecs.set(vehicleKey, new Set());
    vehicleSpecs.get(vehicleKey).add(spec);
  }

  // Source 1: AAIA chassis cache
  const aaia = loadJSON('aaia-chassis-cache.json');
  if (aaia && aaia.chassisToVehicles && aaia.wheelsByChassis) {
    let aaiaSpecs = 0;
    for (const [chassisId, wheels] of Object.entries(aaia.wheelsByChassis)) {
      const vehicles = (aaia.chassisToVehicles[chassisId] || []).map(normalizeVehicleKey);
      for (const w of wheels) {
        const dia = String(w.WheelSize || '').match(/x\s*(\d+(?:\.\d+)?)/)?.[1] || '';
        const pcd = String(w.Pcd1 || '').replace(/\s/g, '');
        const cb = String(w.BoreMax || '');
        for (const v of vehicles) {
          addSpec(v, pcd, cb, dia);
          aaiaSpecs++;
        }
      }
    }
    console.log(`  AAIA: ${aaia.chassisToVehicles ? Object.keys(aaia.chassisToVehicles).length : 0} chassis → ${aaiaSpecs} spec entries`);
  }

  // Source 2: existing Alltire/RWC/Superspeed fitment in fitmentMap — derive specs from products
  let derivedFromExisting = 0;
  for (const [gtaId, vehicleSet] of Object.entries(fitmentMap)) {
    const p = productsById.get(gtaId);
    if (!p || p.category !== 'wheel') continue;
    const pcd = (p.boltPattern || '').replace(/\s/g, '');
    const cb = String(p.hubBore || '');
    const dia = String(p.rimDiameter || '');
    for (const v of vehicleSet) {
      addSpec(v, pcd, cb, dia);
      derivedFromExisting++;
    }
  }
  console.log(`  From existing fitment: ${derivedFromExisting} spec entries derived (${vehicleSpecs.size} unique vehicles total)`);

  // Match every catalog wheel to vehicle specs
  let addedFitments = 0;
  let productsExpanded = 0;
  for (const p of products) {
    if (p.category !== 'wheel') continue;
    const pcd = (p.boltPattern || '').replace(/\s/g, '');
    const cb = String(p.hubBore || '');
    const dia = String(p.rimDiameter || '');
    if (!pcd || !cb || !dia || cb === 'null' || cb === '0') continue;
    const spec = `${pcd}|${cb}|${dia}`;

    const before = fitmentMap[p.id]?.size || 0;
    for (const [vehicleKey, specs] of vehicleSpecs) {
      if (specs.has(spec)) {
        if (!fitmentMap[p.id]) fitmentMap[p.id] = new Set();
        fitmentMap[p.id].add(vehicleKey);
      }
    }
    const after = fitmentMap[p.id]?.size || 0;
    if (after > before) {
      addedFitments += (after - before);
      productsExpanded++;
    }
  }
  console.log(`  Spec match added ${addedFitments} fitment entries to ${productsExpanded} products`);
  console.log(`  Total products with fitment: ${Object.keys(fitmentMap).length}`);

  // ─── Build fitment (convert Sets to arrays) ───
  const fitment = {};
  for (const [gtaId, vehicles] of Object.entries(fitmentMap)) {
    fitment[gtaId] = Array.from(vehicles);
  }

  // ─── Build vehicle tree from normalized fitmentMap ───
  // Sole source of truth: any vehicle a customer can find wheels for should
  // appear in the dropdown / static-page generation. Building from fitmentMap
  // (which already uses normalized keys) avoids the dupe entries we'd get if
  // we started from Alltire's raw tree (e.g. TESLA|3 vs TESLA|MODEL 3).
  const vehicles = {};
  for (const [gtaId, vehicleSet] of Object.entries(fitmentMap)) {
    const p = productsById.get(gtaId);
    if (!p || p.category !== 'wheel') continue;
    const dia = p.rimDiameter;
    if (!dia) continue;
    for (const vk of vehicleSet) {
      const [year, make, model] = vk.split('|');
      if (!year || !make || !model) continue;
      if (!vehicles[year]) vehicles[year] = {};
      if (!vehicles[year][make]) vehicles[year][make] = {};
      if (!vehicles[year][make][model]) vehicles[year][make][model] = [];
      const arr = vehicles[year][make][model];
      const s = String(dia);
      if (!arr.includes(s)) arr.push(s);
    }
  }
  // Sort diameters numerically
  for (const y of Object.keys(vehicles)) {
    for (const mk of Object.keys(vehicles[y])) {
      for (const md of Object.keys(vehicles[y][mk])) {
        vehicles[y][mk][md].sort((a, b) => parseInt(a) - parseInt(b));
      }
    }
  }
  let totalYMM = 0;
  for (const y of Object.keys(vehicles)) {
    for (const mk of Object.keys(vehicles[y])) totalYMM += Object.keys(vehicles[y][mk]).length;
  }
  console.log(`Vehicle tree: ${totalYMM} year/make/model combos`);

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

  // ─── Build cross-reference: tire ↔ wheel by rim diameter ───
  console.log('\nBuilding cross-reference...');
  const crossRef = {};

  // Index wheels by rim diameter + bolt pattern
  const wheelsByRim = {};
  const tiresByRim = {};

  for (const p of products) {
    if (!p.rimDiameter) continue;
    const rim = p.rimDiameter;
    if (p.category === 'wheel') {
      if (!wheelsByRim[rim]) wheelsByRim[rim] = [];
      wheelsByRim[rim].push({ id: p.id, name: p.name, brand: p.brand, boltPattern: p.boltPattern, priceNum: p.priceNum, image: p.image });
    } else if (p.category === 'tire') {
      if (!tiresByRim[rim]) tiresByRim[rim] = [];
      tiresByRim[rim].push({ id: p.id, name: p.name, brand: p.brand, tireSize: p.tireSize, type: p.wheelType, priceNum: p.priceNum, image: p.image });
    }
  }

  // For each rim diameter, pick top tires and wheels for quick display
  for (const rim of Object.keys(wheelsByRim)) {
    if (!crossRef[rim]) crossRef[rim] = {};
    // Top 6 tires sorted by price (in stock preferred)
    const tires = (tiresByRim[rim] || []).sort((a, b) => a.priceNum - b.priceNum).slice(0, 20);
    const wheels = (wheelsByRim[rim] || []).sort((a, b) => a.priceNum - b.priceNum).slice(0, 20);
    crossRef[rim] = { tires, wheels };
  }

  // Also build tire fitment from scraped data if available
  const tireFitment = loadJSON('alltire-tire-fitment.json');
  const vehicleTireSizes = {};
  if (tireFitment) {
    for (const [key, data] of Object.entries(tireFitment)) {
      if (data.tireSizes && data.tireSizes.length > 0) {
        vehicleTireSizes[key] = {
          sizes: data.tireSizes,
          oeWheel: data.oeWheelSize,
        };
      }
    }
    console.log(`  Tire fitment: ${Object.keys(vehicleTireSizes).length} vehicles with OE tire sizes`);
  }

  console.log(`  Cross-ref rim sizes: ${Object.keys(crossRef).length}`);
  for (const rim of Object.keys(crossRef).sort((a, b) => a - b)) {
    const t = crossRef[rim].tires?.length || 0;
    const w = crossRef[rim].wheels?.length || 0;
    if (t > 0 || w > 0) process.stdout.write(`  ${rim}": ${w}W/${t}T  `);
  }
  console.log('');

  // ─── Save internal DB (not public) ───
  console.log('\nSaving internal database...');
  saveJSON(pathMod.join(DATA_DIR, 'gta-products.json'), products, true);
  saveJSON(pathMod.join(DATA_DIR, 'gta-sku-map.json'), skuMap, true);

  // ─── Mark placeholder images (tiny files = Alltire "no image" placeholders) ───
  // Image URLs are now absolute CDN paths, so derive the local path by
  // stripping the CDN_BASE prefix before checking size on disk.
  let noImageCount = 0;
  for (const p of products) {
    if (!p.image) { p.noImage = true; noImageCount++; continue; }
    const relPath = p.image.startsWith(CDN_BASE)
      ? p.image.slice(CDN_BASE.length)
      : p.image;
    const localPath = pathMod.join(__dirname, '..', 'webapp', 'public', relPath.replace(/^\//, ''));
    if (fs.existsSync(localPath)) {
      const size = fs.statSync(localPath).size;
      if (p.category === 'tire' && size < 10000) { p.noImage = true; noImageCount++; }
    }
  }
  console.log(`  Marked ${noImageCount} products with placeholder images`);

  // ─── SQLite: source-of-truth catalog ───
  // Populate data/gta.sqlite from the in-memory products/fitment. The static
  // site still consumes JSON snapshots (next block), but the DB is now the
  // queryable artifact for audits (`sqlite3 data/gta.sqlite "SELECT brand,
  // COUNT(*) FROM products GROUP BY brand ORDER BY 2 DESC"`).
  console.log('\nWriting SQLite catalog...');
  const db = sqliteDb.openDb();
  try {
    sqliteDb.createSchema(db);
    sqliteDb.truncateAll(db);
    sqliteDb.insertProducts(db, products, skuMap);
    sqliteDb.insertFitment(db, fitmentMap);
    if (Object.keys(vehicleTireSizes).length > 0) {
      sqliteDb.insertVehicleTireSizes(db, vehicleTireSizes);
    }
    sqliteDb.setMeta(db, 'last_built_at', new Date().toISOString());
    sqliteDb.setMeta(db, 'product_count', products.length);
    const s = sqliteDb.summary(db);
    console.log(`  → ${s.products} products, ${s.fitment} fitment rows, ${s.images} images`);
    console.log(`  → By supplier: ${s.bySupplier.map(r => `${r.supplier}=${r.n}`).join(', ')}`);
    console.log(`  → By category: ${s.byCategory.map(r => `${r.category}=${r.n}`).join(', ')}`);
    console.log(`  → Top brands: ${s.byBrand.slice(0, 10).map(r => `${r.brand}(${r.n})`).join(', ')}`);
  } finally {
    db.close();
  }

  // ─── Save public data (no supplier info) ───
  console.log('\nSaving public data...');
  const publicProducts = products.map(p => ({ ...p }));

  saveJSON(pathMod.join(OUT_DIR, 'products.json'), publicProducts);
  saveJSON(pathMod.join(OUT_DIR, 'fitment.json'), fitment);
  saveJSON(pathMod.join(OUT_DIR, 'vehicles.json'), vehicles);
  saveJSON(pathMod.join(OUT_DIR, 'stats.json'), stats);
  saveJSON(pathMod.join(OUT_DIR, 'cross-ref.json'), crossRef);
  if (Object.keys(vehicleTireSizes).length > 0) {
    saveJSON(pathMod.join(OUT_DIR, 'tire-fitment.json'), vehicleTireSizes);
  }

  // ─── Summary ───
  console.log('\n=== Summary ===');
  console.log(`Products: ${products.length} (supplier-prefixed IDs: a-/s-/r-)`);
  console.log(`Brands: ${JSON.stringify(brands)}`);
  console.log(`Images copied to: ${IMG_PUB_DIR}`);
  console.log(`Internal DB: data/gta-products.json, data/gta-sku-map.json`);
  console.log(`Public data: webapp/public/data/`);

  // Verify no supplier leaks. Only flag identifiers that are never legit brand
  // names — Superspeed and RWC are legitimate aftermarket brands, so we exclude
  // them. Alltire and gpibtob.com are pure supplier identifiers.
  const pubStr = JSON.stringify(publicProducts);
  const leaks = ['alltire', 'gpibtob'].filter(s => pubStr.toLowerCase().includes(s));
  if (leaks.length > 0) {
    console.log(`\n⚠ SUPPLIER LEAKS FOUND: ${leaks.join(', ')}`);
  } else {
    console.log('\n✓ No supplier names in public data');
  }
}

buildDatabase();
