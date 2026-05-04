const { chromium } = require('playwright');
const config = require('./config');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('--- SUPERSPEED B2B DEEP RECON ---');
  await page.goto(config.superspeed.url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000); // Let SPA render

  // Try login
  const inputs = await page.locator('input').all();
  console.log('Inputs on page:');
  for (const input of inputs) {
    const type = await input.getAttribute('type') || '';
    const placeholder = await input.getAttribute('placeholder') || '';
    const name = await input.getAttribute('name') || '';
    const cls = await input.getAttribute('class') || '';
    console.log(`  type=${type} name=${name} placeholder=${placeholder} class=${cls.substring(0, 40)}`);
  }

  // Fill login - try multiple approaches
  try {
    const emailInput = await page.locator('input').first();
    await emailInput.fill(config.superspeed.username);
    const passInput = await page.locator('input').nth(1);
    await passInput.fill(config.superspeed.password);
    await page.screenshot({ path: 'scrapers/screenshots/superspeed-filled2.png', fullPage: true });

    // Click login button
    const buttons = await page.locator('button').all();
    console.log('\nButtons:');
    for (const btn of buttons) {
      const text = await btn.textContent().catch(() => '');
      const type = await btn.getAttribute('type') || '';
      console.log(`  [${text.trim()}] type=${type}`);
    }

    const loginBtn = await page.locator('button').last();
    await loginBtn.click();
    console.log('Clicked login button');

    // Wait for SPA navigation
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'scrapers/screenshots/superspeed-dashboard.png', fullPage: true });
    console.log('Dashboard screenshot saved');

    // Get full page text
    const bodyText = await page.locator('body').innerText();
    console.log('\n=== BODY TEXT (3000 chars) ===');
    console.log(bodyText.substring(0, 3000));

    // Check URL
    console.log('\nCurrent URL:', page.url());

    // Look for any elements now
    const allElements = await page.locator('a, button, [class*="product"], [class*="wheel"], [class*="item"], [class*="card"]').all();
    console.log('\nInteractive elements:', allElements.length);
    for (const el of allElements.slice(0, 30)) {
      const tag = await el.evaluate(e => e.tagName);
      const text = await el.textContent().catch(() => '');
      const href = await el.getAttribute('href').catch(() => '');
      if (text.trim()) console.log(`  <${tag}> ${text.trim().substring(0, 60)} ${href ? '-> ' + href : ''}`);
    }

    // Look for images (product images)
    const images = await page.locator('img').all();
    console.log('\nImages found:', images.length);
    for (const img of images.slice(0, 10)) {
      const src = await img.getAttribute('src') || '';
      const alt = await img.getAttribute('alt') || '';
      console.log(`  ${alt || 'no-alt'}: ${src.substring(0, 80)}`);
    }

    // Try navigating to a products/catalog page if hash routing
    const hashRoutes = ['#/products', '#/catalog', '#/wheels', '#/home', '#/dashboard', '#/order'];
    for (const route of hashRoutes) {
      try {
        await page.goto(`https://b2b.super-speed.ca/${route}`, { waitUntil: 'networkidle', timeout: 10000 });
        await page.waitForTimeout(2000);
        const text = await page.locator('body').innerText();
        if (text.trim().length > 100) {
          console.log(`\n=== Route ${route} ===`);
          console.log(text.substring(0, 1000));
          await page.screenshot({ path: `scrapers/screenshots/superspeed${route.replace('#/', '-')}.png`, fullPage: true });
        }
      } catch (e) {
        // skip
      }
    }

  } catch (e) {
    console.log('Error:', e.message);
  }

  console.log('\nBrowser closing in 20 seconds...');
  await page.waitForTimeout(20000);
  await browser.close();
})();
