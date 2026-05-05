const { chromium, devices } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const iPhone = devices['iPhone 14'];
  const ctx = await browser.newContext({ ...iPhone });
  const page = await ctx.newPage();
  const base = 'http://localhost:3000/gtatire';
  const dir = 'scrapers/screenshots/mobile';
  const fs = require('fs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const pages = [
    ['home', '/'],
    ['wheels', '/wheels'],
    ['vehicle', '/vehicle/2025/HONDA/CIVIC'],
    ['product', '/wheels/alltire-083481'],
    ['search', '/search?q=18+alloy'],
    ['login', '/login'],
    ['contact', '/contact'],
  ];

  for (const [name, path] of pages) {
    await page.goto(base + path, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${dir}/${name}.jpg`, fullPage: true, type: 'jpeg', quality: 80 });
    console.log(`Captured: ${name}`);
  }

  await browser.close();
  console.log('Done');
})();
