const { chromium } = require('playwright');
const fs = require('fs');
const config = require('./config');
const pathMod = require('path');

const DATA_DIR = pathMod.join(__dirname, '..', 'data');

function save(filename, data) {
  fs.writeFileSync(pathMod.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

function loadIfExists(filename) {
  const fpath = pathMod.join(DATA_DIR, filename);
  if (fs.existsSync(fpath)) return JSON.parse(fs.readFileSync(fpath, 'utf8'));
  return null;
}

// Common tire sizes that actually exist (covers 95%+ of the market)
function getSearchSizes() {
  const sizes = [];

  // Passenger car sizes (P-metric)
  const configs = [
    // width, aspects, rims
    ['155', ['65','70','80'], ['13','14','15']],
    ['165', ['65','70','80'], ['13','14','15']],
    ['175', ['55','60','65','70'], ['13','14','15']],
    ['185', ['55','60','65','70','75'], ['14','15','16']],
    ['195', ['45','50','55','60','65','70','75'], ['14','15','16','17']],
    ['205', ['45','50','55','60','65','70','75'], ['14','15','16','17','18']],
    ['215', ['40','45','50','55','60','65','70'], ['15','16','17','18']],
    ['225', ['35','40','45','50','55','60','65','70','75'], ['15','16','17','18','19','20']],
    ['235', ['35','40','45','50','55','60','65','70','75','85'], ['16','17','18','19','20']],
    ['245', ['30','35','40','45','50','55','60','65','70','75'], ['16','17','18','19','20','21','22']],
    ['255', ['30','35','40','45','50','55','60','65','70'], ['17','18','19','20','21','22']],
    ['265', ['30','35','40','45','50','55','60','65','70','75'], ['16','17','18','19','20','22']],
    ['275', ['30','35','40','45','50','55','60','65','70'], ['17','18','19','20','21','22']],
    ['285', ['30','35','40','45','50','55','60','65','70','75'], ['17','18','19','20','22']],
    ['295', ['25','30','35','40','45','50','55','60','70'], ['18','19','20','22']],
    ['305', ['25','30','35','40','45','50','55'], ['19','20','22','24']],
    ['315', ['30','35','40','70','75'], ['17','18','20','22','24']],
    ['325', ['30','35','50','60','65'], ['20','22','24']],
    ['335', ['25','30'], ['22','24']],
    ['345', ['25','30'], ['20','22']],
    ['355', ['25','30'], ['21','22']],
  ];

  for (const [width, aspects, rims] of configs) {
    for (const aspect of aspects) {
      for (const rim of rims) {
        sizes.push({
          qs: `${width}${aspect}${rim}`,
          display: `${width}/${aspect}R${rim}`,
        });
      }
    }
  }

  return sizes;
}

(async () => {
  console.log('=== ALLTIRE TIRE SCRAPER ===\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Login
  await page.goto(config.alltire.url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('input[type="text"]', config.alltire.username);
  await page.fill('input[type="password"]', config.alltire.password);
  await page.locator('button:has-text("Sign In"), input[type="submit"]').first().click();
  await page.waitForLoadState('networkidle');
  await new Promise(r => setTimeout(r, 2000));
  console.log('Logged in');

  // Get session cookies for direct API calls
  const cookies = await page.context().cookies();
  const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

  const allTires = loadIfExists('alltire-tires.json') || [];
  const scraped = new Set(loadIfExists('alltire-tires-scraped.json') || []);
  console.log(`Resume: ${allTires.length} products, ${scraped.size} sizes done`);

  const sizes = getSearchSizes();
  console.log(`Sizes to search: ${sizes.length} (${sizes.length - scraped.size} remaining)\n`);

  let searched = 0;
  let totalNew = 0;

  for (const size of sizes) {
    if (scraped.has(size.qs)) { searched++; continue; }
    searched++;

    try {
      // Direct API call via page.evaluate (uses session cookies)
      const html = await page.evaluate(async (qs) => {
        const res = await fetch(`https://alltire.ca/searchItem.asp?cid=6340&qs=${qs}`);
        return await res.text();
      }, size.qs);

      // Parse the HTML table
      const products = await page.evaluate((htmlStr) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlStr, 'text/html');
        const rows = doc.querySelectorAll('tr');
        const items = [];

        for (const row of rows) {
          const cells = row.querySelectorAll('td');
          if (cells.length < 10) continue;

          const getText = (i) => cells[i]?.textContent?.trim() || '';
          const getAttr = (i, a) => cells[i]?.getAttribute(a) || '';
          const rowNum = getText(0);
          if (!rowNum.match(/^\d+$/)) continue;

          const productNo = getText(1);
          if (!productNo) continue;

          // Image
          const img = cells[2]?.querySelector('img');
          const image = img ? img.getAttribute('src') || '' : '';

          // Dealer cost is hidden behind a placeholder ("DC"/"Special"/"…") but the
          // real number is embedded in cell[8] as id='$NNN.NN' and name='NNN.NN'.
          // Confirmed by scrapers/probe-alltire-tire-cost.js (2026-05-25).
          const costIdAttr = getAttr(8, 'id');
          const costNameAttr = getAttr(8, 'name');
          const costFromId = costIdAttr.startsWith('$') ? costIdAttr.slice(1) : '';
          const dealerPriceNum = costFromId || costNameAttr || '';
          const dealerPriceLabel = getText(8); // "DC", "Special", "...", actual $, etc.

          items.push({
            productNo,
            image: image ? `https://alltire.ca/${image}` : '',
            evRf: getText(3),
            description: getText(4),
            maker: getText(5),
            model: getText(6),
            size: getText(7),
            dealerPrice: dealerPriceNum ? `$${dealerPriceNum}` : dealerPriceLabel,
            dealerPriceLabel,
            msrp: getText(9),
            stock: getText(10),
            type: getText(12),
          });
        }
        return items;
      }, html);

      const count = products.length;
      if (count > 0) {
        for (const p of products) {
          p.searchSize = size.display;
        }
        allTires.push(...products);
        totalNew += count;
        process.stdout.write(`[${searched}/${sizes.length}] ${size.display} → ${count} tires\n`);
      }

      scraped.add(size.qs);

      // Save every 25 successful searches
      if (searched % 25 === 0) {
        save('alltire-tires.json', allTires);
        save('alltire-tires-scraped.json', [...scraped]);
        console.log(`  [SAVED] ${allTires.length} total, ${scraped.size}/${sizes.length} sizes done`);
      }
    } catch (e) {
      console.log(`[${searched}] ${size.display} ERROR: ${e.message.substring(0, 60)}`);
    }
  }

  // Final save
  save('alltire-tires.json', allTires);
  save('alltire-tires-scraped.json', [...scraped]);

  // Dedupe by productNo
  const unique = new Map();
  for (const t of allTires) {
    if (!unique.has(t.productNo)) unique.set(t.productNo, t);
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Sizes searched: ${scraped.size}`);
  console.log(`Total tire entries: ${allTires.length}`);
  console.log(`Unique tires: ${unique.size}`);
  console.log(`Makers: ${[...new Set(allTires.map(t => t.maker))].filter(Boolean).join(', ')}`);
  console.log(`Types: ${JSON.stringify([...new Set(allTires.map(t => t.type))].filter(Boolean))}`);
  console.log('Done!');

  await browser.close();
})();
