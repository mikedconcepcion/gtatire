// Walk every RWC product's detail page on gpibtob.com to capture the real
// MSRP (lives in the .show-price element above the dealer cost). The bulk
// listing scrape only catches dealer cost; MSRP is detail-page-only.
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

const DELAY_MS = 250; // polite pacing between requests

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
    console.log('Logging in...');
    await page.goto(config.rwc.url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.fill('input[type="email"], input[name="email"], input#email, input[name="customer[email]"]', config.rwc.username);
    await page.fill('input[type="password"], input[name="password"]', config.rwc.password);
    await page.locator('button:has-text("Sign"), button:has-text("Log"), input[type="submit"]').first().click();
    await page.waitForLoadState('networkidle');
    console.log('Logged in. Walking detail pages...');

    let i = 0;
    const t0 = Date.now();
    for (const p of todo) {
      i++;
      try {
        await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        // The price block has two $ amounts: MSRP (visible) and dealer cost
        // (hidden behind "Click to see cost"). Both render as plain $X.XX.
        // We want the FIRST one (the larger, retail price).
        const prices = await page.evaluate(() => {
          const out = [];
          // Look for the price block container, which has both .show-price and .price-product
          document.querySelectorAll('.price, .show-price, .price-product').forEach(el => {
            const text = (el.textContent || '').trim();
            const m = text.match(/\$([0-9]+(?:\.[0-9]+)?)/);
            if (m) out.push({ amount: parseFloat(m[1]), cls: el.className });
          });
          return out;
        });

        // MSRP = the visible price (not the hidden dealer cost). On gpibtob.com,
        // the .show-price div has the visible $ amount; .price-product is hidden.
        // Pick the maximum since MSRP > cost.
        const amounts = prices.map(x => x.amount).filter(n => n > 0);
        const msrp = amounts.length ? Math.max(...amounts) : 0;

        if (msrp > 0) {
          existing[p.sku] = msrp;
          if (i % 25 === 0) {
            saveJSON(OUT_PATH, existing);
            const rate = (i / ((Date.now() - t0) / 1000)).toFixed(2);
            const eta = ((todo.length - i) / rate).toFixed(0);
            process.stdout.write(`\n[${i}/${todo.length}] ${rate}/s — ETA ${eta}s — last MSRP $${msrp}`);
          } else {
            process.stdout.write('.');
          }
        } else {
          failures[p.sku] = { url: p.url, reason: 'no $ in price block', amounts };
          process.stdout.write('?');
        }
      } catch (err) {
        failures[p.sku] = { url: p.url, reason: err.message.slice(0, 100) };
        process.stdout.write('x');
      }
      await sleep(DELAY_MS);
    }

    saveJSON(OUT_PATH, existing);
    saveJSON(FAIL_PATH, failures);
    console.log(`\n\nDone. Captured: ${Object.keys(existing).length}, Failures: ${Object.keys(failures).length}`);
    console.log(`Wrote ${OUT_PATH}`);
  } catch (err) {
    saveJSON(OUT_PATH, existing); // partial save on crash
    console.log('FATAL:', err.message);
  } finally {
    await browser.close();
  }
})();
