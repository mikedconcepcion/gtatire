const { chromium } = require('playwright');
const config = require('./config');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('--- RWC WHEELS RECON ---');
  console.log('Navigating to:', config.rwc.url);

  await page.goto(config.rwc.url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.screenshot({ path: 'scrapers/screenshots/rwc-login.png', fullPage: true });
  console.log('Screenshot: login page saved');

  // Login
  try {
    await page.fill('input[type="email"], input[name="email"], input#email, input[name="customer[email]"]', config.rwc.username);
    await page.fill('input[type="password"], input[name="password"], input#password, input[name="customer[password]"]', config.rwc.password);
    await page.screenshot({ path: 'scrapers/screenshots/rwc-filled.png', fullPage: true });

    const loginBtn = await page.locator('button:has-text("Sign"), button:has-text("Log"), input[type="submit"]').first();
    await loginBtn.click();
    await page.waitForLoadState('networkidle');
    console.log('Logged in successfully');
  } catch (e) {
    console.log('Login attempt error:', e.message);
    const inputs = await page.locator('input').all();
    console.log('Found inputs:', inputs.length);
    for (const input of inputs) {
      const type = await input.getAttribute('type');
      const name = await input.getAttribute('name');
      const id = await input.getAttribute('id');
      console.log(`  Input: type=${type} name=${name} id=${id}`);
    }
  }

  await page.screenshot({ path: 'scrapers/screenshots/rwc-after-login.png', fullPage: true });
  console.log('Screenshot: after login saved');

  // Explore after login
  await page.waitForTimeout(2000);

  // Check current URL (may have redirected)
  console.log('\nCurrent URL:', page.url());

  // Look for navigation/catalog
  const navItems = await page.locator('nav a, .nav-item, header a').all();
  console.log('\nNavigation items:', navItems.length);
  for (const item of navItems.slice(0, 20)) {
    const text = await item.textContent().catch(() => '');
    const href = await item.getAttribute('href').catch(() => '');
    if (text.trim()) console.log(`  [${text.trim().substring(0, 40)}] -> ${href}`);
  }

  // Look for product collections
  const collections = await page.locator('a[href*="collection"], a[href*="product"], a[href*="catalog"]').all();
  console.log('\nProduct/collection links:', collections.length);
  for (const col of collections.slice(0, 15)) {
    const text = await col.textContent().catch(() => '');
    const href = await col.getAttribute('href').catch(() => '');
    console.log(`  [${text.trim().substring(0, 40)}] -> ${href}`);
  }

  // If Shopify-based, try collections page
  try {
    await page.goto('https://gpibtob.com/collections', { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: 'scrapers/screenshots/rwc-collections.png', fullPage: true });
    console.log('\nScreenshot: collections page saved');

    const collectionLinks = await page.locator('a[href*="/collections/"]').all();
    for (const link of collectionLinks.slice(0, 20)) {
      const text = await link.textContent().catch(() => '');
      const href = await link.getAttribute('href').catch(() => '');
      if (text.trim()) console.log(`  Collection: [${text.trim()}] -> ${href}`);
    }
  } catch (e) {
    console.log('Could not access collections:', e.message);
  }

  console.log('\nBrowser will close in 30 seconds...');
  await page.waitForTimeout(30000);

  await browser.close();
})();
