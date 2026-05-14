// Fitment-only scrape for RWC: iterate year/make/model from rwc-fitment-tree.json,
// extract URL-slug SKUs from each search response, and attach fitment to the
// already-scraped products in rwc-wheels-raw.json.

const { chromium } = require('playwright');
const config = require('./config');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const TREE_PATH = path.join(DATA_DIR, 'rwc-fitment-tree.json');
const WHEELS_PATH = path.join(DATA_DIR, 'rwc-wheels-raw.json');

(async () => {
  console.log('=== RWC FITMENT SCRAPE (URL-slug join) ===\n');
  const tree = JSON.parse(fs.readFileSync(TREE_PATH, 'utf8'));
  const products = JSON.parse(fs.readFileSync(WHEELS_PATH, 'utf8'));
  const productsBySku = new Map(products.map(p => [p.sku, p]));
  console.log(`Loaded ${products.length} products. Tree years: ${Object.keys(tree).join(', ')}\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Login
  await page.goto(config.rwc.url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.fill('input[type="email"], input[name="email"], input#email, input[name="customer[email]"]', config.rwc.username);
  await page.fill('input[type="password"], input[name="password"]', config.rwc.password);
  await page.locator('button:has-text("Sign"), button:has-text("Log"), input[type="submit"]').first().click();
  await page.waitForLoadState('networkidle');
  console.log('Logged in\n');

  // Build URL list
  const tasks = [];
  for (const year of Object.keys(tree)) {
    for (const [make, data] of Object.entries(tree[year])) {
      for (const model of data.models) {
        tasks.push({ year, make, model, carId: data.id });
      }
    }
  }
  console.log(`Total year/make/model combinations: ${tasks.length}\n`);

  const fitmentMap = {}; // slug -> [{year, make, model}]
  let i = 0, hitCount = 0;
  const startTime = Date.now();

  for (const { year, make, model, carId } of tasks) {
    i++;
    const url = `https://gpibtob.com/product/searchwheel?car=${carId}&model=${encodeURIComponent(model)}&year=${year}&filter_type=&limit=99999`;

    try {
      const slugs = await page.evaluate(async (u) => {
        const res = await fetch(u, { credentials: 'include' });
        const html = await res.text();
        // Extract one URL slug per product card; slug appears as
        //   href="https://gpibtob.com/rwc-xxxx"
        // Take unique slugs only.
        const set = new Set();
        const re = /https?:\/\/gpibtob\.com\/(rwc-[a-z0-9-]+)(?=["?])/gi;
        let m;
        while ((m = re.exec(html))) set.add(m[1].toLowerCase());
        return [...set];
      }, url);

      for (const slug of slugs) {
        if (!fitmentMap[slug]) fitmentMap[slug] = [];
        fitmentMap[slug].push({ year, make, model });
      }
      hitCount += slugs.length;

      if (i % 25 === 0 || i === tasks.length) {
        const eta = ((Date.now() - startTime) / i) * (tasks.length - i) / 1000;
        console.log(`  ${i}/${tasks.length} (${slugs.length} slugs this | ${hitCount} total | ETA ${eta.toFixed(0)}s)`);
      }
    } catch (e) {
      console.log(`  ${i}/${tasks.length} ERR ${year} ${make} ${model}: ${e.message.slice(0, 80)}`);
    }
  }

  // Attach fitment to products
  let matched = 0;
  for (const product of products) {
    const fit = fitmentMap[product.sku?.toLowerCase()] || [];
    product.fitment = fit;
    if (fit.length > 0) matched++;
  }
  console.log(`\nDone. ${matched}/${products.length} products got fitment entries.`);

  // Save back
  fs.writeFileSync(WHEELS_PATH, JSON.stringify(products, null, 2));
  console.log(`Wrote ${WHEELS_PATH}`);

  // Also dump the slug -> fitment map separately
  const mapPath = path.join(DATA_DIR, 'rwc-fitment-map.json');
  fs.writeFileSync(mapPath, JSON.stringify(fitmentMap, null, 2));
  console.log(`Wrote ${mapPath} (${Object.keys(fitmentMap).length} unique slugs)`);

  await browser.close();
})();
