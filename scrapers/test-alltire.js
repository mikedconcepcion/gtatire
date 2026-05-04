const { chromium } = require('playwright');
const fs = require('fs');
const config = require('./config');

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();

  // Login
  await page.goto(config.alltire.url, { waitUntil: 'networkidle' });
  await page.fill('input[type="text"]', config.alltire.username);
  await page.fill('input[type="password"]', config.alltire.password);
  await page.locator('button:has-text("Sign In"), input[type="submit"]').first().click();
  await page.waitForLoadState('networkidle');
  await delay(2000);
  console.log('Logged in');

  // Dump the HTML structure to understand the tab/frame layout
  const html = await page.content();
  fs.writeFileSync('scrapers/screenshots/alltire-page.html', html);
  console.log('Full HTML saved to scrapers/screenshots/alltire-page.html');

  // Check all select elements and their visibility
  const allSelects = await page.locator('select').all();
  console.log(`\nTotal <select> elements: ${allSelects.length}`);
  for (let i = 0; i < allSelects.length; i++) {
    const sel = allSelects[i];
    const id = await sel.getAttribute('id') || '';
    const visible = await sel.isVisible();
    const optCount = await sel.locator('option').count();
    console.log(`  [${i}] id="${id}" visible=${visible} options=${optCount}`);
  }

  // ─── TEST 1: Try Ordering tab tire search ───
  console.log('\n=== TIRE SEARCH (Quick Size) ===');

  // Find all visible inputs
  const visibleInputs = [];
  const allInputs = await page.locator('input').all();
  for (let i = 0; i < allInputs.length; i++) {
    const inp = allInputs[i];
    const visible = await inp.isVisible();
    if (visible) {
      const type = await inp.getAttribute('type') || '';
      const name = await inp.getAttribute('name') || '';
      const id = await inp.getAttribute('id') || '';
      visibleInputs.push({ index: i, type, name, id, element: inp });
      console.log(`  Visible input [${i}]: type=${type} name=${name} id=${id}`);
    }
  }

  // Search by Quick Size 2254517 (225/45R17)
  try {
    // Find Quick Size input by context
    const quickSizeInput = page.locator('input:visible[type="text"]').first();
    await quickSizeInput.fill('2254517');
    console.log('Filled Quick Size: 2254517');

    // Click Search button
    await page.locator('button:visible:has-text("Search"), input:visible[value="Search"]').first().click();
    await delay(2000);

    await page.screenshot({ path: 'scrapers/screenshots/alltire-tire-search-results.png', fullPage: true });

    // Read results from order table area
    const bodyText = await page.locator('body').innerText();
    // Find the results portion
    const lines = bodyText.split('\n').filter(l => l.trim());
    console.log('\nPage text after search:');
    for (const line of lines.slice(0, 50)) {
      console.log(`  ${line}`);
    }
  } catch (e) {
    console.log('Quick size search error:', e.message);
  }

  // ─── TEST 2: Click Wheel Search tab ───
  console.log('\n=== WHEEL SEARCH TAB ===');
  try {
    await page.locator('text=/Wheel Search/i').first().click();
    await delay(1500);
    await page.screenshot({ path: 'scrapers/screenshots/alltire-wheel-tab-active.png', fullPage: true });

    // Now find visible selects
    const visSelects = await page.locator('select:visible').all();
    console.log(`Visible selects after clicking Wheel tab: ${visSelects.length}`);
    for (let i = 0; i < visSelects.length; i++) {
      const sel = visSelects[i];
      const id = await sel.getAttribute('id') || '';
      const opts = await sel.locator('option').allTextContents();
      console.log(`  [${i}] id="${id}" options: ${opts.slice(0, 8).join(', ')}`);
    }

    // Select Year using visible select
    const yearSel = page.locator('select:visible').first();
    await yearSel.selectOption('2025');
    await delay(800);

    // Get makes
    const makeSel = page.locator('select:visible').nth(1);
    const makes = await makeSel.locator('option').allTextContents();
    console.log(`\n2025 Makes: ${makes.filter(m => !m.includes('select')).join(', ')}`);

    // Select a make
    const testMake = makes.find(m => m === 'Honda') || makes.find(m => m === 'Toyota') || makes[1];
    if (testMake && !testMake.includes('select')) {
      await makeSel.selectOption(testMake);
      await delay(800);

      const modelSel = page.locator('select:visible').nth(2);
      const models = await modelSel.locator('option').allTextContents();
      console.log(`${testMake} Models: ${models.filter(m => !m.includes('select')).join(', ')}`);

      // Select first model
      const testModel = models.find(m => !m.includes('select'));
      if (testModel) {
        await modelSel.selectOption(testModel);
        await delay(800);

        // Check diameter dropdown
        const diamSel = page.locator('select:visible').nth(3);
        const diameters = await diamSel.locator('option').allTextContents();
        console.log(`Diameters: ${diameters.join(', ')}`);

        // Click "All" radio button for wheel type
        const radios = await page.locator('input[type="radio"]:visible').all();
        console.log(`Visible radios: ${radios.length}`);
        for (const radio of radios) {
          const val = await radio.getAttribute('value') || '';
          const checked = await radio.isChecked();
          console.log(`  Radio value="${val}" checked=${checked}`);
        }

        // Click the "All" radio if it exists
        try {
          await page.locator('input[type="radio"]:visible').nth(2).click(); // 3rd = "All"
          await delay(1500);
        } catch (e) {}

        await page.screenshot({ path: 'scrapers/screenshots/alltire-wheel-results.png', fullPage: true });

        // Get results
        const bodyText = await page.locator('body').innerText();
        const lines = bodyText.split('\n').filter(l => l.trim());
        console.log('\nWheel search results:');
        for (const line of lines.slice(0, 60)) {
          console.log(`  ${line}`);
        }
      }
    }
  } catch (e) {
    console.log('Wheel search error:', e.message);
  }

  // ─── TEST 3: Tire Fitment ───
  console.log('\n=== TIRE FITMENT TAB ===');
  try {
    await page.locator('text=/Tire Fitment/i').first().click();
    await delay(1500);

    const fitSelects = await page.locator('select:visible').all();
    console.log(`Visible selects on fitment: ${fitSelects.length}`);

    if (fitSelects.length >= 3) {
      await fitSelects[0].selectOption('2025');
      await delay(800);
      const fitMakes = await fitSelects[1].locator('option').allTextContents();
      console.log('Fitment makes:', fitMakes.filter(m => !m.includes('select')).join(', '));

      const honda = fitMakes.find(m => m === 'Honda');
      if (honda) {
        await fitSelects[1].selectOption(honda);
        await delay(800);
        const fitModels = await fitSelects[2].locator('option').allTextContents();
        console.log('Honda models:', fitModels.filter(m => !m.includes('select')).join(', '));

        const civic = fitModels.find(m => m.includes('Civic'));
        if (civic) {
          await fitSelects[2].selectOption(civic);
          await delay(1500);
          await page.screenshot({ path: 'scrapers/screenshots/alltire-fitment-civic.png', fullPage: true });

          const bodyText = await page.locator('body').innerText();
          console.log('\nFitment result:');
          console.log(bodyText.substring(0, 2000));
        }
      }
    }
  } catch (e) {
    console.log('Fitment error:', e.message);
  }

  console.log('\nTest done. Closing in 10 seconds...');
  await delay(10000);
  await browser.close();
})();
