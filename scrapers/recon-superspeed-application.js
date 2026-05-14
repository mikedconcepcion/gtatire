// Click "Search by Application" in Superspeed B2B and capture the full AAIA
// fitment API flow (years, makes, models, wheels-by-application).

const { chromium } = require('playwright');
const config = require('./config');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'superspeed-aaia-recon.json');
const SHOT = path.join(__dirname, 'screenshots');

(async () => {
  fs.mkdirSync(SHOT, { recursive: true });
  const apiCalls = [];
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  page.on('request', req => {
    const url = req.url();
    if (/driverightdata|aaia|fitment|application|vehicle|year|make|model/i.test(url)) {
      apiCalls.push({
        method: req.method(),
        url,
        postData: req.postData()?.slice(0, 500) || null,
        when: new Date().toISOString().slice(11, 19),
      });
    }
  });
  page.on('response', async resp => {
    const url = resp.url();
    if (/driverightdata|aaia/i.test(url)) {
      try {
        const body = await resp.text();
        apiCalls.push({ direction: 'response', url, status: resp.status(), body: body.slice(0, 800) });
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

  console.log('Current URL after login:', page.url());

  // Click "Search by Application"
  console.log('Clicking "Search by Application"...');
  await page.locator('text=/search by application/i').first().click({ timeout: 10000 }).catch(e => console.log('  click error:', e.message));
  await page.waitForTimeout(4000);

  await page.screenshot({ path: path.join(SHOT, 'superspeed-app-1.png'), fullPage: true });

  // List interactive fields after click
  const fields = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('select, input, button, [class*="dropdown"], [class*="select"]')) {
      const tag = el.tagName.toLowerCase();
      const text = el.textContent?.trim().slice(0, 80) || '';
      const placeholder = el.getAttribute('placeholder') || '';
      const name = el.getAttribute('name') || el.getAttribute('id') || '';
      out.push({ tag, text, placeholder, name });
    }
    return out.slice(0, 40);
  });
  console.log('\nFields after click:');
  for (const f of fields) console.log(`  ${f.tag} name=${f.name} placeholder=${f.placeholder} text="${f.text}"`);

  // Try selecting a year (any first option)
  console.log('\nAttempting Year dropdown...');
  const yearSel = page.locator('select, [class*="year"], [class*="Year"]').first();
  try {
    await yearSel.click({ timeout: 5000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SHOT, 'superspeed-app-year-open.png'), fullPage: true });
  } catch (e) {
    console.log('  year click error:', e.message.slice(0, 80));
  }

  // Try a more aggressive interaction: click any dropdown, select 2024, then proceed
  console.log('\nTrying to fill year=2024, make=HYUNDAI, model=SANTA FE...');
  try {
    // Look for any input with year-like attributes
    const yearInputs = await page.locator('input').all();
    for (const inp of yearInputs.slice(0, 10)) {
      const ph = await inp.getAttribute('placeholder').catch(() => '') || '';
      const name = await inp.getAttribute('name').catch(() => '') || '';
      console.log(`  input: ph=${ph}, name=${name}`);
    }
  } catch {}

  // Wait a bit longer for any deferred API calls
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(SHOT, 'superspeed-app-final.png'), fullPage: true });

  console.log('\n=== Captured API calls ===');
  for (const c of apiCalls) {
    const u = c.url.slice(0, 130);
    if (c.direction === 'response') {
      console.log(`  <- ${c.status} ${u}\n     body: ${(c.body || '').slice(0, 200).replace(/\s+/g, ' ')}`);
    } else {
      console.log(`  ${c.method} ${u}${c.postData ? '\n     data: ' + c.postData.slice(0, 200) : ''}`);
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(apiCalls, null, 2));
  console.log(`\nFull report: ${OUT}`);

  await browser.close();
})();
