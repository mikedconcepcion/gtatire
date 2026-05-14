// Load the Superspeed B2B SPA, intercept every JS bundle, and grep for AAIA
// endpoint names so we don't have to drive the UI.

const { chromium } = require('playwright');
const config = require('./config');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const jsBundles = [];
  page.on('response', async resp => {
    const u = resp.url();
    if (/\.js(\?|$)/.test(u) && /super-speed|b2b/.test(u)) {
      try {
        const body = await resp.text();
        jsBundles.push({ url: u, size: body.length, body });
      } catch {}
    }
  });

  console.log('Loading login page...');
  await page.goto(config.superspeed.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.fill('input[type="email"], input[type="text"]:not([readonly]):not([type="hidden"])', config.superspeed.username);
  await page.fill('input[type="password"]', config.superspeed.password);
  await page.locator('button:has-text("Login"), button:has-text("Sign"), button[type="submit"]').first().click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(4500);

  // Click Search by Application so the lazy-loaded bundles for that page also load
  await page.locator('text=/search by application/i').first().click({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(3500);

  console.log(`Captured ${jsBundles.length} JS bundles, total ${jsBundles.reduce((s, b) => s + b.size, 0)} bytes\n`);

  // Grep for AAIA endpoint names + URL patterns
  const allText = jsBundles.map(b => b.body).join('\n');
  const patterns = {
    'GetAAIA* methods': /GetAAIA[A-Za-z]+/g,
    'driverightdata paths': /aaia\/(\w+)/g,
    'webapi /Product/* methods': /\/Product\/(\w+)/g,
    'fitment-related calls': /(GetWheelsFor|getWheelByApp|application|fitment)\w*/gi,
  };

  for (const [name, re] of Object.entries(patterns)) {
    const matches = [...new Set([...allText.matchAll(re)].map(m => m[0]))];
    console.log(`${name}:`);
    for (const m of matches.slice(0, 30)) console.log('  ', m);
    console.log();
  }

  // Dump each bundle URL + size
  console.log('Bundle list:');
  for (const b of jsBundles) console.log(`  ${b.size.toString().padStart(8)} ${b.url.slice(0, 120)}`);

  await browser.close();
})();
