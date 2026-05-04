const { chromium } = require('playwright');
const fs = require('fs');
const config = require('./config');

const pathMod = require('path');
const DATA_DIR = pathMod.join(__dirname, '..', 'data');
const DELAY = 400;
const MIN_YEAR = 2020;

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function save(filename, data) {
  fs.writeFileSync(`${DATA_DIR}/${filename}`, JSON.stringify(data, null, 2));
}

function loadIfExists(filename) {
  const fpath = `${DATA_DIR}/${filename}`;
  if (fs.existsSync(fpath)) return JSON.parse(fs.readFileSync(fpath, 'utf8'));
  return null;
}

// ─── Scrape tires via Quick Size search ───
// Quick Size format: WWWAARD (width + aspect + rim diameter, no separators)
// e.g., 2254517 = 225/45R17

function generateTireSizes() {
  const widths = [
    '145', '155', '165', '175', '185', '195', '205', '215',
    '225', '235', '245', '255', '265', '275', '285', '295',
    '305', '315', '325', '335', '345', '355'
  ];
  const aspects = ['25', '30', '35', '40', '45', '50', '55', '60', '65', '70', '75', '80', '85'];
  const rims = ['13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '24', '26'];

  const sizes = [];
  for (const w of widths) {
    for (const a of aspects) {
      for (const r of rims) {
        sizes.push({ quickSize: `${w}${a}${r}`, display: `${w}/${a}R${r}`, width: w, aspect: a, rim: r });
      }
    }
  }
  return sizes;
}

// Also search LT (light truck) sizes
function generateLTSizes() {
  const widths = ['215', '225', '235', '245', '255', '265', '275', '285', '295', '305', '315', '325', '335'];
  const aspects = ['45', '50', '55', '60', '65', '70', '75', '80', '85'];
  const rims = ['15', '16', '17', '18', '19', '20', '22'];

  const sizes = [];
  for (const w of widths) {
    for (const a of aspects) {
      for (const r of rims) {
        // LT prefix format in Full Size: LT225/75R16
        sizes.push({ fullSize: `LT${w}/${a}R${r}`, display: `LT${w}/${a}R${r}`, width: w, aspect: a, rim: r, lt: true });
      }
    }
  }
  return sizes;
}

async function scrapeTiresByQuickSize(page) {
  console.log('\n========================================');
  console.log('TIRE SCRAPING - Quick Size Search');
  console.log('========================================');

  const allTires = loadIfExists('alltire-tires.json') || [];
  const scraped = new Set(loadIfExists('alltire-tires-scraped.json') || []);
  console.log(`Resuming: ${allTires.length} products, ${scraped.size} sizes already scraped`);

  // Make sure we're on the Ordering tab
  await page.locator('text=/^Ordering$/i').first().click();
  await delay(1000);

  const sizes = generateTireSizes();
  console.log(`Total size combinations to search: ${sizes.length}`);

  let searchCount = 0;
  let emptyCount = 0;

  for (const size of sizes) {
    searchCount++;
    if (scraped.has(size.quickSize)) continue;

    process.stdout.write(`[${searchCount}/${sizes.length}] ${size.display} `);

    try {
      // Clear previous search
      await page.locator('input:visible[value="Clear"], button:visible:has-text("Clear")').first().click();
      await delay(200);

      // Fill Quick Size field
      const qsInput = page.locator('#textqs');
      await qsInput.fill(size.quickSize);

      // Click Search
      await page.locator('input:visible[value="Search"], button:visible:has-text("Search")').first().click();
      await delay(800);

      // Wait for results - check the item count text
      // The page shows "XX Items" next to search
      const bodyText = await page.locator('body').innerText();
      const itemMatch = bodyText.match(/(\d+)\s*Items?/i);
      const itemCount = itemMatch ? parseInt(itemMatch[1]) : 0;

      if (itemCount === 0) {
        process.stdout.write(`→ 0\n`);
        emptyCount++;
        scraped.add(size.quickSize);
        continue;
      }

      process.stdout.write(`→ ${itemCount} items `);

      // Wait for iframe to load the results
      await delay(1500);

      // The tire results load in an iframe called "itemframe"
      const itemFrame = page.frame('itemframe');
      let products = [];

      if (itemFrame) {
        // Wait for content in the iframe
        await delay(1000);

        products = await itemFrame.evaluate(() => {
          const rows = [];
          // Try Tabulator rows
          const tabRows = document.querySelectorAll('.tabulator-row');
          for (const row of tabRows) {
            const cells = row.querySelectorAll('.tabulator-cell');
            if (cells.length >= 6) {
              const getText = (i) => cells[i]?.textContent?.trim() || '';
              const getImg = (i) => {
                const img = cells[i]?.querySelector('img');
                return img ? img.src : '';
              };
              rows.push({
                no: getText(0),
                productNo: getText(1),
                image: getImg(2),
                evRf: getText(3),
                description: getText(4),
                maker: getText(5),
                model: getText(6),
                size: getText(7),
                price: getText(8),
                msrp: getText(9),
                stock: getText(10),
                type: getText(12)
              });
            }
          }

          // Fallback: try regular table
          if (rows.length === 0) {
            const trs = document.querySelectorAll('tr');
            for (const tr of trs) {
              const tds = tr.querySelectorAll('td');
              if (tds.length >= 8) {
                const getText = (i) => tds[i]?.textContent?.trim() || '';
                const getImg = (i) => {
                  const img = tds[i]?.querySelector('img');
                  return img ? img.src : '';
                };
                if (getText(0).match(/^\d+$/) || getText(1).match(/^\d+$/)) {
                  rows.push({
                    no: getText(0),
                    productNo: getText(1),
                    image: getImg(2),
                    evRf: getText(3),
                    description: getText(4),
                    maker: getText(5),
                    model: getText(6),
                    size: getText(7),
                    price: getText(8),
                    msrp: getText(9),
                    stock: getText(10),
                    type: getText(12)
                  });
                }
              }
            }
          }

          // Last resort: get all text
          if (rows.length === 0) {
            return [{ rawText: document.body?.innerText?.substring(0, 5000) || 'empty' }];
          }

          return rows;
        });
      }

      // If iframe didn't work, try main page
      if (!products || products.length === 0 || products[0]?.rawText) {
        products = await page.evaluate(() => {
          const rows = [];
          const tabRows = document.querySelectorAll('.tabulator-row:visible, .tabulator-row');
          for (const row of tabRows) {
            const cells = row.querySelectorAll('.tabulator-cell');
            if (cells.length >= 6) {
              const getText = (i) => cells[i]?.textContent?.trim() || '';
              rows.push({
                no: getText(0),
                productNo: getText(1),
                description: getText(4) || getText(2),
                maker: getText(5) || getText(3),
                model: getText(6) || getText(4),
                size: getText(7) || getText(5),
                price: getText(8) || getText(6),
                msrp: getText(9) || getText(7),
                stock: getText(10) || getText(8)
              });
            }
          }
          return rows;
        });
      }

      // Add metadata
      const cleanProducts = (products || []).filter(p => p.productNo && !p.rawText);
      for (const p of cleanProducts) {
        p.supplier = 'alltire';
        p.category = 'tire';
        p.searchSize = size.display;
        p.searchWidth = size.width;
        p.searchAspect = size.aspect;
        p.searchRim = size.rim;
        allTires.push(p);
      }

      process.stdout.write(`(scraped ${cleanProducts.length})\n`);
      scraped.add(size.quickSize);

      // Log raw text if we got it but no structured data
      if (products && products[0]?.rawText && itemCount > 0) {
        console.log(`  WARNING: Got ${itemCount} items but couldn't parse. Raw sample:`);
        console.log(`  ${products[0].rawText.substring(0, 200)}`);
      }

    } catch (e) {
      console.log(`ERROR: ${e.message.substring(0, 80)}`);
      // Recovery
      try {
        await page.locator('text=/^Ordering$/i').first().click();
        await delay(1000);
      } catch (e2) {}
    }

    // Save every 50 searches
    if (searchCount % 50 === 0) {
      save('alltire-tires.json', allTires);
      save('alltire-tires-scraped.json', [...scraped]);
      console.log(`  [SAVED] ${allTires.length} total tire products, ${scraped.size} sizes searched`);
    }
  }

  save('alltire-tires.json', allTires);
  save('alltire-tires-scraped.json', [...scraped]);
  console.log(`\nTire scraping complete: ${allTires.length} total products`);
  return allTires;
}

// ─── Scrape tire fitment data (Year/Make/Model → OEM sizes) ───
async function scrapeFitment(page) {
  console.log('\n========================================');
  console.log('TIRE FITMENT DATA');
  console.log('========================================');

  const fitment = loadIfExists('alltire-fitment.json') || {};
  const scrapedFit = new Set(Object.keys(fitment));

  await page.locator('text=/Tire Fitment/i').first().click();
  await delay(1000);

  const yearSelect = page.locator('select:visible').first();
  const yearOpts = await yearSelect.locator('option').allTextContents();
  const allYears = yearOpts.filter(y => y.match(/^\d{4}$/));
  const years = allYears.filter(y => parseInt(y) >= MIN_YEAR);
  console.log(`Fitment years: ${years.length} (${MIN_YEAR}+, filtered from ${allYears.length})`);

  let count = 0;

  for (const year of years) {
    await yearSelect.selectOption(year);
    await delay(DELAY);

    const makeSelect = page.locator('select:visible').nth(1);
    await delay(300);
    const makeOpts = await makeSelect.locator('option').allTextContents();
    const makes = makeOpts.filter(m => m && !m.includes('select'));

    for (const make of makes) {
      await makeSelect.selectOption(make);
      await delay(DELAY);

      const modelSelect = page.locator('select:visible').nth(2);
      await delay(300);
      const modelOpts = await modelSelect.locator('option').allTextContents();
      const models = modelOpts.filter(m => m && !m.includes('select'));

      for (const model of models) {
        count++;
        const key = `${year}|${make}|${model}`;
        if (scrapedFit.has(key)) continue;

        await modelSelect.selectOption(model);
        await delay(800);

        // Read the fitment result (shown on page after selecting model)
        const bodyText = await page.locator('body').innerText();

        // Extract tire sizes from the page - typically shown as a list
        const sizePattern = /\b[P|LT]?\d{3}\/\d{2}R\d{2,3}\b/g;
        const sizes = bodyText.match(sizePattern) || [];

        // Also get the full text around the fitment area
        const fitmentText = bodyText.substring(
          bodyText.indexOf(model) > -1 ? bodyText.indexOf(model) : 0,
          Math.min(bodyText.length, (bodyText.indexOf(model) > -1 ? bodyText.indexOf(model) : 0) + 500)
        );

        fitment[key] = {
          year, make, model,
          oeSizes: [...new Set(sizes)],
          rawText: fitmentText.substring(0, 300)
        };

        if (sizes.length > 0) {
          process.stdout.write(`[${count}] ${year} ${make} ${model} → ${sizes.join(', ')}\n`);
        }
      }
    }

    // Save after each year
    save('alltire-fitment.json', fitment);
    process.stdout.write(`  [SAVED] ${Object.keys(fitment).length} fitment entries (year ${year} done)\n`);
  }

  save('alltire-fitment.json', fitment);
  console.log(`\nFitment scraping complete: ${Object.keys(fitment).length} entries`);
  return fitment;
}

// ─── MAIN ───
(async () => {
  console.log('Starting Alltire Tire Scraper...');
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
  console.log('Logged in');

  // Phase 1: Fitment data (fast - just Year/Make/Model -> OEM sizes)
  await scrapeFitment(page);

  // Phase 2: Full tire catalog via Quick Size search
  await scrapeTiresByQuickSize(page);

  console.log('\n========================================');
  console.log('TIRE SCRAPING COMPLETE');
  console.log('Time:', new Date().toISOString());
  console.log('========================================');

  await browser.close();
})();
