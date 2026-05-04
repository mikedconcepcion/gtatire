const { chromium } = require('playwright');
const config = require('./config');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('--- ALLTIRE RECON ---');
  await page.goto(config.alltire.url, { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'scrapers/screenshots/alltire-login.png', fullPage: true });

  // Login
  await page.fill('input[type="text"]', config.alltire.username);
  await page.fill('input[type="password"]', config.alltire.password);
  await page.locator('button:has-text("Sign In"), input[type="submit"]').first().click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  console.log('Logged in');
  await page.screenshot({ path: 'scrapers/screenshots/alltire-dashboard.png', fullPage: true });

  // Dump all visible text structure
  const bodyText = await page.locator('body').innerText();
  console.log('\n=== PAGE TEXT (first 3000 chars) ===');
  console.log(bodyText.substring(0, 3000));

  // Find all tabs/sections
  const tabs = await page.locator('[class*="tab"], [role="tab"], .nav-link, .menu-item').all();
  console.log('\n=== TABS/MENU ITEMS ===');
  for (const tab of tabs) {
    const text = await tab.textContent().catch(() => '');
    if (text.trim()) console.log(`  TAB: ${text.trim()}`);
  }

  // Look for dropdowns (Year/Make/Model)
  const selects = await page.locator('select').all();
  console.log('\n=== DROPDOWNS ===');
  for (const select of selects) {
    const name = await select.getAttribute('name') || '';
    const id = await select.getAttribute('id') || '';
    const optCount = await select.locator('option').count();
    const firstOpts = await select.locator('option').allTextContents();
    console.log(`  SELECT [name=${name} id=${id}] (${optCount} options): ${firstOpts.slice(0, 8).join(', ')}`);
  }

  // Look for iframes (old ASP sites often use frames)
  const frames = page.frames();
  console.log('\n=== FRAMES ===');
  for (const frame of frames) {
    console.log(`  Frame: ${frame.url()}`);
  }

  // Try clicking "Ordering" or "Wheel Search" tab
  try {
    const orderTab = await page.locator('text=/Ordering|Order/i').first();
    if (await orderTab.isVisible()) {
      await orderTab.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'scrapers/screenshots/alltire-ordering.png', fullPage: true });
      console.log('\nClicked Ordering tab');

      const orderText = await page.locator('body').innerText();
      console.log(orderText.substring(0, 2000));
    }
  } catch (e) {
    console.log('No ordering tab clickable:', e.message);
  }

  // Try Wheel Search tab
  try {
    const wheelTab = await page.locator('text=/Wheel Search|Wheel/i').first();
    if (await wheelTab.isVisible()) {
      await wheelTab.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'scrapers/screenshots/alltire-wheels.png', fullPage: true });
      console.log('\nClicked Wheel Search tab');

      const wheelText = await page.locator('body').innerText();
      console.log(wheelText.substring(0, 2000));
    }
  } catch (e) {
    console.log('No wheel tab clickable:', e.message);
  }

  // Try Tire Fitment tab
  try {
    const tireTab = await page.locator('text=/Tire Fitment|Fitment/i').first();
    if (await tireTab.isVisible()) {
      await tireTab.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'scrapers/screenshots/alltire-fitment.png', fullPage: true });
      console.log('\nClicked Tire Fitment tab');

      const fitText = await page.locator('body').innerText();
      console.log(fitText.substring(0, 2000));
    }
  } catch (e) {
    console.log('No fitment tab clickable:', e.message);
  }

  console.log('\nBrowser closing in 20 seconds...');
  await page.waitForTimeout(20000);
  await browser.close();
})();
