// Drive the Search-by-Application form: select Year → Make → Model and capture
// every AAIA API call in the chain. Goal: figure out the URL pattern for making
// year/make/model → wheels lookups programmatically.

const { chromium } = require('playwright');
const config = require('./config');
const fs = require('fs');
const path = require('path');

const OUT_REPORT = path.join(__dirname, 'superspeed-aaia-flow.json');

(async () => {
  const calls = [];

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  page.on('request', req => {
    const u = req.url();
    if (/driverightdata|aaia|webapi/i.test(u)) {
      calls.push({ phase: 'req', method: req.method(), url: u, postData: req.postData()?.slice(0, 800) || null, when: Date.now() });
    }
  });
  page.on('response', async resp => {
    const u = resp.url();
    if (/driverightdata|aaia/i.test(u)) {
      try {
        const body = await resp.text();
        calls.push({ phase: 'resp', status: resp.status(), url: u, body: body.slice(0, 2000), when: Date.now() });
      } catch {}
    }
  });

  // Login
  console.log('Logging in...');
  await page.goto(config.superspeed.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.fill('input[type="email"], input[type="text"]:not([readonly]):not([type="hidden"])', config.superspeed.username);
  await page.fill('input[type="password"]', config.superspeed.password);
  await page.locator('button:has-text("Login"), button:has-text("Sign"), button[type="submit"]').first().click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(4500);

  // Click "Search by Application"
  console.log('Clicking "Search by Application"...');
  await page.locator('text=/search by application/i').first().click({ timeout: 10000 });
  await page.waitForTimeout(4000);

  // Enumerate all selects and their first ~10 options
  let snapshot = await page.evaluate(() => {
    const out = [];
    for (const sel of document.querySelectorAll('select')) {
      const opts = [...sel.options].map(o => ({ v: o.value, t: o.text.trim().slice(0, 30) })).slice(0, 12);
      const cls = sel.getAttribute('class') || '';
      const name = sel.getAttribute('name') || sel.getAttribute('id') || '';
      out.push({ name, cls: cls.slice(0, 50), optsCount: sel.options.length, opts });
    }
    return out;
  });
  console.log('\n=== SELECTS ON APPLICATION PAGE ===');
  for (let i = 0; i < snapshot.length; i++) {
    const s = snapshot[i];
    console.log(`select[${i}] cls=${s.cls} optsCount=${s.optsCount} firstOpts=${JSON.stringify(s.opts.slice(0, 6))}`);
  }

  // Select Year=2024 (assume first select is Year, second Make, third Model)
  console.log('\nSelecting year=2024 on select[0]...');
  await page.locator('select').nth(0).selectOption({ value: '2024' }).catch(async e => {
    console.log('  value="2024" failed, trying label...');
    await page.locator('select').nth(0).selectOption({ label: '2024' });
  });
  await page.waitForTimeout(2500);

  // Re-snapshot — make dropdown should now be populated
  snapshot = await page.evaluate(() => {
    const out = [];
    for (const sel of document.querySelectorAll('select')) {
      const opts = [...sel.options].map(o => ({ v: o.value, t: o.text.trim().slice(0, 30) })).slice(0, 12);
      out.push({ optsCount: sel.options.length, opts });
    }
    return out;
  });
  console.log('After year=2024:');
  for (let i = 0; i < Math.min(4, snapshot.length); i++) {
    console.log(`  select[${i}] optsCount=${snapshot[i].optsCount} first=${JSON.stringify(snapshot[i].opts.slice(0, 5))}`);
  }

  // Select Make=HYUNDAI
  console.log('\nSelecting make on select[1]...');
  await page.locator('select').nth(1).selectOption({ label: /hyundai/i }).catch(async e => {
    console.log('  label hyundai failed, listing options:');
    const opts = await page.locator('select').nth(1).evaluate(s => [...s.options].map(o => o.text));
    console.log('  opts:', opts.slice(0, 20));
  });
  await page.waitForTimeout(2500);

  snapshot = await page.evaluate(() => {
    const out = [];
    for (const sel of document.querySelectorAll('select')) {
      const opts = [...sel.options].map(o => ({ v: o.value, t: o.text.trim().slice(0, 30) })).slice(0, 12);
      out.push({ optsCount: sel.options.length, opts });
    }
    return out;
  });
  console.log('After make=HYUNDAI:');
  for (let i = 0; i < Math.min(4, snapshot.length); i++) {
    console.log(`  select[${i}] optsCount=${snapshot[i].optsCount} first=${JSON.stringify(snapshot[i].opts.slice(0, 5))}`);
  }

  // Select Model=SANTA FE
  console.log('\nSelecting model on select[2]...');
  await page.locator('select').nth(2).selectOption({ label: /santa.?fe/i }).catch(async e => {
    const opts = await page.locator('select').nth(2).evaluate(s => [...s.options].map(o => o.text));
    console.log('  santa fe label failed, opts:', opts.slice(0, 15));
  });
  await page.waitForTimeout(2500);

  // Click Search
  console.log('\nClicking Search...');
  await page.locator('button:has-text("Search")').first().click({ timeout: 5000 }).catch(e => console.log('  search err:', e.message));
  await page.waitForTimeout(4000);

  console.log('\n=== ALL CAPTURED CALLS (in order) ===');
  calls.sort((a, b) => a.when - b.when);
  for (const c of calls) {
    const u = c.url.length > 180 ? c.url.slice(0, 180) + '...' : c.url;
    if (c.phase === 'req') {
      console.log(`-> ${c.method} ${u}`);
      if (c.postData) console.log(`     data: ${c.postData.slice(0, 200)}`);
    } else {
      console.log(`<- ${c.status} ${u}`);
      console.log(`     body: ${(c.body || '').slice(0, 300).replace(/\s+/g, ' ')}`);
    }
  }

  fs.writeFileSync(OUT_REPORT, JSON.stringify(calls, null, 2));
  console.log(`\nReport: ${OUT_REPORT}`);

  await browser.close();
})();
