// Probe: gpibtob.com global catalog beyond just RWC-branded items.
// Tries multiple discovery paths:
//   1. Top-level /index.php?route=product/category (catalog tree)
//   2. Empty search ?search= (returns all products)
//   3. Sitemap / robots.txt / categories
// Writes findings to data/probe-gpibtob-catalog.log.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const LOG = path.join(__dirname, '..', 'data', 'probe-gpibtob-catalog.log');
const log = (m) => { const l = `[${new Date().toISOString()}] ${m}`; console.log(l); fs.appendFileSync(LOG, l + '\n'); };

(async () => {
  fs.writeFileSync(LOG, '');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(config.rwc.url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.fill('input[type="email"], input[name="email"], input#email, input[name="customer[email]"]', config.rwc.username);
    await page.fill('input[type="password"], input[name="password"]', config.rwc.password);
    await page.locator('button:has-text("Sign"), button:has-text("Log"), input[type="submit"]').first().click();
    await page.waitForLoadState('networkidle');
    log('Logged in');

    // Path A: try home page / nav menu
    await page.goto('https://gpibtob.com/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    const navLinks = await page.evaluate(() => {
      const links = [];
      document.querySelectorAll('nav a, header a, .nav a, .menu a, ul.dropdown-menu a').forEach(a => {
        const href = a.href;
        const text = (a.textContent || '').trim();
        if (text && text.length < 80 && /product|category|brand|manufacturer|wheel|tire/i.test(href + ' ' + text)) {
          if (!links.find(l => l.href === href)) links.push({ text, href });
        }
      });
      return links;
    });
    log(`Found ${navLinks.length} nav links matching product/brand/wheel/tire`);
    navLinks.slice(0, 30).forEach(l => log(`  - "${l.text}" → ${l.href}`));

    // Path B: try empty search
    log('\nTrying empty search...');
    await page.goto('https://gpibtob.com/index.php?route=product/search&search=&limit=100', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    const empty = await page.evaluate(() => {
      const items = document.querySelectorAll('.product-thumb');
      const first5 = [];
      items.forEach((t, i) => {
        if (i >= 5) return;
        const name = t.querySelector('.name-product a')?.textContent?.trim() || '';
        first5.push(name);
      });
      return { count: items.length, first5 };
    });
    log(`Empty search returned ${empty.count} items`);
    empty.first5.forEach(n => log(`  - ${n}`));

    // Path C: extract distinct product-name prefixes from a broad search
    log('\nLooking at distinct first-word prefixes across all products (could be brand hints)...');
    await page.goto('https://gpibtob.com/index.php?route=product/search&search=&limit=99999', { waitUntil: 'networkidle', timeout: 180000 });
    await page.waitForTimeout(3000);
    const prefixes = await page.evaluate(() => {
      const counts = new Map();
      document.querySelectorAll('.product-thumb .name-product a').forEach(a => {
        const name = a.textContent.trim();
        const first = name.split(/\s+/)[0];
        counts.set(first, (counts.get(first) || 0) + 1);
      });
      return [...counts.entries()].sort((a,b) => b[1]-a[1]);
    });
    log(`Got ${prefixes.length} distinct product-name first words. Top 30:`);
    prefixes.slice(0, 30).forEach(([w, n]) => log(`  ${w.padEnd(18)} ${n}`));
  } catch (err) {
    log('ERROR: ' + err.message);
    log(err.stack);
  } finally {
    await browser.close();
  }
})();
