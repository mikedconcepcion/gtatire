// Probe: log in to RWC, fetch one search-by-vehicle URL, and dump SKU patterns
// to figure out what regex/selector to use for the real fitment scrape.

const { chromium } = require('playwright');
const config = require('./config');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('=== RWC FITMENT PROBE ===\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Login
  await page.goto(config.rwc.url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.fill('input[type="email"], input[name="email"], input#email, input[name="customer[email]"]', config.rwc.username);
  await page.fill('input[type="password"], input[name="password"]', config.rwc.password);
  await page.locator('button:has-text("Sign"), button:has-text("Log"), input[type="submit"]').first().click();
  await page.waitForLoadState('networkidle');
  console.log('Logged in');

  // Find a vehicle in the tree for which RWC has wheels
  const tree = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'rwc-fitment-tree.json'), 'utf8'));
  const year = '2026';
  const make = 'HYUNDAI';
  const makeData = tree[year]?.[make];
  if (!makeData) { console.log('No tree entry for', year, make); await browser.close(); return; }
  const model = makeData.models.find(m => /santa\s*fe/i.test(m)) || makeData.models[0];
  console.log(`Probing: ${year} ${make} ${model} (carId=${makeData.id})\n`);

  const searchUrl = `https://gpibtob.com/product/searchwheel?car=${makeData.id}&model=${encodeURIComponent(model)}&year=${year}&filter_type=&limit=99999`;
  console.log('URL:', searchUrl, '\n');

  const html = await page.evaluate(async (url) => {
    const res = await fetch(url, { credentials: 'include' });
    return await res.text();
  }, searchUrl);

  console.log('HTML length:', html.length);

  // Save full HTML for inspection
  const outPath = path.join(__dirname, 'rwc-probe-output.html');
  fs.writeFileSync(outPath, html);
  console.log('Full HTML saved to', outPath);

  // Try several extraction patterns and report what hits
  const patterns = [
    { name: 'RW uppercase legacy', re: /class="pull-right"[^>]*>(RW[^<]+)</g },
    { name: 'rwc lowercase', re: /class="pull-right"[^>]*>(rwc[^<\s]+)</gi },
    { name: 'any pull-right text', re: /class="pull-right"[^>]*>([^<]+)</g },
    { name: 'cart-button pull-right', re: /cart-button[^>]*>\s*<[^>]+>\s*<span[^>]*class="pull-right"[^>]*>([^<]+)</g },
    { name: 'data-sku attribute', re: /data-sku="([^"]+)"/g },
    { name: 'product-thumb container', re: /<div[^>]*class="[^"]*product-thumb[^"]*"/g },
  ];
  console.log('\nPattern hits:');
  for (const { name, re } of patterns) {
    const matches = [...html.matchAll(re)];
    console.log(`  ${name}: ${matches.length} matches`);
    if (matches.length && matches.length <= 6) {
      console.log('    First 3:', matches.slice(0, 3).map(m => m[1] || m[0]).map(s => s.slice(0, 80)));
    } else if (matches.length) {
      console.log('    First 3:', matches.slice(0, 3).map(m => m[1] || m[0]).map(s => s.slice(0, 80)));
    }
  }

  // Also try DOM-based extraction
  const domSkus = await page.evaluate(async (url) => {
    const res = await fetch(url, { credentials: 'include' });
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const skus = [];
    for (const el of doc.querySelectorAll('.cart-button .pull-right, .pull-right')) {
      const t = el.textContent?.trim();
      if (t && t.length < 80) skus.push(t);
    }
    return [...new Set(skus)].slice(0, 20);
  }, searchUrl);
  console.log('\nDOM-extracted pull-right contents (unique, first 20):');
  console.log(domSkus);

  await browser.close();
})();
