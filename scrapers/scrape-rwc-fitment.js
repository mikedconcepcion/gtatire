// RWC fitment scrape — fetch year/make/model tree from the LIVE portal
// (not the cached rwc-fitment-tree.json which was a truncated old scrape),
// then per (year, make, model), fetch search-result HTML and extract
// URL-slug SKUs. Join to products.sku by URL slug.

const { chromium } = require('playwright');
const config = require('./config');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const WHEELS_PATH = path.join(DATA_DIR, 'rwc-wheels-raw.json');

const MIN_YEAR = 2010; // widened from 2012 on 2026-05-26

(async () => {
  console.log('=== RWC FITMENT SCRAPE (live portal) ===\n');
  const products = JSON.parse(fs.readFileSync(WHEELS_PATH, 'utf8'));
  console.log(`Loaded ${products.length} products.\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Login
  await page.goto(config.rwc.url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.fill('input[type="email"], input[name="email"], input#email, input[name="customer[email]"]', config.rwc.username);
  await page.fill('input[type="password"], input[name="password"]', config.rwc.password);
  await page.locator('button:has-text("Sign"), button:has-text("Log"), input[type="submit"]').first().click();
  await page.waitForLoadState('networkidle');
  console.log('Logged in.\n');

  // Get list of years
  await page.goto('https://gpibtob.com/product/searchwheel', { waitUntil: 'networkidle', timeout: 30000 });
  const allYears = await page.locator('#year option').evaluateAll(opts =>
    opts.map(o => o.value).filter(v => v && v !== '')
  );
  const years = allYears.filter(y => parseFloat(y) >= MIN_YEAR);
  console.log(`Years to scrape (>=${MIN_YEAR}): ${years.join(', ')}\n`);

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Wrap fetch in try/catch INSIDE page.evaluate so network errors don't crash the scrape.
  // RWC rate-limits aggressively — we retry with exponential backoff on empty results.
  async function fetchMakes(year) {
    for (let attempt = 1; attempt <= 6; attempt++) {
      const makes = await page.evaluate(async (yr) => {
        try {
          const res = await fetch(`https://gpibtob.com/index.php?route=module/searchtyrecar/getcar&year=${yr}`, { credentials: 'include' });
          const html = await res.text();
          return [...html.matchAll(/<option value="(\d+)">([^<]+)<\/option>/g)].map(m => ({ id: m[1], name: m[2].trim() }));
        } catch (e) { return []; }
      }, year);
      if (makes.length > 0) return makes;
      await sleep(3000 * attempt);  // 3s, 6s, 9s, 12s, 15s, 18s backoff
      console.log(`    retry ${attempt} for year ${year} (waited ${3 * attempt}s)`);
    }
    return [];
  }

  async function fetchModels(year, makeId) {
    for (let attempt = 1; attempt <= 6; attempt++) {
      const html = await page.evaluate(async ({ y, mid }) => {
        try {
          const res = await fetch(`https://gpibtob.com/index.php?route=module/searchtyrecar/getmodel&year=${y}&id=${mid}`, { credentials: 'include' });
          return await res.text();
        } catch (e) { return ''; }
      }, { y: year, mid: makeId });
      const models = [...html.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map(m => m[1]);
      if (models.length > 0) return models;
      await sleep(2000 * attempt);
    }
    return [];
  }

  // Step 1: build YMM list from live portal with per-call throttle
  const tasks = [];
  for (const year of years) {
    const makes = await fetchMakes(year);
    for (const { id, name } of makes) {
      await sleep(120);  // gentle throttle between models requests
      const models = await fetchModels(year, id);
      for (const model of models) tasks.push({ year, makeId: id, makeName: name, model });
    }
    console.log(`  ${year}: ${makes.length} makes`);
    await sleep(2000);  // cooldown between years
  }
  console.log(`\nTotal year/make/model combinations: ${tasks.length}\n`);

  // Step 2: per YMM, fetch wheel slugs
  const fitmentMap = {};
  let i = 0, hits = 0;
  const start = Date.now();

  for (const { year, makeId, makeName, model } of tasks) {
    i++;
    const url = `https://gpibtob.com/product/searchwheel?car=${makeId}&model=${encodeURIComponent(model)}&year=${year}&filter_type=&limit=99999`;
    try {
      const slugs = await page.evaluate(async (u) => {
        try {
          const res = await fetch(u, { credentials: 'include' });
          const html = await res.text();
          const set = new Set();
          const re = /https?:\/\/gpibtob\.com\/(rwc-[a-z0-9-]+)(?=["?])/gi;
          let m;
          while ((m = re.exec(html))) set.add(m[1].toLowerCase());
          return [...set];
        } catch (e) { return null; }
      }, url);
      if (slugs === null) { await sleep(3000); continue; }

      for (const slug of slugs) {
        if (!fitmentMap[slug]) fitmentMap[slug] = [];
        fitmentMap[slug].push({ year, make: makeName, model });
      }
      hits += slugs.length;

      if (i % 50 === 0 || i === tasks.length) {
        const eta = ((Date.now() - start) / i) * (tasks.length - i) / 1000;
        console.log(`  ${i}/${tasks.length} (${slugs.length} slugs | ${hits} total | ETA ${eta.toFixed(0)}s)`);
      }
    } catch (e) {
      console.log(`  ${i}/${tasks.length} ERR ${year} ${makeName} ${model}: ${e.message.slice(0, 80)}`);
    }
  }

  // Attach fitment to products. Products are joined by URL slug (rwc-...),
  // not by encoded SKU (RW...), because the search-results HTML only links
  // to the URL slug. The two formats refer to the same product but aren't
  // string-equal. Extract slug from product.url to match fitmentMap keys.
  let matched = 0;
  for (const product of products) {
    const m = (product.url || '').match(/gpibtob\.com\/(rwc-[a-z0-9-]+)/i);
    const slug = m ? m[1].toLowerCase() : null;
    const fit = (slug && fitmentMap[slug]) || [];
    product.fitment = fit;
    if (fit.length > 0) matched++;
  }
  console.log(`\nDone. ${matched}/${products.length} products got fitment entries.`);

  fs.writeFileSync(WHEELS_PATH, JSON.stringify(products, null, 2));
  console.log(`Wrote ${WHEELS_PATH}`);

  const mapPath = path.join(DATA_DIR, 'rwc-fitment-map.json');
  fs.writeFileSync(mapPath, JSON.stringify(fitmentMap, null, 2));
  console.log(`Wrote ${mapPath} (${Object.keys(fitmentMap).length} unique slugs)`);

  await browser.close();
})();
