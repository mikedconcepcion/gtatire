const { chromium } = require('playwright');
const config = require('./config');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(config.alltire.url, { waitUntil: 'networkidle' });
  await page.fill('input[type="text"]', config.alltire.username);
  await page.fill('input[type="password"]', config.alltire.password);
  await page.locator('button:has-text("Sign In")').first().click();
  await page.waitForLoadState('networkidle');

  const html = await page.evaluate(async () => {
    const res = await fetch('https://alltire.ca/searchWheel.asp?year=2025&make=HYUNDAI&model=TUCSON&diameter=17&wtype=&by=weborder&cid=6340&checkhub=false');
    return await res.text();
  });

  // Test regex directly on raw HTML
  const rowPattern = /<tr onclick='clickWheelTr[^>]*>([\s\S]*?)<\/tr>/g;
  let match;
  while ((match = rowPattern.exec(html)) !== null) {
    const rowHtml = match[1];

    // Get product no
    const prodMatch = rowHtml.match(/<td>([A-Z0-9]+)<\/td>/);
    const productNo = prodMatch ? prodMatch[1] : '?';

    // Get DC from id attribute — the $ is literal in the HTML
    const dcMatch = rowHtml.match(/id='\$([^']+)'/);
    const dc = dcMatch ? '$' + dcMatch[1] : 'none';

    // Get MSRP
    const msrpMatch = rowHtml.match(/align='right'>\$([^<]+)</);
    const msrp = msrpMatch ? '$' + msrpMatch[1] : '?';

    console.log(`${productNo}  DC: ${dc}  MSRP: ${msrp}`);
  }

  await browser.close();
})();
