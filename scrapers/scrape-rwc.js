const { chromium } = require('playwright');
const config = require('./config');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const IMG_DIR = path.join(DATA_DIR, 'images', 'rwc');

(async () => {
  console.log('=== RWC WHEELS SCRAPER ===\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Login (retry up to 3 times)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(config.rwc.url, { waitUntil: 'networkidle', timeout: 90000 });
      break;
    } catch (e) {
      console.log(`  Login page attempt ${attempt}/3 failed: ${e.message.substring(0, 60)}`);
      if (attempt === 3) { console.log('Could not reach RWC. Check VPN.'); await browser.close(); return; }
      await page.waitForTimeout(5000);
    }
  }
  await page.fill('input[type="email"], input[name="email"], input#email, input[name="customer[email]"]', config.rwc.username);
  await page.fill('input[type="password"], input[name="password"]', config.rwc.password);
  await page.locator('button:has-text("Sign"), button:has-text("Log"), input[type="submit"]').first().click();
  await page.waitForLoadState('networkidle');
  console.log('Logged in');

  // Load all products in one page (limit=99999 shows all 964)
  console.log('Loading all RWC products...');
  await page.goto('https://gpibtob.com/index.php?route=product/search&search=RWC&limit=99999', {
    waitUntil: 'networkidle', timeout: 120000
  });
  await page.waitForTimeout(3000);

  // Parse all products from the page
  const products = await page.evaluate(() => {
    const items = [];
    const thumbs = document.querySelectorAll('.product-thumb');

    for (const thumb of thumbs) {
      try {
        // Name/title from the link
        const nameEl = thumb.querySelector('.name-product a');
        const name = nameEl?.textContent?.trim() || '';
        const url = nameEl?.href || '';

        // Image
        const imgEl = thumb.querySelector('.image img');
        const image = imgEl?.src || '';
        const imageAlt = imgEl?.alt || '';

        // Description text (has all specs)
        const descEl = thumb.querySelector('.description1') || thumb.querySelector('.description');
        const descText = descEl?.textContent?.trim() || '';

        // Parse specs from description
        const specs = {};
        const specLines = descText.split('\n').map(l => l.trim()).filter(Boolean);
        for (const line of specLines) {
          const [key, ...valParts] = line.split(':');
          if (key && valParts.length) {
            specs[key.trim()] = valParts.join(':').trim();
          }
        }

        // Dealer cost (hidden price-product div)
        const costEl = thumb.querySelector('.price-product');
        const costText = costEl?.textContent?.trim() || '';
        const cost = parseFloat(costText.replace(/[^0-9.]/g, '')) || 0;

        // Stock status — gpibtob.com renders it as <span class="green"> /
        // <span class="red"> inside <div class="rating">. The original
        // `.stock` selector matched nothing (left all 964 products blank).
        const stockEl = thumb.querySelector('.rating span');
        const stock = stockEl?.textContent?.trim() || '';

        // SKU — in <span class="pull-right"> inside .cart-button
        const skuEl = thumb.querySelector('.cart-button .pull-right');
        const sku = skuEl?.textContent?.trim() || '';

        // Parse name for structured data: "RWC AC01 / HO01 ANTHRACITE 17x7.0 5x114.3 ET45 CB64.1"
        const nameMatch = name.match(/^RWC\s+(\S+)\s*\/\s*(\S+)\s+(\S+)\s+(\d+(?:\.\d+)?x\d+(?:\.\d+)?)\s+(\dx\d+(?:\.\d+)?)\s+ET(\d+)\s+CB(\d+(?:\.\d+)?)/);

        items.push({
          name,
          url,
          image: image.replace('-270x270', ''),  // Get full-size image
          sku,
          cost,
          stock,
          finish: specs['Finish'] || (nameMatch ? nameMatch[3] : ''),
          size: specs['Size'] || (nameMatch ? nameMatch[4] : ''),
          boltPattern: specs['Bolt Pattern'] || (nameMatch ? nameMatch[5] : ''),
          offset: specs['Offset'] || (nameMatch ? 'ET' + nameMatch?.[6] : ''),
          centerBore: specs['Center Bore'] || (nameMatch ? 'CB' + nameMatch?.[7] : ''),
          loadRating: specs['Load Rating'] || '',
          tpmsCompatible: specs['TPMS COMPATIBLE'] || '',
          runflatCertified: specs['RUNFLAT CERTIFIED'] || '',
          oeCap: specs['OE Cap'] || '',
          customFit: specs['Custom Fit'] || '',
          modelCode1: nameMatch ? nameMatch[1] : '',
          modelCode2: nameMatch ? nameMatch[2] : '',
          rawSpecs: specs
        });
      } catch (e) {
        console.log('Parse error:', e.message);
      }
    }
    return items;
  });

  console.log(`Parsed ${products.length} products`);

  // Now get fitment data (Year/Make/Model) by scraping the search endpoint
  // First, get all years, makes, models
  console.log('\nFetching vehicle fitment tree...');
  const fitmentTree = {};

  // Get years
  await page.goto('https://gpibtob.com/product/searchwheel', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  const years = await page.locator('#year option').evaluateAll(opts =>
    opts.map(o => o.value).filter(v => v && v !== '')
  );
  console.log(`Years: ${years.length} (${years[0]} to ${years[years.length - 1]})`);

  // Focus on 2012+ per project decision (widened from 2020 on 2026-05-18)
  const recentYears = years.filter(y => parseFloat(y) >= 2012);
  console.log(`Scraping ${recentYears.length} years (2012+)`);

  for (const year of recentYears) {
    try {
      const carsHtml = await page.evaluate(async (y) => {
        const res = await fetch(`https://gpibtob.com/index.php?route=module/searchtyrecar/getcar&year=${y}`);
        return await res.text();
      }, year);

      const carMatches = [...carsHtml.matchAll(/<option value="(\d+)">([^<]+)<\/option>/g)];
      if (carMatches.length === 0) continue;

      fitmentTree[year] = {};

      for (const [, carId, carName] of carMatches) {
        try {
          const modelsHtml = await page.evaluate(async (params) => {
            const res = await fetch(`https://gpibtob.com/index.php?route=module/searchtyrecar/getmodel&year=${params.year}&id=${params.carId}`);
            return await res.text();
          }, { year, carId });

          const modelMatches = [...modelsHtml.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)];
          const models = modelMatches.map(m => m[1]).filter(v => v);

          if (models.length > 0) {
            fitmentTree[year][carName.trim()] = { id: carId, models };
          }
        } catch (e) {
          console.log(`    Error fetching models for ${carName} ${year}: ${e.message}`);
        }
      }

      const makeCount = Object.keys(fitmentTree[year]).length;
      const modelCount = Object.values(fitmentTree[year]).reduce((s, m) => s + m.models.length, 0);
      console.log(`  ${year}: ${makeCount} makes, ${modelCount} models`);
    } catch (e) {
      console.log(`  Error fetching year ${year}: ${e.message}`);
    }
  }

  // Save fitment tree
  fs.writeFileSync(
    path.join(DATA_DIR, 'rwc-fitment-tree.json'),
    JSON.stringify(fitmentTree, null, 2)
  );

  // Save products before fitment (in case fitment takes long/fails)
  fs.writeFileSync(
    path.join(DATA_DIR, 'rwc-wheels-raw.json'),
    JSON.stringify(products, null, 2)
  );
  console.log('Products saved (pre-fitment)');

  // Now for each Year/Make/Model, get which wheels fit
  console.log('\nScraping fitment data (which wheels fit which vehicles)...');
  const fitmentMap = {}; // sku -> [{ year, make, model }]
  let fitmentRequests = 0;

  for (const year of Object.keys(fitmentTree)) {
    for (const [make, makeData] of Object.entries(fitmentTree[year])) {
      for (const model of makeData.models) {
        try {
          const searchUrl = `https://gpibtob.com/product/searchwheel?car=${makeData.id}&model=${encodeURIComponent(model)}&year=${year}&filter_type=&limit=99999`;

          const skus = await page.evaluate(async (url) => {
            const res = await fetch(url);
            const html = await res.text();
            const matches = [...html.matchAll(/class="pull-right"[^>]*>(RW[^<]+)</g)];
            return matches.map(m => m[1].trim());
          }, searchUrl);

          for (const sku of skus) {
            if (!fitmentMap[sku]) fitmentMap[sku] = [];
            fitmentMap[sku].push({ year, make, model });
          }
        } catch (e) {
          console.log(`    Error: ${year} ${make} ${model}: ${e.message.substring(0, 60)}`);
        }
        fitmentRequests++;
        if (fitmentRequests % 50 === 0) {
          console.log(`    ${fitmentRequests} requests done...`);
        }
      }
    }
    console.log(`  ${year} fitment done`);
  }

  // Attach fitment to products
  for (const product of products) {
    product.fitment = fitmentMap[product.sku] || [];
  }

  // Save products
  fs.writeFileSync(
    path.join(DATA_DIR, 'rwc-wheels-raw.json'),
    JSON.stringify(products, null, 2)
  );

  // Download images
  console.log('\nDownloading images...');
  fs.mkdirSync(IMG_DIR, { recursive: true });
  let downloaded = 0, skipped = 0;

  const uniqueImages = [...new Set(products.map(p => p.image).filter(Boolean))];
  console.log(`Unique images: ${uniqueImages.length}`);

  for (const imgUrl of uniqueImages) {
    const filename = imgUrl.split('/').pop();
    const outPath = path.join(IMG_DIR, filename);
    if (fs.existsSync(outPath)) { skipped++; continue; }

    try {
      const imgData = await page.evaluate(async (url) => {
        const res = await fetch(url);
        if (!res.ok) return null;
        const blob = await res.blob();
        const reader = new FileReader();
        return new Promise(resolve => {
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      }, imgUrl);

      if (imgData) {
        const base64 = imgData.split(',')[1];
        fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
        downloaded++;
      }
    } catch (e) {
      console.log(`  Failed: ${filename}`);
    }
  }
  console.log(`Images: ${downloaded} downloaded, ${skipped} skipped`);

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Products: ${products.length}`);
  console.log(`With cost: ${products.filter(p => p.cost > 0).length}`);
  console.log(`In stock: ${products.filter(p => p.stock.includes('In Stock')).length}`);
  console.log(`Unique images: ${uniqueImages.length}`);
  console.log(`Fitment entries: ${Object.keys(fitmentMap).length} SKUs with vehicle data`);
  console.log(`Years scraped: ${Object.keys(fitmentTree).length}`);
  console.log('\nDone!');

  await browser.close();
})();
