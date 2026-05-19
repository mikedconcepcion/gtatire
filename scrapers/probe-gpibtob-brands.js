// Probe: enumerate brands/manufacturers on gpibtob.com. Saves the full list
// of manufacturers to data/probe-gpibtob-brands.json so we can decide which
// to scrape and in what order.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const OUT = path.join(__dirname, '..', 'data', 'probe-gpibtob-brands.json');
const LOG = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    LOG('Logging in...');
    await page.goto(config.rwc.url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.fill('input[type="email"], input[name="email"], input#email, input[name="customer[email]"]', config.rwc.username);
    await page.fill('input[type="password"], input[name="password"]', config.rwc.password);
    await page.locator('button:has-text("Sign"), button:has-text("Log"), input[type="submit"]').first().click();
    await page.waitForLoadState('networkidle');

    LOG('Fetching /product/manufacturer...');
    await page.goto('https://gpibtob.com/index.php?route=product/manufacturer', {
      waitUntil: 'networkidle', timeout: 60000
    });
    await page.waitForTimeout(2000);

    const brands = await page.evaluate(() => {
      // OpenCart manufacturer index typically lists alpha-grouped <a> tags
      const links = [];
      document.querySelectorAll('a').forEach(a => {
        const href = a.getAttribute('href') || '';
        if (href.includes('manufacturer_id=') || /\/manufacturer\//i.test(href)) {
          const name = a.textContent.trim();
          if (name && name.length < 60 && !links.find(l => l.href === href)) {
            links.push({ name, href: a.href });
          }
        }
      });
      return links;
    });

    LOG(`Found ${brands.length} brand links`);
    fs.writeFileSync(OUT, JSON.stringify(brands, null, 2));
    LOG(`Wrote ${OUT}`);
    LOG('Sample (first 20):');
    brands.slice(0, 20).forEach(b => LOG(`  - ${b.name}`));
  } catch (err) {
    LOG('ERROR: ' + err.message);
    LOG(err.stack);
  } finally {
    await browser.close();
  }
})();
