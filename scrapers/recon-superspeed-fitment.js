// Superspeed fitment recon: log in, capture every API call, sweep the UI for
// any "vehicle/year/make/model/fitment/find by car" affordance, click into it,
// and dump what we find.

const { chromium } = require('playwright');
const config = require('./config');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'screenshots');
const REPORT_PATH = path.join(__dirname, 'superspeed-fitment-recon.json');

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const apiCalls = [];
  const consoleLogs = [];

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Network listener: capture every webapi call
  page.on('request', req => {
    const url = req.url();
    if (/webapi|api|fitment|vehicle|car|year|make|model/i.test(url)) {
      apiCalls.push({
        method: req.method(),
        url,
        postData: req.postData()?.slice(0, 300) || null,
        when: new Date().toISOString().slice(11, 19),
      });
    }
  });
  page.on('console', msg => consoleLogs.push(`${msg.type()}: ${msg.text().slice(0, 200)}`));

  console.log('=== SUPERSPEED FITMENT RECON ===\n');
  console.log('Navigating to login...');
  await page.goto(config.superspeed.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  // Login
  await page.fill('input[type="email"], input[type="text"]:not([readonly]):not([type="hidden"])', config.superspeed.username);
  await page.fill('input[type="password"]', config.superspeed.password);
  await page.locator('button:has-text("Login"), button:has-text("Sign"), button[type="submit"]').first().click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(4000);
  console.log('Logged in.\n');

  await page.screenshot({ path: path.join(OUT_DIR, 'superspeed-fitment-recon-home.png'), fullPage: true });

  // Dump all nav items and clickable items with text matching keywords
  const keywords = ['fit', 'vehicle', 'car', 'year', 'make', 'model', 'find', 'search by', 'app', 'inquiry'];
  const allClickable = await page.locator('a, button, [role="button"], [class*="menu"], [class*="nav"]').all();
  console.log(`Scanning ${allClickable.length} clickable elements...\n`);

  const candidates = [];
  for (const el of allClickable) {
    try {
      const text = (await el.textContent({ timeout: 500 }))?.trim().toLowerCase() || '';
      const href = (await el.getAttribute('href').catch(() => null)) || '';
      const cls = (await el.getAttribute('class').catch(() => null)) || '';
      if (text && keywords.some(k => text.includes(k))) {
        candidates.push({ text: text.slice(0, 80), href, cls: cls.slice(0, 60) });
      }
    } catch {}
  }
  console.log('Keyword-matching clickable elements:');
  for (const c of candidates.slice(0, 30)) console.log(' -', c.text, '|', c.href || '(no href)');

  // Also list every nav/sidebar route in the SPA
  const navLinks = await page.evaluate(() => {
    const out = [];
    for (const a of document.querySelectorAll('a')) {
      const t = a.textContent?.trim() || '';
      const h = a.getAttribute('href') || '';
      if (h && h !== '#' && t.length > 0 && t.length < 60) out.push({ text: t, href: h });
    }
    return out.slice(0, 80);
  });
  console.log('\nAll links (first 80):');
  for (const l of navLinks) console.log(' -', l.text, '->', l.href);

  // Try navigating to common fitment-related routes
  const probeRoutes = [
    '#/app/product/productVehicles',
    '#/app/product/productFitment',
    '#/app/product/findByCar',
    '#/app/product/searchByVehicle',
    '#/app/vehicle',
    '#/app/fitment',
  ];
  for (const route of probeRoutes) {
    const url = config.superspeed.url.replace(/#.*$/, '') + route;
    console.log(`\nProbing route: ${url}`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(1500);
      const title = await page.title();
      const has404 = await page.evaluate(() => /not found|404|invalid/i.test(document.body.innerText));
      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 200));
      console.log(`  title="${title}", 404?=${has404}, body="${bodyText.replace(/\s+/g, ' ').slice(0, 120)}"`);
    } catch (e) {
      console.log(`  ERR: ${e.message.slice(0, 80)}`);
    }
  }

  console.log('\n=== Captured API calls so far ===');
  const unique = [...new Map(apiCalls.map(c => [c.method + c.url, c])).values()];
  for (const c of unique) console.log(`  ${c.method} ${c.url.slice(0, 140)}${c.postData ? ' | data=' + c.postData.slice(0, 80) : ''}`);

  fs.writeFileSync(REPORT_PATH, JSON.stringify({ candidates, navLinks, apiCalls: unique, consoleLogs }, null, 2));
  console.log(`\nFull report: ${REPORT_PATH}`);

  await browser.close();
})();
