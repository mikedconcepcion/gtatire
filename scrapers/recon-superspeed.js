const { chromium } = require('playwright');
const config = require('./config');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('--- SUPERSPEED B2B RECON ---');
  console.log('Navigating to:', config.superspeed.url);

  await page.goto(config.superspeed.url, { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'scrapers/screenshots/superspeed-login.png', fullPage: true });
  console.log('Screenshot: login page saved');

  // Login
  try {
    await page.fill('input[type="email"], input[name="email"], input[placeholder*="mail"], input[type="text"]', config.superspeed.username);
    await page.fill('input[type="password"], input[name="password"]', config.superspeed.password);
    await page.screenshot({ path: 'scrapers/screenshots/superspeed-filled.png', fullPage: true });

    const loginBtn = await page.locator('button:has-text("Login"), button:has-text("Sign"), button[type="submit"]').first();
    await loginBtn.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // SPA needs time
    console.log('Logged in successfully');
  } catch (e) {
    console.log('Login attempt error:', e.message);
    const inputs = await page.locator('input').all();
    console.log('Found inputs:', inputs.length);
    for (const input of inputs) {
      const type = await input.getAttribute('type');
      const name = await input.getAttribute('name');
      const placeholder = await input.getAttribute('placeholder');
      console.log(`  Input: type=${type} name=${name} placeholder=${placeholder}`);
    }
  }

  await page.screenshot({ path: 'scrapers/screenshots/superspeed-after-login.png', fullPage: true });
  console.log('Screenshot: after login saved');

  // Explore the SPA
  await page.waitForTimeout(2000);

  // Look for navigation
  const navItems = await page.locator('nav a, .nav-item, .menu-item, [class*="nav"], [class*="menu"]').all();
  console.log('\nNavigation items:', navItems.length);
  for (const item of navItems.slice(0, 20)) {
    const text = await item.textContent().catch(() => '');
    if (text.trim()) console.log(`  ${text.trim().substring(0, 60)}`);
  }

  // Look for product categories or search
  const categories = await page.locator('[class*="category"], [class*="product"], [class*="catalog"]').all();
  console.log('\nProduct/category elements:', categories.length);

  // Check for any tables or grids
  const tables = await page.locator('table').all();
  console.log('Tables found:', tables.length);

  const grids = await page.locator('[class*="grid"], [class*="list"]').all();
  console.log('Grid/list elements:', grids.length);

  // Try clicking around to find products
  const allLinks = await page.locator('a').all();
  console.log('\nAll links:');
  for (const link of allLinks.slice(0, 20)) {
    const text = await link.textContent().catch(() => '');
    const href = await link.getAttribute('href').catch(() => '');
    if (text.trim()) console.log(`  [${text.trim().substring(0, 40)}] -> ${href}`);
  }

  console.log('\nBrowser will close in 30 seconds...');
  await page.waitForTimeout(30000);

  await browser.close();
})();
