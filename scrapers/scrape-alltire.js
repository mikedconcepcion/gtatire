const { chromium } = require('playwright');
const fs = require('fs');
const config = require('./config');

const DATA_DIR = '../data';
const DELAY = 500; // ms between actions to be respectful

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function login(page) {
  await page.goto(config.alltire.url, { waitUntil: 'networkidle' });
  await page.fill('input[type="text"]', config.alltire.username);
  await page.fill('input[type="password"]', config.alltire.password);
  await page.locator('button:has-text("Sign In"), input[type="submit"]').first().click();
  await page.waitForLoadState('networkidle');
  await delay(1000);
  console.log('Logged into Alltire');
}

// ─── PHASE 1: Scrape Year/Make/Model tree for wheels ───
async function scrapeWheelTree(page) {
  console.log('\n=== SCRAPING WHEEL YEAR/MAKE/MODEL TREE ===');

  // Click Wheel Search tab
  await page.locator('text=/Wheel Search/i').first().click();
  await delay(1000);

  // Get all years
  const yearSelect = page.locator('#selyear');
  const years = await yearSelect.locator('option').allTextContents();
  const validYears = years.filter(y => y.match(/^\d{4}$/));
  console.log(`Years available: ${validYears.length} (${validYears[0]} - ${validYears[validYears.length - 1]})`);

  const tree = {};

  for (const year of validYears) {
    console.log(`\nYear: ${year}`);
    await yearSelect.selectOption(year);
    await delay(DELAY);

    // Wait for makes to populate
    await delay(500);
    const makeSelect = page.locator('#selmake');
    const makes = await makeSelect.locator('option').allTextContents();
    const validMakes = makes.filter(m => m && !m.includes('select'));

    tree[year] = {};
    console.log(`  Makes: ${validMakes.length}`);

    for (const make of validMakes) {
      await makeSelect.selectOption(make);
      await delay(DELAY);

      const modelSelect = page.locator('#selmodel');
      await delay(300);
      const models = await modelSelect.locator('option').allTextContents();
      const validModels = models.filter(m => m && !m.includes('select'));

      tree[year][make] = validModels;
      if (validModels.length > 0) {
        console.log(`    ${make}: ${validModels.join(', ')}`);
      }
    }
  }

  fs.writeFileSync(`${DATA_DIR}/alltire-wheel-tree.json`, JSON.stringify(tree, null, 2));
  console.log(`\nWheel tree saved to ${DATA_DIR}/alltire-wheel-tree.json`);
  return tree;
}

// ─── PHASE 2: Scrape wheel products for each Year/Make/Model ───
async function scrapeWheelProducts(page, tree) {
  console.log('\n=== SCRAPING WHEEL PRODUCTS ===');

  // Click Wheel Search tab
  await page.locator('text=/Wheel Search/i').first().click();
  await delay(1000);

  const allProducts = [];
  let count = 0;

  for (const [year, makes] of Object.entries(tree)) {
    for (const [make, models] of Object.entries(makes)) {
      for (const model of models) {
        count++;
        console.log(`[${count}] ${year} ${make} ${model}`);

        await page.locator('#selyear').selectOption(year);
        await delay(300);
        await page.locator('#selmake').selectOption(make);
        await delay(300);
        await page.locator('#selmodel').selectOption(model);
        await delay(500);

        // Check if there's a diameter dropdown to iterate
        const diamSelect = page.locator('#seldiameter, select[name*="diameter"]');
        let diameters = [];
        try {
          const diamOpts = await diamSelect.locator('option').allTextContents();
          diameters = diamOpts.filter(d => d && !d.includes('select') && d.match(/\d/));
        } catch (e) {
          // no diameter dropdown
        }

        // Click "All" radio for wheel type
        try {
          await page.locator('input[value="All"], text=All').first().click();
        } catch (e) {}
        await delay(300);

        // Read the results table
        const rows = await page.locator('table tr, .result-row').all();
        for (const row of rows) {
          const cells = await row.locator('td').allTextContents();
          if (cells.length >= 4 && cells[1] && cells[1].trim()) {
            const product = {
              supplier: 'alltire',
              type: 'wheel',
              year, make, model,
              productNo: cells[1]?.trim() || '',
              description: cells[2]?.trim() || '',
              price: cells[4]?.trim() || '',
              inStock: cells[6]?.trim() || '',
              raw: cells.map(c => c.trim())
            };
            allProducts.push(product);
          }
        }

        // Save periodically
        if (count % 50 === 0) {
          fs.writeFileSync(`${DATA_DIR}/alltire-wheels-partial.json`, JSON.stringify(allProducts, null, 2));
          console.log(`  Saved ${allProducts.length} wheel products so far...`);
        }
      }
    }
  }

  fs.writeFileSync(`${DATA_DIR}/alltire-wheels.json`, JSON.stringify(allProducts, null, 2));
  console.log(`\nTotal wheel products scraped: ${allProducts.length}`);
  return allProducts;
}

// ─── PHASE 3: Scrape tire catalog via search ───
async function scrapeTires(page) {
  console.log('\n=== SCRAPING TIRE CATALOG ===');

  // Click Ordering tab
  await page.locator('text=/^Ordering$/i').first().click();
  await delay(1000);

  // Common tire sizes to search
  const commonWidths = ['155', '165', '175', '185', '195', '205', '215', '225', '235', '245', '255', '265', '275', '285', '295', '305', '315'];
  const commonAspects = ['30', '35', '40', '45', '50', '55', '60', '65', '70', '75', '80', '85'];
  const commonDiameters = ['14', '15', '16', '17', '18', '19', '20', '22', '24'];

  const allTires = [];
  let searchCount = 0;

  for (const width of commonWidths) {
    for (const diameter of commonDiameters) {
      const quickSize = `${width}${diameter}`;
      // Only search sizes with 2-digit aspect (we'll use wildcard approach)
      // Actually use the Quick Size format: WWWAARD where WW=width, AA=aspect, RD=rim diameter
      // But quick size is compact, let's try broader searches

      searchCount++;
      console.log(`[${searchCount}] Searching width ${width}, rim ${diameter}`);

      // Use the Quick Size field with partial match
      const searchInput = page.locator('input').first(); // Quick Size input
      try {
        // Clear and search
        await page.locator('input[type="text"]').first().fill(`${width}`);
        // Actually let's use the description/maker fields for broader search

        // Reset and use structured search
        await page.locator('button:has-text("Clear"), input[value="Clear"]').first().click();
        await delay(200);

        // Search by size pattern in Full Size field
        const fullSizeInput = page.locator('input').nth(5); // Full Size field
        await fullSizeInput.fill(`${width}/${diameter}`);

        await page.locator('button:has-text("Search"), input[value="Search"]').first().click();
        await delay(1000);

        // Read results
        const rows = await page.locator('#orderTable tr, table tr').all();
        let resultCount = 0;
        for (const row of rows) {
          const cells = await row.locator('td').allTextContents();
          if (cells.length >= 4 && cells[1] && cells[1].trim()) {
            allTires.push({
              supplier: 'alltire',
              type: 'tire',
              searchQuery: `${width}/${diameter}`,
              productNo: cells[1]?.trim() || '',
              description: cells[2]?.trim() || '',
              price: cells[4]?.trim() || '',
              inStock: cells[6]?.trim() || '',
              raw: cells.map(c => c.trim())
            });
            resultCount++;
          }
        }
        console.log(`  Found ${resultCount} results`);

      } catch (e) {
        console.log(`  Error: ${e.message.substring(0, 80)}`);
      }

      // Save periodically
      if (searchCount % 20 === 0) {
        fs.writeFileSync(`${DATA_DIR}/alltire-tires-partial.json`, JSON.stringify(allTires, null, 2));
        console.log(`  Saved ${allTires.length} tire products so far...`);
      }
    }
  }

  fs.writeFileSync(`${DATA_DIR}/alltire-tires.json`, JSON.stringify(allTires, null, 2));
  console.log(`\nTotal tire products scraped: ${allTires.length}`);
  return allTires;
}

// ─── MAIN ───
(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const page = await browser.newPage();

  await login(page);

  // Phase 1: Get the Year/Make/Model tree first (fast, gives us structure)
  const tree = await scrapeWheelTree(page);

  // Phase 2: Get wheel products
  await scrapeWheelProducts(page, tree);

  // Phase 3: Get tire catalog
  await scrapeTires(page);

  console.log('\n=== SCRAPING COMPLETE ===');
  console.log('Data saved to:', DATA_DIR);

  await browser.close();
})();
