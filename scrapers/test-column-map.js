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

  // Select 2025 ACURA INTEGRA, diameter not selected yet
  await page.locator('#selectyear:visible').selectOption('2025');
  await delay(500);
  await page.locator('#selectmake:visible').selectOption('HONDA');
  await delay(500);
  await page.locator('#selectmodel:visible').selectOption('CIVIC');
  await delay(500);

  // Get available diameters
  const diamOpts = await page.locator('#selectdiameter:visible').locator('option').allTextContents();
  console.log('Diameters:', diamOpts);
  const firstDiam = diamOpts.find(d => d.match(/^\d+$/));
  console.log('Selecting diameter:', firstDiam);

  await page.locator('#selectdiameter:visible').selectOption(firstDiam);
  await delay(500);

  // Click "All" radio
  const radios = await page.locator('input[type="radio"]:visible').all();
  if (radios.length >= 3) await radios[2].click();
  await delay(2000);

  await page.screenshot({ path: 'scrapers/screenshots/test-column-map.png', fullPage: true });

  // Dump every TR with its TD contents and indices
  const allRows = await page.evaluate(() => {
    const results = [];
    const trs = document.querySelectorAll('tr');
    for (let i = 0; i < trs.length; i++) {
      const tds = trs[i].querySelectorAll('td');
      if (tds.length >= 10) {
        const cells = [];
        for (let j = 0; j < tds.length; j++) {
          const text = tds[j].textContent.trim().substring(0, 50);
          const img = tds[j].querySelector('img');
          const imgSrc = img ? img.src.substring(0, 80) : '';
          cells.push({ idx: j, text, img: imgSrc });
        }
        results.push({ trIndex: i, cellCount: tds.length, cells });
      }
    }
    return results;
  });

  console.log('\n=== ALL ROWS WITH 10+ CELLS ===');
  for (const row of allRows) {
    console.log(`\nTR[${row.trIndex}] — ${row.cellCount} cells:`);
    for (const cell of row.cells) {
      const extra = cell.img ? ` [IMG: ${cell.img}]` : '';
      console.log(`  [${cell.idx}] "${cell.text}"${extra}`);
    }
  }

  await delay(5000);
  await browser.close();
})();
