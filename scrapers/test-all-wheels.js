const { chromium } = require('playwright');
const config = require('./config');
async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto(config.alltire.url, { waitUntil: 'networkidle' });
  await page.fill('input[type="text"]', config.alltire.username);
  await page.fill('input[type="password"]', config.alltire.password);
  await page.locator('button:has-text("Sign In"), input[type="submit"]').first().click();
  await page.waitForLoadState('networkidle');
  await delay(2000);

  await page.locator('text=/Wheel Search/i').first().click();
  await delay(1000);

  // Test 1: Click "All" radio WITHOUT selecting any vehicle/diameter
  console.log('=== TEST 1: Click All without any selection ===');
  const radios = await page.locator('input[type="radio"]:visible').all();
  console.log('Radios:', radios.length);
  if (radios.length >= 3) {
    await radios[2].click(); // "All"
    await delay(2000);
    const rows15 = await page.locator('tr').evaluateAll(trs =>
      trs.filter(tr => tr.querySelectorAll('td').length === 15).length
    );
    console.log('Product rows (15 cells):', rows15);
    await page.screenshot({ path: 'scrapers/screenshots/test-all-nofilter.png', fullPage: true });
  }

  // Test 2: Select just a diameter, no vehicle
  console.log('\n=== TEST 2: Diameter only (17") ===');
  try {
    await page.locator('#selectdiameter:visible').selectOption('17');
    await delay(500);
    await radios[2].click();
    await delay(2000);
    const rows15 = await page.locator('tr').evaluateAll(trs =>
      trs.filter(tr => tr.querySelectorAll('td').length === 15).length
    );
    console.log('Product rows (15 cells):', rows15);
    await page.screenshot({ path: 'scrapers/screenshots/test-all-diam17.png', fullPage: true });
  } catch (e) {
    console.log('Error:', e.message.substring(0, 80));
  }

  // Test 3: Select year only
  console.log('\n=== TEST 3: Year only (2025) ===');
  try {
    // Reset first
    await page.locator('button:visible:has-text("Reset"), input:visible[value="Reset"]').first().click();
    await delay(1000);

    await page.locator('#selectyear:visible').selectOption('2025');
    await delay(500);
    await page.locator('input[type="radio"]:visible').nth(2).click();
    await delay(2000);
    const rows15 = await page.locator('tr').evaluateAll(trs =>
      trs.filter(tr => tr.querySelectorAll('td').length === 15).length
    );
    console.log('Product rows (15 cells):', rows15);
  } catch (e) {
    console.log('Error:', e.message.substring(0, 80));
  }

  // Test 4: Year + Make only (no model/diameter)
  console.log('\n=== TEST 4: Year + Make only (2025 HONDA) ===');
  try {
    await page.locator('#selectyear:visible').selectOption('2025');
    await delay(500);
    await page.locator('#selectmake:visible').selectOption('HONDA');
    await delay(500);
    await page.locator('input[type="radio"]:visible').nth(2).click();
    await delay(2000);
    const rows15 = await page.locator('tr').evaluateAll(trs =>
      trs.filter(tr => tr.querySelectorAll('td').length === 15).length
    );
    console.log('Product rows (15 cells):', rows15);
  } catch (e) {
    console.log('Error:', e.message.substring(0, 80));
  }

  // Test 5: Year + Make + Model, no diameter
  console.log('\n=== TEST 5: Year + Make + Model, NO diameter (2025 HONDA CIVIC) ===');
  try {
    await page.locator('#selectmodel:visible').selectOption('CIVIC');
    await delay(500);
    await page.locator('input[type="radio"]:visible').nth(2).click();
    await delay(2000);
    const rows15 = await page.locator('tr').evaluateAll(trs =>
      trs.filter(tr => tr.querySelectorAll('td').length === 15).length
    );
    console.log('Product rows (15 cells):', rows15);
    await page.screenshot({ path: 'scrapers/screenshots/test-all-civic-nodiam.png', fullPage: true });
  } catch (e) {
    console.log('Error:', e.message.substring(0, 80));
  }

  // Test 6: Intercept network requests to find API endpoint
  console.log('\n=== TEST 6: Network intercept ===');
  const requests = [];
  page.on('request', req => {
    const url = req.url();
    if (url.includes('.asp') || url.includes('wheel') || url.includes('Wheel') || url.includes('search')) {
      requests.push({ method: req.method(), url, postData: req.postData()?.substring(0, 200) });
    }
  });

  // Do a search that works (full selection)
  await page.locator('#selectyear:visible').selectOption('2025');
  await delay(300);
  await page.locator('#selectmake:visible').selectOption('HONDA');
  await delay(300);
  await page.locator('#selectmodel:visible').selectOption('CIVIC');
  await delay(300);
  await page.locator('#selectdiameter:visible').selectOption('17');
  await delay(300);
  await page.locator('input[type="radio"]:visible').nth(2).click();
  await delay(3000);

  console.log('\nCaptured requests:');
  for (const r of requests) {
    console.log(`  ${r.method} ${r.url}`);
    if (r.postData) console.log(`    POST: ${r.postData}`);
  }

  await delay(5000);
  await browser.close();
})();
