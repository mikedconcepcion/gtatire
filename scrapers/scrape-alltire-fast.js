const { chromium } = require('playwright');
const fs = require('fs');
const pathMod = require('path');
const config = require('./config');

const DATA_DIR = pathMod.join(__dirname, '..', 'data');
const DELAY = 200; // Fast — just API calls, no page rendering needed
const CID = '6340'; // Customer ID from the API URL

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function save(filename, data) {
  fs.writeFileSync(`${DATA_DIR}/${filename}`, JSON.stringify(data, null, 2));
}
function loadIfExists(filename) {
  const fpath = `${DATA_DIR}/${filename}`;
  if (fs.existsSync(fpath)) return JSON.parse(fs.readFileSync(fpath, 'utf8'));
  return null;
}

// Parse the HTML response from searchWheel.asp
function parseWheelHtml(html, year, make, model, diameter) {
  const products = [];
  // Each product row: <tr onclick='clickWheelTr...'>
  const rowPattern = /<tr onclick='clickWheelTr[^>]*>([\s\S]*?)<\/tr>/g;
  let match;

  while ((match = rowPattern.exec(html)) !== null) {
    const rowHtml = match[1];
    // Extract all <td> contents
    const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/g;
    const cells = [];
    let tdMatch;
    while ((tdMatch = tdPattern.exec(rowHtml)) !== null) {
      cells.push(tdMatch[1]);
    }

    if (cells.length < 10) continue;

    // Extract text from cell (strip HTML tags)
    const getText = (html) => html.replace(/<[^>]*>/g, '').trim();
    // Extract img src
    const getImg = (html) => {
      const imgMatch = html.match(/src='([^']+)'/);
      if (imgMatch) {
        const src = imgMatch[1];
        if (src.includes('Arrow')) return '';
        return src.startsWith('/') ? `https://alltire.ca${src}` : src;
      }
      return '';
    };
    // Extract hidden price from id attribute
    const getPrice = (html) => {
      const priceMatch = html.match(/id='(\$[^']+)'/);
      return priceMatch ? priceMatch[1] : getText(html);
    };

    const product = {
      no: getText(cells[0]),
      filter1: getText(cells[1]), // "Hub Centric" or empty
      filter2: getText(cells[2]), // EV-RF or empty
      productNo: getText(cells[3]),
      image: getImg(cells[4]),
      wheelType: getText(cells[5]),
      description: getText(cells[6]),
      dealerPrice: getPrice(cells[7]),
      msrp: getText(cells[8]),
      stock: getText(cells[9]),
      // Metadata
      supplier: 'alltire',
      category: 'wheel',
      vehicleYear: year,
      vehicleMake: make,
      vehicleModel: model,
      diameter: diameter,
      hubCentric: getText(cells[1]).includes('Hub Centric'),
    };

    if (product.productNo) {
      products.push(product);
    }
  }

  return products;
}

// ─── MAIN ───
(async () => {
  console.log('=== ALLTIRE FAST API SCRAPER ===');
  console.log('Time:', new Date().toISOString());

  // Load the tree
  const tree = loadIfExists('alltire-wheel-tree.json');
  if (!tree) {
    console.log('ERROR: No wheel tree found. Run scrape-alltire-wheels.js first for the tree.');
    process.exit(1);
  }

  const years = Object.keys(tree);
  console.log(`Tree loaded: ${years.length} years`);

  // Count total combos
  let totalCombos = 0;
  for (const year of years) {
    for (const make of Object.keys(tree[year])) {
      for (const model of Object.keys(tree[year][make])) {
        totalCombos += tree[year][make][model].length;
      }
    }
  }
  console.log(`Total API calls needed: ${totalCombos}`);

  // Load progress
  const allProducts = loadIfExists('alltire-wheels.json') || [];
  const scraped = new Set(loadIfExists('alltire-wheels-scraped.json') || []);
  const seenProductNos = new Set(allProducts.map(p => `${p.productNo}|${p.vehicleYear}|${p.vehicleMake}|${p.vehicleModel}`));
  console.log(`Resuming: ${allProducts.length} products, ${scraped.size} combos done`);

  // Launch browser just for session/cookies
  const browser = await chromium.launch({ headless: true }); // Headless! No UI needed
  const page = await browser.newPage();

  // Login
  await page.goto(config.alltire.url, { waitUntil: 'networkidle' });
  await page.fill('input[type="text"]', config.alltire.username);
  await page.fill('input[type="password"]', config.alltire.password);
  await page.locator('button:has-text("Sign In"), input[type="submit"]').first().click();
  await page.waitForLoadState('networkidle');
  await delay(1000);
  console.log('Logged in (headless)\n');

  let comboCount = 0;
  let newProducts = 0;
  let errors = 0;

  for (const year of years) {
    for (const make of Object.keys(tree[year])) {
      for (const model of Object.keys(tree[year][make])) {
        const diameters = tree[year][make][model];

        for (const diameter of diameters) {
          comboCount++;
          const key = `${year}|${make}|${model}|${diameter}`;
          if (scraped.has(key)) continue;

          try {
            // Call the API directly via the browser's fetch (uses session cookies)
            const apiUrl = `https://alltire.ca/searchWheel.asp?year=${encodeURIComponent(year)}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&diameter=${encodeURIComponent(diameter)}&wtype=&by=weborder&cid=${CID}&checkhub=false`;

            const html = await page.evaluate(async (url) => {
              const res = await fetch(url);
              return await res.text();
            }, apiUrl);

            if (html.includes('internal server error')) {
              process.stdout.write(`[${comboCount}/${totalCombos}] ${year} ${make} ${model} ${diameter}" → ERROR\n`);
              errors++;
            } else {
              const products = parseWheelHtml(html, year, make, model, diameter);

              for (const p of products) {
                allProducts.push(p);
                newProducts++;
              }

              if (products.length > 0) {
                process.stdout.write(`[${comboCount}/${totalCombos}] ${year} ${make} ${model} ${diameter}" → ${products.length} products\n`);
              }
            }

            scraped.add(key);
            await delay(DELAY);

          } catch (e) {
            process.stdout.write(`[${comboCount}/${totalCombos}] ${year} ${make} ${model} ${diameter}" → FAIL: ${e.message.substring(0, 60)}\n`);
            errors++;
          }

          // Save every 200 combos
          if (comboCount % 200 === 0) {
            save('alltire-wheels.json', allProducts);
            save('alltire-wheels-scraped.json', [...scraped]);
            console.log(`  [SAVED] ${allProducts.length} products, ${scraped.size}/${totalCombos} combos, ${errors} errors`);
          }
        }
      }
    }
  }

  // Final save
  save('alltire-wheels.json', allProducts);
  save('alltire-wheels-scraped.json', [...scraped]);

  console.log('\n=== SCRAPING COMPLETE ===');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Total products: ${allProducts.length}`);
  console.log(`New products this run: ${newProducts}`);
  console.log(`Combos scraped: ${scraped.size}/${totalCombos}`);
  console.log(`Errors: ${errors}`);

  // Stats
  const brands = {};
  const types = {};
  allProducts.forEach(p => {
    brands[p.wheelType] = (brands[p.wheelType] || 0) + 1;
    types[p.diameter] = (types[p.diameter] || 0) + 1;
  });
  console.log('\nBy type:', brands);
  console.log('By diameter:', types);

  await browser.close();
})();
