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

  // Select 2025
  await page.locator('select:visible').first().selectOption('2025');
  await delay(800);

  // List makes
  const makeOpts = await page.locator('select:visible').nth(1).locator('option').allTextContents();
  console.log('Makes:', makeOpts.filter(m => !m.includes('select')).join(', '));

  // Select HONDA
  await page.locator('select:visible').nth(1).selectOption('HONDA');
  await delay(800);

  // List models (these are the ACTUAL option values)
  const modelSel = page.locator('select:visible').nth(2);
  const modelOpts = await modelSel.locator('option').allTextContents();
  const modelVals = await modelSel.locator('option').evaluateAll(opts => opts.map(o => ({ text: o.textContent, value: o.value })));
  console.log('\nHonda models (text / value):');
  modelVals.forEach(m => console.log(`  "${m.text}" -> value="${m.value}"`));

  // Select the first real model by value
  const firstModel = modelVals.find(m => m.value && m.value !== '' && !m.text.includes('select'));
  if (firstModel) {
    console.log(`\nSelecting: ${firstModel.text} (value=${firstModel.value})`);
    await modelSel.selectOption(firstModel.value);
    await delay(1000);

    // Click "All" for wheel type
    const radios = await page.locator('input[type="radio"]:visible').all();
    if (radios.length >= 3) await radios[2].click();
    await delay(2000);

    await page.screenshot({ path: 'scrapers/screenshots/test-wheel-honda.png', fullPage: true });

    // Now check what loaded
    const tables = await page.locator('table:visible').all();
    console.log('\nVisible tables:', tables.length);

    for (let t = 0; t < tables.length; t++) {
      const rows = await tables[t].locator('tr').all();
      console.log(`\nTable ${t}: ${rows.length} rows`);
      for (let r = 0; r < Math.min(rows.length, 15); r++) {
        const tds = await rows[r].locator('td').allTextContents();
        if (tds.length > 3) {
          console.log(`  Row ${r}: ${tds.map(t => t.trim()).filter(Boolean).join(' | ')}`);
        }
      }
    }

    // Check Tabulator
    const tabCount = await page.locator('.tabulator-row').count();
    console.log('\nTabulator rows:', tabCount);

    // Check the lower table area (order table)
    const orderTable = await page.evaluate(() => {
      const trs = document.querySelectorAll('tr');
      const data = [];
      trs.forEach(tr => {
        const tds = Array.from(tr.querySelectorAll('td'));
        if (tds.length >= 8) {
          const texts = tds.map(td => td.textContent.trim());
          if (texts[0] && texts[0].match(/^\d+$/)) {
            data.push(texts);
          }
        }
      });
      return data;
    });
    console.log('\nOrder table rows with data:', orderTable.length);
    orderTable.slice(0, 5).forEach(row => console.log('  ', row.join(' | ')));
  }

  await delay(10000);
  await browser.close();
})();
