// Scrape vehicle reference photos + fitment data from wheel-size.com.
// Pure HTTP — no browser, no login dance.
//
// For each YMM in webapp/public/data/vehicles.json:
//   1. GET /modifications/?make=X&year=Y&model=Z
//   2. Take the first modification's generation.bodies[0].image
//   3. Download the image to webapp/public/images/vehicles/
//   4. Save trim list + OE sizes alongside in vehicle-fitment-wsize.json
//
// Output:
//   webapp/public/images/vehicles/{year}-{MAKE}-{MODEL}.jpg
//   webapp/public/data/vehicle-images.json   { "YYYY|MAKE|MODEL": "/images/vehicles/..." }
//   webapp/public/data/vehicle-fitment-wsize.json  (bonus fitment data)
//
// Resumable + skips already-scraped.
// Rate-limit: 1 req/sec by default (conservative).

const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = process.env.WSIZE_KEY || 'dbb96d3e5698b3eb6bba12d5eecb0114';
const VEHICLES_PATH = path.join(__dirname, '..', 'webapp', 'public', 'data', 'vehicles.json');
const OUT_MANIFEST = path.join(__dirname, '..', 'webapp', 'public', 'data', 'vehicle-images.json');
const OUT_FITMENT = path.join(__dirname, '..', 'webapp', 'public', 'data', 'vehicle-fitment-wsize.json');
const IMAGES_DIR = path.join(__dirname, '..', 'webapp', 'public', 'images', 'vehicles');
const FAIL_LOG = path.join(__dirname, 'wsize-scrape-failures.json');

const REQ_DELAY_MS = parseInt(process.env.REQ_DELAY_MS || '700', 10);
const START_INDEX = parseInt(process.env.START_INDEX || '0', 10);
const LIMIT = parseInt(process.env.LIMIT || '99999', 10);

// Burst-then-pause quota strategy. wheel-size.com's free tier is ~100 API
// calls/hour. We burst BURST_SIZE calls fast (each YMM is typically 1 call,
// sometimes 2-3 with fuzzy-match fallbacks), then sleep until ~1hr after
// the burst started — letting the API quota window reset.
const BURST_SIZE = parseInt(process.env.BURST_SIZE || '90', 10);
const BURST_WINDOW_MS = parseInt(process.env.BURST_WINDOW_MS || String(3600 * 1000), 10);
const CLEAR_FAILURES = process.env.CLEAR_FAILURES === '1';

if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
if (CLEAR_FAILURES && fs.existsSync(FAIL_LOG)) {
  fs.unlinkSync(FAIL_LOG);
  console.log('Cleared failure log — entries will be retried.');
}

function safeFilename(year, make, model, ext = 'jpg') {
  const safe = s => String(s).replace(/[^a-zA-Z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `${year}-${safe(make)}-${safe(model)}.${ext}`;
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error(`Parse failed (${res.statusCode}): ${data.slice(0,200)}`)); }
      });
    }).on('error', reject);
  });
}

// ─── Burst quota state ──────────────────────────────────────────────────
let apiCalls = 0;
let burstStartTs = Date.now();

async function maybePauseForQuota(forced429 = false) {
  if (apiCalls < BURST_SIZE && !forced429) return;
  const elapsed = Date.now() - burstStartTs;
  // Sleep until 1hr after burst started, +60s buffer for clock drift.
  const wait = Math.max(0, BURST_WINDOW_MS - elapsed) + 60_000;
  if (wait > 0) {
    const mins = (wait / 60000).toFixed(1);
    const reason = forced429 ? '429 received' : `${apiCalls} burst calls used`;
    const resumeAt = new Date(Date.now() + wait).toISOString();
    console.log(`\n[pause] ${reason} — sleeping ${mins} min (resume ~${resumeAt})\n`);
    await sleep(wait);
  }
  apiCalls = 0;
  burstStartTs = Date.now();
}

// All API calls go through here so the burst counter stays accurate.
async function apiGetJson(url) {
  await maybePauseForQuota(false);
  const res = await getJson(url);
  apiCalls++;
  if (res.status === 429) {
    // Quota tripped mid-burst — back off immediately.
    await maybePauseForQuota(true);
  }
  return res;
}

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
      const f = fs.createWriteStream(dest);
      res.pipe(f);
      f.on('finish', () => f.close(() => resolve(dest)));
      f.on('error', reject);
    }).on('error', reject);
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function load(p, fallback) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : fallback; }
  catch (e) { return fallback; }
}
function save(p, data) { fs.writeFileSync(p, JSON.stringify(data, null, 2)); }

// wheel-size.com uses lowercase slugs. Most makes/models match if we lowercase
// and replace spaces with dashes. Some hand-crafted overrides for tricky names.
const MAKE_SLUG_OVERRIDES = {
  'MERCEDES-BENZ': 'mercedes-benz', 'MERCEDES-AMG': 'mercedes-amg',
  'ALFA ROMEO': 'alfa-romeo', 'AM GENERAL': 'am-general',
  'LAND ROVER': 'land-rover', 'ROLLS-ROYCE': 'rolls-royce',
  'ASTON MARTIN': 'aston-martin',
};
function makeSlug(m) {
  if (MAKE_SLUG_OVERRIDES[m]) return MAKE_SLUG_OVERRIDES[m];
  return m.toLowerCase().replace(/\s+/g, '-');
}
function modelSlug(m) {
  return m.toLowerCase().replace(/\s+/g, '-');
}
// Strip drivetrain / variant suffixes we add but wheel-size doesn't carry.
function stripVariantSuffix(m) {
  return m.replace(/\s+(AWD|FWD|RWD|4WD|2WD|4MATIC|QUATTRO|XDRIVE|x-?Drive|sDrive|SPORTBACK)\s*$/i, '').trim();
}

// Per-make slug rewrites for catalogues where our model names diverge from
// wheel-size's. BMW: trim codes (230i, 330e, M340i) → series (2-series,
// 3-series). Lexus: model+displacement (ES350, NX300H) → family (es, nx).
// Returns a slug candidate or null.
function customSlugOverride(make, model) {
  const m = String(model || '').toUpperCase();
  if (make === 'BMW') {
    // Pull the first digit after any optional "M" prefix. 230i → 2, M340i → 3.
    const series = m.match(/^M?(\d)\d\d/);
    if (series) return `${series[1]}-series`;
    // i3, i4, i7, i8, iX, X1-X7, Z4 already match wheel-size directly.
  }
  if (make === 'LEXUS') {
    // ES350 → es, NX300H → nx, IS300 → is, RX450HL → rx
    const family = m.match(/^([A-Z]{2})\d/);
    if (family) return family[1].toLowerCase();
  }
  if (make === 'PORSCHE') {
    // "718 BOXSTER" / "718 CAYMAN" — wheel-size lists the body separately.
    if (m.startsWith('718 ')) return m.slice(4).toLowerCase().replace(/\s+/g, '-');
  }
  if (make === 'MAZDA') {
    // "3 SPORT" → "3", "MX-5" already direct. Strip trailing word.
    if (m === '3 SPORT' || m === '3-SPORT') return '3';
  }
  if (make === 'TOYOTA' && m === 'GR SUPRA') return 'supra';
  return null;
}
// Cache the per-make/year model list so we don't re-fetch.
const modelListCache = {};
async function listModels(make, year) {
  const cacheKey = `${make}|${year}`;
  if (modelListCache[cacheKey]) return modelListCache[cacheKey];
  const url = `https://api.wheel-size.com/v2/models/?user_key=${API_KEY}&make=${encodeURIComponent(makeSlug(make))}&year=${year}`;
  const res = await apiGetJson(url).catch(() => ({ status: 0, body: null }));
  const list = (res.status === 200 && Array.isArray(res.body?.data)) ? res.body.data.map(m => m.slug) : [];
  modelListCache[cacheKey] = list;
  return list;
}
function fuzzyMatchModel(target, candidates) {
  const t = target.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (candidates.includes(t)) return t;
  // Tolerate hyphens/spaces removed
  const exact = candidates.find(c => c.replace(/[^a-z0-9]/g, '') === t);
  if (exact) return exact;
  // Prefix match: model starts with target slug (e.g. "rx-450h" vs "rx450hl")
  const prefix = candidates.find(c => c.replace(/[^a-z0-9]/g, '').startsWith(t.slice(0, Math.min(t.length, 5))));
  if (prefix) return prefix;
  // Substring containment
  return candidates.find(c => c.replace(/[^a-z0-9]/g, '').includes(t.slice(0, 4))) || null;
}

async function tryModifications(year, make, modelSlugStr) {
  const url = `https://api.wheel-size.com/v2/modifications/?user_key=${API_KEY}&make=${encodeURIComponent(makeSlug(make))}&year=${year}&model=${encodeURIComponent(modelSlugStr)}`;
  const res = await apiGetJson(url);
  if (res.status === 200 && Array.isArray(res.body?.data) && res.body.data.length > 0) return res.body.data;
  return null;
}

async function scrapeOne(year, make, model) {
  // 1. Exact slug from our YMM
  let mods = await tryModifications(year, make, modelSlug(model));
  let usedSlug = modelSlug(model);

  // 2. Strip drivetrain suffix (EQUINOX AWD -> EQUINOX, A4 QUATTRO -> A4)
  if (!mods) {
    const stripped = stripVariantSuffix(model);
    if (stripped !== model) {
      const s = modelSlug(stripped);
      mods = await tryModifications(year, make, s);
      if (mods) usedSlug = s;
    }
  }

  // 3. Per-make slug override — known catalogue divergences (BMW trim codes
  // → series, Lexus model+displacement → family, etc.). Try before the
  // fuzzy fallback so we don't burn an extra API call on listModels().
  if (!mods) {
    const override = customSlugOverride(make, model);
    if (override && override !== modelSlug(model)) {
      mods = await tryModifications(year, make, override);
      if (mods) usedSlug = override;
    }
  }

  // 4. Fuzzy match against wheel-size's actual model list
  if (!mods) {
    const list = await listModels(make, year);
    const candidate = fuzzyMatchModel(stripVariantSuffix(model), list);
    if (candidate && candidate !== modelSlug(model)) {
      mods = await tryModifications(year, make, candidate);
      if (mods) usedSlug = candidate;
    }
  }

  if (!mods) return { err: 'no modifications (slug mismatch?)', tried: modelSlug(model) };

  const first = mods[0];
  const bodies = first.generation && first.generation.bodies;
  const bodyImage = Array.isArray(bodies) && bodies[0] && bodies[0].image;
  if (!bodyImage) return { err: 'no body image', generation: first.generation && first.generation.name };

  return {
    imageUrl: bodyImage,
    usedSlug,
    fitment: {
      generation: first.generation && first.generation.name,
      generation_start: first.generation && first.generation.start,
      generation_end: first.generation && first.generation.end,
      bodies: (bodies || []).map(b => ({ name: b.name, image: b.image })),
      trims: mods.map(m => ({
        trim: m.trim, name: m.name,
        engine: m.engine && { fuel: m.engine.fuel, power_hp: m.engine.power && m.engine.power.hp },
        levels: m.trim_levels || [],
      })),
    },
  };
}

(async () => {
  const vehicles = load(VEHICLES_PATH, {});
  const all = [];
  for (const yr of Object.keys(vehicles)) {
    for (const mk of Object.keys(vehicles[yr])) {
      const modelObj = vehicles[yr][mk];
      const models = Array.isArray(modelObj) ? modelObj : Object.keys(modelObj);
      for (const md of models) all.push({ year: yr, make: mk, model: md });
    }
  }

  const manifest = load(OUT_MANIFEST, {});
  const fitments = load(OUT_FITMENT, {});
  const fails = load(FAIL_LOG, {});

  // Optional TARGET_FILE — path to a text file listing image filenames (one per
  // line, paths or basenames OK). Only YMMs matching those filenames are
  // processed. Used to scope re-scrapes (e.g. just the 966 silver-fill vehicles).
  let targetSet = null;
  if (process.env.TARGET_FILE && fs.existsSync(process.env.TARGET_FILE)) {
    const lines = fs.readFileSync(process.env.TARGET_FILE, 'utf-8').trim().split('\n');
    targetSet = new Set(lines.map(l => path.basename(l.trim()).replace(/\.(jpg|jpeg|png|webp)$/i, '')));
    console.log(`TARGET_FILE: ${targetSet.size} target filenames loaded`);
  }

  // Skip if already done (manifest has entry AND image file exists)
  const todo = all.filter(v => {
    const key = `${v.year}|${v.make}|${v.model}`;
    if (targetSet) {
      // Filename-based filter — match the safeFilename() output without ext
      const fn = safeFilename(v.year, v.make, v.model, 'jpg').replace(/\.jpg$/i, '');
      if (!targetSet.has(fn)) return false;
    }
    if (manifest[key]) {
      const p = path.join(__dirname, '..', 'webapp', 'public', manifest[key].replace(/^\//, ''));
      if (fs.existsSync(p)) return false;
    }
    return true;
  }).slice(START_INDEX, START_INDEX + LIMIT);

  console.log(`Total YMMs: ${all.length}, manifest: ${Object.keys(manifest).length}, todo: ${todo.length}`);

  let ok = 0, fail = 0;
  const start = Date.now();
  for (let i = 0; i < todo.length; i++) {
    const v = todo[i];
    const key = `${v.year}|${v.make}|${v.model}`;
    process.stdout.write(`[${i+1}/${todo.length}] ${key} ... `);
    try {
      const result = await scrapeOne(v.year, v.make, v.model);
      if (result.imageUrl) {
        // Determine extension from URL
        const ext = (result.imageUrl.match(/\.(jpe?g|png|webp)/i) || ['','jpg'])[1].toLowerCase() || 'jpg';
        const filename = safeFilename(v.year, v.make, v.model, ext === 'jpeg' ? 'jpg' : ext);
        const dest = path.join(IMAGES_DIR, filename);
        await downloadImage(result.imageUrl, dest);
        manifest[key] = `/images/vehicles/${filename}`;
        fitments[key] = result.fitment;
        save(OUT_MANIFEST, manifest);
        save(OUT_FITMENT, fitments);
        ok++;
        console.log(`OK ${filename}`);
      } else {
        fails[key] = { err: result.err, generation: result.generation, ts: new Date().toISOString() };
        save(FAIL_LOG, fails);
        fail++;
        console.log(`FAIL ${result.err}`);
      }
    } catch (e) {
      fails[key] = { err: e.message, ts: new Date().toISOString() };
      save(FAIL_LOG, fails);
      fail++;
      console.log(`ERROR ${e.message}`);
    }
    await sleep(REQ_DELAY_MS);
  }

  const dur = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nDone. ${ok} ok, ${fail} fail in ${dur}s`);
})().catch(e => { console.error(e); process.exit(1); });
