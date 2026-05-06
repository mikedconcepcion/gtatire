const { chromium } = require('playwright');
const config = require('./config');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const IMG_DIR = path.join(DATA_DIR, 'images', 'superspeed');

(async () => {
  console.log('=== SUPERSPEED SCRAPER ===\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Login
  let loginData = null;
  page.on('response', async res => {
    if (res.url().includes('Dealer/login')) {
      try { loginData = await res.json(); } catch (e) {}
    }
  });

  await page.goto(config.superspeed.url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.locator('input').first().fill(config.superspeed.username);
  await page.locator('input').nth(1).fill(config.superspeed.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(5000);

  if (!loginData?.Success) {
    console.log('Login failed!');
    await browser.close();
    return;
  }

  const aid = loginData.Json.ID;
  console.log('Logged in as:', loginData.Json.Name);
  console.log('Dealer ID:', aid);

  // Fetch all wheels (pageSize=1000 to get all in one request)
  console.log('\nFetching all wheels...');
  const wheelsResp = await page.evaluate(async (params) => {
    const res = await fetch('https://b2b.super-speed.ca/webapi/api/Product/getWheelsListByAengtId', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Aid: params.aid,
        Skus: '', PCD: '', Diameter: '', Width: '',
        MinimumET: '', MaximumET: '', Brand: '', Model: '',
        Finish: '', ET: '', CB: '', SEAT: '',
        isHideOutStock: false,
        OY: 'SKU', OYA: '',
        pageNumber: 1,
        pageSize: 1000
      })
    });
    return await res.json();
  }, { aid });

  const wheels = wheelsResp.rows.List;
  console.log(`Got ${wheels.length} wheels`);

  // Fetch accessories (lug nuts, bolts, etc.)
  const accTypes = ['Lug Nut', 'Lug Bolt', 'Hub Ring', 'Spacers', 'Center Caps', 'TPMS'];
  const accessories = {};
  for (const type of accTypes) {
    const accResp = await page.evaluate(async (params) => {
      const res = await fetch(
        `https://b2b.super-speed.ca/webapi/api/Product/getAccessoriesListByAengtId?Aid=${params.aid}&Type=${encodeURIComponent(params.type)}`
      );
      return await res.json();
    }, { aid, type });

    if (accResp.Success && accResp.rows) {
      const list = accResp.rows.List || accResp.rows;
      const count = Array.isArray(list) ? list.length : 0;
      if (count > 0) {
        accessories[type] = list;
        console.log(`  ${type}: ${count} items`);
      }
    }
  }

  // Save raw data
  fs.writeFileSync(
    path.join(DATA_DIR, 'superspeed-wheels-raw.json'),
    JSON.stringify(wheelsResp.rows, null, 2)
  );
  if (Object.keys(accessories).length > 0) {
    fs.writeFileSync(
      path.join(DATA_DIR, 'superspeed-accessories-raw.json'),
      JSON.stringify(accessories, null, 2)
    );
  }

  // Download images
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const imgBase = 'https://b2b.super-speed.ca/webapi/api//Product/GetImage?imgName=';
  let downloaded = 0;
  let skipped = 0;

  for (const wheel of wheels) {
    if (!wheel.FACE_IMG) continue;
    const imgs = wheel.FACE_IMG.split(',').filter(Boolean);
    for (const imgName of imgs) {
      const outPath = path.join(IMG_DIR, imgName);
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
        }, imgBase + imgName);

        if (imgData) {
          const base64 = imgData.split(',')[1];
          fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
          downloaded++;
        }
      } catch (e) {
        console.log(`  Failed: ${imgName} - ${e.message}`);
      }
    }
    if ((downloaded + skipped) % 50 === 0 && downloaded > 0) {
      console.log(`  Images: ${downloaded} downloaded, ${skipped} skipped`);
    }
  }

  console.log(`\nImages: ${downloaded} downloaded, ${skipped} skipped`);

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Wheels: ${wheels.length}`);
  console.log(`Brands: ${wheelsResp.rows.Brands.join(', ')}`);
  console.log(`Models: ${wheelsResp.rows.Models.length}`);
  console.log(`Diameters: ${wheelsResp.rows.Diameters.join(', ')}`);
  console.log(`Finishes: ${wheelsResp.rows.Finishs.length}`);
  console.log(`Accessories types: ${Object.keys(accessories).length}`);
  console.log(`Images downloaded: ${downloaded}`);
  console.log('\nDone!');

  await browser.close();
})();
