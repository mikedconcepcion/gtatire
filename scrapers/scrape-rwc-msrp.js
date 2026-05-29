// Walk every RWC product's detail page on gpibtob.com to capture the real
// MSRP (lives in the `.price-section .price-old` element, visible at the
// top of each detail page). The bulk listing scrape only catches the
// dealer cost.
//
// Strategy: log in once via Playwright (gets the auth cookies), then issue
// raw HTTP fetches per detail URL via `page.evaluate`. ~50ms per request
// vs ~1.5min per full page.goto navigation — about 30-100× faster.
//
// Saves to data/rwc-msrp.json keyed by SKU so the build script can fold it
// in without re-scraping. Resumable — skips SKUs already captured.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const DATA_DIR = path.join(__dirname, '..', 'data');
const RAW_PATH = path.join(DATA_DIR, 'rwc-wheels-raw.json');
const OUT_PATH = path.join(DATA_DIR, 'rwc-msrp.json');
const FAIL_PATH = path.join(DATA_DIR, 'rwc-msrp-failures.json');

const CONCURRENCY = 8;     // simultaneous fetches per worker
const PAUSE_BETWEEN_BATCHES_MS = 50;

function loadJSON(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return fallback; }
}
function saveJSON(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const raw = loadJSON(RAW_PATH);
  if (!raw) { console.log('No rwc-wheels-raw.json. Bail.'); return; }

  const existing = loadJSON(OUT_PATH, {});
  const failures = loadJSON(FAIL_PATH, {});
  const todo = raw.filter(p => p.sku && p.url && !existing[p.sku]);

  console.log(`RWC MSRP scrape: ${raw.length} total, ${Object.keys(existing).length} already captured, ${todo.length} to do`);
  if (todo.length === 0) { console.log('Nothing to do.'); return; }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('Logging in (one-shot auth)...');
    await page.goto(config.rwc.url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.fill('input[type="email"], input[name="email"], input#email, input[name="customer[email]"]', config.rwc.username);
    await page.fill('input[type="password"], input[name="password"]', config.rwc.password);
    await page.locator('button:has-text("Sign"), button:has-text("Log"), input[type="submit"]').first().click();
    await page.waitForLoadState('networkidle');
    console.log('Logged in. Streaming detail-page fetches...');

    const t0 = Date.now();
    let done = 0;

    // Process in batches of CONCURRENCY. Each batch's fetches share the same
    // browser context (cookies + session). page.evaluate runs them in-browser
    // so the supplier sees us as the same authenticated user.
    for (let i = 0; i < todo.length; i += CONCURRENCY) {
      const batch = todo.slice(i, i + CONCURRENCY);

      const results = await page.evaluate(async (urls) => {
        async function fetchOne(u) {
          try {
            const r = await fetch(u, { credentials: 'include' });
            if (!r.ok) return { ok: false, status: r.status };
            const html = await r.text();
            // .price-section .price-old has the MSRP. Match by class attr.
            const m = html.match(/class=["'][^"']*\bprice-old\b[^"']*["'][^>]*>\s*\$?\s*([\d,]+(?:\.\d+)?)/);
            if (!m) return { ok: false, status: 'no-match' };
            const msrp = parseFloat(m[1].replace(/,/g, ''));
            return { ok: true, msrp };
          } catch (err) {
            return { ok: false, status: err.message.slice(0, 80) };
          }
        }
        return Promise.all(urls.map(fetchOne));
      }, batch.map(p => p.url));

      results.forEach((res, idx) => {
        const sku = batch[idx].sku;
        if (res.ok && res.msrp > 0) {
          existing[sku] = res.msrp;
        } else {
          failures[sku] = { url: batch[idx].url, reason: res.status };
        }
      });
      done += batch.length;

      if (done % 80 === 0 || done >= todo.length) {
        saveJSON(OUT_PATH, existing);
        saveJSON(FAIL_PATH, failures);
        const elapsed = (Date.now() - t0) / 1000;
        const rate = (done / elapsed).toFixed(2);
        const eta = ((todo.length - done) / rate).toFixed(0);
        console.log(`[${done}/${todo.length}] ${rate}/s — ETA ${eta}s — captured ${Object.keys(existing).length}, failed ${Object.keys(failures).length}`);
      }
      await sleep(PAUSE_BETWEEN_BATCHES_MS);
    }

    saveJSON(OUT_PATH, existing);
    saveJSON(FAIL_PATH, failures);
    console.log(`\nDone. Captured: ${Object.keys(existing).length}, Failures: ${Object.keys(failures).length}`);
  } catch (err) {
    saveJSON(OUT_PATH, existing);
    saveJSON(FAIL_PATH, failures);
    console.log('FATAL:', err.message);
  } finally {
    await browser.close();
  }
})();
