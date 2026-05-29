const { chromium } = require('playwright');
const fs = require('fs');
const config = require('./config');

const pathMod = require('path');
const DATA_DIR = pathMod.join(__dirname, '..', 'data');
const DELAY = 400;
const MIN_YEAR = 2010; // Scrape 2010-present (widened from 2012 on 2026-05-26)

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function save(filename, data) {
  fs.writeFileSync(`${DATA_DIR}/${filename}`, JSON.stringify(data, null, 2));
}

function loadIfExists(filename) {
  const fpath = `${DATA_DIR}/${filename}`;
  if (fs.existsSync(fpath)) return JSON.parse(fs.readFileSync(fpath, 'utf8'));
  return null;
}

// ─── PHASE 1: Build Year/Make/Model/Diameter tree ───
async function scrapeWheelTree(page) {
  console.log('\n========================================');
  console.log('PHASE 1: WHEEL YEAR/MAKE/MODEL TREE');
  console.log('========================================');

  // Load existing tree (if any) and merge in any missing years.
  // The MIN_YEAR may have been widened since the last run, so we need to
  // walk any year >= MIN_YEAR that isn't already in the tree.
  const tree = loadIfExists('alltire-wheel-tree.json') || {};
  const existingYears = Object.keys(tree).map(Number);
  if (existingYears.length) {
    console.log(`Existing tree: ${existingYears.length} years (min ${Math.min(...existingYears)}, max ${Math.max(...existingYears)})`);
  }

  await page.locator('text=/Wheel Search/i').first().click();
  await delay(1000);

  const yearSelect = page.locator('select:visible').first();
  const yearOpts = await yearSelect.locator('option').allTextContents();
  const allYears = yearOpts.filter(y => y.match(/^\d{4}$/));
  const years = allYears.filter(y => parseInt(y) >= MIN_YEAR);
  console.log(`Years: ${years.length} (${years[0]} to ${years[years.length - 1]}) [filtered from ${allYears.length} total]`);

  const yearsToWalk = years.filter(y => !tree[y] || Object.keys(tree[y]).length === 0);
  if (yearsToWalk.length === 0) {
    console.log('Tree already covers all target years. Skipping rebuild.');
    return tree;
  }
  console.log(`Years to walk this run: ${yearsToWalk.length} (${yearsToWalk.join(', ')})`);

  for (let yi = 0; yi < yearsToWalk.length; yi++) {
    const year = yearsToWalk[yi];
    process.stdout.write(`\n[${yi + 1}/${yearsToWalk.length}] ${year}: `);

    await yearSelect.selectOption(year);
    await delay(DELAY);

    const makeSelect = page.locator('select:visible').nth(1);
    await delay(300);
    const makeOpts = await makeSelect.locator('option').allTextContents();
    const makes = makeOpts.filter(m => m && !m.includes('select'));

    tree[year] = {};
    process.stdout.write(`${makes.length} makes `);

    for (const make of makes) {
      await makeSelect.selectOption(make);
      await delay(DELAY);

      const modelSelect = page.locator('select:visible').nth(2);
      await delay(200);
      const modelOpts = await modelSelect.locator('option').allTextContents();
      const models = modelOpts.filter(m => m && !m.includes('select'));

      // For each model, get available diameters
      tree[year][make] = {};
      for (const model of models) {
        await modelSelect.selectOption(model);
        await delay(300);

        const diamSelect = page.locator('select:visible').nth(3);
        await delay(200);
        const diamOpts = await diamSelect.locator('option').allTextContents();
        const diameters = diamOpts.filter(d => d && !d.includes('select') && d.match(/\d/));

        tree[year][make][model] = diameters;
      }

      process.stdout.write('.');
    }

    // Save progress after each year
    save('alltire-wheel-tree.json', tree);
  }

  // Count total combos
  let totalCombos = 0;
  for (const year of Object.keys(tree)) {
    for (const make of Object.keys(tree[year])) {
      for (const model of Object.keys(tree[year][make])) {
        totalCombos += Math.max(1, tree[year][make][model].length);
      }
    }
  }
  console.log(`\n\nTree complete. Total search combinations: ${totalCombos}`);
  save('alltire-wheel-tree.json', tree);
  return tree;
}

// ─── PHASE 2: Scrape wheel products ───
// Flow: Year → Make → Model → Diameter → select "All" type → read table
async function scrapeWheelProducts(page, tree) {
  console.log('\n========================================');
  console.log('PHASE 2: WHEEL PRODUCT SCRAPING');
  console.log('========================================');

  const allProducts = loadIfExists('alltire-wheels.json') || [];
  const scraped = new Set(loadIfExists('alltire-wheels-scraped.json') || []);
  console.log(`Resuming: ${allProducts.length} products, ${scraped.size} combos already scraped`);

  await page.locator('text=/Wheel Search/i').first().click();
  await delay(1000);

  // Count total combos (year/make/model/diameter)
  let totalCombos = 0;
  for (const year of Object.keys(tree)) {
    for (const make of Object.keys(tree[year])) {
      for (const model of Object.keys(tree[year][make])) {
        const diams = tree[year][make][model];
        totalCombos += diams.length || 1;
      }
    }
  }
  console.log(`Total Year/Make/Model/Diameter combos: ${totalCombos}`);

  let comboCount = 0;

  for (const year of Object.keys(tree)) {
    for (const make of Object.keys(tree[year])) {
      for (const model of Object.keys(tree[year][make])) {
        const diameters = tree[year][make][model];
        if (diameters.length === 0) {
          comboCount++;
          continue;
        }

        for (const diameter of diameters) {
          comboCount++;
          const key = `${year}|${make}|${model}|${diameter}`;

          if (scraped.has(key)) continue;

          process.stdout.write(`[${comboCount}/${totalCombos}] ${year} ${make} ${model} ${diameter}" `);

          try {
            // Select Year → Make → Model → Diameter
            await page.locator('#selectyear:visible').selectOption(year);
            await delay(300);
            await page.locator('#selectmake:visible').selectOption(make);
            await delay(300);
            await page.locator('#selectmodel:visible').selectOption(model);
            await delay(300);
            await page.locator('#selectdiameter:visible, select:visible').nth(3).selectOption(diameter);
            await delay(300);

            // Click "All" radio (Steel + Alloy)
            const radios = await page.locator('input[type="radio"]:visible').all();
            if (radios.length >= 3) {
              await radios[2].click();
            }

            // Wait for the wheel result table to load
            await delay(1500);

            // Extract products from the wheel result table
            // Confirmed column mapping (15-cell rows):
            // [0]=rowNum [1]=hubCentric [2]=empty [3]=productNo [4]=image
            // [5]=type(Steel/Alloy) [6]=description(size+specs) [7]=price [8]=msrp [9]=stock
            // [10-13]=qty controls [14]=Add button
            const products = await page.evaluate(() => {
              const rows = [];
              const trs = document.querySelectorAll('tr');
              for (const tr of trs) {
                const tds = tr.querySelectorAll('td');
                // Product rows have exactly 15 cells and cell[0] is a row number
                if (tds.length === 15) {
                  const rowNum = tds[0]?.textContent?.trim() || '';
                  if (rowNum.match(/^\d+$/)) {
                    const getText = (i) => tds[i]?.textContent?.trim() || '';
                    const getImg = (i) => {
                      const img = tds[i]?.querySelector('img');
                      if (!img) return '';
                      // Filter out arrow/UI images
                      const src = img.src || '';
                      if (src.includes('Arrow') || src.includes('arrow')) return '';
                      return src;
                    };
                    rows.push({
                      no: rowNum,
                      hubCentric: getText(1) === 'Hub Centric',
                      productNo: getText(3),
                      image: getImg(4),
                      wheelType: getText(5),
                      description: getText(6),
                      price: getText(7),
                      msrp: getText(8),
                      stock: getText(9),
                    });
                  }
                }
              }
              return rows;
            });

            for (const p of products) {
              p.supplier = 'alltire';
              p.category = 'wheel';
              p.vehicleYear = year;
              p.vehicleMake = make;
              p.vehicleModel = model;
              p.diameter = diameter;
              allProducts.push(p);
            }

            process.stdout.write(`→ ${products.length} products\n`);
            scraped.add(key);

            // Save every 50 combos
            if (comboCount % 50 === 0) {
              save('alltire-wheels.json', allProducts);
              save('alltire-wheels-scraped.json', [...scraped]);
              console.log(`  [SAVED] ${allProducts.length} total products`);
            }

          } catch (e) {
            console.log(`ERROR: ${e.message.substring(0, 80)}`);
            try {
              await page.locator('text=/Wheel Search/i').first().click();
              await delay(1000);
            } catch (e2) {}
          }
        }
      }
    }
  }

  save('alltire-wheels.json', allProducts);
  save('alltire-wheels-scraped.json', [...scraped]);
  console.log(`\nWheel scraping complete: ${allProducts.length} total products`);
  return allProducts;
}

// ─── MAIN ───
(async () => {
  console.log('Starting Alltire Wheel Scraper...');
  console.log('Time:', new Date().toISOString());

  const browser = await chromium.launch({ headless: false, slowMo: 30 });
  const page = await browser.newPage();

  // Login
  await page.goto(config.alltire.url, { waitUntil: 'networkidle' });
  await page.fill('input[type="text"]', config.alltire.username);
  await page.fill('input[type="password"]', config.alltire.password);
  await page.locator('button:has-text("Sign In"), input[type="submit"]').first().click();
  await page.waitForLoadState('networkidle');
  await delay(2000);
  console.log('Logged in as:', config.alltire.username);

  // Phase 1: Build tree
  const tree = await scrapeWheelTree(page);

  // Phase 2: Scrape products
  await scrapeWheelProducts(page, tree);

  console.log('\n========================================');
  console.log('WHEEL SCRAPING COMPLETE');
  console.log('Time:', new Date().toISOString());
  console.log('========================================');

  await browser.close();
})();
