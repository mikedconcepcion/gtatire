// Build Superspeed wheel fitment via AAIA. Walks AAIA's tree
// (Years -> Manufacturers -> Models -> BodyTypes -> SubModelsWheels) and
// calls GetAllWheelsUpstep per chassis. Wheels returned by AAIA are matched
// to our local Superspeed catalog by (brand, model, diameter, width, ET, PCD, CB).

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

const CRED = 'username=SuperSpeed&securityToken=c30c25a493d0433e987d9d9c78b5492c';
const BASE = 'https://api.driverightdata.com/eu/api';
const DIST = 'Wheel%20Tech%20Group';
const REGION = '2';
const MIN_YEAR = 2012;

async function fetchJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return [];
    const txt = await res.text();
    if (txt.startsWith('{') && !txt.startsWith('{"')) return [];  // error envelope
    try { return JSON.parse(txt); } catch { return []; }
  } catch { return []; }
}

const aaia = (ep, params) => {
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return fetchJson(`${BASE}/aaia/${ep}?${CRED}&${qs}`);
};
const upstep = cid => fetchJson(`${BASE}/wheel-data/GetAllWheelsUpstep?${CRED}&distributor=${DIST}&chassisId=${cid}`);

async function pool(items, fn, concurrency = 8) {
  let i = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      await fn(items[idx], idx);
    }
  }));
}

function normBrand(b) {
  // Strip generic "Wheels"/"Forged" suffix differences and special chars so that
  // AAIA's "Superspeed Wheels" matches our catalog's "Superspeed", etc.
  let s = (b || '').toLowerCase().trim();
  s = s.replace(/\s+wheels?$/, '');           // "Superspeed Wheels" -> "superspeed"
  s = s.replace(/[+\s\-]/g, '');               // strip whitespace, +, -
  if (s === 'oe' || s === 'oeplus') return 'oeplus';
  if (s === 'oeforged' || s === 'oeplusforged') return 'oeplusforged';
  if (s === 'superspeedforged') return 'superspeedforged';
  return s;
}
// Treat hyphen and whitespace as same separator so "EVO-FF" matches "EVO FF".
const normModel = m => (m || '').toLowerCase().trim().replace(/[\-\s]+/g, ' ');

(async () => {
  console.log('=== SUPERSPEED FITMENT VIA AAIA ===\n');
  const ssRaw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'superspeed-wheels-raw.json'), 'utf8'));
  const catalog = ssRaw.List;
  console.log(`Catalog: ${catalog.length} wheels`);

  // Spec index for matching
  const specIndex = new Map();
  for (const w of catalog) {
    const key = [
      normBrand(w.BRAND),
      normModel(w.MODEL),
      String(w.DIAMETER),
      String(w.WIDTH),
      String(w.ET),
      String(w.PCD || '').replace(/\s/g, ''),
      String(w.CB || ''),
    ].join('|');
    if (!specIndex.has(key)) specIndex.set(key, []);
    specIndex.get(key).push(w.SKU);
  }
  console.log(`Spec keys: ${specIndex.size}\n`);

  // 1) Years
  const yrs = (await aaia('GetAAIAYears', {})).map(y => y.Year).filter(y => parseInt(y) >= MIN_YEAR);
  console.log(`Years (>=${MIN_YEAR}): ${yrs.join(', ')}`);

  // 2) For each year, get manufacturers
  const yrMakes = [];
  for (const y of yrs) {
    const mans = await aaia('GetAAIAManufacturers', { year: y, regionID: REGION });
    for (const m of mans) yrMakes.push({ year: y, make: m.Manufacturer });
  }
  console.log(`Year/make combos: ${yrMakes.length}`);

  // 3) For each year+make, get models
  const yrMkModels = [];
  await pool(yrMakes, async ({ year, make }) => {
    const models = await aaia('GetAAIAModels', { year, regionID: REGION, manufacturer: make });
    for (const md of models) yrMkModels.push({ year, make, model: md.Model });
  }, 8);
  console.log(`Year/make/model combos: ${yrMkModels.length}`);

  // 4) For each year+make+model, get body types
  const ymmBt = [];
  let stepStart = Date.now();
  await pool(yrMkModels, async ({ year, make, model }, i) => {
    const bts = await aaia('GetAAIABodyTypes', { year, regionID: REGION, manufacturer: make, model });
    for (const bt of bts) ymmBt.push({ year, make, model, bodyType: bt.BodyType });
    if ((i + 1) % 250 === 0) console.log(`  bodyTypes ${i + 1}/${yrMkModels.length} (${ymmBt.length} so far, ${((Date.now() - stepStart)/1000).toFixed(0)}s)`);
  }, 10);
  console.log(`Year/make/model/body combos: ${ymmBt.length}`);

  // 5) SubModelsWheels -> collect unique chassis IDs (with vehicle context)
  const chassisToVehicles = new Map(); // chassisId -> Set of "year|MAKE|MODEL"
  stepStart = Date.now();
  await pool(ymmBt, async (x, i) => {
    const subs = await aaia('GetAAIASubModelsWheels', {
      year: x.year, regionID: REGION, manufacturer: x.make, model: x.model, bodyType: x.bodyType,
    });
    const vehKey = `${x.year}|${x.make.toUpperCase()}|${x.model.toUpperCase()}`;
    for (const s of subs) {
      if (!s.DRChassisID) continue;
      if (!chassisToVehicles.has(s.DRChassisID)) chassisToVehicles.set(s.DRChassisID, new Set());
      chassisToVehicles.get(s.DRChassisID).add(vehKey);
    }
    if ((i + 1) % 250 === 0) console.log(`  subModels ${i + 1}/${ymmBt.length} (${chassisToVehicles.size} unique chassis, ${((Date.now() - stepStart)/1000).toFixed(0)}s)`);
  }, 10);
  console.log(`Unique chassis IDs: ${chassisToVehicles.size}`);

  // 6) For each chassis, fetch wheels and match to catalog
  const chassisIds = [...chassisToVehicles.keys()];
  const skuToVehicles = new Map();
  const wheelsByChassis = {};  // chassisId -> [raw AAIA wheels] (persisted for re-matching)
  let matchHits = 0;
  stepStart = Date.now();
  await pool(chassisIds, async (cid, i) => {
    const wheels = await upstep(cid);
    wheelsByChassis[cid] = wheels;
    const vehs = chassisToVehicles.get(cid);
    for (const w of wheels) {
      const widthMatch = String(w.WheelSize || '').match(/^(\d+(?:\.\d+)?)\s*x/);
      const diaMatch = String(w.WheelSize || '').match(/x\s*(\d+(?:\.\d+)?)/);
      const key = [
        normBrand(w.Brand),
        normModel(w.ProdName),
        diaMatch?.[1] || '',
        widthMatch?.[1] || '',
        String(w.Et || ''),
        String(w.Pcd1 || '').replace(/\s/g, ''),
        String(w.BoreMax || ''),
      ].join('|');
      const skus = specIndex.get(key) || [];
      for (const sku of skus) {
        if (!skuToVehicles.has(sku)) skuToVehicles.set(sku, new Set());
        for (const v of vehs) skuToVehicles.get(sku).add(v);
        matchHits++;
      }
    }
    if ((i + 1) % 250 === 0) console.log(`  upstep ${i + 1}/${chassisIds.length} (${matchHits} catalog hits, ${skuToVehicles.size} unique SKUs matched, ${((Date.now() - stepStart)/1000).toFixed(0)}s)`);
  }, 10);

  // 7) Save fitment map + raw chassis cache (so we can re-match without rescrape)
  const out = {};
  for (const [sku, set] of skuToVehicles) out[sku] = [...set];
  const outPath = path.join(DATA_DIR, 'superspeed-fitment-map.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\nDone. ${skuToVehicles.size}/${catalog.length} Superspeed SKUs got fitment entries.`);
  console.log(`Wrote ${outPath}`);

  // Persist chassis→wheels cache for future re-matching (no rescrape needed)
  const cacheOut = {
    chassisToVehicles: Object.fromEntries([...chassisToVehicles].map(([k, v]) => [k, [...v]])),
    wheelsByChassis,
  };
  const cachePath = path.join(DATA_DIR, 'aaia-chassis-cache.json');
  fs.writeFileSync(cachePath, JSON.stringify(cacheOut, null, 2));
  console.log(`Wrote chassis cache to ${cachePath}`);
})();
