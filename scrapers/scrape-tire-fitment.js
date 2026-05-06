const { chromium } = require('playwright');
const config = require('./config');
const fs = require('fs');
const pathMod = require('path');

const DATA_DIR = pathMod.join(__dirname, '..', 'data');
const MIN_YEAR = 2020;

function save(filename, data) {
  fs.writeFileSync(pathMod.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

function loadIfExists(filename) {
  const fpath = pathMod.join(DATA_DIR, filename);
  if (fs.existsSync(fpath)) return JSON.parse(fs.readFileSync(fpath, 'utf8'));
  return null;
}

(async () => {
  console.log('=== ALLTIRE TIRE FITMENT SCRAPER ===\n');

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

  const fitment = loadIfExists('alltire-tire-fitment.json') || {};
  const scraped = new Set(Object.keys(fitment));
  console.log(`Resume: ${scraped.size} vehicles already scraped`);

  // Get years
  const yearsResp = await page.evaluate(async () => {
    const res = await fetch('https://alltire.ca/searchTire.asp?year=year&make=make&model=model');
    return await res.text();
  });
  const allYears = yearsResp.split('|').filter(y => y.match(/^\d{4}$/));
  const years = allYears.filter(y => parseInt(y) >= MIN_YEAR);
  console.log(`Years: ${years.length} (${MIN_YEAR}+)\n`);

  let totalRequests = 0;
  let totalFitments = 0;

  for (const year of years) {
    // Get makes
    const makesResp = await page.evaluate(async (y) => {
      const res = await fetch(`https://alltire.ca/searchTire.asp?year=${y}&make=make&model=model`);
      return await res.text();
    }, year);
    const makes = makesResp.split('|').filter(m => m && m !== 'make');

    let yearFitments = 0;

    for (const make of makes) {
      // Get models
      const modelsResp = await page.evaluate(async (params) => {
        const res = await fetch(`https://alltire.ca/searchTire.asp?year=${params.y}&make=${encodeURIComponent(params.m)}&model=model`);
        return await res.text();
      }, { y: year, m: make });
      const models = modelsResp.split('|').filter(m => m && m !== 'model');

      for (const model of models) {
        const key = `${year}|${make}|${model}`;
        if (scraped.has(key)) continue;

        try {
          const html = await page.evaluate(async (params) => {
            const res = await fetch(`https://alltire.ca/searchTire.asp?year=${params.y}&make=${encodeURIComponent(params.m)}&model=${encodeURIComponent(params.md)}&wheel=false&note=true`);
            return await res.text();
          }, { y: year, m: make, md: model });

          // Parse tire sizes from HTML: pattern like 215/55-16 or P225/65-17
          const sizePattern = /[PL]?T?(\d{3})\/([\d.]+)-(\d{2})/g;
          const sizes = [];
          let match;
          while ((match = sizePattern.exec(html)) !== null) {
            sizes.push({
              raw: match[0],
              width: parseInt(match[1]),
              aspect: parseInt(match[2]),
              rim: parseInt(match[3]),
              display: `${match[1]}/${match[2]}R${match[3]}`,
            });
          }

          // Parse OE wheel info
          const oeMatch = html.match(/OE-(\d+)/);
          const oeWheel = oeMatch ? parseInt(oeMatch[1]) : null;

          // Parse plus/minus sizes
          const plusMatch = html.match(/PLUS/i);

          fitment[key] = {
            year, make, model,
            oeWheelSize: oeWheel,
            tireSizes: sizes.map(s => s.display),
            tireSizesDetailed: sizes,
          };

          if (sizes.length > 0) {
            yearFitments++;
            totalFitments++;
          }

          scraped.add(key);
          totalRequests++;
        } catch (e) {
          // skip errors
        }
      }
    }

    // Save after each year
    save('alltire-tire-fitment.json', fitment);
    save('alltire-tire-fitment-scraped.json', [...scraped]);
    console.log(`${year}: ${makes.length} makes, ${yearFitments} with fitment data (total: ${Object.keys(fitment).length})`);
  }

  save('alltire-tire-fitment.json', fitment);

  // Summary
  const withSizes = Object.values(fitment).filter(f => f.tireSizes?.length > 0).length;
  const allSizes = [...new Set(Object.values(fitment).flatMap(f => f.tireSizes || []))];
  console.log(`\n=== SUMMARY ===`);
  console.log(`Total vehicles: ${Object.keys(fitment).length}`);
  console.log(`With tire sizes: ${withSizes}`);
  console.log(`Unique tire sizes: ${allSizes.length}`);
  console.log(`Requests made: ${totalRequests}`);
  console.log('Done!');

  await browser.close();
})();
