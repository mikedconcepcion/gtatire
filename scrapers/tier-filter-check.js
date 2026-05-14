const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const iPhone = devices['iPhone 14'];
  const ctx = await browser.newContext({ ...iPhone });
  const page = await ctx.newPage();
  const url = 'http://localhost:4321/gtatire/search?q=2024+honda+civic';
  const dir = path.join(__dirname, '..', '.wolf', 'designqc-captures');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForSelector('text=STYLE', { timeout: 15000 });
  await page.waitForTimeout(800);

  const tiers = ['All', '$ Budget', '$$ Performance', '$$$ Premium'];
  for (const label of tiers) {
    await page.click(`button:has-text("${label}")`).catch(e => console.log(`click fail ${label}: ${e.message}`));
    await page.waitForTimeout(600);

    // Capture the package summary area (near top) showing the tier row + first tire/wheel
    const safe = label.replace(/[^a-z0-9]/gi, '_');
    await page.screenshot({
      path: path.join(dir, `tier_${safe}.jpg`),
      fullPage: false,
      type: 'jpeg',
      quality: 75,
    });

    // Extract the brand+price of the first tire and first wheel cards
    const info = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('p.text-white.text-\\[11px\\]'));
      const prices = Array.from(document.querySelectorAll('.text-white.font-bold.text-sm')).map(e => e.textContent.trim()).slice(0, 6);
      const names = cards.slice(0, 6).map(e => e.textContent.trim());
      return { names, prices };
    });
    console.log(`${label}: first cards = ${JSON.stringify(info)}`);
  }

  await browser.close();
})();
