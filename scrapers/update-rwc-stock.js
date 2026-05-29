// One-shot: log in to gpibtob.com, fetch the full RWC listing once
// (?search=RWC&limit=99999), extract real stock + MSRP per SKU, and patch
// those fields onto the existing data/rwc-wheels-raw.json so we don't have
// to re-run the full scrape (which also walks fitment).
//
// Why this exists: the original scrape-rwc.js used selector `.stock` which
// matched nothing. All 964 RWC products shipped with empty stock and got
// the "Available" fallback in the build script — misleading. This grabs
// the real `<span class="green/red">` signal from inside `.rating`.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const DATA_DIR = path.join(__dirname, '..', 'data');
const RAW_PATH = path.join(DATA_DIR, 'rwc-wheels-raw.json');

(async () => {
  console.log('=== RWC STOCK UPDATE ===');

  if (!fs.existsSync(RAW_PATH)) {
    console.log('No rwc-wheels-raw.json found. Run scrape-rwc.js first.');
    return;
  }
  const raw = JSON.parse(fs.readFileSync(RAW_PATH, 'utf-8'));
  console.log(`Loaded ${raw.length} existing RWC products`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('Logging in...');
    await page.goto(config.rwc.url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.fill('input[type="email"], input[name="email"], input#email, input[name="customer[email]"]', config.rwc.username);
    await page.fill('input[type="password"], input[name="password"]', config.rwc.password);
    await page.locator('button:has-text("Sign"), button:has-text("Log"), input[type="submit"]').first().click();
    await page.waitForLoadState('networkidle');
    console.log('Logged in.');

    console.log('Loading full listing (limit=99999)...');
    await page.goto('https://gpibtob.com/index.php?route=product/search&search=RWC&limit=99999', {
      waitUntil: 'networkidle', timeout: 180000
    });
    await page.waitForTimeout(3000);

    console.log('Extracting per-SKU stock signals...');
    const stockBySku = await page.evaluate(() => {
      const out = {};
      document.querySelectorAll('.product-thumb').forEach(thumb => {
        const skuEl = thumb.querySelector('.cart-button .pull-right');
        const sku = skuEl?.textContent?.trim();
        if (!sku) return;
        const stockEl = thumb.querySelector('.rating span');
        const text = stockEl?.textContent?.trim() || '';
        const isGreen = stockEl?.classList?.contains('green') || /in stock/i.test(text);
        const isRed = stockEl?.classList?.contains('red');
        out[sku] = { text, inStock: isGreen, outOfStock: isRed };
      });
      return out;
    });

    const skus = Object.keys(stockBySku);
    console.log(`Captured stock for ${skus.length} SKUs`);
    if (skus.length === 0) {
      console.log('No stock data captured. Check selectors.');
      return;
    }

    // Distribution
    const summary = { inStock: 0, outOfStock: 0, other: 0 };
    for (const k of skus) {
      const s = stockBySku[k];
      if (s.inStock) summary.inStock++;
      else if (s.outOfStock) summary.outOfStock++;
      else summary.other++;
    }
    console.log(`Distribution: ${JSON.stringify(summary)}`);

    // Patch
    let updated = 0, unmatched = 0;
    for (const r of raw) {
      const s = stockBySku[r.sku];
      if (s) {
        r.stock = s.text;
        updated++;
      } else {
        unmatched++;
      }
    }
    console.log(`Patched ${updated} products (${unmatched} unmatched — likely removed from supplier)`);

    fs.writeFileSync(RAW_PATH, JSON.stringify(raw, null, 2));
    console.log(`Wrote ${RAW_PATH}`);
  } catch (err) {
    console.log('ERROR:', err.message);
    console.log(err.stack);
  } finally {
    await browser.close();
  }
})();
